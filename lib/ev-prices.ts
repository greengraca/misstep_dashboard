// Shared helper: pick the freshest available EUR price for an ev_cards doc.
//
// Two sources coexist on every card:
//   • `price_eur` / `price_eur_foil` — Scryfall bulk, refreshed every 3 days.
//   • `cm_prices.{nonfoil|foil}.trend` — Cardmarket's Trend Price, scraped by
//     the extension whenever the user visits that card's product page.
//
// The extension's value is always more reliable *when it's more recent*
// (direct scrape from the source) but the Scryfall bulk has broader coverage.
// This helper compares timestamps per variant and returns the fresher one,
// plus metadata (`source`, `updatedAt`) so UIs can annotate the value.
//
// Use this helper anywhere you would otherwise read `price_eur` /
// `price_eur_foil` off an ev_cards doc for computation or display.

import type { EvCardCmPriceSnapshot } from "@/lib/types";

/**
 * Threshold for flagging a EUR price as anomalous vs USD-converted.
 *
 * Catches two distinct but similar-looking data quality bugs:
 *
 * 1. **Thin-market Cardmarket trend spikes.** A handful of inflated listings
 *    on a low-availability card drive the CM trend far above fair value;
 *    Scryfall passes the trend through as `eur`/`eur_foil`.
 *
 * 2. **Cross-printing misattribution.** Scryfall's `cardmarket_id` for a
 *    card maps to a Cardmarket product page whose listings include copies
 *    of a DIFFERENT (rarer / more expensive) printing — e.g. mh3 #381
 *    Emrakul (non-serialized, Play Booster eligible) whose CM page picks
 *    up listings of the serialized #381z variant (Collector Booster
 *    exclusive), inflating the reported trend to €2,292 vs the real
 *    non-serialized value of ~€40. See notes/ev/mh3.md for the full case.
 *
 * TCGplayer's catalog is more granular (distinct `productId` per printing),
 * so USD stays accurate in both scenarios — which is why a USD ceiling
 * works as the sanity check.
 *
 * A 5× gap almost always means one of the two scenarios above; real EUR/USD
 * price divergence on the same printing rarely exceeds ~3×.
 */
const EUR_USD_ANOMALY_RATIO = 5;

/**
 * Sanity-check Scryfall's EUR prices against its USD prices. When the EUR
 * value is more than EUR_USD_ANOMALY_RATIO times the USD-converted value,
 * replace it with the USD-converted figure. Used by both the per-set sync
 * (`applyUsdFallback` in lib/ev.ts) and the bulk sync (`parseScryfallCardToDoc`
 * in lib/scryfall-bulk.ts).
 *
 * `usdToEurFactor` is the combined ECB rate × EU market discount that
 * callers already use for null-EUR fallback (typically ~0.856 × 0.75).
 */
export function clampEurAgainstUsd(
  eur: number | null,
  usd: string | undefined | null,
  usdToEurFactor: number
): { value: number | null; clamped: boolean } {
  if (eur === null || !usd || !usdToEurFactor) return { value: eur, clamped: false };
  const usdConverted = parseFloat(usd) * usdToEurFactor;
  if (eur > usdConverted * EUR_USD_ANOMALY_RATIO) {
    return { value: Math.round(usdConverted * 100) / 100, clamped: true };
  }
  return { value: eur, clamped: false };
}

export interface EffectivePriceInput {
  price_eur: number | null;
  price_eur_foil: number | null;
  /** True when the nonfoil price was derived from USD (EUR was null or USD-clamped at sync). */
  price_eur_estimated?: boolean;
  /** True when the foil price was derived from USD. Separate flag so we don't falsely mark a clean nonfoil as estimated just because its foil was clamped. */
  price_eur_foil_estimated?: boolean;
  prices_updated_at?: string | null;
  cm_prices?: {
    nonfoil?: EvCardCmPriceSnapshot;
    foil?: EvCardCmPriceSnapshot;
  } | null;
  /**
   * Scryfall's `finishes` array. Used to detect single-variant-on-CM printings
   * (e.g. foil-only Starter Collection prints, etched-only commanders) so the
   * variant-fallback can route a foil request to nonfoil-side CM data when
   * the card simply has no nonfoil version on Cardmarket. Without this, the
   * `oppositeScryfall == null` heuristic doesn't fire for foil-only cards
   * because `applyUsdFallback` fills `price_eur` from `price_eur_foil`.
   */
  finishes?: string[];
}

