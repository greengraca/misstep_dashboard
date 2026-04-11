// components/storage/types.ts
import type {
  PlacedCell,
  ShelfLayout,
  CutOverride,
  StaleOverrideReport,
  UnmatchedVariant,
} from "@/lib/storage";
import type { RebuildResult, StorageStats } from "@/lib/storage-db";

export type { PlacedCell, ShelfLayout, CutOverride, StaleOverrideReport, UnmatchedVariant, RebuildResult, StorageStats };

export interface SlotsResponse {
  data: {
    slots: PlacedCell[];
    total: number;
    page: number;
    pageSize: number;
  };
}

export interface StatsResponse {
  data: StorageStats;
}

export interface LayoutResponse {
  data: ShelfLayout;
}

export interface OverridesResponse {
  data: CutOverride[];
}

export interface RebuildResponse {
  data: RebuildResult;
}

export const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Request failed: ${r.status}`);
    return r.json();
  });
