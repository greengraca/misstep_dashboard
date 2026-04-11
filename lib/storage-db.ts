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
