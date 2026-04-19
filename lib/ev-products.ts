import type {
  EvProduct,
  EvProductResult,
  EvProductCardBreakdown,
  EvProductBoosterBreakdown,
} from "./types";

// The calc only reads these fields from ev_cards. Accepting a structural
// subset keeps the function trivially mockable in tests.
export interface EvCardPriceRef {
  scryfall_id: string;
  name?: string;
  price_eur: number | null;
  price_eur_foil: number | null;
}

export interface CalculateProductEvOptions {
  feeRate: number;
  /** Opened-box EV per included booster's parent set (e.g. { akh: 3.75 }). */
  boosterEvBySet?: Record<string, number>;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function calculateProductEv(
  product: EvProduct,
  cards: EvCardPriceRef[],
  options: CalculateProductEvOptions
): EvProductResult {
  const { feeRate, boosterEvBySet = {} } = options;

  const cardById = new Map<string, EvCardPriceRef>();
  for (const c of cards) cardById.set(c.scryfall_id, c);

  let cardsTotal = 0;
  let cardCountTotal = 0;
  const cardBreakdown: EvProductCardBreakdown[] = [];
  const missing: string[] = [];

  for (const pc of product.cards) {
    const c = cardById.get(pc.scryfall_id);
    const unit = c ? (pc.is_foil ? c.price_eur_foil : c.price_eur) : null;
    if (!c) missing.push(pc.scryfall_id);
    const price = unit ?? 0;
    const line = price * pc.count;
    cardsTotal += line;
    cardCountTotal += pc.count;
    cardBreakdown.push({ ...pc, unit_price: unit, line_total: round2(line) });
  }

  cardBreakdown.sort((a, b) => b.line_total - a.line_total);

  const ib = product.included_boosters ?? [];
  const hasBoosters = ib.length > 0;

  let sealedTotal = 0;
  let sealedAvailable = hasBoosters;
  let openedTotal = 0;
  let openedAvailable = hasBoosters;
  let boosterCountTotal = 0;
  const boosterBreakdown: EvProductBoosterBreakdown[] = [];

  for (const b of ib) {
    boosterCountTotal += b.count;
    if (b.sealed_price_eur !== undefined) {
      sealedTotal += b.sealed_price_eur * b.count;
    } else {
      sealedAvailable = false;
    }

    const openedUnit = boosterEvBySet[b.set_code];
    if (openedUnit !== undefined) {
      openedTotal += openedUnit * b.count;
    } else {
      openedAvailable = false;
    }

    boosterBreakdown.push({ ...b, opened_unit_ev: openedUnit ?? null });
  }

  const cardsOnlyGross = round2(cardsTotal);
  const cardsOnlyNet = round2(cardsTotal * (1 - feeRate));

  const boosters = hasBoosters
    ? {
        count_total: boosterCountTotal,
        sealed: {
          available: sealedAvailable,
          gross: round2(sealedTotal),
          net: round2(sealedTotal * (1 - feeRate)),
        },
        opened: {
          available: openedAvailable,
          gross: round2(openedTotal),
          net: round2(openedTotal * (1 - feeRate)),
        },
      }
    : null;

  const totals = {
    cards_only: { gross: cardsOnlyGross, net: cardsOnlyNet },
    sealed:
      hasBoosters && sealedAvailable
        ? {
            gross: round2(cardsTotal + sealedTotal),
            net: round2((cardsTotal + sealedTotal) * (1 - feeRate)),
          }
        : null,
    opened:
      hasBoosters && openedAvailable
        ? {
            gross: round2(cardsTotal + openedTotal),
            net: round2((cardsTotal + openedTotal) * (1 - feeRate)),
          }
        : null,
  };

  return {
    slug: product.slug,
    name: product.name,
    product_type: product.product_type,
    card_count_total: cardCountTotal,
    unique_card_count: product.cards.length,
    cards_subtotal_gross: cardsOnlyGross,
    boosters,
    totals,
    fee_rate: feeRate,
    card_breakdown: cardBreakdown,
    booster_breakdown: boosterBreakdown,
    missing_scryfall_ids: missing,
  };
}
