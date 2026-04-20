// Joins appraiser card docs with the matching `dashboard_ev_cards` rows so
// live CM prices (from/trend/avg*) captured by the extension become visible
// on the appraiser without waiting for a per-card click-through.
//
// Recency rule for trend: we reuse `getEffectivePrice` from lib/ev-prices.ts,
// which picks the newer of Scryfall bulk (`price_eur`/`price_eur_foil`) and
// CM scrape (`cm_prices.{variant}.trend`). Matches the convention used by
// the Stock overpriced-listing pipeline.
//
// From price has no Scryfall equivalent — when ev_cards.cm_prices.{variant}.from
// exists, we surface it. Otherwise the appraiser card's own fromPrice (null
// by default, or whatever the legacy fan-out wrote) stays.

import type { Db } from "mongodb";
import { getEffectivePrice, type EffectivePriceInput } from "@/lib/ev-prices";
import type {
  AppraiserCard,
  AppraiserCardDoc,
  CmPricesSnapshot,
} from "./types";

function cardDocToPayload(d: AppraiserCardDoc): AppraiserCard {
  return {
    _id: String(d._id),
    collectionId: String(d.collectionId),
    name: d.name,
    set: d.set,
    setName: d.setName,
    collectorNumber: d.collectorNumber,
    language: d.language,
    foil: d.foil,
    qty: d.qty,
    scryfallId: d.scryfallId,
    cardmarket_id: d.cardmarket_id,
    cardmarketUrl: d.cardmarketUrl,
    imageUrl: d.imageUrl,
    trendPrice: d.trendPrice,
    fromPrice: d.fromPrice,
    pricedAt: d.pricedAt ? d.pricedAt.toISOString() : null,
    cm_prices: d.cm_prices,
    status: d.status,
    createdAt: d.createdAt.toISOString(),
  };
}

interface EvCardPriceRow {
  cardmarket_id: number;
  price_eur: number | null;
  price_eur_foil: number | null;
  prices_updated_at: string | null;
  cm_prices: EffectivePriceInput["cm_prices"] | null;
}

/**
 * Returns the appraiser cards with their fromPrice / trendPrice / cm_prices /
 * pricedAt / status hydrated from `dashboard_ev_cards` when that collection
 * has a matching row with fresher CM data. No-op for cards without a
 * cardmarket_id or without any matching ev_cards row.
 */
export async function hydrateAppraiserCards(
  db: Db,
  cards: AppraiserCardDoc[]
): Promise<AppraiserCard[]> {
  const cmIds = Array.from(
    new Set(
      cards
        .map((c) => c.cardmarket_id)
        .filter((x): x is number => x != null)
    )
  );
  if (cmIds.length === 0) return cards.map(cardDocToPayload);

  const evCards = (await db
    .collection("dashboard_ev_cards")
    .find(
      { cardmarket_id: { $in: cmIds } },
      {
        projection: {
          cardmarket_id: 1,
          price_eur: 1,
          price_eur_foil: 1,
          prices_updated_at: 1,
          cm_prices: 1,
        },
      }
    )
    .toArray()) as unknown as EvCardPriceRow[];

  const evByCmId = new Map<number, EvCardPriceRow>();
  for (const ev of evCards) evByCmId.set(ev.cardmarket_id, ev);

  return cards.map((c) => {
    const payload = cardDocToPayload(c);
    if (c.cardmarket_id == null) return payload;
    const ev = evByCmId.get(c.cardmarket_id);
    if (!ev) return payload;

    // Prefer the requested variant. Fall back to the other one if empty —
    // foil-only promos (PLG21, G11, V13, FTV, etc.) have no foil toggle on
    // Cardmarket, so the extension reads foilMode:false and writes to
    // cm_prices.nonfoil even though the listings ARE foil. A foil-tagged
    // appraiser card for one of those would otherwise never show prices.
    const requestedVariant = c.foil ? ev.cm_prices?.foil : ev.cm_prices?.nonfoil;
    const fallbackVariant = c.foil ? ev.cm_prices?.nonfoil : ev.cm_prices?.foil;
    const variant = requestedVariant && (requestedVariant.from != null || requestedVariant.trend != null)
      ? requestedVariant
      : fallbackVariant;
    const fromFromCm = variant?.from ?? null;

    // Same fallback on the Scryfall side: some cards only have one of
    // price_eur / price_eur_foil populated even though they exist in both
    // finishes on CM. Pick the requested first, fall back to the other.
    const scryfallPrice = c.foil
      ? (ev.price_eur_foil ?? ev.price_eur ?? null)
      : (ev.price_eur ?? ev.price_eur_foil ?? null);
    const eff = getEffectivePrice(
      {
        price_eur: scryfallPrice,
        price_eur_foil: null,
        prices_updated_at: ev.prices_updated_at,
        // Feed the picked variant under `nonfoil` so getEffectivePrice uses it
        // regardless of the `foil` flag we pass in below.
        cm_prices: variant ? { nonfoil: variant } : null,
      },
      false
    );

    // Prefer ev_cards' full CM snapshot so the UI sees avg30d/avg7d/chart too.
    const cm_prices: CmPricesSnapshot | null = variant
      ? {
          from: variant.from,
          trend: variant.trend,
          avg30d: variant.avg30d,
          avg7d: variant.avg7d,
          avg1d: variant.avg1d,
          available: variant.available,
          chart: variant.chart,
          updatedAt: variant.updatedAt,
        }
      : payload.cm_prices;

    const trendPrice = eff.price ?? payload.trendPrice;
    const fromPrice = fromFromCm ?? payload.fromPrice;
    const pricedAt = variant?.updatedAt ?? payload.pricedAt;
    const status: AppraiserCard["status"] =
      fromPrice != null || trendPrice != null ? "priced" : payload.status;

    return {
      ...payload,
      trendPrice,
      fromPrice,
      cm_prices,
      pricedAt,
      status,
      trend_source: eff.price != null ? eff.source : null,
      trend_updated_at: eff.price != null ? eff.updatedAt : null,
    };
  });
}

/** Per-card totals — uses the hydrated values so collection cards counts line up with what's displayed. */
export function computeCollectionTotals(cards: AppraiserCard[]): {
  cardCount: number;
  totalTrend: number;
  totalFrom: number;
} {
  return cards.reduce(
    (acc, c) => ({
      cardCount: acc.cardCount + c.qty,
      totalTrend: acc.totalTrend + (c.trendPrice ?? 0) * c.qty,
      totalFrom: acc.totalFrom + (c.fromPrice ?? 0) * c.qty,
    }),
    { cardCount: 0, totalTrend: 0, totalFrom: 0 }
  );
}
