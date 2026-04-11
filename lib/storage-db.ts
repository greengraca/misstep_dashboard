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
  const stock = stockDocs.map(projectStockRow);
  const cardMetaByKey = new Map<string, CardMeta>();
  for (const c of cardDocs) {
    cardMetaByKey.set(`${c.name}|${c.set}`, projectCardMeta(c));
  }
  const sets = setDocs.map(projectSetMeta);

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
