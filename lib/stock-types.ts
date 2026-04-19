import type { CmStockListing } from "@/lib/types";

export type StockSortField =
  | "name"
  | "qty"
  | "price"
  | "condition"
  | "foil"
  | "set"
  | "language"
  | "lastSeenAt"
  | "overpriced_pct";

export const STOCK_SORT_FIELDS: StockSortField[] = [
  "name", "qty", "price", "condition", "foil", "set", "language", "lastSeenAt", "overpriced_pct",
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
  // Minimum "(price / trend) - 1" fraction. 0.2 means +20% above trend.
  // Listings without a resolvable trend are excluded when this is set.
  minOverpricedPct?: number;
  // true = only signed listings, false = exclude signed listings,
  // undefined = no signed filter.
  signed?: boolean;
  sort: StockSortField;
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
}

// Stock row enriched with Scryfall trend price + how far over it we're listed.
// `trend_eur` is null when the (name, set) join to ev_cards failed — stock's
// CM set name variants like "X: Extras" don't all map yet (see CLAUDE.md TODO).
// `cardmarket_id` is the joined ev_cards.cardmarket_id (Scryfall's Cardmarket
// product ID) so the UI can deep-link into /Products/Search?idProduct=N.
export interface StockListingWithTrend extends CmStockListing {
  trend_eur: number | null;
  overpriced_pct: number | null;
  cardmarket_id: number | null;
}

export interface StockSearchResult {
  rows: StockListingWithTrend[];
  total: number;
  totalQty: number;
  totalValue: number;
  distinctNameSet: number;
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
