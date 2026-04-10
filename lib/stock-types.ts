import type { CmStockListing } from "@/lib/types";

export type StockSortField =
  | "name"
  | "qty"
  | "price"
  | "condition"
  | "foil"
  | "set"
  | "language"
  | "lastSeenAt";

export const STOCK_SORT_FIELDS: StockSortField[] = [
  "name", "qty", "price", "condition", "foil", "set", "language", "lastSeenAt",
];

export const STOCK_CONDITIONS = ["MT", "NM", "EX", "GD", "LP", "PL", "PO"] as const;
export type StockCondition = (typeof STOCK_CONDITIONS)[number];

export interface StockSearchParams {
  name?: string;
  set?: string;
  condition?: StockCondition;
  foil?: boolean;
  language?: string;
  minPrice?: number;
  maxPrice?: number;
  minQty?: number;
  sort: StockSortField;
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
}

export interface StockSearchResult {
  rows: CmStockListing[];
  total: number;
  page: number;
  pageSize: number;
}

export interface StockCounts {
  totalListings: number;
  totalQty: number;
  totalValue: number;
  distinctNameSet: number;
}

export type HistoryRange = "7d" | "30d" | "90d" | "all";

export interface StockHistoryPoint {
  extractedAt: string;
  totalListings: number;
  totalQty: number | null;
  totalValue: number | null;
  distinctNameSet: number | null;
}
