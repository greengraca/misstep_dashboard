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
