import { getDb } from "@/lib/mongodb";
import { logActivity } from "@/lib/activity";
import { J25_THEMES } from "@/lib/ev-jumpstart-j25";
import type {
  EvSet,
  EvCard,
  EvCardFilter,
  EvSlotDefinition,
  EvBoosterConfig,
  EvConfig,
  EvConfigInput,
  EvCalculationResult,
  EvSimulationResult,
  EvSnapshot,
  EvJumpstartTheme,
  EvJumpstartThemeResult,
  EvJumpstartResult,
} from "@/lib/types";

// ── Jumpstart seed data (used only for initial DB population) ──
const JUMPSTART_SEED_DATA: Record<string, EvJumpstartTheme[]> = {
  j25: J25_THEMES,
};

// ── Collection names ───────────────────────────────────────────
const COL_SETS = "dashboard_ev_sets";
const COL_CARDS = "dashboard_ev_cards";
const COL_CONFIG = "dashboard_ev_config";
const COL_SNAPSHOTS = "dashboard_ev_snapshots";
const COL_JUMPSTART_THEMES = "dashboard_ev_jumpstart_themes";

// ── Scryfall ───────────────────────────────────────────────────
const SCRYFALL_BASE = "https://api.scryfall.com";
const SCRYFALL_UA = "MISSTEP/1.0";
const SCRYFALL_DELAY_MS = 80;

const BOOSTER_SET_TYPES = new Set([
  "expansion",
  "masters",
  "draft_innovation",
  "core",
  "funny",
]);

const MIN_RELEASE_YEAR = 2020;

// ── Indexes ────────────────────────────────────────────────────
let indexesEnsured = false;

async function ensureIndexes(): Promise<void> {
  if (indexesEnsured) return;
  try {
    const db = await getDb();
    await Promise.all([
      db.collection(COL_SETS).createIndex({ code: 1 }, { unique: true, name: "code_unique" }),
      db.collection(COL_SETS).createIndex({ released_at: -1 }, { name: "released_desc" }),
      db.collection(COL_CARDS).createIndex({ scryfall_id: 1 }, { unique: true, name: "scryfall_id_unique" }),
      db.collection(COL_CARDS).createIndex({ set: 1, rarity: 1 }, { name: "set_rarity" }),
      db.collection(COL_CARDS).createIndex({ set: 1, booster: 1 }, { name: "set_booster" }),
      db.collection(COL_CONFIG).createIndex({ set_code: 1 }, { unique: true, name: "set_code_unique" }),
      db.collection(COL_SNAPSHOTS).createIndex(
        { set_code: 1, date: -1 },
        { unique: true, name: "set_code_date_unique" }
      ),
      db.collection(COL_JUMPSTART_THEMES).createIndex({ set_code: 1 }, { name: "jst_set_code" }),
    ]);
    indexesEnsured = true;
  } catch {
    indexesEnsured = true;
  }
}

