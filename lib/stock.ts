import { getDb } from "@/lib/mongodb";
import { COLLECTION_PREFIX } from "@/lib/constants";
import type { CmStockListing, CmStockSnapshot } from "@/lib/types";
import { getSetNameByCode } from "@/lib/scryfall-sets";
import { getEffectivePrice } from "@/lib/ev-prices";
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
  if (typeof params.signed === "boolean") {
    // "false" should match rows that are explicitly signed: false AND rows
    // synced before the ext started sending the field (no `signed` property).
    filter.signed = params.signed ? true : { $ne: true };
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

// ── Trend-join helper (in-memory) ────────────────────────────────────
//
// Stock rows carry the Cardmarket-flavored set name (e.g. "Adventures in
// the Forgotten Realms"). Scryfall's price_eur lives on ev_cards keyed by
// { name, set: <Scryfall code> }. So we hop:
//   stock.set → ev_sets.name → ev_sets.code → ev_cards{ name, set: code }.
//
// The naive MongoDB $lookup with a 2-field `let`+pipeline join runs at
// ~30ms/row on Atlas M0, which blows up to 3 minutes on 6k rows. We do
// the join in Node instead: fetch all matching stock rows (indexed, fast),
// resolve set codes (small), then batch-fetch ev_cards per set.
//
// Set-name variants ": Extras", ": Promos", ": Tokens" currently don't
// resolve to Scryfall codes — those rows get `trend_eur: null` (see
// CLAUDE.md TODO for the normalization table).

interface _JoinedStockRow extends CmStockListing {
  trend_eur: number | null;
  trend_source: "scryfall" | "cm_ext" | null;
  trend_updated_at: string | null;
  trend_ascending: boolean;
  // True when (name, set) matches multiple ev_cards variants and we don't
  // have a productId on the stock row to disambiguate. UI should explain
  // the missing trend rather than pick a random variant.
  trend_ambiguous: boolean;
  overpriced_pct: number | null;
  cardmarket_id: number | null;
}

interface _JoinedCard {
  price_eur: number | null;
  price_eur_foil: number | null;
  prices_updated_at: string | null;
  cardmarket_id: number | null;
  cm_prices: {
    nonfoil?: { trend?: number; updatedAt: string };
    foil?: { trend?: number; updatedAt: string };
  } | null;
  finishes: string[];
}

async function enrichWithTrend(
  db: Awaited<ReturnType<typeof getDb>>,
  rows: CmStockListing[]
): Promise<_JoinedStockRow[]> {
  if (rows.length === 0) return [];

  const setNames = Array.from(new Set(rows.map((r) => r.set)));
  const setDocs = await db
    .collection(`${COLLECTION_PREFIX}ev_sets`)
    .find({ name: { $in: setNames } }, { projection: { _id: 0, name: 1, code: 1 } })
    .toArray();
  const nameToCode = new Map<string, string>();
  for (const d of setDocs) nameToCode.set(d.name as string, d.code as string);

  const byCode = new Map<string, Set<string>>();
  for (const r of rows) {
    const code = nameToCode.get(r.set);
    if (!code) continue;
    if (!byCode.has(code)) byCode.set(code, new Set());
    byCode.get(code)!.add(r.name);
  }

  // Two lookup paths:
  //  • productId → one specific ev_cards variant (authoritative; ext v1.7.1+)
  //  • (name, set) → possibly many variants (basics, reprints). We only pick
  //    a trend when there's exactly one; otherwise leave it ambiguous and let
  //    the UI explain, rather than guess at which art the user listed.
  const productIds = rows
    .map((r) => r.productId)
    .filter((p): p is number => typeof p === "number");
  const cardByProductId = new Map<number, _JoinedCard>();
  if (productIds.length) {
    const byIdCards = await db
      .collection(`${COLLECTION_PREFIX}ev_cards`)
      .find(
        { cardmarket_id: { $in: productIds } },
        {
          projection: {
            _id: 0,
            price_eur: 1,
            price_eur_foil: 1,
            prices_updated_at: 1,
            cardmarket_id: 1,
            finishes: 1,
            "cm_prices.nonfoil.trend": 1,
            "cm_prices.nonfoil.updatedAt": 1,
            "cm_prices.foil.trend": 1,
            "cm_prices.foil.updatedAt": 1,
          },
        }
      )
      .toArray();
    for (const c of byIdCards) {
      cardByProductId.set(c.cardmarket_id as number, {
        price_eur: (c.price_eur as number | null) ?? null,
        price_eur_foil: (c.price_eur_foil as number | null) ?? null,
        prices_updated_at: (c.prices_updated_at as string | null) ?? null,
        cardmarket_id: (c.cardmarket_id as number | null) ?? null,
        cm_prices: (c.cm_prices as _JoinedCard["cm_prices"]) ?? null,
        finishes: (c.finishes as string[] | undefined) ?? [],
      });
    }
  }

  const cardsByNameSet = new Map<string, _JoinedCard[]>();
  await Promise.all(
    Array.from(byCode.entries()).map(async ([code, names]) => {
      const cards = await db
        .collection(`${COLLECTION_PREFIX}ev_cards`)
        .find(
          { set: code, name: { $in: Array.from(names) } },
          {
            projection: {
              _id: 0,
              name: 1,
              set: 1,
              price_eur: 1,
              price_eur_foil: 1,
              prices_updated_at: 1,
              cardmarket_id: 1,
              finishes: 1,
              "cm_prices.nonfoil.trend": 1,
              "cm_prices.nonfoil.updatedAt": 1,
              "cm_prices.foil.trend": 1,
              "cm_prices.foil.updatedAt": 1,
            },
          }
        )
        .toArray();
      for (const c of cards) {
        const key = `${c.set}\u241F${c.name}`;
        const variant: _JoinedCard = {
          price_eur: (c.price_eur as number | null) ?? null,
          price_eur_foil: (c.price_eur_foil as number | null) ?? null,
          prices_updated_at: (c.prices_updated_at as string | null) ?? null,
          cardmarket_id: (c.cardmarket_id as number | null) ?? null,
          cm_prices: (c.cm_prices as _JoinedCard["cm_prices"]) ?? null,
          finishes: (c.finishes as string[] | undefined) ?? [],
        };
        const bucket = cardsByNameSet.get(key);
        if (bucket) bucket.push(variant);
        else cardsByNameSet.set(key, [variant]);
      }
    })
  );

  return rows.map((r) => {
    let card: _JoinedCard | null = null;
    let ambiguous = false;

    if (typeof r.productId === "number") {
      card = cardByProductId.get(r.productId) ?? null;
    } else {
      const code = nameToCode.get(r.set);
      const variants = code ? cardsByNameSet.get(`${code}\u241F${r.name}`) : null;
      if (variants?.length === 1) card = variants[0];
      else if (variants && variants.length > 1) ambiguous = true;
    }

    const eff = card
      ? getEffectivePrice(card, r.foil)
      : { price: null, source: null, updatedAt: null, estimated: false, ascending: false };
    const overpriced_pct = eff.price != null && eff.price > 0 ? r.price / eff.price - 1 : null;
    return {
      ...r,
      trend_eur: eff.price,
      trend_source: eff.source,
      trend_updated_at: eff.updatedAt,
      trend_ascending: eff.ascending,
      trend_ambiguous: ambiguous,
      overpriced_pct,
      cardmarket_id: card?.cardmarket_id ?? null,
    };
  });
}

function cmpValues(a: unknown, b: unknown, dir: 1 | -1): number {
  // Null-last regardless of direction so sort by overpriced_pct doesn't
  // surface the unjoinable rows at the top.
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "string" && typeof b === "string") return dir * a.localeCompare(b);
  if (typeof a === "boolean" && typeof b === "boolean") {
    return dir * (Number(a) - Number(b));
  }
  return dir * (Number(a) - Number(b));
}

