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

export interface EffectivePriceInput {
  price_eur: number | null;
  price_eur_foil: number | null;
  prices_updated_at?: string | null;
  cm_prices?: {
    nonfoil?: EvCardCmPriceSnapshot;
    foil?: EvCardCmPriceSnapshot;
  } | null;
}

export interface EffectivePrice {
  price: number | null;
  source: "scryfall" | "cm_ext" | null;
  updatedAt: string | null;
}

export function getEffectivePrice(
  card: EffectivePriceInput,
  isFoil: boolean
): EffectivePrice {
  const scryfallPrice = isFoil ? card.price_eur_foil : card.price_eur;
  const scryfallAt = card.prices_updated_at ?? null;
  const variant = isFoil ? card.cm_prices?.foil : card.cm_prices?.nonfoil;
  const cmPrice = variant?.trend ?? null;
  const cmAt = variant?.updatedAt ?? null;

  if (cmPrice != null && scryfallPrice != null && cmAt && scryfallAt) {
    return cmAt >= scryfallAt
      ? { price: cmPrice, source: "cm_ext", updatedAt: cmAt }
      : { price: scryfallPrice, source: "scryfall", updatedAt: scryfallAt };
  }
  if (cmPrice != null) return { price: cmPrice, source: "cm_ext", updatedAt: cmAt };
  if (scryfallPrice != null) {
    return { price: scryfallPrice, source: "scryfall", updatedAt: scryfallAt };
  }
  return { price: null, source: null, updatedAt: null };
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
