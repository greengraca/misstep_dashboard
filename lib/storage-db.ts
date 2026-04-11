// lib/storage-db.ts
//
// DB integration layer for the canonical-storage feature. Composes the pure
// core in lib/storage.ts with MongoDB reads and writes.

import type { CmStockListing, EvCard, EvSet } from "@/lib/types";
import type {
  StockRow,
  CardMeta,
  SetMeta,
} from "@/lib/storage";

// ── Collection names ───────────────────────────────────────────

export const COL_STORAGE_SLOTS = "dashboard_storage_slots";
export const COL_STORAGE_SLOTS_NEXT = "dashboard_storage_slots_next";
export const COL_STORAGE_LAYOUT = "dashboard_storage_layout";
export const COL_STORAGE_OVERRIDES = "dashboard_storage_overrides";
export const COL_STORAGE_REBUILD_LOG = "dashboard_storage_rebuild_log";

// Existing collections we read from
const COL_CM_STOCK = "dashboard_cm_stock";
const COL_EV_CARDS = "dashboard_ev_cards";
const COL_EV_SETS = "dashboard_ev_sets";

// ── Pure projection helpers ────────────────────────────────────

export function projectStockRow(cm: CmStockListing): StockRow {
  return { name: cm.name, set: cm.set, qty: cm.qty };
}

export function projectCardMeta(ev: EvCard): CardMeta {
  return {
    name: ev.name,
    set: ev.set,
    collector_number: ev.collector_number,
    rarity: ev.rarity,
    type_line: ev.type_line,
    colors: ev.colors,
    color_identity: ev.color_identity,
    cmc: ev.cmc,
    layout: ev.layout,
    image_uri: ev.image_uri,
    released_at: ev.released_at,
  };
}

export function projectSetMeta(ev: EvSet): SetMeta {
  return {
    code: ev.code,
    name: ev.name,
    released_at: ev.released_at,
    set_type: ev.set_type,
    parent_set_code: ev.parent_set_code ?? null,
  };
}

// ── Name / set cleanup for Cardmarket → Scryfall join ──────────
//
// Cardmarket adds variant suffixes to card names ("Ornithopter of Paradise (V.1)")
// and uses set-name conventions that differ from Scryfall ("Core 2019",
// "Commander: Modern Horizons 3", "Revised"). Both need to be normalized
// before joining stock rows against the Scryfall-shaped ev_cards collection.

/**
 * Strip Cardmarket parenthetical suffixes from a card name:
 *   "Ornithopter of Paradise (V.1)"       → "Ornithopter of Paradise"
 *   "Faerie Rogue Token (Black 1/1)"      → "Faerie Rogue Token"
 *   "Elemental Token (Blue and Red 4/4)"  → "Elemental Token"
 */
export function cleanCardName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

/**
 * Manual alias map for sets whose Cardmarket name can't be resolved via
 * transformation rules. Keys are lowercased Cardmarket set names; values are
 * Scryfall set codes.
 */
const SET_NAME_ALIASES: Record<string, string> = {
  "revised": "3ed",
  "magic: the gathering foundations": "fdn",
  "mystery booster": "mb1",
};

/**
 * Resolve a raw Cardmarket set label to a Scryfall set code, using a series of
 * fallback strategies. Returns null if nothing matches.
 */
export function resolveSetCode(
  rawSet: string,
  lookup: Map<string, string>
): string | null {
  const lower = rawSet.toLowerCase();

  // 1. Direct lookup (covers codes passing through and exact-match names).
  const direct = lookup.get(lower);
  if (direct) return direct;

  // 2. Manual alias table.
  const alias = SET_NAME_ALIASES[lower];
  if (alias) return alias;

  // 3. Strip ": Extras" or ": Promos" suffix — Cardmarket tags for collector
  //    booster / showcase / borderless subsets and promo variants that Scryfall
  //    keeps inside the base set.
  for (const suffix of [": extras", ": promos"]) {
    if (lower.endsWith(suffix)) {
      const stripped = lower.slice(0, -suffix.length);
      const match = lookup.get(stripped);
      if (match) return match;
    }
  }

  // 4. "Core N" → "Core Set N" (Cardmarket drops "Set" in the name).
  const coreMatch = lower.match(/^core (\d{4})$/);
  if (coreMatch) {
    const match = lookup.get(`core set ${coreMatch[1]}`);
    if (match) return match;
  }

  // 5. "Commander: X" → "X Commander" (Cardmarket prefixes, Scryfall suffixes).
  if (lower.startsWith("commander: ")) {
    const rest = lower.slice("commander: ".length);
    const match = lookup.get(`${rest} commander`);
    if (match) return match;
  }

  return null;
}