export async function searchStock(params: StockSearchParams): Promise<StockSearchResult> {
  const db = await getDb();
  const col = db.collection<CmStockListing>(COL_STOCK);
  const filter = await buildStockFilter(params);
  const sortDir: 1 | -1 = params.dir === "asc" ? 1 : -1;
  const skip = (params.page - 1) * params.pageSize;

  // Fast path: no overpriced-aware filter/sort. Paginate in the DB, then
  // enrich the ≤pageSize rows we actually return.
  const needsInMemoryPass =
    params.minOverpricedPct != null || params.sort === "overpriced_pct";

  if (!needsInMemoryPass) {
    const [pageRows, totalsAgg] = await Promise.all([
      col
        .find(filter)
        .sort({ [params.sort]: sortDir })
        .skip(skip)
        .limit(params.pageSize)
        .toArray(),
      col
        .aggregate([
          ...(Object.keys(filter).length ? [{ $match: filter }] : []),
          {
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
          },
        ])
        .toArray(),
    ]);

    const enriched = await enrichWithTrend(db, pageRows as unknown as CmStockListing[]);
    const tBucket = totalsAgg[0] || {};
    const totals = tBucket.totals?.[0] || {};
    return {
      rows: enriched,
      total: totals.count || 0,
      totalQty: totals.qty || 0,
      totalValue: Math.round((totals.value || 0) * 100) / 100,
      distinctNameSet: tBucket.distinct?.[0]?.count || 0,
      page: params.page,
      pageSize: params.pageSize,
    };
  }

  // Slow path: the overpriced filter or sort depends on the trend join.
  // Pull everything matching the basic filter, enrich in memory, then
  // filter/sort/paginate. Stock is small enough (≤6k rows today) for this
  // to comfortably beat the $lookup pipeline on Atlas M0.
  const allRows = (await col.find(filter).toArray()) as unknown as CmStockListing[];
  const enrichedAll = await enrichWithTrend(db, allRows);

  const filtered =
    params.minOverpricedPct != null
      ? enrichedAll.filter(
          (r) => r.overpriced_pct != null && r.overpriced_pct >= params.minOverpricedPct!
        )
      : enrichedAll;

  filtered.sort((a, b) =>
    cmpValues(
      (a as unknown as Record<string, unknown>)[params.sort],
      (b as unknown as Record<string, unknown>)[params.sort],
      sortDir
    )
  );

  const total = filtered.length;
  let totalQty = 0;
  let totalValue = 0;
  const distinctKeys = new Set<string>();
  for (const r of filtered) {
    totalQty += r.qty;
    totalValue += r.qty * r.price;
    distinctKeys.add(`${r.name}\u241F${r.set}`);
  }

  return {
    rows: filtered.slice(skip, skip + params.pageSize),
    total,
    totalQty,
    totalValue: Math.round(totalValue * 100) / 100,
    distinctNameSet: distinctKeys.size,
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
