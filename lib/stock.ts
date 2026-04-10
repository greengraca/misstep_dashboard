import { getDb } from "@/lib/mongodb";
import { COLLECTION_PREFIX } from "@/lib/constants";
import type { CmStockListing, CmStockSnapshot } from "@/lib/types";

const COL_STOCK = `${COLLECTION_PREFIX}cm_stock`;
const COL_SNAPSHOTS = `${COLLECTION_PREFIX}cm_stock_snapshots`;

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

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildStockFilter(params: StockSearchParams): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  if (params.name && params.name.trim()) {
    filter.name = { $regex: escapeRegex(params.name.trim()), $options: "i" };
  }
  if (params.set && params.set.trim()) {
    filter.set = params.set.trim();
  }
  if (params.condition) {
    filter.condition = params.condition;
  }
  if (typeof params.foil === "boolean") {
    filter.foil = params.foil;
  }
  if (params.language && params.language.trim()) {
    filter.language = params.language.trim();
  }
  const priceRange: Record<string, number> = {};
  if (typeof params.minPrice === "number") priceRange.$gte = params.minPrice;
  if (typeof params.maxPrice === "number") priceRange.$lte = params.maxPrice;
  if (Object.keys(priceRange).length > 0) filter.price = priceRange;
  if (typeof params.minQty === "number") {
    filter.qty = { $gte: params.minQty };
  }
  return filter;
}

export async function searchStock(params: StockSearchParams): Promise<StockSearchResult> {
  const db = await getDb();
  const col = db.collection<CmStockListing>(COL_STOCK);
  const filter = buildStockFilter(params);
  const sortDir = params.dir === "asc" ? 1 : -1;
  const skip = (params.page - 1) * params.pageSize;

  const [rows, total] = await Promise.all([
    col
      .find(filter)
      .sort({ [params.sort]: sortDir })
      .skip(skip)
      .limit(params.pageSize)
      .toArray(),
    col.countDocuments(filter),
  ]);

  return {
    rows: rows as unknown as CmStockListing[],
    total,
    page: params.page,
    pageSize: params.pageSize,
  };
}

export interface StockCounts {
  totalListings: number;
  totalQty: number;
  totalValue: number;
  distinctNameSet: number;
}

/**
 * Computes all four snapshot-level counts in a single $facet aggregation.
 * - totalListings: number of documents in the stock collection
 * - totalQty: sum of qty across all listings
 * - totalValue: sum of (qty * price) where price > 0.25
 * - distinctNameSet: count of unique (name, set) pairs
 *
 * Used by the summary API, the history backfill, and processStockOverview.
 */
export async function computeStockCounts(): Promise<StockCounts> {
  const db = await getDb();
  const col = db.collection(COL_STOCK);

  const result = await col
    .aggregate([
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                totalListings: { $sum: 1 },
                totalQty: { $sum: "$qty" },
                totalValue: {
                  $sum: {
                    $cond: [
                      { $gt: ["$price", 0.25] },
                      { $multiply: ["$qty", "$price"] },
                      0,
                    ],
                  },
                },
              },
            },
          ],
          distinct: [
            { $group: { _id: { name: "$name", set: "$set" } } },
            { $count: "count" },
          ],
        },
      },
    ])
    .toArray();

  const totals = result[0]?.totals?.[0] || {};
  const distinct = result[0]?.distinct?.[0]?.count || 0;

  return {
    totalListings: totals.totalListings || 0,
    totalQty: totals.totalQty || 0,
    totalValue: Math.round((totals.totalValue || 0) * 100) / 100,
    distinctNameSet: distinct,
  };
}

/**
 * Returns the three headline metrics shown in the stat cards.
 * Thin wrapper over computeStockCounts that drops totalListings.
 */
export async function getStockTotals(): Promise<{
  totalQty: number;
  totalValue: number;
  distinctListings: number;
}> {
  const counts = await computeStockCounts();
  return {
    totalQty: counts.totalQty,
    totalValue: counts.totalValue,
    distinctListings: counts.distinctNameSet,
  };
}

export type HistoryRange = "7d" | "30d" | "90d" | "all";

export interface StockHistoryPoint {
  extractedAt: string;
  totalListings: number;
  totalQty: number | null;
  totalValue: number | null;
  distinctNameSet: number | null;
}

function rangeStartISO(range: HistoryRange): string | null {
  if (range === "all") return null;
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

export async function getStockHistory(range: HistoryRange): Promise<StockHistoryPoint[]> {
  const db = await getDb();
  const col = db.collection<CmStockSnapshot>(COL_SNAPSHOTS);
  const filter: Record<string, unknown> = {};
  const start = rangeStartISO(range);
  if (start) filter.extractedAt = { $gte: start };

  const docs = await col.find(filter).sort({ extractedAt: 1 }).toArray();

  return docs.map((d) => ({
    extractedAt: d.extractedAt,
    totalListings: d.totalListings,
    totalQty: typeof d.totalQty === "number" ? d.totalQty : null,
    totalValue: typeof d.totalValue === "number" ? d.totalValue : null,
    distinctNameSet: typeof d.distinctNameSet === "number" ? d.distinctNameSet : null,
  }));
}
