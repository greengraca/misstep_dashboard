import { describe, it, expect } from "vitest";
import { calculateProductEv } from "../ev-products";
import type { EvProduct, EvProductCard } from "../types";

// Minimal EvCard shape used by the calculator — only the fields it reads.
type EvCardLite = {
  scryfall_id: string;
  name: string;
  price_eur: number | null;
  price_eur_foil: number | null;
};

function card(id: string, name: string, eur: number | null, foil: number | null = null): EvCardLite {
  return { scryfall_id: id, name, price_eur: eur, price_eur_foil: foil };
}

function productCard(over: Partial<EvProductCard> & Pick<EvProductCard, "scryfall_id">): EvProductCard {
  return {
    name: "x",
    set_code: "tst",
    count: 1,
    is_foil: false,
    ...over,
  };
}

function product(over: Partial<EvProduct>): EvProduct {
  return {
    slug: "slug",
    name: "Name",
    product_type: "planeswalker_deck",
    release_year: 2017,
    cards: [],
    seeded_at: new Date().toISOString(),
    ...over,
  };
}

describe("calculateProductEv — cards only", () => {
  it("sums unit price * count across cards", () => {
    const cards = [card("a", "A", 1.0), card("b", "B", 2.0)];
    const p = product({
      cards: [
        productCard({ scryfall_id: "a", count: 2 }),
        productCard({ scryfall_id: "b", count: 3 }),
      ],
    });
    const r = calculateProductEv(p, cards, { feeRate: 0 });
    expect(r.cards_subtotal_gross).toBe(2 * 1.0 + 3 * 2.0);
    expect(r.totals.cards_only.gross).toBe(8.0);
    expect(r.totals.cards_only.net).toBe(8.0);
    expect(r.boosters).toBeNull();
    expect(r.totals.sealed).toBeNull();
    expect(r.totals.opened).toBeNull();
  });

  it("uses foil price when is_foil=true", () => {
    const cards = [card("a", "A", 1.0, 5.0)];
    const p = product({ cards: [productCard({ scryfall_id: "a", is_foil: true })] });
    const r = calculateProductEv(p, cards, { feeRate: 0 });
    expect(r.cards_subtotal_gross).toBe(5.0);
  });

  it("treats missing price as 0 but reports scryfall_id in missing_scryfall_ids", () => {
    const cards = [card("a", "A", null)];
    const p = product({ cards: [productCard({ scryfall_id: "a" }), productCard({ scryfall_id: "b" })] });
    const r = calculateProductEv(p, cards, { feeRate: 0 });
    expect(r.cards_subtotal_gross).toBe(0);
    expect(r.missing_scryfall_ids).toEqual(["b"]);
  });

  it("applies feeRate to net", () => {
    const cards = [card("a", "A", 10.0)];
    const p = product({ cards: [productCard({ scryfall_id: "a" })] });
    const r = calculateProductEv(p, cards, { feeRate: 0.05 });
    expect(r.totals.cards_only.gross).toBe(10.0);
    expect(r.totals.cards_only.net).toBeCloseTo(9.5, 10);
  });

  it("card_count_total sums counts; unique_card_count counts entries", () => {
    const cards = [card("a", "A", 1), card("b", "B", 1)];
    const p = product({
      cards: [
        productCard({ scryfall_id: "a", count: 24 }),
        productCard({ scryfall_id: "b", count: 1 }),
      ],
    });
    const r = calculateProductEv(p, cards, { feeRate: 0 });
    expect(r.card_count_total).toBe(25);
    expect(r.unique_card_count).toBe(2);
  });
});

describe("calculateProductEv — included boosters", () => {
  it("computes sealed totals when every sealed_price is known", () => {
    const cards = [card("a", "A", 10)];
    const p = product({
      cards: [productCard({ scryfall_id: "a" })],
      included_boosters: [{ set_code: "akh", count: 2, sealed_price_eur: 2.5 }],
    });
    const r = calculateProductEv(p, cards, { feeRate: 0 });
    expect(r.boosters?.sealed.available).toBe(true);
    expect(r.boosters?.sealed.gross).toBe(2 * 2.5);
    expect(r.totals.sealed?.gross).toBe(15);
  });

  it("marks sealed unavailable when any sealed_price is missing", () => {
    const cards = [card("a", "A", 10)];
    const p = product({
      cards: [productCard({ scryfall_id: "a" })],
      included_boosters: [
        { set_code: "akh", count: 1, sealed_price_eur: 2.5 },
        { set_code: "hou", count: 1 }, // no sealed_price_eur
      ],
    });
    const r = calculateProductEv(p, cards, { feeRate: 0 });
    expect(r.boosters?.sealed.available).toBe(false);
    expect(r.totals.sealed).toBeNull();
  });

  it("computes opened totals from boosterEvBySet", () => {
    const cards = [card("a", "A", 10)];
    const p = product({
      cards: [productCard({ scryfall_id: "a" })],
      included_boosters: [{ set_code: "akh", count: 2 }],
    });
    const r = calculateProductEv(p, cards, {
      feeRate: 0,
      boosterEvBySet: { akh: 4.0 },
    });
    expect(r.boosters?.opened.available).toBe(true);
    expect(r.boosters?.opened.gross).toBe(2 * 4.0);
    expect(r.totals.opened?.gross).toBe(18);
  });

  it("marks opened unavailable when any set is missing from boosterEvBySet", () => {
    const cards = [card("a", "A", 10)];
    const p = product({
      cards: [productCard({ scryfall_id: "a" })],
      included_boosters: [
        { set_code: "akh", count: 1 },
        { set_code: "hou", count: 1 },
      ],
    });
    const r = calculateProductEv(p, cards, {
      feeRate: 0,
      boosterEvBySet: { akh: 4.0 },
    });
    expect(r.boosters?.opened.available).toBe(false);
    expect(r.totals.opened).toBeNull();
  });

  it("applies feeRate to both sealed and opened net totals", () => {
    const cards = [card("a", "A", 10)];
    const p = product({
      cards: [productCard({ scryfall_id: "a" })],
      included_boosters: [{ set_code: "akh", count: 2, sealed_price_eur: 3 }],
    });
    const r = calculateProductEv(p, cards, {
      feeRate: 0.1,
      boosterEvBySet: { akh: 5 },
    });
    expect(r.totals.sealed?.net).toBeCloseTo((10 + 6) * 0.9, 10);
    expect(r.totals.opened?.net).toBeCloseTo((10 + 10) * 0.9, 10);
  });
});
