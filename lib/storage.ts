// lib/storage.ts
//
// Pure core of the canonical-storage feature. Takes stock rows, card metadata,
// a shelf layout, and override records, returns a deterministic slot placement.
// No I/O, no DB, no framework. Everything here is unit-testable in isolation.

// ── Constants ──────────────────────────────────────────────────

export type BoxType = "1k" | "2k" | "4k";
export type ColorGroup = "W" | "U" | "B" | "R" | "G" | "M" | "C" | "L";
export type Rarity = "mythic" | "rare" | "uncommon" | "common";

export const SLOT_CAPACITY = 8;
export const ROW_CAPACITY_SLOTS = 125;
export const BOX_ROWS: Record<BoxType, number> = { "1k": 1, "2k": 2, "4k": 4 };
export const COLOR_GROUP_ORDER: Record<ColorGroup, number> = {
  W: 0, U: 1, B: 2, R: 3, G: 4, M: 5, C: 6, L: 7,
};
export const RARITY_ORDER: Record<string, number> = {
  mythic: 0, special: 0, bonus: 0, rare: 1, uncommon: 2, common: 3,
};

// ── Input types (subsets of domain models) ─────────────────────

export interface StockRow {
  name: string;
  set: string;
  qty: number;
  // Other CmStockListing fields are ignored by the pure core.
}

export interface CardMeta {
  name: string;
  set: string;
  collector_number?: string;
  rarity: string;
  type_line: string;
  colors: string[];
  color_identity: string[];
  cmc: number;
  layout: string;
  image_uri: string | null;
  released_at: string;
}

export interface SetMeta {
  code: string;
  name: string;
  released_at: string;
  set_type: string;
  parent_set_code?: string | null;
}

// ── Layout / override types ────────────────────────────────────

export interface BoxConfig {
  id: string;
  type: BoxType;
  label?: string;
}

export interface ShelfRowConfig {
  id: string;
  label: string;
  boxes: BoxConfig[];
}

export interface ShelfLayout {
  shelfRows: ShelfRowConfig[];
}

export interface CutOverride {
  id: string;
  anchorSlotKey: string;
  targetBoxId: string;
  targetBoxRowIndex: number;
}

// ── Intermediate types ─────────────────────────────────────────

/** An aggregated stock variant — one per unique (name, set) with qty summed. */
export interface Variant {
  name: string;
  set: string;             // original set code, before token re-homing
  effectiveSet: string;    // after token re-homing
  qty: number;
}

/** Sort-critical fields derived from a card's metadata. */
export interface SortFields {
  effectiveSet: string;
  colorGroup: ColorGroup;
  landTier: 0 | 1 | 2;
  rarityOrder: number;
  cmcBucket: number;
  rarity: Rarity;
  cmc: number;
  name: string;
  nameLower: string;
  releasedAt: string;
}

// ── Output types ───────────────────────────────────────────────

export interface Slot {
  slotKey: string;
  variantKey: string;
  position: number;
  name: string;
  set: string;
  setName: string;
  setReleaseDate: string;
  collectorNumber?: string;
  colorGroup: ColorGroup;
  landTier: 0 | 1 | 2;
  cmc: number;
  cmcBucket: number;
  rarity: Rarity;
  qtyInSlot: number;
  slotIndexInVariant: number;
  imageUri: string | null;
}

export type ReadingDirection = "far-to-near" | "near-to-far";

export interface PlacedSlot extends Slot {
  shelfRowId: string;
  shelfRowIndex: number;
  boxId: string;
  boxIndexInRow: number;
  boxRowIndex: number;
  readingDirection: ReadingDirection;
  positionInBoxRow: number;
  spansShelfRow?: true;
  unplaced?: true;
}

export interface EmptyReservedCell {
  kind: "empty-reserved";
  shelfRowId: string;
  shelfRowIndex: number;
  boxId: string;
  boxIndexInRow: number;
  boxRowIndex: number;
  readingDirection: ReadingDirection;
  positionInBoxRow: number;
  reason: "override-gap";
}

export type PlacedCell = PlacedSlot | EmptyReservedCell;

export interface UnmatchedVariant {
  name: string;
  set: string;
  qty: number;
}

export type OverrideStatus =
  | "applied"
  | "stale-missing-slot"
  | "stale-missing-target"
  | "stale-regression";

export interface StaleOverrideReport {
  override: CutOverride;
  status: Exclude<OverrideStatus, "applied">;
}

export interface CanonicalSortResult {
  slots: Slot[];
  unmatched: UnmatchedVariant[];
}

export interface ApplyOverridesResult {
  cells: PlacedCell[];
  staleOverrides: StaleOverrideReport[];
}

// ── Main functions (implemented in later tasks) ────────────────

// Task 4 — computeCanonicalSort
// Task 5 — flowIntoLayout
// Task 6 — applyOverrides