// ── Helpers ────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function scryfallGet(path: string): Promise<unknown> {
  const url = path.startsWith("http") ? path : `${SCRYFALL_BASE}${path}`;
  const res = await fetch(url, {
    headers: { "User-Agent": SCRYFALL_UA, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Scryfall ${res.status}: ${await res.text()}`);
  return res.json();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deriveCardTreatment(card: any): string {
  if (card.border_color === "borderless") return "borderless";
  const fe: string[] = card.frame_effects || [];
  if (fe.includes("showcase")) return "showcase";
  if (fe.includes("extendedart")) return "extended_art";
  const pt: string[] = card.promo_types || [];
  if (pt.includes("textured")) return "textured";
  if (pt.includes("serialized")) return "serialized";
  if (pt.includes("galaxyfoil")) return "galaxy_foil";
  if (pt.includes("surgefoil")) return "surge_foil";
  return "normal";
}

// ── Scryfall Sync: Sets ────────────────────────────────────────

// NOTE: isRelevantSet removed — EV-specific filtering moved to getSets (read time)
// so canonical-sort can see every set while the EV UI remains unchanged.

export async function syncSets(): Promise<{ added: number; updated: number }> {
  await ensureIndexes();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = (await scryfallGet("/sets")) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sets = res.data as any[];
  const db = await getDb();
  const col = db.collection(COL_SETS);
  const now = new Date().toISOString();
  let added = 0, updated = 0;

  for (const s of sets) {
    const result = await col.updateOne(
      { code: s.code },
      {
        $set: {
          name: s.name,
          released_at: s.released_at,
          card_count: s.card_count,
          icon_svg_uri: s.icon_svg_uri,
          set_type: s.set_type,
          scryfall_id: s.id,
          parent_set_code: s.parent_set_code ?? null,
          digital: s.digital ?? false,
          synced_at: now,
        },
      },
      { upsert: true }
    );
    if (result.upsertedCount) added++;
    else if (result.modifiedCount) updated++;
  }
  return { added, updated };
}

export async function getSets(): Promise<EvSet[]> {
  await ensureIndexes();
  const db = await getDb();

  // Read-time filter: EV calculator UI only wants booster sets released in 2020+,
  // excluding digital-only. The underlying collection may contain every Scryfall set
  // (since refreshAllScryfall populates the full catalog for canonical sort).
  const sets = await db
    .collection(COL_SETS)
    .find({
      set_type: { $in: Array.from(BOOSTER_SET_TYPES) },
      released_at: { $gte: `${MIN_RELEASE_YEAR}-01-01` },
      $or: [{ digital: { $ne: true } }, { digital: { $exists: false } }],
    })
    .sort({ released_at: -1 })
    .toArray();

  // Enrich with latest snapshot EV and config existence
  const configCodes = await db
    .collection(COL_CONFIG)
    .find({}, { projection: { set_code: 1 } })
    .toArray();
  const configSet = new Set(configCodes.map((c) => c.set_code));

  // Check which sets have jumpstart themes in DB
  const jumpstartCodes = await db
    .collection(COL_JUMPSTART_THEMES)
    .aggregate([
      { $group: { _id: "$set_code" } },
    ])
    .toArray();
  const jumpstartSet = new Set(jumpstartCodes.map((c) => c._id));

  // Get latest snapshot per set
  const latestSnapshots = await db
    .collection(COL_SNAPSHOTS)
    .aggregate([
      { $sort: { date: -1 } },
      { $group: { _id: "$set_code", doc: { $first: "$$ROOT" } } },
    ])
    .toArray();
  const snapMap = new Map(latestSnapshots.map((s) => [s._id, s.doc]));

  return sets.map((s) => {
    const snap = snapMap.get(s.code);
    return {
      ...s,
      _id: s._id.toString(),
      config_exists: configSet.has(s.code) || jumpstartSet.has(s.code) || s.code in JUMPSTART_SEED_DATA,
      play_ev_net: snap?.play_ev_net ?? null,
      collector_ev_net: snap?.collector_ev_net ?? null,
    } as EvSet;
  });
}

/**
 * Unfiltered set list — used by canonical-sort in sub-plan 2.
 * Returns every set in the collection, sorted chronologically (oldest first).
 */
export async function getAllSets(): Promise<EvSet[]> {
  await ensureIndexes();
  const db = await getDb();
  const sets = await db
    .collection(COL_SETS)
    .find()
    .sort({ released_at: 1 })
    .toArray();
  return sets.map((s) => ({ ...s, _id: s._id.toString() }) as EvSet);
}

export async function getSetByCode(code: string): Promise<EvSet | null> {
  await ensureIndexes();
  const db = await getDb();
  const doc = await db.collection(COL_SETS).findOne({ code });
  if (!doc) return null;
  return { ...doc, _id: doc._id.toString() } as EvSet;
}

// ── Scryfall Sync: Cards ───────────────────────────────────────

export async function syncCards(
  setCode: string
): Promise<{ added: number; updated: number; total: number }> {
  await ensureIndexes();
  const db = await getDb();
  const col = db.collection(COL_CARDS);
  const now = new Date().toISOString();
  let added = 0, updated = 0, total = 0;

  let url: string | null = `/cards/search?q=set:${setCode}&unique=prints&order=set`;
  while (url) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = (await scryfallGet(url)) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const card of page.data as any[]) {
      total++;
      const treatment = deriveCardTreatment(card);
      const doc = {
        scryfall_id: card.id,
        set: card.set,
        name: card.name,
        collector_number: card.collector_number,
        rarity: card.rarity,
        price_eur: card.prices?.eur ? parseFloat(card.prices.eur) : null,
        price_eur_foil: card.prices?.eur_foil ? parseFloat(card.prices.eur_foil) : null,
        finishes: card.finishes || [],
        booster: card.booster ?? false,
        image_uri: card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small || null,
        cardmarket_id: card.cardmarket_id ?? null,
        type_line: card.type_line || "",
        frame_effects: card.frame_effects || [],
        promo_types: card.promo_types || [],
        border_color: card.border_color || "black",
        treatment,
        // Canonical-sort fields
        colors: card.colors ?? [],
        color_identity: card.color_identity ?? [],
        cmc: typeof card.cmc === "number" ? card.cmc : 0,
        released_at: card.released_at ?? "9999-12-31",
        layout: card.layout ?? "normal",
        prices_updated_at: now,
        synced_at: now,
      };
      const result = await col.updateOne(
        { scryfall_id: card.id },
        { $set: doc },
        { upsert: true }
      );
      if (result.upsertedCount) added++;
      else if (result.modifiedCount) updated++;
    }
    url = page.has_more ? page.next_page : null;
    if (url) await sleep(SCRYFALL_DELAY_MS);
  }

  return { added, updated, total };
}

export async function getCardsForSet(
  setCode: string,
  options?: { boosterOnly?: boolean; page?: number; limit?: number }
): Promise<{ cards: EvCard[]; total: number }> {
  await ensureIndexes();
  const db = await getDb();
  const col = db.collection(COL_CARDS);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: any = { set: setCode };
  if (options?.boosterOnly) filter.booster = true;
  const total = await col.countDocuments(filter);
  const page = options?.page ?? 1;
  const limit = options?.limit ?? 200;
  const skip = (page - 1) * limit;
  const docs = await col.find(filter).sort({ collector_number: 1 }).skip(skip).limit(limit).toArray();
  return {
    cards: docs.map((d) => ({ ...d, _id: d._id.toString() }) as EvCard),
    total,
  };
}

// ── Config ─────────────────────────────────────────────────────

export async function getConfig(setCode: string): Promise<EvConfig | null> {
  await ensureIndexes();
  const db = await getDb();
  const doc = await db.collection(COL_CONFIG).findOne({ set_code: setCode });
  if (!doc) return null;
  return { ...doc, _id: doc._id.toString() } as EvConfig;
}

export async function saveConfig(
  setCode: string,
  input: EvConfigInput,
  userName: string
): Promise<void> {
  await ensureIndexes();
  const db = await getDb();
  const now = new Date().toISOString();
  await db.collection(COL_CONFIG).updateOne(
    { set_code: setCode },
    {
      $set: {
        ...input,
        set_code: setCode,
        updated_at: now,
        updated_by: userName,
      },
    },
    { upsert: true }
  );
  logActivity("update", "ev_config", setCode, `Updated EV config for ${setCode}`, "system", userName);
}

export function getDefaultPlayBoosterConfig(): EvBoosterConfig {
  return {
    packs_per_box: 36,
    cards_per_pack: 14,
    slots: [
      { slot_number: 1, label: "Common 1", is_foil: false, outcomes: [{ probability: 1, filter: { rarity: ["common"], treatment: ["normal"] } }] },
      { slot_number: 2, label: "Common 2", is_foil: false, outcomes: [{ probability: 1, filter: { rarity: ["common"], treatment: ["normal"] } }] },
      { slot_number: 3, label: "Common 3", is_foil: false, outcomes: [{ probability: 1, filter: { rarity: ["common"], treatment: ["normal"] } }] },
      { slot_number: 4, label: "Common 4", is_foil: false, outcomes: [{ probability: 1, filter: { rarity: ["common"], treatment: ["normal"] } }] },
      { slot_number: 5, label: "Common 5", is_foil: false, outcomes: [{ probability: 1, filter: { rarity: ["common"], treatment: ["normal"] } }] },
      { slot_number: 6, label: "Common 6", is_foil: false, outcomes: [{ probability: 1, filter: { rarity: ["common"], treatment: ["normal"] } }] },
      {
        slot_number: 7, label: "Common / SPG", is_foil: false,
        outcomes: [
          { probability: 0.96875, filter: { rarity: ["common"], treatment: ["normal"] } },
          { probability: 0.03125, filter: { promo_types: ["spg"] } },
        ],
      },
      { slot_number: 8, label: "Uncommon 1", is_foil: false, outcomes: [{ probability: 1, filter: { rarity: ["uncommon"], treatment: ["normal"] } }] },
      { slot_number: 9, label: "Uncommon 2", is_foil: false, outcomes: [{ probability: 1, filter: { rarity: ["uncommon"], treatment: ["normal"] } }] },
      { slot_number: 10, label: "Uncommon 3", is_foil: false, outcomes: [{ probability: 1, filter: { rarity: ["uncommon"], treatment: ["normal"] } }] },
      {
        slot_number: 11, label: "Rare / Mythic Wildcard", is_foil: false,
        outcomes: [
          { probability: 0.780, filter: { rarity: ["rare"], treatment: ["normal"] } },
          { probability: 0.128, filter: { rarity: ["mythic"], treatment: ["normal"] } },
          { probability: 0.077, filter: { rarity: ["rare"], border_color: ["borderless"] } },
          { probability: 0.015, filter: { rarity: ["mythic"], border_color: ["borderless"] } },
        ],
      },
      {
        slot_number: 12, label: "Foil Wildcard", is_foil: true,
        outcomes: [
          { probability: 0.667, filter: { rarity: ["common"] } },
          { probability: 0.250, filter: { rarity: ["uncommon"] } },
          { probability: 0.069, filter: { rarity: ["rare"] } },
          { probability: 0.014, filter: { rarity: ["mythic"] } },
        ],
      },
      {
        slot_number: 13, label: "Land", is_foil: false,
        outcomes: [
          { probability: 0.80, filter: { type_line_contains: "Basic Land" } },
          { probability: 0.20, filter: { type_line_contains: "Basic Land", finishes: ["foil"] } },
        ],
      },
      { slot_number: 14, label: "Token / Ad", is_foil: false, outcomes: [] },
    ],
  };
}

export function getDefaultCollectorBoosterConfig(): EvBoosterConfig {
  return {
    packs_per_box: 12,
    cards_per_pack: 15,
    slots: [
      { slot_number: 1, label: "Foil Common 1", is_foil: true, outcomes: [{ probability: 1, filter: { rarity: ["common"] } }] },
      { slot_number: 2, label: "Foil Common 2", is_foil: true, outcomes: [{ probability: 1, filter: { rarity: ["common"] } }] },
      { slot_number: 3, label: "Foil Common 3", is_foil: true, outcomes: [{ probability: 1, filter: { rarity: ["common"] } }] },
      { slot_number: 4, label: "Foil Common 4", is_foil: true, outcomes: [{ probability: 1, filter: { rarity: ["common"] } }] },
      { slot_number: 5, label: "Foil Uncommon 1", is_foil: true, outcomes: [{ probability: 1, filter: { rarity: ["uncommon"] } }] },
      { slot_number: 6, label: "Foil Uncommon 2", is_foil: true, outcomes: [{ probability: 1, filter: { rarity: ["uncommon"] } }] },
      { slot_number: 7, label: "Foil Uncommon 3", is_foil: true, outcomes: [{ probability: 1, filter: { rarity: ["uncommon"] } }] },
      {
        slot_number: 8, label: "Extended Art Rare/Mythic", is_foil: false,
        outcomes: [
          { probability: 0.875, filter: { rarity: ["rare"], treatment: ["extended_art"] } },
          { probability: 0.125, filter: { rarity: ["mythic"], treatment: ["extended_art"] } },
        ],
      },
      {
        slot_number: 9, label: "Foil Rare/Mythic", is_foil: true,
        outcomes: [
          { probability: 0.875, filter: { rarity: ["rare"], treatment: ["normal"] } },
          { probability: 0.125, filter: { rarity: ["mythic"], treatment: ["normal"] } },
        ],
      },
      {
        slot_number: 10, label: "Showcase/Borderless Rare", is_foil: false,
        outcomes: [
          { probability: 0.50, filter: { rarity: ["rare"], treatment: ["showcase"] } },
          { probability: 0.30, filter: { rarity: ["rare"], treatment: ["borderless"] } },
          { probability: 0.20, filter: { rarity: ["uncommon"], treatment: ["showcase"] } },
        ],
      },
      {
        slot_number: 11, label: "Foil Extended Art Rare/Mythic", is_foil: true,
        outcomes: [
          { probability: 0.875, filter: { rarity: ["rare"], treatment: ["extended_art"] } },
          { probability: 0.125, filter: { rarity: ["mythic"], treatment: ["extended_art"] } },
        ],
      },
      {
        slot_number: 12, label: "Foil Showcase/Borderless", is_foil: true,
        outcomes: [
          { probability: 0.60, filter: { rarity: ["rare"], treatment: ["showcase"] } },
          { probability: 0.25, filter: { rarity: ["rare"], treatment: ["borderless"] } },
          { probability: 0.10, filter: { rarity: ["mythic"], treatment: ["showcase"] } },
          { probability: 0.05, filter: { rarity: ["mythic"], treatment: ["borderless"] } },
        ],
      },
      {
        slot_number: 13, label: "Borderless Mythic / Showcase Mythic", is_foil: false,
        outcomes: [
          { probability: 0.60, filter: { rarity: ["mythic"], treatment: ["borderless"] } },
          { probability: 0.40, filter: { rarity: ["mythic"], treatment: ["showcase"] } },
        ],
      },
      {
        slot_number: 14, label: "Foil Borderless Rare/Mythic", is_foil: true,
        outcomes: [
          { probability: 0.75, filter: { rarity: ["rare"], treatment: ["borderless"] } },
          { probability: 0.25, filter: { rarity: ["mythic"], treatment: ["borderless"] } },
        ],
      },
      { slot_number: 15, label: "Token / Ad", is_foil: false, outcomes: [] },
    ],
  };
}

export function getDefaultJumpstartBoosterConfig(): EvBoosterConfig {
  // Jumpstart: 20 cards + 1 theme card per pack, 24 packs per box
  // 1-2 Rare/Mythic per pack (33% chance of second R/M)
  // Typical breakdown: 7 lands, 6 commons, 4 uncommons, 1-2 R/M, 1 theme card
  // Rare/Mythic split: ~87% rare / ~13% mythic (standard 2:1 sheet ratio with 100R/31M)
  return {
    packs_per_box: 24,
    cards_per_pack: 20,
    slots: [
      { slot_number: 1, label: "Basic Land 1", is_foil: false, outcomes: [{ probability: 1, filter: { type_line_contains: "Basic Land" } }] },
      { slot_number: 2, label: "Basic Land 2", is_foil: false, outcomes: [{ probability: 1, filter: { type_line_contains: "Basic Land" } }] },
      { slot_number: 3, label: "Basic Land 3", is_foil: false, outcomes: [{ probability: 1, filter: { type_line_contains: "Basic Land" } }] },
      { slot_number: 4, label: "Basic Land 4", is_foil: false, outcomes: [{ probability: 1, filter: { type_line_contains: "Basic Land" } }] },
      { slot_number: 5, label: "Basic Land 5", is_foil: false, outcomes: [{ probability: 1, filter: { type_line_contains: "Basic Land" } }] },
      { slot_number: 6, label: "Basic Land 6", is_foil: false, outcomes: [{ probability: 1, filter: { type_line_contains: "Basic Land" } }] },
      { slot_number: 7, label: "Basic Land 7", is_foil: false, outcomes: [{ probability: 1, filter: { type_line_contains: "Basic Land" } }] },
      { slot_number: 8, label: "Common 1", is_foil: false, outcomes: [{ probability: 1, filter: { rarity: ["common"], type_line_not_contains: "Basic Land" } }] },
      { slot_number: 9, label: "Common 2", is_foil: false, outcomes: [{ probability: 1, filter: { rarity: ["common"], type_line_not_contains: "Basic Land" } }] },
      { slot_number: 10, label: "Common 3", is_foil: false, outcomes: [{ probability: 1, filter: { rarity: ["common"], type_line_not_contains: "Basic Land" } }] },
      { slot_number: 11, label: "Common 4", is_foil: false, outcomes: [{ probability: 1, filter: { rarity: ["common"], type_line_not_contains: "Basic Land" } }] },
      { slot_number: 12, label: "Common 5", is_foil: false, outcomes: [{ probability: 1, filter: { rarity: ["common"], type_line_not_contains: "Basic Land" } }] },
      { slot_number: 13, label: "Common 6", is_foil: false, outcomes: [{ probability: 1, filter: { rarity: ["common"], type_line_not_contains: "Basic Land" } }] },
      { slot_number: 14, label: "Uncommon 1", is_foil: false, outcomes: [{ probability: 1, filter: { rarity: ["uncommon"] } }] },
      { slot_number: 15, label: "Uncommon 2", is_foil: false, outcomes: [{ probability: 1, filter: { rarity: ["uncommon"] } }] },
      { slot_number: 16, label: "Uncommon 3", is_foil: false, outcomes: [{ probability: 1, filter: { rarity: ["uncommon"] } }] },
      { slot_number: 17, label: "Uncommon 4", is_foil: false, outcomes: [{ probability: 1, filter: { rarity: ["uncommon"] } }] },
      {
        slot_number: 18, label: "Rare / Mythic (Guaranteed)", is_foil: false,
        outcomes: [
          { probability: 0.87, filter: { rarity: ["rare"] } },
          { probability: 0.13, filter: { rarity: ["mythic"] } },
        ],
      },
      {
        slot_number: 19, label: "Rare/Mythic or Uncommon", is_foil: false,
        outcomes: [
          { probability: 0.29, filter: { rarity: ["rare"] } },
          { probability: 0.04, filter: { rarity: ["mythic"] } },
          { probability: 0.67, filter: { rarity: ["uncommon"] } },
        ],
      },
      { slot_number: 20, label: "Theme Card (no value)", is_foil: false, outcomes: [] },
    ],
  };
}

// ── Jumpstart Themes (DB) ──────────────────────────────────────

export async function getJumpstartThemes(setCode: string): Promise<EvJumpstartTheme[] | null> {
  await ensureIndexes();
  const db = await getDb();
  const docs = await db.collection(COL_JUMPSTART_THEMES).find({ set_code: setCode }).toArray();
  if (!docs.length) return null;
  return docs.map((d) => ({
    name: d.name as string,
    variant: d.variant as number,
    color: d.color as string,
    tier: d.tier as "common" | "rare" | "mythic",
    cards: d.cards as string[],
  }));
}

export async function seedJumpstartThemes(setCode: string): Promise<{ seeded: number }> {
  const seedData = JUMPSTART_SEED_DATA[setCode];
  if (!seedData) return { seeded: 0 };

  await ensureIndexes();
  const db = await getDb();
  const col = db.collection(COL_JUMPSTART_THEMES);

  // Clear existing themes for this set and insert fresh
  await col.deleteMany({ set_code: setCode });
  const docs = seedData.map((t) => ({
    set_code: setCode,
    name: t.name,
    variant: t.variant,
    color: t.color,
    tier: t.tier,
    cards: t.cards,
  }));
  await col.insertMany(docs);
  return { seeded: docs.length };
}

export async function hasJumpstartThemes(setCode: string): Promise<boolean> {
  await ensureIndexes();
  const db = await getDb();
  const count = await db.collection(COL_JUMPSTART_THEMES).countDocuments({ set_code: setCode });
  return count > 0;
}

export function hasJumpstartSeedData(setCode: string): boolean {
  return setCode in JUMPSTART_SEED_DATA;
}

// ── Card Matching ──────────────────────────────────────────────

export function matchCardsToFilter(cards: EvCard[], filter: EvCardFilter): EvCard[] {
  return cards.filter((c) => {
    if (filter.rarity?.length && !filter.rarity.includes(c.rarity)) return false;
    if (filter.treatment?.length && !filter.treatment.includes(c.treatment)) return false;
    if (filter.border_color?.length && !filter.border_color.includes(c.border_color)) return false;
    if (filter.frame_effects?.length && !filter.frame_effects.some((fe) => c.frame_effects.includes(fe))) return false;
    if (filter.promo_types?.length && !filter.promo_types.some((pt) => c.promo_types.includes(pt))) return false;
    if (filter.type_line_contains && !c.type_line.includes(filter.type_line_contains)) return false;
    if (filter.type_line_not_contains && c.type_line.includes(filter.type_line_not_contains)) return false;
    if (filter.finishes?.length && !filter.finishes.some((f) => c.finishes.includes(f))) return false;
    if (filter.custom_pool?.length && !filter.custom_pool.includes(c.collector_number)) return false;
    return true;
  });
}

// ── EV Calculation (Deterministic) ─────────────────────────────

function getCardPrice(card: EvCard, isFoil: boolean, siftFloor: number): number {
  const price = isFoil ? (card.price_eur_foil ?? card.price_eur ?? 0) : (card.price_eur ?? 0);
  return price >= siftFloor ? price : 0;
}

export function calculateEv(
  cards: EvCard[],
  config: EvBoosterConfig,
  options: { siftFloor: number; feeRate: number; setCode: string; boosterType: "play" | "collector" }
): EvCalculationResult {
  const { siftFloor, feeRate, setCode, boosterType } = options;
  // Don't filter on c.booster — slot config filters determine card eligibility.
  // Scryfall's booster flag only covers standard play/collector boosters,
  // not Jumpstart or other sealed products.
  const boosterCards = cards;

  // Track per-card EV contributions
  const cardEvMap = new Map<string, { card: EvCard; ev: number; pullRate: number }>();
  const slotBreakdown: EvCalculationResult["slot_breakdown"] = [];

  for (const slot of config.slots) {
    if (!slot.outcomes.length) {
      slotBreakdown.push({ slot_number: slot.slot_number, label: slot.label, slot_ev: 0, top_cards: [] });
      continue;
    }

    let slotEv = 0;
    const slotTopCards: { name: string; price: number; pull_rate: number; ev: number }[] = [];

    for (const outcome of slot.outcomes) {
      const matching = matchCardsToFilter(boosterCards, outcome.filter);
      if (!matching.length) continue;

      const probPerCard = outcome.probability / matching.length;
      const pullsPerBox = probPerCard * config.packs_per_box;

      for (const card of matching) {
        const price = getCardPrice(card, slot.is_foil, siftFloor);
        const ev = price * pullsPerBox;
        slotEv += ev;

        if (ev > 0) {
          slotTopCards.push({ name: card.name, price, pull_rate: pullsPerBox, ev });
        }

        // Aggregate per card
        const key = `${card.scryfall_id}_${slot.is_foil ? "foil" : "nonfoil"}`;
        const existing = cardEvMap.get(key);
        if (existing) {
          existing.ev += ev;
          existing.pullRate += pullsPerBox;
        } else {
          cardEvMap.set(key, { card, ev, pullRate: pullsPerBox });
        }
      }
    }

    slotTopCards.sort((a, b) => b.ev - a.ev);
    slotBreakdown.push({
      slot_number: slot.slot_number,
      label: slot.label,
      slot_ev: slotEv,
      top_cards: slotTopCards.slice(0, 5),
    });
  }

  const boxEvGross = slotBreakdown.reduce((sum, s) => sum + s.slot_ev, 0);
  const boxEvNet = boxEvGross * (1 - feeRate);
  const packEv = boxEvGross / config.packs_per_box;

  // Top EV cards across all slots
  const allCardEvs = Array.from(cardEvMap.values())
    .filter((e) => e.ev > 0)
    .sort((a, b) => b.ev - a.ev);

  const cardsAboveFloor = allCardEvs.length;

  return {
    set_code: setCode,
    booster_type: boosterType,
    pack_ev: Math.round(packEv * 100) / 100,
    box_ev_gross: Math.round(boxEvGross * 100) / 100,
    box_ev_net: Math.round(boxEvNet * 100) / 100,
    fee_rate: feeRate,
    sift_floor: siftFloor,
    cards_counted: boosterCards.length,
    cards_above_floor: cardsAboveFloor,
    cards_total: cards.length,
    slot_breakdown: slotBreakdown,
    top_ev_cards: allCardEvs.slice(0, 20).map((e) => ({
      name: e.card.name,
      collector_number: e.card.collector_number,
      rarity: e.card.rarity,
      treatment: e.card.treatment,
      price: getCardPrice(e.card, false, 0),
      pull_rate_per_box: Math.round(e.pullRate * 10000) / 10000,
      ev_contribution: Math.round(e.ev * 100) / 100,
      image_uri: e.card.image_uri,
    })),
  };
}

// ── Monte Carlo Simulation ─────────────────────────────────────

interface SlotPool {
  cumulativeProbs: number[];
  cardPrices: number[][];   // cardPrices[outcomeIdx] = array of prices for each matching card
}

function buildSlotPools(
  boosterCards: EvCard[],
  config: EvBoosterConfig,
  siftFloor: number
): SlotPool[] {
  return config.slots.map((slot) => {
    if (!slot.outcomes.length) return { cumulativeProbs: [], cardPrices: [] };

    const cumulativeProbs: number[] = [];
    const cardPrices: number[][] = [];
    let cumProb = 0;

    for (const outcome of slot.outcomes) {
      cumProb += outcome.probability;
      cumulativeProbs.push(cumProb);
      const matching = matchCardsToFilter(boosterCards, outcome.filter);
      cardPrices.push(
        matching.map((c) => getCardPrice(c, slot.is_foil, siftFloor))
      );
    }

    return { cumulativeProbs, cardPrices };
  });
}

export function simulateBoxOpening(
  cards: EvCard[],
  config: EvBoosterConfig,
  options: {
    siftFloor: number;
    feeRate: number;
    iterations: number;
    boxCost?: number;
    quantity?: number;
  }
): EvSimulationResult {
  const start = Date.now();
  const { siftFloor, feeRate, iterations } = options;
  const pools = buildSlotPools(cards, config, siftFloor);
  const boxValues: number[] = new Array(iterations);

  for (let i = 0; i < iterations; i++) {
    let boxValue = 0;

    for (let p = 0; p < config.packs_per_box; p++) {
      for (const pool of pools) {
        if (!pool.cumulativeProbs.length) continue;

        // Select outcome by weighted random
        const roll = Math.random();
        let outcomeIdx = 0;
        while (outcomeIdx < pool.cumulativeProbs.length - 1 && roll > pool.cumulativeProbs[outcomeIdx]) {
          outcomeIdx++;
        }

        const prices = pool.cardPrices[outcomeIdx];
        if (!prices.length) continue;

        // Select random card from pool
        const cardIdx = Math.floor(Math.random() * prices.length);
        boxValue += prices[cardIdx];
      }
    }

    boxValues[i] = boxValue * (1 - feeRate);
  }

  // Sort for percentile calculations
  boxValues.sort((a, b) => a - b);

  const mean = boxValues.reduce((s, v) => s + v, 0) / iterations;
  const median = boxValues[Math.floor(iterations / 2)];
  const variance = boxValues.reduce((s, v) => s + (v - mean) ** 2, 0) / iterations;
  const stddev = Math.sqrt(variance);

  const pct = (p: number) => boxValues[Math.floor(iterations * p)];

  // Histogram
  const min = boxValues[0];
  const max = boxValues[iterations - 1];
  const binCount = 50;
  const binWidth = (max - min) / binCount || 1;
  const histogram: { bin_min: number; bin_max: number; count: number }[] = [];
  for (let b = 0; b < binCount; b++) {
    histogram.push({ bin_min: min + b * binWidth, bin_max: min + (b + 1) * binWidth, count: 0 });
  }
  for (const v of boxValues) {
    const idx = Math.min(Math.floor((v - min) / binWidth), binCount - 1);
    histogram[idx].count++;
  }

  // ROI
  let roi: EvSimulationResult["roi"] = null;
  if (options.boxCost && options.boxCost > 0) {
    const qty = options.quantity || 1;
    const profitCount = boxValues.filter((v) => v > options.boxCost!).length;
    roi = {
      box_cost: options.boxCost,
      quantity: qty,
      roi_percent: Math.round(((mean - options.boxCost) / options.boxCost) * 10000) / 100,
      profit_per_box: Math.round((mean - options.boxCost) * 100) / 100,
      total_profit: Math.round((mean - options.boxCost) * qty * 100) / 100,
      profit_probability: Math.round((profitCount / iterations) * 10000) / 100,
    };
  }

  return {
    iterations,
    mean: Math.round(mean * 100) / 100,
    median: Math.round(median * 100) / 100,
    stddev: Math.round(stddev * 100) / 100,
    min: Math.round(min * 100) / 100,
    max: Math.round(max * 100) / 100,
    percentiles: {
      p2_5: Math.round(pct(0.025) * 100) / 100,
      p5: Math.round(pct(0.05) * 100) / 100,
      p16: Math.round(pct(0.16) * 100) / 100,
      p25: Math.round(pct(0.25) * 100) / 100,
      p75: Math.round(pct(0.75) * 100) / 100,
      p84: Math.round(pct(0.84) * 100) / 100,
      p95: Math.round(pct(0.95) * 100) / 100,
      p97_5: Math.round(pct(0.975) * 100) / 100,
    },
    histogram,
    roi,
    duration_ms: Date.now() - start,
  };
}

// ── Jumpstart Theme-Based EV ───────────────────────────────────

// Tier pull rate weights (derived from 120-pack sample across 5 boxes)
const JUMPSTART_TIER_WEIGHTS: Record<string, number> = {
  common: 0.65,   // 65% of packs are common themes
  rare: 0.30,     // 30% of packs are rare themes
  mythic: 0.05,   // 5% of packs are mythic themes
};

export function calculateJumpstartEv(
  cards: EvCard[],
  themes: EvJumpstartTheme[],
  options: { siftFloor: number; feeRate: number; setCode: string; packsPerBox: number }
): EvJumpstartResult {
  const { siftFloor, feeRate, setCode, packsPerBox } = options;

  // Build a name→card lookup (lowercase for fuzzy matching)
  const cardByName = new Map<string, EvCard>();
  for (const c of cards) {
    cardByName.set(c.name.toLowerCase(), c);
  }

  // Count variants per tier for per-variant weight calculation
  const variantsPerTier = { common: 0, rare: 0, mythic: 0 };
  for (const t of themes) variantsPerTier[t.tier]++;

  const themeResults: EvJumpstartThemeResult[] = [];

  for (const theme of themes) {
    let themeEvGross = 0;
    let rareCount = 0;
    const cardResults: EvJumpstartThemeResult["cards"] = [];

    for (const cardName of theme.cards) {
      const card = cardByName.get(cardName.toLowerCase());
      const price = card?.price_eur ?? 0;
      const effectivePrice = price >= siftFloor ? price : 0;
      themeEvGross += effectivePrice;

      if (card && (card.rarity === "rare" || card.rarity === "mythic")) rareCount++;

      cardResults.push({
        name: cardName,
        rarity: card?.rarity ?? "unknown",
        price: price,
        image_uri: card?.image_uri ?? null,
      });
    }

    // Sort cards by price desc within each theme
    cardResults.sort((a, b) => b.price - a.price);

    themeResults.push({
      name: theme.name,
      variant: theme.variant,
      color: theme.color,
      tier: theme.tier,
      ev_gross: Math.round(themeEvGross * 100) / 100,
      ev_net: Math.round(themeEvGross * (1 - feeRate) * 100) / 100,
      rare_count: rareCount,
      cards: cardResults,
    });
  }

  // Sort themes by EV desc
  themeResults.sort((a, b) => b.ev_gross - a.ev_gross);

  // Weighted average EV per pack using tier pull rates
  // Each variant's weight = tier_weight / variants_in_tier
  let weightedEvGross = 0;
  for (const t of themeResults) {
    const tierWeight = JUMPSTART_TIER_WEIGHTS[t.tier] ?? 0;
    const variantCount = variantsPerTier[t.tier] || 1;
    const perVariantWeight = tierWeight / variantCount;
    weightedEvGross += t.ev_gross * perVariantWeight;
  }
  const weightedEvNet = weightedEvGross * (1 - feeRate);

  return {
    set_code: setCode,
    packs_per_box: packsPerBox,
    theme_count: themeResults.length,
    themes: themeResults,
    avg_theme_ev_gross: Math.round(weightedEvGross * 100) / 100,
    avg_theme_ev_net: Math.round(weightedEvNet * 100) / 100,
    box_ev_gross: Math.round(weightedEvGross * packsPerBox * 100) / 100,
    box_ev_net: Math.round(weightedEvNet * packsPerBox * 100) / 100,
    fee_rate: feeRate,
    sift_floor: siftFloor,
  };
}

// ── Jumpstart Monte Carlo Simulation ───────────────────────────

export function simulateJumpstartBox(
  cards: EvCard[],
  themes: EvJumpstartTheme[],
  options: {
    siftFloor: number;
    feeRate: number;
    packsPerBox: number;
    iterations: number;
    boxCost?: number;
    quantity?: number;
  }
): EvSimulationResult {
  const start = Date.now();
  const { siftFloor, feeRate, packsPerBox, iterations } = options;

  // Build name→price lookup
  const cardByName = new Map<string, EvCard>();
  for (const c of cards) cardByName.set(c.name.toLowerCase(), c);

  // Pre-calculate gross EV for each theme variant
  const themeEvs: { tier: string; evGross: number }[] = themes.map((theme) => {
    let ev = 0;
    for (const name of theme.cards) {
      const card = cardByName.get(name.toLowerCase());
      const price = card?.price_eur ?? 0;
      if (price >= siftFloor) ev += price;
    }
    return { tier: theme.tier, evGross: ev };
  });

  // Group themes by tier for weighted random selection
  const byTier: Record<string, number[]> = { common: [], rare: [], mythic: [] };
  themeEvs.forEach((t, i) => byTier[t.tier]?.push(i));

  // Build cumulative tier weights for fast selection — skip tiers with no themes
  const allTiers = [
    { name: "common", weight: JUMPSTART_TIER_WEIGHTS.common, indices: byTier.common },
    { name: "rare", weight: JUMPSTART_TIER_WEIGHTS.rare, indices: byTier.rare },
    { name: "mythic", weight: JUMPSTART_TIER_WEIGHTS.mythic, indices: byTier.mythic },
  ];
  const tiers = allTiers.filter(t => t.indices.length > 0);
  const cumWeights: number[] = [];
  let cumW = 0;
  for (const t of tiers) { cumW += t.weight; cumWeights.push(cumW); }
  // Normalize so cumulative weights sum to 1.0 (in case tiers were filtered out)
  if (cumW > 0 && cumW !== 1) {
    for (let i = 0; i < cumWeights.length; i++) cumWeights[i] /= cumW;
  }

  // Simulate
  const boxValues: number[] = new Array(iterations);

  for (let i = 0; i < iterations; i++) {
    let boxGross = 0;

    for (let p = 0; p < packsPerBox; p++) {
      // Pick tier
      const roll = Math.random();
      let tierIdx = 0;
      while (tierIdx < cumWeights.length - 1 && roll > cumWeights[tierIdx]) tierIdx++;

      // Pick random theme within tier
      const indices = tiers[tierIdx].indices;
      const themeIdx = indices[Math.floor(Math.random() * indices.length)];
      boxGross += themeEvs[themeIdx].evGross;
    }

    boxValues[i] = boxGross * (1 - feeRate);
  }

  // Statistics (same as slot-based simulation)
  boxValues.sort((a, b) => a - b);

  const mean = boxValues.reduce((s, v) => s + v, 0) / iterations;
  const median = boxValues[Math.floor(iterations / 2)];
  const variance = boxValues.reduce((s, v) => s + (v - mean) ** 2, 0) / iterations;
  const stddev = Math.sqrt(variance);

  const pct = (p: number) => boxValues[Math.floor(iterations * p)];

  const min = boxValues[0];
  const max = boxValues[iterations - 1];
  const binCount = 50;
  const binWidth = (max - min) / binCount || 1;
  const histogram: { bin_min: number; bin_max: number; count: number }[] = [];
  for (let b = 0; b < binCount; b++) {
    histogram.push({ bin_min: min + b * binWidth, bin_max: min + (b + 1) * binWidth, count: 0 });
  }
  for (const v of boxValues) {
    const idx = Math.min(Math.floor((v - min) / binWidth), binCount - 1);
    histogram[idx].count++;
  }

  let roi: EvSimulationResult["roi"] = null;
  if (options.boxCost && options.boxCost > 0) {
    const qty = options.quantity || 1;
    const profitCount = boxValues.filter((v) => v > options.boxCost!).length;
    roi = {
      box_cost: options.boxCost,
      quantity: qty,
      roi_percent: Math.round(((mean - options.boxCost) / options.boxCost) * 10000) / 100,
      profit_per_box: Math.round((mean - options.boxCost) * 100) / 100,
      total_profit: Math.round((mean - options.boxCost) * qty * 100) / 100,
      profit_probability: Math.round((profitCount / iterations) * 10000) / 100,
    };
  }

  return {
    iterations,
    mean: Math.round(mean * 100) / 100,
    median: Math.round(median * 100) / 100,
    stddev: Math.round(stddev * 100) / 100,
    min: Math.round(min * 100) / 100,
    max: Math.round(max * 100) / 100,
    percentiles: {
      p2_5: Math.round(pct(0.025) * 100) / 100,
      p5: Math.round(pct(0.05) * 100) / 100,
      p16: Math.round(pct(0.16) * 100) / 100,
      p25: Math.round(pct(0.25) * 100) / 100,
      p75: Math.round(pct(0.75) * 100) / 100,
      p84: Math.round(pct(0.84) * 100) / 100,
      p95: Math.round(pct(0.95) * 100) / 100,
      p97_5: Math.round(pct(0.975) * 100) / 100,
    },
    histogram,
    roi,
    duration_ms: Date.now() - start,
  };
}

// ── Snapshots ──────────────────────────────────────────────────

export async function generateSnapshot(setCode: string): Promise<EvSnapshot | null> {
  await ensureIndexes();
  const { cards } = await getCardsForSet(setCode, { boosterOnly: false, limit: 10000 });
  const today = new Date().toISOString().slice(0, 10);

  let playEvGross: number | null = null;
  let playEvNet: number | null = null;
  let collectorEvGross: number | null = null;
  let collectorEvNet: number | null = null;

  // Check if this is a Jumpstart set with theme data
  const jumpstartThemes = await getJumpstartThemes(setCode);
  const config = await getConfig(setCode);
  if (jumpstartThemes) {
    const feeRate = config?.fee_rate ?? 0.05;
    const siftFloor = config?.sift_floor ?? 0.25;
    const packsPerBox = config?.play_booster?.packs_per_box ?? 24;

    const result = calculateJumpstartEv(cards, jumpstartThemes, {
      siftFloor,
      feeRate,
      setCode,
      packsPerBox,
    });
    playEvGross = result.box_ev_gross;
    playEvNet = result.box_ev_net;
  } else {
    // Standard slot-based calculation
    if (!config) return null;

    if (config.play_booster) {
      const result = calculateEv(cards, config.play_booster, {
        siftFloor: config.sift_floor,
        feeRate: config.fee_rate,
        setCode,
        boosterType: "play",
      });
      playEvGross = result.box_ev_gross;
      playEvNet = result.box_ev_net;
    }

    if (config.collector_booster) {
      const result = calculateEv(cards, config.collector_booster, {
        siftFloor: config.sift_floor,
        feeRate: config.fee_rate,
        setCode,
        boosterType: "collector",
      });
      collectorEvGross = result.box_ev_gross;
      collectorEvNet = result.box_ev_net;
    }
  }

  const db = await getDb();
  const doc = {
    date: today,
    set_code: setCode,
    play_ev_gross: playEvGross,
    play_ev_net: playEvNet,
    collector_ev_gross: collectorEvGross,
    collector_ev_net: collectorEvNet,
    card_count_total: cards.length,
    card_count_priced: cards.filter((c) => c.price_eur !== null || c.price_eur_foil !== null).length,
    sift_floor: config?.sift_floor ?? 0.25,
    created_at: new Date().toISOString(),
  };

  await db.collection(COL_SNAPSHOTS).updateOne(
    { set_code: setCode, date: today },
    { $set: doc },
    { upsert: true }
  );

  return { ...doc, _id: "" } as EvSnapshot;
}

export async function generateAllSnapshots(): Promise<{ generated: number; errors: string[] }> {
  await ensureIndexes();
  const db = await getDb();

  // Collect all set codes that should get snapshots: saved configs + jumpstart themes
  const configCodes = await db.collection(COL_CONFIG).find({}, { projection: { set_code: 1 } }).toArray();
  const jumpstartCodes = await db.collection(COL_JUMPSTART_THEMES).aggregate([
    { $group: { _id: "$set_code" } },
  ]).toArray();

  const allCodes = new Set([
    ...configCodes.map((c) => c.set_code as string),
    ...jumpstartCodes.map((c) => c._id as string),
  ]);

  let generated = 0;
  const errors: string[] = [];

  for (const code of allCodes) {
    try {
      const result = await generateSnapshot(code);
      if (result) generated++;
    } catch (err) {
      errors.push(`${code}: ${String(err)}`);
    }
  }

  return { generated, errors };
}

export async function getSnapshots(setCode: string, days: number = 90): Promise<EvSnapshot[]> {
  await ensureIndexes();
  const db = await getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const docs = await db
    .collection(COL_SNAPSHOTS)
    .find({ set_code: setCode, date: { $gte: cutoffStr } })
    .sort({ date: 1 })
    .toArray();

  return docs.map((d) => ({ ...d, _id: d._id.toString() }) as EvSnapshot);
}

// ── Scryfall Sync: Full Catalog (bulk data) ────────────────────

import {
  fetchBulkDataIndex,
  findDefaultCardsEntry,
  streamBulkCards,
} from "@/lib/scryfall-bulk";

export async function refreshAllScryfall(): Promise<{
  setsUpserted: number;
  cardsUpserted: number;
  durationMs: number;
}> {
  const started = Date.now();
  await ensureIndexes();

  // 1. Refresh sets (full catalog — filter dropped in Task 9)
  const setResult = await syncSets();
  const setsUpserted = setResult.added + setResult.updated;

  // 2. Fetch bulk-data index and locate default_cards
  const index = await fetchBulkDataIndex();
  const entry = findDefaultCardsEntry(index);

  // 3. Download the bulk file (Scryfall ships the default_cards JSON
  // ungzipped at the CDN, so we use the body directly)
  const fileRes = await fetch(entry.download_uri, {
    headers: { "User-Agent": SCRYFALL_UA },
  });
  if (!fileRes.ok || !fileRes.body) {
    throw new Error(`Scryfall bulk-data download failed: ${fileRes.status}`);
  }
  const body = fileRes.body;

  // 4. Stream-parse and bulk-upsert
  const db = await getDb();
  const col = db.collection(COL_CARDS);
  let cardsUpserted = 0;

  await streamBulkCards(body, {
    batchSize: 1000,
    onBatch: async (batch) => {
      const ops = batch.map((doc) => ({
        updateOne: {
          filter: { scryfall_id: doc.scryfall_id },
          update: { $set: doc },
          upsert: true,
        },
      }));
      const result = await col.bulkWrite(ops, { ordered: false });
      cardsUpserted += (result.upsertedCount ?? 0) + (result.modifiedCount ?? 0);
    },
  });

  return {
    setsUpserted,
    cardsUpserted,
    durationMs: Date.now() - started,
  };
}