// ── Rebuild orchestrator ───────────────────────────────────────

import { getDb } from "@/lib/mongodb";
import {
  computeCanonicalSort,
  applyOverrides,
  type ShelfLayout,
  type CutOverride,
  type PlacedCell,
  type StaleOverrideReport,
  type UnmatchedVariant,
} from "@/lib/storage";

export interface RebuildCounts {
  stockRows: number;
  variantsMatched: number;
  variantsUnmatched: number;
  slots: number;
  placedSlots: number;
  unplacedSlots: number;
  spansShelfRowCount: number;
}

export interface RebuildResult {
  durationMs: number;
  counts: RebuildCounts;
  overrides: {
    applied: number;
    staleMissingSlot: StaleOverrideReport[];
    staleMissingTarget: StaleOverrideReport[];
    staleRegression: StaleOverrideReport[];
  };
  unmatchedVariants: UnmatchedVariant[];  // first 50
}

export async function rebuildStorageSlots(): Promise<RebuildResult> {
  const started = Date.now();
  const db = await getDb();

  // 1. Load inputs.
  const [stockDocs, cardDocs, setDocs, layoutDoc, overrideDocs] = await Promise.all([
    db.collection<CmStockListing>(COL_CM_STOCK).find({}).toArray(),
    db.collection<EvCard>(COL_EV_CARDS)
      .find({}, {
        projection: {
          name: 1, set: 1, collector_number: 1, rarity: 1, type_line: 1,
          colors: 1, color_identity: 1, cmc: 1, layout: 1, image_uri: 1, released_at: 1,
        },
      })
      .toArray(),
    db.collection<EvSet>(COL_EV_SETS).find({}).toArray(),
    db.collection<ShelfLayout & { _id: string }>(COL_STORAGE_LAYOUT).findOne({ _id: "current" }),
    db.collection<CutOverride>(COL_STORAGE_OVERRIDES).find({}).toArray(),
  ]);

  // 2. Project to pure core inputs.
  const sets = setDocs.map(projectSetMeta);

  // Cardmarket's stock collection stores set names ("Commander 2014", "Ikoria:
  // Lair of Behemoths"), but Scryfall's ev_cards stores set codes ("c14", "iko").
  // Build a case-insensitive lookup from set.name → set.code plus code → code
  // (so rows that already have a code pass through). `resolveSetCode` handles
  // a few common Cardmarket-vs-Scryfall divergences beyond exact name match.
  const setCodeLookup = new Map<string, string>();
  for (const s of sets) {
    setCodeLookup.set(s.code.toLowerCase(), s.code);
    if (!setCodeLookup.has(s.name.toLowerCase())) {
      setCodeLookup.set(s.name.toLowerCase(), s.code);
    }
  }

  const stock = stockDocs
    .map(projectStockRow)
    .map((row) => {
      const code = resolveSetCode(row.set, setCodeLookup);
      const cleanedName = cleanCardName(row.name);
      return {
        ...row,
        name: cleanedName,
        set: code ?? row.set,
      };
    });

  // Build two metadata lookups: the primary (name|set) and a fallback keyed
  // on name alone. The fallback is used when Cardmarket's stock references a
  // printing that Scryfall's default-cards bulk dump doesn't include (e.g.
  // Mystery Booster reprints, Commander product reprints, tokens stored in
  // separate Scryfall token sets). Oracle-level fields (colors, rarity, cmc,
  // type_line, layout) are printing-invariant, so using any printing's
  // metadata gives the correct sort fields.
  const cardMetaByKey = new Map<string, CardMeta>();
  const cardMetaByName = new Map<string, CardMeta>();
  for (const c of cardDocs) {
    const meta = projectCardMeta(c);
    cardMetaByKey.set(`${c.name}|${c.set}`, meta);
    if (!cardMetaByName.has(c.name)) cardMetaByName.set(c.name, meta);
  }

  // For every stock row that doesn't have a direct (name|set) match, try a
  // name-only lookup. If found, inject a pseudo-entry into cardMetaByKey so
  // the pure core's join succeeds with the user's set preserved. For tokens,
  // also try stripping a trailing " Token" from the name since Scryfall
  // sometimes names tokens without the suffix.
  for (const row of stock) {
    const primaryKey = `${row.name}|${row.set}`;
    if (cardMetaByKey.has(primaryKey)) continue;

    let fallback = cardMetaByName.get(row.name);
    if (!fallback && row.name.endsWith(" Token")) {
      fallback = cardMetaByName.get(row.name.slice(0, -" Token".length));
    }
    if (fallback) cardMetaByKey.set(primaryKey, fallback);
  }

  // 3. Run pure core.
  const sortResult = computeCanonicalSort(stock, cardMetaByKey, sets);
  const layout: ShelfLayout = layoutDoc ? { shelfRows: layoutDoc.shelfRows } : { shelfRows: [] };
  const placedResult = applyOverrides(sortResult.slots, layout, overrideDocs);

  // 4. Count stats.
  const placedSlots = placedResult.cells.filter(
    (c) => c.kind !== "empty-reserved" && !("unplaced" in c && c.unplaced)
  ).length;
  const unplacedSlots = placedResult.cells.filter(
    (c) => c.kind !== "empty-reserved" && "unplaced" in c && c.unplaced === true
  ).length;
  const spansShelfRowCount = placedResult.cells.filter(
    (c) => c.kind !== "empty-reserved" && "spansShelfRow" in c && c.spansShelfRow === true
  ).length;

  // 5. Transactional write: scratch collection → drop live → rename.
  const slotsCol = db.collection(COL_STORAGE_SLOTS);
  const scratchCol = db.collection(COL_STORAGE_SLOTS_NEXT);

  // Wipe scratch if a previous rebuild left debris.
  try {
    await scratchCol.drop();
  } catch {
    // Didn't exist — fine.
  }

  if (placedResult.cells.length > 0) {
    // Batch inserts. Each cell already has all fields we want.
    const batchSize = 1000;
    for (let i = 0; i < placedResult.cells.length; i += batchSize) {
      const batch = placedResult.cells.slice(i, i + batchSize);
      await scratchCol.insertMany(batch as PlacedCell[], { ordered: false });
    }
  }

  // Drop live, rename scratch to live.
  try {
    await slotsCol.drop();
  } catch {
    // Collection didn't exist — first rebuild.
  }
  if (placedResult.cells.length > 0) {
    await scratchCol.rename(COL_STORAGE_SLOTS);
  }

  // 6. Update override lastStatus for all overrides (applied/stale tracking).
  const appliedIds = new Set(overrideDocs.map((o) => o.id));
  for (const stale of placedResult.staleOverrides) appliedIds.delete(stale.override.id);
  const overridesCol = db.collection<CutOverride>(COL_STORAGE_OVERRIDES);
  await Promise.all([
    ...Array.from(appliedIds).map((id) =>
      overridesCol.updateOne(
        { id },
        { $set: { lastStatus: "applied", lastCheckedAt: new Date() } }
      )
    ),
    ...placedResult.staleOverrides.map((s) =>
      overridesCol.updateOne(
        { id: s.override.id },
        { $set: { lastStatus: s.status, lastCheckedAt: new Date() } }
      )
    ),
  ]);

  // 7. Write rebuild log entry.
  const counts: RebuildCounts = {
    stockRows: stockDocs.length,
    variantsMatched: sortResult.slots.length > 0 ? new Set(sortResult.slots.map((s) => s.variantKey)).size : 0,
    variantsUnmatched: sortResult.unmatched.length,
    slots: sortResult.slots.length,
    placedSlots,
    unplacedSlots,
    spansShelfRowCount,
  };

  const durationMs = Date.now() - started;

  await db.collection(COL_STORAGE_REBUILD_LOG).insertOne({
    startedAt: new Date(started),
    durationMs,
    counts,
    overridesApplied: appliedIds.size,
    staleOverrideCount: placedResult.staleOverrides.length,
  });

  // 8. Build response.
  const byStatus = {
    staleMissingSlot: placedResult.staleOverrides.filter((s) => s.status === "stale-missing-slot"),
    staleMissingTarget: placedResult.staleOverrides.filter((s) => s.status === "stale-missing-target"),
    staleRegression: placedResult.staleOverrides.filter((s) => s.status === "stale-regression"),
  };

  return {
    durationMs,
    counts,
    overrides: {
      applied: appliedIds.size,
      ...byStatus,
    },
    unmatchedVariants: sortResult.unmatched.slice(0, 50),
  };
}

