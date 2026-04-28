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
  VelocityInfo,
} from "./types";

/**
 * Compute sales-cadence info from a CM chart. The chart is one entry per day
 * with ≥1 sale (CM's published "Avg Sell Price" series), so this counts
 * *active days*, not sale volume.
 *
 * Tier rules (informed by trader behavior — fast = move within a week
 * confidently; slow = capital lock-up risk):
 *   - fast    : ≥20 active days in the window AND last sale ≤2d ago
 *   - slow    : <5 active days   OR last sale ≥8d ago
 *   - medium  : everything between
 *   - unknown : variant has no chart at all (likely never scraped)
 *
 * Window is `min(30, daysSpannedByChart)` so a 12-day-old printing reads as
 * `12/12` instead of being penalized for not having 30 days of history.
 */
function computeVelocity(
  variant: { chart?: Array<{ date: string; avg_sell: number }>; updatedAt?: string } | undefined,
  variantKind: "foil" | "nonfoil",
  now: Date = new Date(),
): VelocityInfo | null {
  if (!variant) return null;
  const chartScrapedAt = variant.updatedAt ?? null;
  const chart = variant.chart ?? [];

  // Parse "DD.MM.YYYY" → ms timestamp at UTC midnight
  const parseEntry = (s: string): number | null => {
    const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!m) return null;
    const t = Date.parse(`${m[3]}-${m[2]}-${m[1]}T00:00:00Z`);
    return Number.isFinite(t) ? t : null;
  };

  const todayMs = now.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const cutoffMs = todayMs - 30 * dayMs;

  const inWindow: number[] = [];
  for (const e of chart) {
    const t = parseEntry(e.date);
    if (t != null && t >= cutoffMs && t <= todayMs) inWindow.push(t);
  }

  if (inWindow.length === 0) {
    // Variant exists but no chart entries in the window — could be "scraped,
    // genuinely zero sales in last 30d" or "never scraped" (no chart array).
    if (chart.length === 0 && !chartScrapedAt) {
      return null;
    }
    return {
      activeDays: 0,
      windowDays: 30,
      daysSinceLastSale: null,
      tier: "slow",
      chartScrapedAt,
      variant: variantKind,
    };
  }

  inWindow.sort((a, b) => a - b);
  const earliest = inWindow[0];
  const latest = inWindow[inWindow.length - 1];
  const activeDays = inWindow.length;
  const windowDays = Math.min(30, Math.max(1, Math.round((todayMs - earliest) / dayMs) + 1));
  const daysSinceLastSale = Math.max(0, Math.round((todayMs - latest) / dayMs));

  let tier: "fast" | "medium" | "slow";
  if (activeDays >= 20 && daysSinceLastSale <= 2) {
    tier = "fast";
  } else if (activeDays < 5 || daysSinceLastSale >= 8) {
    tier = "slow";
  } else {
    tier = "medium";
  }

  return {
    activeDays,
    windowDays,
    daysSinceLastSale,
    tier,
    chartScrapedAt,
    variant: variantKind,
  };
}

/**
 * Returns true when a Cardmarket-style condition string indicates the card is
 * "heavily played" enough that trend price won't apply — buyers price these to
 * the floor (the `from` ask), not the trend midpoint.
 *
 * Matched as: Heavily Played / HP, Poor / PO, Damaged, Played / PL,
 * Moderately Played / MP. Lightly Played (LP) is intentionally NOT included —
 * those still trade close to NM. Case-insensitive.
 *
 * Returns false for null/undefined/empty.
 */
export function isHeavilyPlayedCondition(condition: string | undefined | null): boolean {
  if (!condition) return false;
  const c = condition.trim().toLowerCase();
  // Lightly Played / LP is NOT heavily played — buyer expectations match NM.
  if (c === "lightly played" || c === "lp") return false;
  return /^(hp|po|pl|mp|heavily played|moderately played|played|poor|damaged)$/.test(c);
}

