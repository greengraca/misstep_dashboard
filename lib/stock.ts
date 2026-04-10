import { getDb } from "@/lib/mongodb";
import { COLLECTION_PREFIX } from "@/lib/constants";
import type { CmStockListing, CmStockSnapshot } from "@/lib/types";
import type {
  StockSortField,
  StockSearchParams,
  StockSearchResult,
  StockCounts,
  HistoryRange,
  StockHistoryPoint,
} from "./stock-types";

// Re-export client-safe types/constants so server-side callers can
// keep importing from a single module if they want.
export * from "./stock-types";

const COL_STOCK = `${COLLECTION_PREFIX}cm_stock`;
const COL_SNAPSHOTS = `${COLLECTION_PREFIX}cm_stock_snapshots`;

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