export interface EffectivePrice {
  price: number | null;
  source: "scryfall" | "cm_ext" | null;
  updatedAt: string | null;
  /** True when the returned price is a USD-derived estimate (Scryfall only; CM-ext is always real market data). */
  estimated: boolean;
  /**
   * True when the CM-ext price used is `from` (Cardmarket's lowest current
   * listing) rather than `trend`, because `from > trend` signals a thin-supply
   * or rising market — the cheapest available seller is asking more than the
   * trend average, so `trend` under-values what you'd actually pay today.
   * Only set when `source === "cm_ext"`. Surfaced in the UI as an up-arrow
   * indicator (↑) instead of the usual circle (•).
   */
  ascending: boolean;
}

export function getEffectivePrice(
  card: EffectivePriceInput,
  isFoil: boolean
): EffectivePrice {
  const scryfallPrice = isFoil ? card.price_eur_foil : card.price_eur;
  const scryfallAt = card.prices_updated_at ?? null;
  // The estimated flag is per-variant: nonfoil has its own flag, foil has its own.
  // Older card docs may only have the legacy single `price_eur_estimated` flag (applied
  // when either variant was estimated). Fall back to it so we don't silently drop the
  // signal on un-resynced data.
  const scryfallEstimated = isFoil
    ? (card.price_eur_foil_estimated ?? card.price_eur_estimated ?? false)
    : (card.price_eur_estimated ?? false);
  // Variant fallback: if the requested variant has no CM data but the card is
  // single-variant on CM (the opposite variant's Scryfall price is null —
  // meaning that variant doesn't exist as a Cardmarket product at all), use
  // the opposite CM variant. Covers foil-only printings (Raised Foil Aang,
  // FTV/PLG/G foils) and nonfoil-only promos where the extension's per-page
  // foil-detection wrote data to whichever key matched the page's foil toggle,
  // regardless of the "canonical" variant label.
  //
  // Mirrors the logic in lib/appraiser/ev-join.ts (see that comment for more).
  const requestedVariant = isFoil ? card.cm_prices?.foil : card.cm_prices?.nonfoil;
  const oppositeVariant = isFoil ? card.cm_prices?.nonfoil : card.cm_prices?.foil;
  const oppositeScryfall = isFoil ? card.price_eur : card.price_eur_foil;
  // Prefer the `finishes` signal — it directly tells us whether the requested
  // variant exists at all. The Scryfall-null heuristic is unreliable because
  // `applyUsdFallback` (lib/ev.ts) fills `price_eur` from `price_eur_foil` for
  // foil-only printings, leaving `oppositeScryfall` populated even when the
  // card has no nonfoil version on Cardmarket. Fall back to the legacy check
  // for callers that don't pass `finishes`.
  const isSingleVariantOnCm =
    card.finishes != null && card.finishes.length > 0
      ? (isFoil ? !card.finishes.includes("nonfoil") : !card.finishes.includes("foil"))
      : oppositeScryfall == null;
  const requestedHasData =
    !!requestedVariant && (requestedVariant.from != null || requestedVariant.trend != null);
  const oppositeHasData =
    !!oppositeVariant && (oppositeVariant.from != null || oppositeVariant.trend != null);
  const variant = requestedHasData
    ? requestedVariant
    : isSingleVariantOnCm && oppositeHasData
      ? oppositeVariant
      : requestedVariant;
  const cmTrend = variant?.trend ?? null;
  const cmFrom = variant?.from ?? null;
  const cmAt = variant?.updatedAt ?? null;

  // CM effective price: prefer `from` when from > trend (thin-supply / rising
  // market — cheapest listing is above trend, so trend under-values buy-in).
  // Fall back to trend otherwise. Marks `ascending: true` so UIs can render
  // an up-arrow indicator instead of the usual circle.
  let cmPrice: number | null = null;
  let ascending = false;
  if (cmTrend != null && cmFrom != null && cmFrom > cmTrend) {
    cmPrice = cmFrom;
    ascending = true;
  } else if (cmTrend != null) {
    cmPrice = cmTrend;
  } else if (cmFrom != null) {
    // trend missing but from exists — use from. Don't mark ascending=true
    // because there's nothing to compare against (the "ascending" signal
    // needs both values to be meaningful).
    cmPrice = cmFrom;
  }

  // Sanity check: discard Cardmarket price when it's wildly higher than the
  // (already USD-clamped) Scryfall price. Same thin-market rationale as
  // clampEurAgainstUsd above — CM data derives from listing prices, and for
  // ultra-rare cards with a handful of copies globally a single inflated ask
  // can drive either `from` or `trend` off fair value. The Scryfall price
  // has already been clamped at sync time, so it serves as a trustworthy
  // ceiling here. Applies uniformly whether cmPrice came from trend or from.
  if (cmPrice != null && scryfallPrice != null && cmPrice > scryfallPrice * EUR_USD_ANOMALY_RATIO) {
    cmPrice = null;
    ascending = false;
  }

  if (cmPrice != null && scryfallPrice != null && cmAt && scryfallAt) {
    return cmAt >= scryfallAt
      ? { price: cmPrice, source: "cm_ext", updatedAt: cmAt, estimated: false, ascending }
      : { price: scryfallPrice, source: "scryfall", updatedAt: scryfallAt, estimated: scryfallEstimated, ascending: false };
  }
  if (cmPrice != null) return { price: cmPrice, source: "cm_ext", updatedAt: cmAt, estimated: false, ascending };
  if (scryfallPrice != null) {
    return { price: scryfallPrice, source: "scryfall", updatedAt: scryfallAt, estimated: scryfallEstimated, ascending: false };
  }
  return { price: null, source: null, updatedAt: null, estimated: false, ascending: false };
}