// ── Read helpers ───────────────────────────────────────────────

export interface QueryStorageSlotsParams {
  shelfRowId?: string;
  boxId?: string;
  set?: string;
  colorGroup?: string;
  search?: string;
  page: number;
  pageSize: number;
}

export interface QueryStorageSlotsResult {
  slots: PlacedCell[];
  total: number;
  page: number;
  pageSize: number;
}

export async function queryStorageSlots(
  params: QueryStorageSlotsParams
): Promise<QueryStorageSlotsResult> {
  const db = await getDb();
  const col = db.collection<PlacedCell>(COL_STORAGE_SLOTS);

  const filter: Record<string, unknown> = {};
  if (params.shelfRowId) filter.shelfRowId = params.shelfRowId;
  if (params.boxId) filter.boxId = params.boxId;
  if (params.set) filter.set = params.set;
  if (params.colorGroup) filter.colorGroup = params.colorGroup;
  if (params.search && params.search.trim()) {
    // Case-insensitive substring match on name. Intentionally NOT using the
    // text index — substring matches like "bolt" → "Lightning Bolt" don't work
    // with Mongo's text index word-boundary semantics, and this is a small
    // collection (~15k docs) so regex is fast enough.
    const escaped = params.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.name = { $regex: escaped, $options: "i" };
  }

  const skip = (params.page - 1) * params.pageSize;
  const [slots, total] = await Promise.all([
    col
      .find(filter)
      .sort({ position: 1 })
      .skip(skip)
      .limit(params.pageSize)
      .toArray(),
    col.countDocuments(filter),
  ]);

  return {
    slots: slots as unknown as PlacedCell[],
    total,
    page: params.page,
    pageSize: params.pageSize,
  };
}

