import type { Collection, Document } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { COLLECTION_PREFIX } from "@/lib/constants";
import type { CmStockListing, CmStockSnapshot } from "@/lib/types";
import { getSetNameByCode } from "@/lib/scryfall-sets";
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

export async function buildStockFilter(
  params: StockSearchParams
): Promise<Record<string, unknown>> {
  const filter: Record<string, unknown> = {};
  if (params.name && params.name.trim()) {
    filter.name = { $regex: escapeRegex(params.name.trim()), $options: "i" };
  }
  if (params.set && params.set.trim()) {
    const raw = params.set.trim();
    // Accept either the stored Cardmarket name (substring, case-insensitive)
    // or a Scryfall set code (e.g. "J25"). For a short all-alphanumeric token
    // we also look up the matching full name so code searches work.
    const asName = { $regex: escapeRegex(raw), $options: "i" };
    const looksLikeCode = raw.length <= 6 && /^[a-z0-9]+$/i.test(raw);
    if (looksLikeCode) {
      const mapped = await getSetNameByCode(raw);
      if (mapped) {
        filter.$or = [
          { set: asName },
          { set: { $regex: `^${escapeRegex(mapped)}$`, $options: "i" } },
        ];
      } else {
        filter.set = asName;
      }
    } else {
      filter.set = asName;
    }
  }
  if (params.condition) {
    filter.condition = params.condition;
  }
  if (typeof params.foil === "boolean") {
    filter.foil = params.foil;
  }
  if (params.language && params.language.trim()) {
    filter.language = { $regex: escapeRegex(params.language.trim()), $options: "i" };
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

async function computeFilteredAggregates<T extends Document>(
  col: Collection<T>,
  filter: Record<string, unknown>
): Promise<{ total: number; totalQty: number; totalValue: number; distinctNameSet: number }> {
  const pipeline: Record<string, unknown>[] = [];
  if (Object.keys(filter).length > 0) pipeline.push({ $match: filter });
  pipeline.push({
    $facet: {
      totals: [
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            qty: { $sum: "$qty" },
            value: { $sum: { $multiply: ["$qty", "$price"] } },
          },
        },
      ],
      distinct: [
        { $group: { _id: { name: "$name", set: "$set" } } },
        { $count: "count" },
      ],
    },
  });
  const aggResult = await col.aggregate(pipeline).toArray();
  const totals = aggResult[0]?.totals?.[0] || {};
  const distinct = aggResult[0]?.distinct?.[0]?.count || 0;
  return {
    total: totals.count || 0,
    totalQty: totals.qty || 0,
    totalValue: Math.round((totals.value || 0) * 100) / 100,
    distinctNameSet: distinct,
  };
}

export async function searchStock(params: StockSearchParams): Promise<StockSearchResult> {
  const db = await getDb();
  const col = db.collection<CmStockListing>(COL_STOCK);
  const filter = await buildStockFilter(params);
  const sortDir = params.dir === "asc" ? 1 : -1;
  const skip = (params.page - 1) * params.pageSize;

  const [rows, aggs] = await Promise.all([
    col
      .find(filter)
      .sort({ [params.sort]: sortDir })
      .skip(skip)
      .limit(params.pageSize)
      .toArray(),
    computeFilteredAggregates(col, filter),
  ]);

  return {
    rows: rows as unknown as CmStockListing[],
    total: aggs.total,
    totalQty: aggs.totalQty,
    totalValue: aggs.totalValue,
    distinctNameSet: aggs.distinctNameSet,
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
                totalValue: { $sum: { $multiply: ["$qty", "$price"] } },
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
  totalListings: number;
  distinctNameSet: number;
}> {
  const counts = await computeStockCounts();
  return {
    totalQty: counts.totalQty,
    totalValue: counts.totalValue,
    totalListings: counts.totalListings,
    distinctNameSet: counts.distinctNameSet,
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

export async function getDistinctStockSets(): Promise<string[]> {
  const db = await getDb();
  const col = db.collection(COL_STOCK);
  const sets = await col.distinct("set");
  return (sets as unknown[])
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .sort((a, b) => a.localeCompare(b));
}

export async function getDistinctStockLanguages(): Promise<string[]> {
  const db = await getDb();
  const col = db.collection(COL_STOCK);
  const langs = await col.distinct("language");
  return (langs as unknown[])
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .sort((a, b) => a.localeCompare(b));
}
