import type { ObjectId } from "mongodb";

export const COL_APPRAISER_COLLECTIONS = "dashboard_appraiser_collections";
export const COL_APPRAISER_CARDS = "dashboard_appraiser_cards";

export interface AppraiserCollectionDoc {
  _id: ObjectId;
  name: string;
  notes: string;
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
}

export interface CardInput {
  name: string;
  set?: string;
  collectorNumber?: string;
  qty?: number;
  foil?: boolean;
  language?: string;
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