export interface StorageStats {
  totalVariants: number;
  totalCards: number;
  totalSlots: number;
  placedSlots: number;
  unplacedSlots: number;
  perSet: { set: string; setName: string; slots: number; variants: number }[];
  perColor: { colorGroup: string; slots: number }[];
  lastRebuildAt: string | null;
  lastRebuildDurationMs: number | null;
}

export async function getStorageStats(): Promise<StorageStats> {
  const db = await getDb();
  const slots = db.collection(COL_STORAGE_SLOTS);

  const [totals, perSet, perColor, lastRebuild] = await Promise.all([
    slots
      .aggregate([
        { $match: { kind: { $ne: "empty-reserved" } } },
        {
          $group: {
            _id: null,
            totalSlots: { $sum: 1 },
            totalCards: { $sum: "$qtyInSlot" },
            distinctVariants: { $addToSet: "$variantKey" },
            placedSlots: {
              $sum: { $cond: [{ $eq: ["$unplaced", true] }, 0, 1] },
            },
            unplacedSlots: {
              $sum: { $cond: [{ $eq: ["$unplaced", true] }, 1, 0] },
            },
          },
        },
      ])
      .toArray(),
    slots
      .aggregate([
        { $match: { kind: { $ne: "empty-reserved" } } },
        {
          $group: {
            _id: { set: "$set", setName: "$setName" },
            slots: { $sum: 1 },
            variants: { $addToSet: "$variantKey" },
          },
        },
        {
          $project: {
            _id: 0,
            set: "$_id.set",
            setName: "$_id.setName",
            slots: 1,
            variants: { $size: "$variants" },
          },
        },
        { $sort: { set: 1 } },
      ])
      .toArray(),
    slots
      .aggregate([
        { $match: { kind: { $ne: "empty-reserved" } } },
        { $group: { _id: "$colorGroup", slots: { $sum: 1 } } },
        { $project: { _id: 0, colorGroup: "$_id", slots: 1 } },
      ])
      .toArray(),
    db
      .collection(COL_STORAGE_REBUILD_LOG)
      .find({})
      .sort({ startedAt: -1 })
      .limit(1)
      .toArray(),
  ]);

  const t = totals[0] || {};
  const last = lastRebuild[0];

  return {
    totalVariants: Array.isArray(t.distinctVariants) ? t.distinctVariants.length : 0,
    totalCards: t.totalCards ?? 0,
    totalSlots: t.totalSlots ?? 0,
    placedSlots: t.placedSlots ?? 0,
    unplacedSlots: t.unplacedSlots ?? 0,
    perSet: perSet as StorageStats["perSet"],
    perColor: perColor as StorageStats["perColor"],
    lastRebuildAt: last ? new Date(last.startedAt).toISOString() : null,
    lastRebuildDurationMs: last?.durationMs ?? null,
  };
}