function cardDocToPayload(d: AppraiserCardDoc): AppraiserCard {
  return {
    _id: String(d._id),
    collectionId: String(d.collectionId),
    name: d.name,
    set: d.set,
    setName: d.setName,
    collectorNumber: d.collectorNumber,
    language: d.language,
    condition: d.condition,
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
    excluded: d.excluded ?? false,
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
  // Helper: derive from_source / from_updated_at for a payload that wasn't
  // hydrated from a fresh CM scrape (no cmIds, or no matching ev_cards row).
  // Manual edits leave pricedAt unchanged but flip status to "manual" — in
  // that case we don't have a reliable date, so source = null.
  function fallbackFromMeta(payload: AppraiserCard): {
    from_source: "cm_ext" | null;
    from_updated_at: string | null;
  } {
    if (payload.fromPrice == null || payload.status === "manual") {
      return { from_source: null, from_updated_at: null };
    }
    const updatedAt =
      payload.cm_prices?.updatedAt ?? payload.pricedAt ?? null;
    return { from_source: "cm_ext", from_updated_at: updatedAt };
  }

  if (cmIds.length === 0) {
    return cards.map((c) => {
      const payload = cardDocToPayload(c);
      const fromMeta = fallbackFromMeta(payload);
      // No ev_cards row to consult, but the appraiser doc may carry its own
      // `cm_prices` snapshot from a prior fan-out — feed that through.
      const velocity = computeVelocity(
        payload.cm_prices ?? undefined,
        c.foil ? "foil" : "nonfoil",
      );
      const isHp = isHeavilyPlayedCondition(c.condition);
      if (isHp && payload.fromPrice != null) {
        return { ...payload, ...fromMeta, velocity, trendPrice: payload.fromPrice, trend_hp_override: true };
      }
      return { ...payload, ...fromMeta, velocity };
    });
  }

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
    const isHpEarly = isHeavilyPlayedCondition(c.condition);
    const applyEarlyHp = (p: AppraiserCard): AppraiserCard => {
      const fromMeta = fallbackFromMeta(p);
      const velocity = computeVelocity(
        p.cm_prices ?? undefined,
        c.foil ? "foil" : "nonfoil",
      );
      const base = { ...p, ...fromMeta, velocity };
      return isHpEarly && p.fromPrice != null
        ? { ...base, trendPrice: p.fromPrice, trend_hp_override: true }
        : base;
    };
    if (c.cardmarket_id == null) return applyEarlyHp(payload);
    const ev = evByCmId.get(c.cardmarket_id);
    if (!ev) return applyEarlyHp(payload);

    // Variant fallback on the CM side is deliberately conservative. A
    // cross-variant fallback is only valid when the card is single-variant
    // on CM — otherwise we'd surface a foil scrape on a non-foil appraiser
    // card just because the user scraped foil but hasn't scraped non-foil
    // yet (both variants genuinely exist with different prices).
    //
    // Scryfall's price_eur / price_eur_foil nullability reflects whether CM
    // lists that variant at all. If the opposite variant's Scryfall price is
    // null, the card is single-variant on CM — classic case is foil-only
    // promos (PLG21, G11, V13, FTV, etc.) whose product page has no foil
    // toggle, so the extension reads foilMode:false and writes to
    // cm_prices.nonfoil even though the listings ARE foil.
    const requestedVariant = c.foil ? ev.cm_prices?.foil : ev.cm_prices?.nonfoil;
    const fallbackVariant = c.foil ? ev.cm_prices?.nonfoil : ev.cm_prices?.foil;
    const oppositeScryfall = c.foil ? ev.price_eur : ev.price_eur_foil;
    const isSingleVariantOnCm = oppositeScryfall == null;
    const requestedHasData =
      !!requestedVariant && (requestedVariant.from != null || requestedVariant.trend != null);
    const variant = requestedHasData
      ? requestedVariant
      : isSingleVariantOnCm
      ? fallbackVariant
      : undefined;
    const fromFromCm = variant?.from ?? null;

    // Scryfall bulk fallback follows the same rule: only substitute the
    // opposite finish's price when Scryfall confirms the requested one
    // doesn't exist (the null one IS the signal that the finish isn't on CM).
    const requestedScryfall = c.foil ? ev.price_eur_foil : ev.price_eur;
    const scryfallPrice = requestedScryfall ?? (isSingleVariantOnCm ? oppositeScryfall : null);

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

    const baseTrendPrice = eff.price ?? payload.trendPrice;
    const fromPrice = fromFromCm ?? payload.fromPrice;
    const pricedAt = variant?.updatedAt ?? payload.pricedAt;

    // HP swap — for heavily-played cards, the realistic price is the floor
    // (lowest current ask), not the trend midpoint. We only override when
    // we actually have a `fromPrice` to substitute; otherwise we leave the
    // trend value as-is and don't flag the override.
    const isHp = isHeavilyPlayedCondition(c.condition);
    const trendHpOverride = isHp && fromPrice != null;
    const trendPrice = trendHpOverride ? fromPrice : baseTrendPrice;

    const status: AppraiserCard["status"] =
      fromPrice != null || trendPrice != null ? "priced" : payload.status;

    // From-price provenance: when the live CM variant scrape contributed
    // `from`, surface that variant's updatedAt. Otherwise fall back to the
    // saved doc — null for manual entries (no reliable date), pricedAt or
    // cm_prices.updatedAt otherwise.
    const fromMeta: { from_source: "cm_ext" | null; from_updated_at: string | null } =
      fromFromCm != null
        ? { from_source: "cm_ext", from_updated_at: variant?.updatedAt ?? null }
        : fromPrice != null && c.status !== "manual"
        ? {
            from_source: "cm_ext",
            from_updated_at: cm_prices?.updatedAt ?? payload.pricedAt ?? null,
          }
        : { from_source: null, from_updated_at: null };

    // Velocity: derived from the same `variant` we used for prices, so the
    // chart matches the displayed numbers (foil/nonfoil consistency).
    const variantUsedKind: "foil" | "nonfoil" =
      variant === requestedVariant
        ? c.foil
          ? "foil"
          : "nonfoil"
        : c.foil
          ? "nonfoil"
          : "foil";
    const velocity = computeVelocity(variant, variantUsedKind);

    return {
      ...payload,
      trendPrice,
      fromPrice,
      cm_prices,
      pricedAt,
      status,
      trend_source: eff.price != null ? eff.source : null,
      trend_updated_at: eff.price != null ? eff.updatedAt : null,
      trend_ascending: eff.price != null ? eff.ascending : false,
      trend_hp_override: trendHpOverride,
      velocity,
      ...fromMeta,
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
