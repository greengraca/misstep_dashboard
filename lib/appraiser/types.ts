import type { ObjectId } from "mongodb";

export const COL_APPRAISER_COLLECTIONS = "dashboard_appraiser_collections";
export const COL_APPRAISER_CARDS = "dashboard_appraiser_cards";

export interface AppraiserCollectionDoc {
  _id: ObjectId;
  name: string;
  notes: string;
  /** When true, cards with `trendPrice < bulkThreshold` (or null trend) are
   *  excluded from main From/Trend totals and the offer-tier math. Default true. */
  bulkExcludeEnabled?: boolean;
  /** EUR threshold below which a card is treated as bulk. Default 1.0. */
  bulkThreshold?: number;
  /** Flat EUR/card rate added back to the offer total via `bulkCount × bulkRate`.
   *  0 means pure exclusion. Default 0. */
  bulkRate?: number;
  /** When true, displayed `trendPrice` is scaled by (1 - undercutPercent/100)
   *  to model the resale haircut on played-condition collections. From price
   *  and the offer math are NOT affected — From is what the user is paying,
   *  Trend is what they'd realize on resale. Default false. */
  undercutEnabled?: boolean;
  /** Percent (0-100) subtracted from displayed Trend when undercut is on.
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
  /** User flagged "I don't want this card" — pushed to bottom, dropped from
   *  totals and offer math, kept in the list so it's reversible. Independent
   *  of the bulk flag. Default false / undefined. */
  excluded?: boolean;
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
  /** User flagged "I don't want this card" — pushed to bottom of the table,
   *  dropped from totals and offer math, restorable via the same toggle. */
  excluded?: boolean;
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
  /** Source of fromPrice. "cm_ext" when sourced from a CM scrape (extension);
   *  null when manually edited or never priced. fromPrice has no Scryfall
   *  equivalent so this is binary. */
  from_source?: "cm_ext" | null;
  /** ISO timestamp of the cm_ext source's last scrape (variant.updatedAt or
   *  doc's pricedAt fallback). */
  from_updated_at?: string | null;
  /** Sales-cadence signal derived from `cm_prices.<variant>.chart`. The chart
   *  is one entry per day with ≥1 sale (no volume info), so this captures
   *  consistency, not volume. Null when no CM scrape has happened. */
  velocity?: VelocityInfo | null;
}

export interface VelocityInfo {
  /** Days within the window that had at least one sale on Cardmarket. */
  activeDays: number;
  /** Length of the observation window in days (≤30, possibly less for new
   *  printings or low-traffic cards where CM serves a shorter chart). */
  windowDays: number;
  /** Days since the most recent sale entry. Null when the window is empty. */
  daysSinceLastSale: number | null;
  /** Tiered classification driving the UI dot color. */
  tier: "fast" | "medium" | "slow" | "unknown";
  /** ISO timestamp of when the chart was last scraped. Used to caveat staleness. */
  chartScrapedAt: string | null;
  /** Which variant's chart we used. May differ from the row's foil flag
   *  when the card is single-variant on CM (foil-only promos, etc.). */
  variant: "foil" | "nonfoil";
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
