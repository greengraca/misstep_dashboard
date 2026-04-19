import { getDb } from "@/lib/mongodb";
import { logActivity } from "@/lib/activity";
import { J25_THEMES } from "@/lib/ev-jumpstart-j25";
import { effectivePriceValue, effectivePriceWithFallback } from "@/lib/ev-prices";
import { MB2_PICKUP_CARDS } from "@/lib/ev-mb2-list";
import { generateAllProductSnapshots, COL_EV_SNAPSHOTS as COL_SNAPSHOTS } from "./ev-products";
import type {
  EvSet,
  EvCard,
  EvCardFilter,
  EvSlotDefinition,
  EvSlotOutcome,
  EvBoosterConfig,
  EvConfig,
  EvConfigInput,
  EvCalculationResult,
  EvSimulationResult,
  EvSnapshot,
  EvJumpstartTheme,
  EvJumpstartThemeResult,
  EvJumpstartResult,
  EvJumpstartWeights,
  EvJumpstartSessionSubmit,
} from "@/lib/types";

// ── Jumpstart seed data (used only for initial DB population) ──
const JUMPSTART_SEED_DATA: Record<string, EvJumpstartTheme[]> = {
  j25: J25_THEMES,
};

// ── Collection names ───────────────────────────────────────────
const COL_SETS = "dashboard_ev_sets";
const COL_CARDS = "dashboard_ev_cards";
const COL_CONFIG = "dashboard_ev_config";
const COL_JUMPSTART_THEMES = "dashboard_ev_jumpstart_themes";
const COL_JUMPSTART_WEIGHTS = "dashboard_ev_jumpstart_weights";

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

    // Auto-heal: drop the legacy snapshot unique index if it still exists.
    // Without this, product snapshots collide on the second-ever product per day
    // because the legacy index enforces unique (set_code, date) and products
    // leave set_code as null.
    try {
      await db.collection(COL_SNAPSHOTS).dropIndex("set_code_date_unique");
    } catch {
      // Not present (already migrated, or fresh DB) — fine.
    }

    await Promise.all([
      db.collection(COL_SETS).createIndex({ code: 1 }, { unique: true, name: "code_unique" }),
      db.collection(COL_SETS).createIndex({ released_at: -1 }, { name: "released_desc" }),
      db.collection(COL_SETS).createIndex({ name: 1 }, { name: "name" }),
      db.collection(COL_CARDS).createIndex({ scryfall_id: 1 }, { unique: true, name: "scryfall_id_unique" }),
      db.collection(COL_CARDS).createIndex({ set: 1, rarity: 1 }, { name: "set_rarity" }),
      db.collection(COL_CARDS).createIndex({ set: 1, booster: 1 }, { name: "set_booster" }),
      db.collection(COL_CARDS).createIndex({ set: 1, name: 1 }, { name: "set_name" }),
      db.collection(COL_CONFIG).createIndex({ set_code: 1 }, { unique: true, name: "set_code_unique" }),
      db.collection(COL_SNAPSHOTS).createIndex(
        { set_code: 1, product_slug: 1, date: 1 },
        { unique: true, name: "set_code_product_slug_date_unique" }
      ),
      db.collection(COL_SNAPSHOTS).createIndex(
        { product_slug: 1, date: -1 },
        { name: "product_slug_date" }
      ),
      db.collection(COL_JUMPSTART_THEMES).createIndex({ set_code: 1 }, { name: "jst_set_code" }),
      db.collection(COL_JUMPSTART_WEIGHTS).createIndex({ set_code: 1 }, { unique: true, name: "jsw_set_code_unique" }),
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

// USD → EUR fallback: ECB exchange rate via frankfurter.dev, then 25% EU market discount
const EUR_MARKET_DISCOUNT = 0.75;
const FRANKFURTER_URL = "https://api.frankfurter.dev/v1/latest?from=USD&to=EUR";
let cachedUsdToEurRate: number | null = null;

async function getUsdToEurRate(): Promise<number> {
  if (cachedUsdToEurRate !== null) return cachedUsdToEurRate;
  try {
    const res = await fetch(FRANKFURTER_URL);
    if (!res.ok) throw new Error(`Frankfurter ${res.status}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    cachedUsdToEurRate = data.rates.EUR as number;
    return cachedUsdToEurRate;
  } catch {
    // Fallback if API is down
    cachedUsdToEurRate = 0.856;
    return cachedUsdToEurRate;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyUsdFallback(card: any, usdToEur: number): { price_eur: number | null; price_eur_foil: number | null; price_eur_estimated: boolean } {
  let price_eur = card.prices?.eur ? parseFloat(card.prices.eur) : null;
  let price_eur_foil = card.prices?.eur_foil ? parseFloat(card.prices.eur_foil) : null;
  let price_eur_estimated = false;
  const factor = usdToEur * EUR_MARKET_DISCOUNT;

  // Fallback chain for EUR: eur → usd (converted)
  if (price_eur === null && card.prices?.usd) {
    price_eur = Math.round(parseFloat(card.prices.usd) * factor * 100) / 100;
    price_eur_estimated = true;
  }
  // Fallback chain for EUR foil: eur_foil → usd_foil (converted)
  if (price_eur_foil === null && card.prices?.usd_foil) {
    price_eur_foil = Math.round(parseFloat(card.prices.usd_foil) * factor * 100) / 100;
    if (price_eur === null) price_eur_estimated = true;
  }
  // Last resort: if still no EUR price, use foil price (for foil-only cards)
  if (price_eur === null && price_eur_foil !== null) {
    price_eur = price_eur_foil;
    price_eur_estimated = true;
  }

  return { price_eur, price_eur_foil, price_eur_estimated };
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

/**
 * Sync a single Scryfall set by code (bypasses the MIN_RELEASE_YEAR UI filter
 * and the BOOSTER_SET_TYPES gate — meant for ad-hoc admin syncing, e.g.
 * pulling in a pre-2020 parent set when seeding a fixed-pool product).
 *
 * Use this alongside `syncCards(code)` to populate both sets and cards for one code.
 */
export async function syncOneSet(code: string): Promise<{ added: number; updated: number }> {
  await ensureIndexes();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = (await scryfallGet(`/sets/${code}`)) as any;
  const db = await getDb();
  const col = db.collection(COL_SETS);
  const now = new Date().toISOString();
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
  return {
    added: result.upsertedCount ? 1 : 0,
    updated: result.modifiedCount && !result.upsertedCount ? 1 : 0,
  };
}

export async function getSets(): Promise<EvSet[]> {
  await ensureIndexes();
  const db = await getDb();

  // Collect set codes referenced by any EvProduct (parent_set_code or
  // included_boosters[].set_code). These get included in the UI list even
  // if they predate MIN_RELEASE_YEAR — otherwise pre-2020 parent sets for
  // Planeswalker Decks / Commander precons can't be configured or snapshotted.
  const productSets = await db
    .collection("dashboard_ev_products")
    .aggregate([
      {
        $project: {
          codes: {
            $setUnion: [
              { $cond: [{ $ifNull: ["$parent_set_code", false] }, ["$parent_set_code"], []] },
              { $ifNull: ["$included_boosters.set_code", []] },
            ],
          },
        },
      },
      { $unwind: "$codes" },
      { $group: { _id: "$codes" } },
    ])
    .toArray();
  const productReferencedCodes = productSets.map((d) => d._id as string).filter(Boolean);

  // Read-time filter: EV calculator UI only wants booster sets released in 2020+,
  // excluding digital-only. The underlying collection may contain every Scryfall set
  // (since refreshAllScryfall populates the full catalog for canonical sort).
  // Product-referenced sets bypass the year filter via $or.
  const sets = await db
    .collection(COL_SETS)
    .find({
      $or: [
        {
          set_type: { $in: Array.from(BOOSTER_SET_TYPES) },
          released_at: { $gte: `${MIN_RELEASE_YEAR}-01-01` },
          $or: [{ digital: { $ne: true } }, { digital: { $exists: false } }],
        },
        ...(productReferencedCodes.length > 0 ? [{ code: { $in: productReferencedCodes } }] : []),
      ],
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

  // Count mb2-list cards to show accurate total for MB2
  const mb2ListCount = await db.collection(COL_CARDS).countDocuments({ set: "mb2-list" });

  return sets.map((s) => {
    const snap = snapMap.get(s.code);
    return {
      ...s,
      _id: s._id.toString(),
      card_count: s.code === "mb2" && mb2ListCount > 0 ? s.card_count + mb2ListCount : s.card_count,
      config_exists: configSet.has(s.code) || jumpstartSet.has(s.code) || s.code in JUMPSTART_SEED_DATA || s.code === "mb2",
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
  setCode: string,
  onProgress?: (pct: number) => void,
): Promise<{ added: number; updated: number; total: number }> {
  await ensureIndexes();
  const db = await getDb();
  const col = db.collection(COL_CARDS);
  const now = new Date().toISOString();
  const usdToEur = await getUsdToEurRate();
  let added = 0, updated = 0, total = 0;

  let url: string | null = `/cards/search?q=set:${setCode}&unique=prints&order=set`;
  while (url) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = (await scryfallGet(url)) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const card of page.data as any[]) {
      total++;
      const treatment = deriveCardTreatment(card);
      const { price_eur, price_eur_foil, price_eur_estimated } = applyUsdFallback(card, usdToEur);
      const doc = {
        scryfall_id: card.id,
        set: card.set,
        name: card.name,
        collector_number: card.collector_number,
        rarity: card.rarity,
        price_eur,
        price_eur_foil,
        price_eur_estimated,
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
        frame: card.frame ?? "2015",
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
    // Estimate progress: total_cards from first page response, cards processed so far
    if (onProgress && page.total_cards) onProgress(Math.min(99, Math.round((total / page.total_cards) * 100)));
  }
  onProgress?.(100);

  return { added, updated, total };
}

// ── MB2 Pick-up Reprint Sync ──────────────────────────────────

export async function syncMB2Cards(
  onProgress?: (pct: number, phase: string) => void,
): Promise<{ native: { added: number; updated: number; total: number }; pickups: { added: number; updated: number; total: number } }> {
  // 1. Sync the 385 native mb2 cards (futureshifted, white-bordered, test, acorn)
  onProgress?.(0, "Syncing native mb2 cards...");
  const native = await syncCards("mb2", (pct) => onProgress?.(Math.round(pct * 0.2), "Syncing native mb2 cards..."));

  // 2. Sync the 1451 pick-up reprints from plst via /cards/collection
  await ensureIndexes();
  const db = await getDb();
  const col = db.collection(COL_CARDS);
  const now = new Date().toISOString();
  const usdToEur = await getUsdToEurRate(); // already cached from syncCards above
  let added = 0, updated = 0, total = 0;

  const BATCH_SIZE = 75;
  for (let i = 0; i < MB2_PICKUP_CARDS.length; i += BATCH_SIZE) {
    const batch = MB2_PICKUP_CARDS.slice(i, i + BATCH_SIZE);
    const identifiers = batch.map((c) => ({ name: c.name, set: "plst" }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = (await scryfallPost("/cards/collection", { identifiers })) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const card of (res.data || []) as any[]) {
      total++;
      const treatment = deriveCardTreatment(card);
      const { price_eur, price_eur_foil, price_eur_estimated } = applyUsdFallback(card, usdToEur);
      const doc = {
        scryfall_id: card.id,
        set: "mb2-list",
        name: card.name,
        collector_number: card.collector_number,
        rarity: card.rarity,
        price_eur,
        price_eur_foil,
        price_eur_estimated,
        finishes: card.finishes || [],
        booster: card.booster ?? false,
        image_uri: card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small || null,
        cardmarket_id: card.cardmarket_id ?? null,
        type_line: card.type_line || "",
        frame_effects: card.frame_effects || [],
        promo_types: card.promo_types || [],
        border_color: card.border_color || "black",
        treatment,
        colors: card.colors ?? [],
        color_identity: card.color_identity ?? [],
        cmc: typeof card.cmc === "number" ? card.cmc : 0,
        released_at: card.released_at ?? "9999-12-31",
        layout: card.layout ?? "normal",
        frame: card.frame ?? "2015",
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
    if (i + BATCH_SIZE < MB2_PICKUP_CARDS.length) await sleep(SCRYFALL_DELAY_MS);
    // 20-100% range (native sync is 0-20%)
    onProgress?.(20 + Math.round(((i + BATCH_SIZE) / MB2_PICKUP_CARDS.length) * 80), "Syncing pick-up reprints...");
  }
  onProgress?.(100, "Done");

  return { native, pickups: { added, updated, total } };
}

async function scryfallPost(path: string, body: unknown): Promise<unknown> {
  const url = `${SCRYFALL_BASE}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "User-Agent": SCRYFALL_UA, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Scryfall POST ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function getCardsForSet(
  setCode: string,
  options?: { boosterOnly?: boolean; page?: number; limit?: number }
): Promise<{ cards: EvCard[]; total: number }> {
  await ensureIndexes();
  const db = await getDb();
  const col = db.collection(COL_CARDS);
  // MB2: combine native mb2 cards with plst pick-up reprints stored as "mb2-list"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: any = setCode === "mb2" ? { set: { $in: ["mb2", "mb2-list"] } } : { set: setCode };
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
      { slot_number: 1, label: "Common 1", is_foil: false, outcomes: [{ probability: 1, filter: { rarity: ["common"], treatment: ["normal"], booster: true, type_line_not_contains: "Basic Land" } }] },
      { slot_number: 2, label: "Common 2", is_foil: false, outcomes: [{ probability: 1, filter: { rarity: ["common"], treatment: ["normal"], booster: true, type_line_not_contains: "Basic Land" } }] },
      { slot_number: 3, label: "Common 3", is_foil: false, outcomes: [{ probability: 1, filter: { rarity: ["common"], treatment: ["normal"], booster: true, type_line_not_contains: "Basic Land" } }] },
      { slot_number: 4, label: "Common 4", is_foil: false, outcomes: [{ probability: 1, filter: { rarity: ["common"], treatment: ["normal"], booster: true, type_line_not_contains: "Basic Land" } }] },
      { slot_number: 5, label: "Common 5", is_foil: false, outcomes: [{ probability: 1, filter: { rarity: ["common"], treatment: ["normal"], booster: true, type_line_not_contains: "Basic Land" } }] },
      { slot_number: 6, label: "Common 6", is_foil: false, outcomes: [{ probability: 1, filter: { rarity: ["common"], treatment: ["normal"], booster: true, type_line_not_contains: "Basic Land" } }] },
      {
        slot_number: 7, label: "Common / SPG", is_foil: false,
        outcomes: [
          { probability: 0.96875, filter: { rarity: ["common"], treatment: ["normal"], booster: true, type_line_not_contains: "Basic Land" } },
          { probability: 0.03125, filter: { promo_types: ["spg"] } },
        ],
      },
      { slot_number: 8, label: "Uncommon 1", is_foil: false, outcomes: [{ probability: 1, filter: { rarity: ["uncommon"], treatment: ["normal"], booster: true } }] },
      { slot_number: 9, label: "Uncommon 2", is_foil: false, outcomes: [{ probability: 1, filter: { rarity: ["uncommon"], treatment: ["normal"], booster: true } }] },
      { slot_number: 10, label: "Uncommon 3", is_foil: false, outcomes: [{ probability: 1, filter: { rarity: ["uncommon"], treatment: ["normal"], booster: true } }] },
      {
        slot_number: 11, label: "Rare / Mythic Wildcard", is_foil: false,
        outcomes: [
          { probability: 0.780, filter: { rarity: ["rare"], treatment: ["normal"], booster: true } },
          { probability: 0.128, filter: { rarity: ["mythic"], treatment: ["normal"], booster: true } },
          { probability: 0.077, filter: { rarity: ["rare"], border_color: ["borderless"], booster: true } },
          { probability: 0.015, filter: { rarity: ["mythic"], border_color: ["borderless"], booster: true } },
        ],
      },
      {
        slot_number: 12, label: "Foil Wildcard", is_foil: true,
        outcomes: [
          { probability: 0.667, filter: { rarity: ["common"], booster: true, type_line_not_contains: "Basic Land" } },
          { probability: 0.250, filter: { rarity: ["uncommon"], booster: true } },
          { probability: 0.069, filter: { rarity: ["rare"], booster: true } },
          { probability: 0.014, filter: { rarity: ["mythic"], booster: true } },
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

// ── Draft Booster 2017–2023 Default Config ────────────────────
//
// The draft booster format used by every premier expansion from Amonkhet
// (2017) through the end of 2023. Replaced by the 15-card Play Booster in
// early 2024. Structure:
//   - 9 plain commons
//   - 1 common slot that is replaced by a foil in ~1/6 packs, or by a
//     Masterpiece in ~1/129 packs (Kaladesh-block only). Standard MTG foil
//     rate is ≈1 foil per 67 cards = 6 per 36-pack box.
//   - 3 uncommons
//   - 1 rare/mythic (87.5% rare, 12.5% mythic — standard 1:8 ratio)
//   - 1 basic land / checklist card (no EV contribution)
//   Plus: a separate token/marketing card slot that isn't counted.
//
// Foil prices: slot 10's foil outcomes use outcome-level is_foil:true so the
// calc reads price_eur_foil. Masterpieces are a cross-set pool (separate
// Scryfall set code) and require the caller to pass masterpieceSetCode.

/**
 * Reference to the Masterpiece subset pulled by a parent expansion's
 * boosters. Masterpiece Series sets combine the batches from two parent
 * expansions in a single Scryfall set, discriminated by collector number:
 *   - Zendikar Expeditions (`exp`): 1-25 BFZ, 26-45 OGW.
 *   - Kaladesh Inventions (`mps`):  1-30 KLD, 31-54 AER.
 *   - Amonkhet Invocations (`mp2`): 1-30 AKH, 31-54 HOU.
 * Without a collector-number range, the calc would pool ALL masterpieces
 * and overestimate EV roughly 2x.
 */
export interface MasterpieceRef {
  set_code: string;
  collector_number_min?: number;
  collector_number_max?: number;
}

export function masterpieceRefFor(setCode: string): MasterpieceRef | undefined {
  switch (setCode.toLowerCase()) {
    case "bfz": return { set_code: "exp", collector_number_max: 25 };
    case "ogw": return { set_code: "exp", collector_number_min: 26 };
    case "kld": return { set_code: "mps", collector_number_max: 30 };
    case "aer": return { set_code: "mps", collector_number_min: 31 };
    case "akh": return { set_code: "mp2", collector_number_max: 30 };
    case "hou": return { set_code: "mp2", collector_number_min: 31 };
    default: return undefined;
  }
}

export function getDefaultDraftBoosterConfig(options: { masterpiece?: MasterpieceRef } = {}): EvBoosterConfig {
  const { masterpiece } = options;
  // Probability budget for slot 10 (non-foil common vs foil wildcard vs
  // Masterpiece). Masterpieces REPLACE foils when they hit, so they eat
  // into the foil probability mass, not the plain-common mass.
  const pMasterpiece = masterpiece ? 1 / 129 : 0;          // ~1:1935 cards, 15 cards/pack
  const pFoilAny = 1 / 6 - pMasterpiece;                    // ~1 foil per 6 packs
  const pCommonPlain = 1 - 1 / 6;                           // 5/6 of packs have no foil

  // Conditional foil rarity distribution (1/12 + 1/18 + 1/36 + 1/216 = 37/216):
  //   common 18/37, uncommon 12/37, rare 6/37, mythic 1/37.
  const pFoilCommon = pFoilAny * (18 / 37);
  const pFoilUncommon = pFoilAny * (12 / 37);
  const pFoilRare = pFoilAny * (6 / 37);
  const pFoilMythic = pFoilAny * (1 / 37);

  const slot10Outcomes: EvSlotOutcome[] = [
    { probability: pCommonPlain, filter: { rarity: ["common"], treatment: ["normal"], booster: true, type_line_not_contains: "Basic Land" } },
    { probability: pFoilCommon, is_foil: true, filter: { rarity: ["common"], finishes: ["foil"], booster: true, type_line_not_contains: "Basic Land" } },
    { probability: pFoilUncommon, is_foil: true, filter: { rarity: ["uncommon"], finishes: ["foil"], booster: true } },
    { probability: pFoilRare, is_foil: true, filter: { rarity: ["rare"], finishes: ["foil"], booster: true } },
    { probability: pFoilMythic, is_foil: true, filter: { rarity: ["mythic"], finishes: ["foil"], booster: true } },
  ];
  if (masterpiece) {
    slot10Outcomes.push({
      probability: pMasterpiece,
      is_foil: true,
      filter: {
        set_codes: [masterpiece.set_code],
        ...(masterpiece.collector_number_min !== undefined ? { collector_number_min: masterpiece.collector_number_min } : {}),
        ...(masterpiece.collector_number_max !== undefined ? { collector_number_max: masterpiece.collector_number_max } : {}),
      },
    });
  }

  return {
    packs_per_box: 36,
    cards_per_pack: 15,
    slots: [
      { slot_number: 1, label: "Common 1", is_foil: false, outcomes: [{ probability: 1, filter: { rarity: ["common"], treatment: ["normal"], booster: true, type_line_not_contains: "Basic Land" } }] },
      { slot_number: 2, label: "Common 2", is_foil: false, outcomes: [{ probability: 1, filter: { rarity: ["common"], treatment: ["normal"], booster: true, type_line_not_contains: "Basic Land" } }] },
      { slot_number: 3, label: "Common 3", is_foil: false, outcomes: [{ probability: 1, filter: { rarity: ["common"], treatment: ["normal"], booster: true, type_line_not_contains: "Basic Land" } }] },
      { slot_number: 4, label: "Common 4", is_foil: false, outcomes: [{ probability: 1, filter: { rarity: ["common"], treatment: ["normal"], booster: true, type_line_not_contains: "Basic Land" } }] },
      { slot_number: 5, label: "Common 5", is_foil: false, outcomes: [{ probability: 1, filter: { rarity: ["common"], treatment: ["normal"], booster: true, type_line_not_contains: "Basic Land" } }] },
      { slot_number: 6, label: "Common 6", is_foil: false, outcomes: [{ probability: 1, filter: { rarity: ["common"], treatment: ["normal"], booster: true, type_line_not_contains: "Basic Land" } }] },
      { slot_number: 7, label: "Common 7", is_foil: false, outcomes: [{ probability: 1, filter: { rarity: ["common"], treatment: ["normal"], booster: true, type_line_not_contains: "Basic Land" } }] },
      { slot_number: 8, label: "Common 8", is_foil: false, outcomes: [{ probability: 1, filter: { rarity: ["common"], treatment: ["normal"], booster: true, type_line_not_contains: "Basic Land" } }] },
      { slot_number: 9, label: "Common 9", is_foil: false, outcomes: [{ probability: 1, filter: { rarity: ["common"], treatment: ["normal"], booster: true, type_line_not_contains: "Basic Land" } }] },
      { slot_number: 10, label: masterpiece ? "Common / Foil / Masterpiece" : "Common / Foil wildcard", is_foil: false, outcomes: slot10Outcomes },
      { slot_number: 11, label: "Uncommon 1", is_foil: false, outcomes: [{ probability: 1, filter: { rarity: ["uncommon"], treatment: ["normal"], booster: true } }] },
      { slot_number: 12, label: "Uncommon 2", is_foil: false, outcomes: [{ probability: 1, filter: { rarity: ["uncommon"], treatment: ["normal"], booster: true } }] },
      { slot_number: 13, label: "Uncommon 3", is_foil: false, outcomes: [{ probability: 1, filter: { rarity: ["uncommon"], treatment: ["normal"], booster: true } }] },
      {
        slot_number: 14, label: "Rare / Mythic", is_foil: false,
        outcomes: [
          { probability: 0.875, filter: { rarity: ["rare"], treatment: ["normal"], booster: true } },
          { probability: 0.125, filter: { rarity: ["mythic"], treatment: ["normal"], booster: true } },
        ],
      },
      {
        // 1 basic land per pack, equal probability across all printed basic
        // arts in the set. Modern full-art / desert basics (e.g. Amonkhet)
        // have meaningful market value and contribute real EV here.
        slot_number: 15, label: "Basic Land", is_foil: false,
        outcomes: [
          { probability: 1, filter: { type_line_contains: "Basic Land", booster: true } },
        ],
      },
    ],
  };
}

/**
 * Returns true when the set falls in the draft-booster era (roughly
 * Amonkhet 2017 through end of 2023, before Play Boosters rolled out in
 * early 2024). Saved configs always override this.
 */
export function isDraftBoosterEra(set: { set_type?: string; released_at?: string } | null | undefined): boolean {
  if (!set) return false;
  if (set.set_type !== "expansion" && set.set_type !== "core" && set.set_type !== "masters") return false;
  const d = set.released_at;
  if (!d) return false;
  return d >= "2017-01-01" && d < "2024-01-01";
}

// ── Mystery Booster 2 Default Config ──────────────────────────

const MB2_NON_FUTURE_FRAMES = ["2015", "2003", "1997", "1993"];

export function getDefaultMB2BoosterConfig(): EvBoosterConfig {
  const base: Omit<EvCardFilter, "colors"> = { rarity: ["common", "uncommon"], border_color: ["black"], frame: MB2_NON_FUTURE_FRAMES, finishes: ["nonfoil"], booster: true, mono_color: true };
  const cuW: EvCardFilter = { ...base, colors: ["W"] };
  const cuU: EvCardFilter = { ...base, colors: ["U"] };
  const cuB: EvCardFilter = { ...base, colors: ["B"] };
  const cuR: EvCardFilter = { ...base, colors: ["R"] };
  const cuG: EvCardFilter = { ...base, colors: ["G"] };
  const rmFilter: EvCardFilter = { rarity: ["rare", "mythic"], border_color: ["black"], frame: MB2_NON_FUTURE_FRAMES, finishes: ["nonfoil"], booster: true, mono_color: true };
  const slot11Filter: EvCardFilter = { border_color: ["black"], frame: MB2_NON_FUTURE_FRAMES, finishes: ["nonfoil"], booster: true, mono_color: false };

  return {
    packs_per_box: 24,
    cards_per_pack: 15,
    slots: [
      { slot_number: 1, label: "White C/U 1", is_foil: false, outcomes: [{ probability: 1, filter: cuW }] },
      { slot_number: 2, label: "White C/U 2", is_foil: false, outcomes: [{ probability: 1, filter: cuW }] },
      { slot_number: 3, label: "Blue C/U 1", is_foil: false, outcomes: [{ probability: 1, filter: cuU }] },
      { slot_number: 4, label: "Blue C/U 2", is_foil: false, outcomes: [{ probability: 1, filter: cuU }] },
      { slot_number: 5, label: "Black C/U 1", is_foil: false, outcomes: [{ probability: 1, filter: cuB }] },
      { slot_number: 6, label: "Black C/U 2", is_foil: false, outcomes: [{ probability: 1, filter: cuB }] },
      { slot_number: 7, label: "Red C/U 1", is_foil: false, outcomes: [{ probability: 1, filter: cuR }] },
      { slot_number: 8, label: "Red C/U 2", is_foil: false, outcomes: [{ probability: 1, filter: cuR }] },
      { slot_number: 9, label: "Green C/U 1", is_foil: false, outcomes: [{ probability: 1, filter: cuG }] },
      { slot_number: 10, label: "Green C/U 2", is_foil: false, outcomes: [{ probability: 1, filter: cuG }] },
      { slot_number: 11, label: "Multi/Artifact/Land", is_foil: false, outcomes: [{ probability: 1, filter: slot11Filter }] },
      { slot_number: 12, label: "Rare / Mythic Rare", is_foil: false, outcomes: [{ probability: 1, filter: rmFilter }] },
      {
        // 99% futureshifted (95% non-foil, 5% foil) + 1% alchemy replacement
        // Non-foil pool: finishes includes "nonfoil" → excludes foil-only cards (#243-265)
        // Foil pool: finishes includes "foil" → includes both-finish + foil-only cards
        slot_number: 13, label: "Future Sight Frame", is_foil: false,
        outcomes: [
          { probability: 0.564, filter: { rarity: ["rare", "mythic"], frame: ["future"], finishes: ["nonfoil"] } },
          { probability: 0.376, filter: { rarity: ["common", "uncommon"], frame: ["future"], finishes: ["nonfoil"] } },
          { probability: 0.030, filter: { rarity: ["rare", "mythic"], frame: ["future"], finishes: ["foil"] } },
          { probability: 0.020, filter: { rarity: ["common", "uncommon"], frame: ["future"], finishes: ["foil"] } },
          { probability: 0.010, filter: { promo_types: ["alchemy"] } },
        ],
      },
      {
        slot_number: 14, label: "White-Bordered", is_foil: false,
        outcomes: [
          { probability: 0.40, filter: { rarity: ["rare", "mythic"], border_color: ["white"] } },
          { probability: 0.60, filter: { rarity: ["common", "uncommon"], border_color: ["white"] } },
        ],
      },
      { slot_number: 15, label: "Test Card (no value)", is_foil: false, outcomes: [] },
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

// ── Jumpstart Empirical Weights ─────────────────────────────────
//
// Stores raw per-session counts and derives tier_weights + theme_weights
// from the accumulated sample. Starts from a seed prior (see
// JUMPSTART_PRIOR_SAMPLES) so the first saved session merges onto the
// existing 120-pack baseline instead of overwriting it.

function tierWeightsFromCounts(counts: { common: number; rare: number; mythic: number }) {
  const total = counts.common + counts.rare + counts.mythic;
  if (total <= 0) return { common: 0.65, rare: 0.30, mythic: 0.05 };
  return {
    common: counts.common / total,
    rare: counts.rare / total,
    mythic: counts.mythic / total,
  };
}

// Laplace-smoothed absolute per-theme probability, scaled by the tier share.
// If no theme counts exist for a tier, falls back to uniform within that tier.
function themeWeightsFromCounts(
  themes: EvJumpstartTheme[],
  themeCounts: Record<string, number>,
  tierWeights: { common: number; rare: number; mythic: number }
): Record<string, number> {
  const byTier: Record<JumpstartTierKey, EvJumpstartTheme[]> = { common: [], rare: [], mythic: [] };
  for (const t of themes) byTier[t.tier].push(t);

  const out: Record<string, number> = {};
  for (const tier of ["common", "rare", "mythic"] as JumpstartTierKey[]) {
    const group = byTier[tier];
    if (!group.length) continue;
    const tierShare = tierWeights[tier];
    const observed = group.map((t) => themeCounts[themeKey(t.name, t.variant)] ?? 0);
    const sumObserved = observed.reduce((s, v) => s + v, 0);

    if (sumObserved === 0) {
      // Uniform within tier — matches default behavior
      const uniform = tierShare / group.length;
      group.forEach((t) => { out[themeKey(t.name, t.variant)] = uniform; });
      continue;
    }

    // Laplace: (count + 1) / (sum + N) gives every variant nonzero probability
    const denom = sumObserved + group.length;
    group.forEach((t, i) => {
      const p = (observed[i] + 1) / denom;
      out[themeKey(t.name, t.variant)] = tierShare * p;
    });
  }
  return out;
}

async function buildInitialWeights(setCode: string, themes: EvJumpstartTheme[]): Promise<EvJumpstartWeights> {
  const prior = JUMPSTART_PRIOR_SAMPLES[setCode];
  const tier_counts = prior ? { ...prior.tier_counts } : { common: 0, rare: 0, mythic: 0 };
  const sample_size = prior ? prior.packs : 0;
  const tier_weights = tierWeightsFromCounts(tier_counts);
  const theme_counts: Record<string, number> = {};
  const theme_weights = themeWeightsFromCounts(themes, theme_counts, tier_weights);
  return {
    set_code: setCode,
    tier_counts,
    theme_counts,
    sample_size,
    tier_weights,
    theme_weights,
    sessions: prior ? [{
      date: "prior-5-boxes",
      packs: prior.packs,
      tier_counts: { ...prior.tier_counts },
      theme_counts: {},
    }] : [],
    updated_at: new Date().toISOString(),
  };
}

export async function getJumpstartWeights(setCode: string): Promise<EvJumpstartWeights | null> {
  await ensureIndexes();
  const db = await getDb();
  const doc = await db.collection(COL_JUMPSTART_WEIGHTS).findOne({ set_code: setCode });
  if (!doc) return null;
  return {
    _id: String(doc._id),
    set_code: doc.set_code,
    tier_counts: doc.tier_counts,
    theme_counts: doc.theme_counts ?? {},
    sample_size: doc.sample_size ?? 0,
    tier_weights: doc.tier_weights,
    theme_weights: doc.theme_weights ?? {},
    sessions: doc.sessions ?? [],
    updated_at: doc.updated_at,
  };
}

/** Ensure weights doc exists; seed from prior on first call. Returns current state. */
export async function ensureJumpstartWeights(setCode: string): Promise<EvJumpstartWeights> {
  const existing = await getJumpstartWeights(setCode);
  if (existing) return existing;

  const themes = await getJumpstartThemes(setCode);
  if (!themes) {
    // no themes yet — still save a zero-state doc so weights endpoint works
    return buildInitialWeights(setCode, []);
  }
  const fresh = await buildInitialWeights(setCode, themes);

  const db = await getDb();
  await db.collection(COL_JUMPSTART_WEIGHTS).updateOne(
    { set_code: setCode },
    { $setOnInsert: fresh },
    { upsert: true }
  );
  const saved = await getJumpstartWeights(setCode);
  return saved ?? fresh;
}

export async function appendJumpstartSession(
  setCode: string,
  session: EvJumpstartSessionSubmit
): Promise<EvJumpstartWeights> {
  await ensureIndexes();
  const themes = await getJumpstartThemes(setCode);
  if (!themes) throw new Error(`No Jumpstart themes for set ${setCode}`);

  const current = await ensureJumpstartWeights(setCode);

  const tier_counts = {
    common: current.tier_counts.common + (session.tier_counts.common || 0),
    rare: current.tier_counts.rare + (session.tier_counts.rare || 0),
    mythic: current.tier_counts.mythic + (session.tier_counts.mythic || 0),
  };
  const theme_counts: Record<string, number> = { ...current.theme_counts };
  for (const [k, v] of Object.entries(session.theme_counts || {})) {
    theme_counts[k] = (theme_counts[k] ?? 0) + v;
  }
  const sample_size = current.sample_size + (session.packs || 0);
  const tier_weights = tierWeightsFromCounts(tier_counts);
  const theme_weights = themeWeightsFromCounts(themes, theme_counts, tier_weights);
  const sessions = [
    ...current.sessions,
    {
      date: new Date().toISOString(),
      packs: session.packs || 0,
      tier_counts: session.tier_counts,
      theme_counts: session.theme_counts || {},
    },
  ];

  const db = await getDb();
  await db.collection(COL_JUMPSTART_WEIGHTS).updateOne(
    { set_code: setCode },
    {
      $set: {
        set_code: setCode,
        tier_counts,
        theme_counts,
        sample_size,
        tier_weights,
        theme_weights,
        sessions,
        updated_at: new Date().toISOString(),
      },
    },
    { upsert: true }
  );
  const saved = await getJumpstartWeights(setCode);
  if (!saved) throw new Error("Failed to save jumpstart weights");
  return saved;
}

export function weightsToOverride(w: EvJumpstartWeights | null): JumpstartWeightOverride | undefined {
  if (!w) return undefined;
  const hasThemeSignal = Object.keys(w.theme_counts || {}).length > 0;
  return {
    tierWeights: w.tier_weights,
    themeWeights: hasThemeSignal ? w.theme_weights : undefined,
  };
}

// ── Card Matching ──────────────────────────────────────────────

/**
 * Collect extra Scryfall set codes referenced by any outcome's `set_codes`
 * filter in a booster config, excluding the primary setCode. Callers use
 * this to pre-fetch cross-set card pools (e.g. Masterpieces from `mp2`
 * alongside Amonkhet cards from `akh`).
 */
export function collectExtraSetCodes(config: EvBoosterConfig, primarySetCode: string): string[] {
  const extras = new Set<string>();
  for (const slot of config.slots) {
    for (const outcome of slot.outcomes) {
      for (const code of outcome.filter.set_codes ?? []) {
        if (code && code !== primarySetCode) extras.add(code);
      }
    }
  }
  return [...extras];
}

export function matchCardsToFilter(cards: EvCard[], filter: EvCardFilter): EvCard[] {
  return cards.filter((c) => {
    if (filter.set_codes?.length && !filter.set_codes.includes(c.set)) return false;
    if (filter.collector_number_min !== undefined || filter.collector_number_max !== undefined) {
      const n = parseInt(c.collector_number, 10);
      if (!Number.isFinite(n)) return false;
      if (filter.collector_number_min !== undefined && n < filter.collector_number_min) return false;
      if (filter.collector_number_max !== undefined && n > filter.collector_number_max) return false;
    }
    if (filter.rarity?.length && !filter.rarity.includes(c.rarity)) return false;
    if (filter.treatment?.length && !filter.treatment.includes(c.treatment)) return false;
    if (filter.border_color?.length && !filter.border_color.includes(c.border_color)) return false;
    if (filter.frame_effects?.length && !filter.frame_effects.some((fe) => c.frame_effects.includes(fe))) return false;
    if (filter.frame?.length && !filter.frame.includes(c.frame ?? "2015")) return false;
    if (filter.promo_types?.length && !filter.promo_types.some((pt) => c.promo_types.includes(pt))) return false;
    if (filter.type_line_contains && !c.type_line.includes(filter.type_line_contains)) return false;
    if (filter.type_line_not_contains && c.type_line.includes(filter.type_line_not_contains)) return false;
    if (filter.finishes?.length && !filter.finishes.some((f) => c.finishes.includes(f))) return false;
    if (filter.booster !== undefined && c.booster !== filter.booster) return false;
    if (filter.mono_color !== undefined) {
      const isMono = c.colors.length === 1;
      if (filter.mono_color !== isMono) return false;
    }
    if (filter.colors?.length && !filter.colors.some((fc) => c.colors.includes(fc))) return false;
    if (filter.custom_pool?.length && !filter.custom_pool.includes(c.collector_number)) return false;
    return true;
  });
}

// ── EV Calculation (Deterministic) ─────────────────────────────

function getCardPrice(card: EvCard, isFoil: boolean, siftFloor: number): number {
  // Pull the freshest EUR we have for this variant (Scryfall bulk vs CM-ext
  // scrape, picked by timestamp). Fall back to the other variant if the
  // requested one is missing — matches the pre-effective-price behaviour
  // of `card.price_eur_foil ?? card.price_eur ?? 0`.
  const price = effectivePriceWithFallback(card, isFoil);
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

  // Track per-card EV contributions. is_foil split via the key — same card
  // pulled foil vs nonfoil are separate entries because they have different
  // prices and the breakdown table needs to surface both.
  const cardEvMap = new Map<string, { card: EvCard; isFoil: boolean; ev: number; pullRate: number }>();
  // Unique scryfall_ids that match at least one outcome's filter (i.e.,
  // actually pullable). Used for the "X / Y" counter instead of raw pool
  // size, which would include excluded cards like PW-deck exclusives or
  // off-subset Masterpieces that get imported but never hit.
  const eligibleCardIds = new Set<string>();
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
      // Outcome-level is_foil takes precedence over the slot default.
      const outcomeIsFoil = outcome.is_foil ?? slot.is_foil;

      for (const card of matching) {
        eligibleCardIds.add(card.scryfall_id);
        const price = getCardPrice(card, outcomeIsFoil, siftFloor);
        const ev = price * pullsPerBox;
        slotEv += ev;

        if (ev > 0) {
          slotTopCards.push({ name: card.name, price, pull_rate: pullsPerBox, ev });
        }

        // Aggregate per card
        const key = `${card.scryfall_id}_${outcomeIsFoil ? "foil" : "nonfoil"}`;
        const existing = cardEvMap.get(key);
        if (existing) {
          existing.ev += ev;
          existing.pullRate += pullsPerBox;
        } else {
          cardEvMap.set(key, { card, isFoil: outcomeIsFoil, ev, pullRate: pullsPerBox });
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

  // Count unique cards (not foil/nonfoil tuples) above the floor, so the
  // "X / Y" counter matches what a user would count by hand.
  const uniqueAboveFloor = new Set<string>();
  for (const e of allCardEvs) uniqueAboveFloor.add(e.card.scryfall_id);
  const cardsAboveFloor = uniqueAboveFloor.size;

  // Biggest pulls — sorted by raw price (most expensive cards you could open)
  const allCardsByPrice = Array.from(cardEvMap.values())
    .filter((e) => e.ev > 0)
    .sort((a, b) => getCardPrice(b.card, false, 0) - getCardPrice(a.card, false, 0));

  const mapToTopCard = (e: { card: EvCard; isFoil: boolean; ev: number; pullRate: number }, i: number) => ({
    // uid: same card can appear in multiple slot outcomes (rare + wildcard,
    // etc.), so scryfall_id alone isn't unique. Suffix the list index.
    uid: `${e.card.scryfall_id}-${i}`,
    scryfall_id: e.card.scryfall_id,
    name: e.card.name,
    set: e.card.set,
    collector_number: e.card.collector_number,
    rarity: e.card.rarity,
    treatment: e.card.treatment,
    is_foil: e.isFoil,
    // Use the foil price when the contribution came from a foil slot —
    // otherwise foil-only outcomes (e.g. Masterpieces) would display nonfoil
    // prices that don't exist for those cards.
    price: getCardPrice(e.card, e.isFoil, 0),
    pull_rate_per_box: Math.round(e.pullRate * 10000) / 10000,
    ev_contribution: Math.round(e.ev * 100) / 100,
    image_uri: e.card.image_uri,
  });

  return {
    set_code: setCode,
    booster_type: boosterType,
    pack_ev: Math.round(packEv * 100) / 100,
    box_ev_gross: Math.round(boxEvGross * 100) / 100,
    box_ev_net: Math.round(boxEvNet * 100) / 100,
    fee_rate: feeRate,
    sift_floor: siftFloor,
    packs_per_box: config.packs_per_box,
    cards_per_pack: config.cards_per_pack,
    cards_counted: eligibleCardIds.size,
    cards_above_floor: cardsAboveFloor,
    cards_total: cards.length,
    slot_breakdown: slotBreakdown,
    top_ev_cards: allCardEvs.slice(0, 20).map(mapToTopCard),
    top_price_cards: allCardsByPrice.slice(0, 20).map(mapToTopCard),
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
      const outcomeIsFoil = outcome.is_foil ?? slot.is_foil;
      cardPrices.push(
        matching.map((c) => getCardPrice(c, outcomeIsFoil, siftFloor))
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
  common: 0.65,
  rare: 0.30,
  mythic: 0.05,
};

// Seed prior sample: raw tier counts from the 5-box (120-pack) dataset
// displayed in the EvJumpstartThemes UI. Used as the initial accumulation
// when the weights collection is empty.
const JUMPSTART_PRIOR_SAMPLES: Record<string, { tier_counts: { common: number; rare: number; mythic: number }; packs: number }> = {
  j25: { tier_counts: { common: 79, rare: 36, mythic: 5 }, packs: 120 },
};

export type JumpstartTierKey = "common" | "rare" | "mythic";
export type JumpstartWeightOverride = {
  tierWeights?: Record<JumpstartTierKey, number>;
  themeWeights?: Record<string, number>;
};

export function themeKey(name: string, variant: number): string {
  return `${name}|${variant}`;
}

export function calculateJumpstartEv(
  cards: EvCard[],
  themes: EvJumpstartTheme[],
  options: { siftFloor: number; feeRate: number; setCode: string; packsPerBox: number; weights?: JumpstartWeightOverride }
): EvJumpstartResult {
  const { siftFloor, feeRate, setCode, packsPerBox, weights } = options;
  const tierW = weights?.tierWeights ?? { common: JUMPSTART_TIER_WEIGHTS.common, rare: JUMPSTART_TIER_WEIGHTS.rare, mythic: JUMPSTART_TIER_WEIGHTS.mythic };
  const themeW = weights?.themeWeights;

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
      const price = card ? effectivePriceValue(card, false) : 0;
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
      lead_card: theme.cards[0] ?? "",
      cards: cardResults,
    });
  }

  // Sort themes by EV desc
  themeResults.sort((a, b) => b.ev_gross - a.ev_gross);

  // Weighted average EV per pack.
  // Default: each variant weight = tier_weight / variants_in_tier (uniform within tier).
  // Override: themeW (absolute per-theme probability) supersedes tier/uniform.
  let weightedEvGross = 0;
  for (const t of themeResults) {
    const key = themeKey(t.name, t.variant);
    let perThemeWeight: number;
    if (themeW && themeW[key] !== undefined) {
      perThemeWeight = themeW[key];
    } else {
      const tierWeight = tierW[t.tier] ?? 0;
      const variantCount = variantsPerTier[t.tier] || 1;
      perThemeWeight = tierWeight / variantCount;
    }
    weightedEvGross += t.ev_gross * perThemeWeight;
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
    weights_source: themeW ? "empirical" : (weights?.tierWeights ? "empirical" : "default"),
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
    weights?: JumpstartWeightOverride;
  }
): EvSimulationResult {
  const start = Date.now();
  const { siftFloor, feeRate, packsPerBox, iterations, weights } = options;
  const tierW = weights?.tierWeights ?? { common: JUMPSTART_TIER_WEIGHTS.common, rare: JUMPSTART_TIER_WEIGHTS.rare, mythic: JUMPSTART_TIER_WEIGHTS.mythic };
  const themeW = weights?.themeWeights;

  // Build name→price lookup
  const cardByName = new Map<string, EvCard>();
  for (const c of cards) cardByName.set(c.name.toLowerCase(), c);

  // Pre-calculate gross EV for each theme variant
  const themeEvs: { tier: JumpstartTierKey; evGross: number; key: string }[] = themes.map((theme) => {
    let ev = 0;
    for (const name of theme.cards) {
      const card = cardByName.get(name.toLowerCase());
      const price = card ? effectivePriceValue(card, false) : 0;
      if (price >= siftFloor) ev += price;
    }
    return { tier: theme.tier, evGross: ev, key: themeKey(theme.name, theme.variant) };
  });

  // If empirical per-theme weights are provided, build a single cumulative
  // distribution over themes. Otherwise fall back to tier → uniform-in-tier.
  let themeCum: number[] | null = null;
  let tiers: { name: JumpstartTierKey; weight: number; indices: number[] }[] = [];
  let tierCum: number[] = [];

  if (themeW) {
    // Absolute per-theme probabilities. Fill missing themes with 0 (or leave).
    const raw = themeEvs.map((t) => themeW[t.key] ?? 0);
    const total = raw.reduce((s, v) => s + v, 0);
    if (total > 0) {
      themeCum = [];
      let c = 0;
      for (const v of raw) { c += v / total; themeCum.push(c); }
    }
  }

  if (!themeCum) {
    const byTier: Record<JumpstartTierKey, number[]> = { common: [], rare: [], mythic: [] };
    themeEvs.forEach((t, i) => byTier[t.tier].push(i));
    const allTiers: { name: JumpstartTierKey; weight: number; indices: number[] }[] = [
      { name: "common", weight: tierW.common, indices: byTier.common },
      { name: "rare", weight: tierW.rare, indices: byTier.rare },
      { name: "mythic", weight: tierW.mythic, indices: byTier.mythic },
    ];
    tiers = allTiers.filter(t => t.indices.length > 0);
    let cumW = 0;
    for (const t of tiers) { cumW += t.weight; tierCum.push(cumW); }
    if (cumW > 0 && cumW !== 1) {
      for (let i = 0; i < tierCum.length; i++) tierCum[i] /= cumW;
    }
  }

  // Simulate
  const boxValues: number[] = new Array(iterations);

  for (let i = 0; i < iterations; i++) {
    let boxGross = 0;

    for (let p = 0; p < packsPerBox; p++) {
      let themeIdx: number;
      if (themeCum) {
        const roll = Math.random();
        let idx = 0;
        while (idx < themeCum.length - 1 && roll > themeCum[idx]) idx++;
        themeIdx = idx;
      } else {
        const roll = Math.random();
        let tierIdx = 0;
        while (tierIdx < tierCum.length - 1 && roll > tierCum[tierIdx]) tierIdx++;
        const indices = tiers[tierIdx].indices;
        themeIdx = indices[Math.floor(Math.random() * indices.length)];
      }
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

// ── Default Config Fallback ───────────────────────────────────

async function getDefaultConfigForSet(setCode: string): Promise<EvConfig | null> {
  const set = await getSetByCode(setCode);
  const isMB2 = set?.name?.toLowerCase().includes("mystery booster 2");
  if (isMB2) {
    return {
      _id: "", set_code: setCode, updated_at: "", updated_by: "",
      sift_floor: 0.25, fee_rate: 0.05,
      play_booster: getDefaultMB2BoosterConfig(), collector_booster: null,
    };
  }
  if (isDraftBoosterEra(set)) {
    return {
      _id: "", set_code: setCode, updated_at: "", updated_by: "",
      sift_floor: 0.25, fee_rate: 0.05,
      play_booster: getDefaultDraftBoosterConfig({ masterpiece: masterpieceRefFor(setCode) }),
      collector_booster: null,
    };
  }
  return null;
}

// ── Snapshots ──────────────────────────────────────────────────

export async function generateSnapshot(setCode: string): Promise<EvSnapshot | null> {
  await ensureIndexes();
  const { cards } = await getCardsForSet(setCode, { boosterOnly: false, limit: 10000 });
  const today = new Date().toISOString().slice(0, 10);

  // Pre-load cross-set pools referenced by the effective config (e.g. mp2
  // Masterpieces merged into an akh booster). Has to happen before calculateEv
  // reads `cards`, and we check both play and collector configs.
  const tentativeConfig = (await getConfig(setCode)) ?? (await getDefaultConfigForSet(setCode));
  const extraCodes = new Set<string>();
  if (tentativeConfig?.play_booster) for (const c of collectExtraSetCodes(tentativeConfig.play_booster, setCode)) extraCodes.add(c);
  if (tentativeConfig?.collector_booster) for (const c of collectExtraSetCodes(tentativeConfig.collector_booster, setCode)) extraCodes.add(c);
  for (const extra of extraCodes) {
    const { cards: extraCards } = await getCardsForSet(extra, { boosterOnly: false, limit: 10000 });
    cards.push(...extraCards);
  }

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
    const weights = weightsToOverride(await getJumpstartWeights(setCode));

    const result = calculateJumpstartEv(cards, jumpstartThemes, {
      siftFloor,
      feeRate,
      setCode,
      packsPerBox,
      weights,
    });
    playEvGross = result.box_ev_gross;
    playEvNet = result.box_ev_net;
  } else {
    // Standard slot-based calculation — use saved config or fall back to defaults
    const effectiveConfig = config ?? await getDefaultConfigForSet(setCode);
    if (!effectiveConfig) return null;

    if (effectiveConfig.play_booster) {
      const result = calculateEv(cards, effectiveConfig.play_booster, {
        siftFloor: effectiveConfig.sift_floor,
        feeRate: effectiveConfig.fee_rate,
        setCode,
        boosterType: "play",
      });
      playEvGross = result.box_ev_gross;
      playEvNet = result.box_ev_net;
    }

    if (effectiveConfig.collector_booster) {
      const result = calculateEv(cards, effectiveConfig.collector_booster, {
        siftFloor: effectiveConfig.sift_floor,
        feeRate: effectiveConfig.fee_rate,
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
    "mb2", // MB2 uses default config, not saved — always include
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

  // Products: run AFTER sets so latestPlayEvBySet picks up fresh snapshots
  const productRes = await generateAllProductSnapshots();
  generated += productRes.generated;
  errors.push(...productRes.errors);

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
import {
  ensureIndexes as ensurePriceHistoryIndexes,
  getInScopeScryfallIds,
  getLastSnapshotMap,
  insertSnapshotsOnChange,
} from "@/lib/ev-price-history";

export async function refreshAllScryfall(): Promise<{
  setsUpserted: number;
  cardsProcessed: number;
  cardsWritten: number;
  priceSnapshotsWritten: number;
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

  // 4. Stream-parse and bulk-upsert, and snapshot in-scope prices to history
  const db = await getDb();
  const col = db.collection(COL_CARDS);
  await ensurePriceHistoryIndexes(db);
  const inScope = await getInScopeScryfallIds(db);
  const lastSnapshots = await getLastSnapshotMap(db, inScope);
  const snapshotDate = new Date();
  let cardsWritten = 0;
  let priceSnapshotsWritten = 0;

  const { processed: cardsProcessed } = await streamBulkCards(body, {
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
      cardsWritten += (result.upsertedCount ?? 0) + (result.modifiedCount ?? 0);

      const historyBatch = batch
        .filter((c) => inScope.has(c.scryfall_id))
        .map((c) => ({
          scryfall_id: c.scryfall_id,
          e: c.price_eur,
          f: c.price_eur_foil,
        }));
      priceSnapshotsWritten += await insertSnapshotsOnChange(
        db,
        historyBatch,
        snapshotDate,
        lastSnapshots
      );
    },
  });

  return {
    setsUpserted,
    cardsProcessed,
    cardsWritten,
    priceSnapshotsWritten,
    durationMs: Date.now() - started,
  };
}