// ── Layout CRUD ────────────────────────────────────────────────

import { randomUUID } from "node:crypto";

export async function getLayout(): Promise<ShelfLayout> {
  const db = await getDb();
  const doc = await db
    .collection<ShelfLayout & { _id: string }>(COL_STORAGE_LAYOUT)
    .findOne({ _id: "current" });
  if (!doc) return { shelfRows: [] };
  return { shelfRows: doc.shelfRows };
}

export async function setLayout(layout: ShelfLayout): Promise<ShelfLayout> {
  const db = await getDb();

  // Ensure every shelfRow and box has a stable UUID. New rows/boxes from the
  // client may come in without IDs; we fill them here so the client doesn't
  // need to. Existing IDs are preserved.
  const normalized: ShelfLayout = {
    shelfRows: layout.shelfRows.map((row) => ({
      id: row.id || randomUUID(),
      label: row.label,
      boxes: row.boxes.map((box) => ({
        id: box.id || randomUUID(),
        type: box.type,
        label: box.label,
      })),
    })),
  };

  type LayoutDoc = ShelfLayout & { _id: string; updatedAt?: Date };
  await db.collection<LayoutDoc>(COL_STORAGE_LAYOUT).updateOne(
    { _id: "current" },
    { $set: { shelfRows: normalized.shelfRows, updatedAt: new Date() } },
    { upsert: true }
  );
  return normalized;
}

// ── Override CRUD ──────────────────────────────────────────────

export interface CreateOverrideInput {
  anchorSlotKey: string;
  targetBoxId: string;
  targetBoxRowIndex: number;
  note?: string;
  createdBy: string;
}

export async function listOverrides(statusFilter?: "all" | "applied" | "stale"): Promise<CutOverride[]> {
  const db = await getDb();
  const col = db.collection<CutOverride>(COL_STORAGE_OVERRIDES);
  const filter: Record<string, unknown> = {};
  if (statusFilter === "applied") filter.lastStatus = "applied";
  else if (statusFilter === "stale") {
    filter.lastStatus = { $in: ["stale-missing-slot", "stale-missing-target", "stale-regression"] };
  }
  return col.find(filter).sort({ createdAt: -1 }).toArray();
}

export async function createOverride(input: CreateOverrideInput): Promise<CutOverride> {
  const db = await getDb();
  const doc: CutOverride & { createdAt: Date; createdBy: string; note?: string } = {
    id: randomUUID(),
    anchorSlotKey: input.anchorSlotKey,
    targetBoxId: input.targetBoxId,
    targetBoxRowIndex: input.targetBoxRowIndex,
    createdAt: new Date(),
    createdBy: input.createdBy,
    note: input.note,
  };
  await db.collection(COL_STORAGE_OVERRIDES).insertOne(doc);
  return doc;
}

export async function deleteOverride(id: string): Promise<boolean> {
  const db = await getDb();
  const result = await db.collection(COL_STORAGE_OVERRIDES).deleteOne({ id });
  return result.deletedCount === 1;
}

export async function clearStaleOverrides(): Promise<number> {
  const db = await getDb();
  const result = await db.collection(COL_STORAGE_OVERRIDES).deleteMany({
    lastStatus: { $in: ["stale-missing-slot", "stale-missing-target", "stale-regression"] },
  });
  return result.deletedCount ?? 0;
}
