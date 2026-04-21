import type { Investment, SealedFlip } from "./types";

export function sumSealedFlipProceeds(flips: SealedFlip[]): number {
  let total = 0;
  for (const f of flips) total += f.proceeds_eur;
  return total;
}

function sumSealedFlipUnits(flips: SealedFlip[]): number {
  let total = 0;
  for (const f of flips) total += f.unit_count;
  return total;
}

/**
 * Compute expected cards to be opened, given the current source config + sealed flips.
 *
 * For product-kind investments, the total cards per unit is not on the Investment
 * document (it lives on EvProduct.cards[*].count). The caller must pass it in
 * via options.cardsPerProductUnit — the service layer reads that from the product.
 */
export function computeExpectedOpenCardCount(
  investment: Investment,
  options: { cardsPerProductUnit?: number } = {}
): number {
  const flippedUnits = sumSealedFlipUnits(investment.sealed_flips);
  if (investment.source.kind === "box") {
    const { packs_per_box, cards_per_pack, box_count } = investment.source;
    return packs_per_box * cards_per_pack * Math.max(0, box_count - flippedUnits);
  }
  const perUnit = options.cardsPerProductUnit ?? 0;
  return perUnit * Math.max(0, investment.source.unit_count - flippedUnits);
}

/** Live / frozen cost basis per opened card. Returns null when totalOpened <= 0. */
export function computeCostBasisPerUnit(
  investment: Investment,
  totalOpened: number
): number | null {
  if (totalOpened <= 0) return null;
  const net = investment.cost_total_eur - sumSealedFlipProceeds(investment.sealed_flips);
  return net / totalOpened;
}

/** How many more cards of this tuple we may attribute right now. */
export function computeAttributable(params: {
  currentStockQty: number;
  baselineQty: number;
  lotAlreadyOpened: number;
}): number {
  const delta = params.currentStockQty - params.baselineQty - params.lotAlreadyOpened;
  return delta > 0 ? delta : 0;
}