/**
 * Convenience: just the price number, or 0 when missing. Matches the
 * callsite pattern `card.price_eur ?? 0`.
 */
export function effectivePriceValue(
  card: EffectivePriceInput,
  isFoil: boolean
): number {
  return getEffectivePrice(card, isFoil).price ?? 0;
}

/**
 * Convenience: price, foil-falling-back-to-nonfoil-then-zero. Matches the
 * pattern `card.price_eur_foil ?? card.price_eur ?? 0`.
 */
export function effectivePriceWithFallback(
  card: EffectivePriceInput,
  isFoil: boolean
): number {
  const primary = getEffectivePrice(card, isFoil).price;
  if (primary != null) return primary;
  const other = getEffectivePrice(card, !isFoil).price;
  return other ?? 0;
}

/**
 * Same as `effectivePriceWithFallback` but returns the full `EffectivePrice`
 * (price + source + updatedAt) with fallback semantics. When the requested
 * variant is missing, falls through to the other variant and returns THAT
 * variant's source/timestamp — so callers rendering a "source dot" annotate
 * the price with the variant that actually produced the number.
 *
 * Fixes the mismatch where `price` came from the fallback but `source` /
 * `updatedAt` were null because `getEffectivePrice` (no fallback) was called
 * separately.
 */
export function getEffectivePriceWithFallback(
  card: EffectivePriceInput,
  isFoil: boolean
): EffectivePrice {
  const primary = getEffectivePrice(card, isFoil);
  if (primary.price != null) return primary;
  const other = getEffectivePrice(card, !isFoil);
  return other;
}
