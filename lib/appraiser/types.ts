import type { ObjectId } from "mongodb";

export const COL_APPRAISER_COLLECTIONS = "dashboard_appraiser_collections";
export const COL_APPRAISER_CARDS = "dashboard_appraiser_cards";

export interface AppraiserCollectionDoc {
  _id: ObjectId;
  name: string;
  notes: string;
  /** When true, cards with `trendPrice < bulkThreshold` (or null trend) are
   *  excluded from main From/Trend totals and the offer-tier math. Default false. */
  bulkExcludeEnabled?: boolean;
  /** EUR threshold below which a card is treated as bulk. Default 1.0. */
  bulkThreshold?: number;
  /** Flat EUR/card rate added back to the offer total via `bulkCount × bulkRate`.
   *  0 means pure exclusion. Default 0. */
  bulkRate?: number;
  /** When true, displayed `fromPrice` and `trendPrice` are scaled by
   *  (1 - undercutPercent/100). Captures the realistic resale discount on
   *  played-condition collections where buyers price into the floor.
   *  Default false. */
  undercutEnabled?: boolean;
  /** Percent (0-100) subtracted from displayed prices when undercut is on.
   *  Default 20. */
  undercutPercent?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AppraiserCollection {
  _id: string;
  name: string;
  notes: string;
  cardCount: number;
  totalTrend: number;
  totalFrom: number;
  bulkExcludeEnabled: boolean;
  bulkThreshold: number;
  bulkRate: number;
  undercutEnabled: boolean;
  undercutPercent: number;
  createdAt: string;
  updatedAt: string;
}

export interface CmPricesSnapshot {
  from?: number;
  trend?: number;
  avg30d?: number;
  avg7d?: number;
  avg1d?: number;
  available?: number;
  chart?: Array<{ date: string; avg_sell: number }>;
  updatedAt?: string;
}

export interface AppraiserCardDoc {
  _id: ObjectId;
  collectionId: ObjectId;
  name: string;
  set: string;
  setName: string;
  collectorNumber: string;
  language: string;
  condition?: string;
  foil: boolean;
  qty: number;
  scryfallId: string;
  cardmarket_id: number | null;
  cardmarketUrl: string;
  imageUrl: string;
  trendPrice: number | null;
  fromPrice: number | null;
  /** Last time trend/from prices were refreshed — set on Scryfall resolve or CM scrape fan-out. Null until first resolve. */
  pricedAt: Date | null;
  cm_prices: CmPricesSnapshot | null;
  status: "pending" | "priced" | "error" | "manual";
  createdAt: Date;
}

export interface AppraiserCard {
  _id: string;
  collectionId: string;
  name: string;
  set: string;
  setName: string;
  collectorNumber: string;
  language: string;
  condition?: string;
  foil: boolean;
  qty: number;
  scryfallId: string;
  cardmarket_id: number | null;
  cardmarketUrl: string;
  imageUrl: string;
  trendPrice: number | null;
  fromPrice: number | null;
  pricedAt: string | null;
  cm_prices: CmPricesSnapshot | null;
  status: "pending" | "priced" | "error" | "manual";
  createdAt: string;
  /** Where the displayed trendPrice came from — 'cm_ext' means fresher than Scryfall bulk. Null when no price. */
  trend_source?: "scryfall" | "cm_ext" | null;
  /** ISO timestamp of the trend source (scryfall's prices_updated_at or CM scrape's updatedAt). */
  trend_updated_at?: string | null;
  /** True when `trendPrice` is actually the CM `from` price (higher than trend) — signals thin-supply / rising market. UI renders ↑ instead of •. */
  trend_ascending?: boolean;
  /** True when condition is heavily-played and trendPrice was substituted from
   *  fromPrice in `hydrateAppraiserCards`. UI uses this to render an HP chip
   *  on the Trend column. */
  trend_hp_override?: boolean;
}

export interface CardInput {
  name: string;
  set?: string;
  collectorNumber?: string;
  qty?: number;
  foil?: boolean;
  language?: string;
  condition?: string;
  scryfallId?: string;           // fast-path: skip fuzzy resolution
  cardmarket_id?: number | null; // pre-known from Delver Lens CSV
}

export interface ScryfallPrinting {
  set: string;
  setName: string;
  scryfallId: string;
  collectorNumber: string;
  cardmarketId: number | null;
  cardmarketUrl: string;
  imageUrl: string;
  trendPrice: number | null;
}

export interface ScryfallResolveResult {
  name: string;
  set: string;
  setName: string;
  collectorNumber: string;
  scryfallId: string;
  cardmarketId: number | null;
  cardmarketUrl: string;
  imageUrl: string;
  trendPrice: number | null;
  foilOnly: boolean;
  printings: ScryfallPrinting[];
}
