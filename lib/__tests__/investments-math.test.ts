import { describe, it, expect } from "vitest";
import {
  computeExpectedOpenCardCount,
  computeCostBasisPerUnit,
  sumSealedFlipProceeds,
} from "../investments/math";
import type { Investment, SealedFlip } from "../investments/types";

function boxInvestment(over: Partial<Investment> = {}): Investment {
  return {
    _id: {} as never,
    name: "test",
    code: "MS-TEST",
    created_at: new Date(),
    created_by: "u1",
    status: "listing",
    cost_total_eur: 900,
    source: {
      kind: "box",
      set_code: "fdn",
      booster_type: "jumpstart",
      packs_per_box: 24,
      cards_per_pack: 20,
      box_count: 12,
    },
    cm_set_names: ["Foundations: Jumpstart"],
    sealed_flips: [],
    expected_open_card_count: 24 * 20 * 12,
    ...over,
  };
}

describe("computeExpectedOpenCardCount", () => {
  it("box: packs_per_box * cards_per_pack * (box_count - flipped)", () => {
    const inv = boxInvestment();
    expect(computeExpectedOpenCardCount(inv)).toBe(5760);
  });

  it("box: reduces by unit_count of sealed flips", () => {
    const flips: SealedFlip[] = [
      { recorded_at: new Date(), unit_count: 2, proceeds_eur: 170 },
    ];
    const inv = boxInvestment({ sealed_flips: flips });
    expect(computeExpectedOpenCardCount(inv)).toBe(24 * 20 * 10);
  });

  it("product: uses product-card-count * unit_count (provided)", () => {
    const inv: Investment = {
      ...boxInvestment(),
      source: { kind: "product", product_slug: "slug", unit_count: 3 },
      expected_open_card_count: 300,
      sealed_flips: [{ recorded_at: new Date(), unit_count: 1, proceeds_eur: 50 }],
    };
    // Caller provides total cards per unit via helper arg since product
    // card count lives on EvProduct, not Investment.
    expect(computeExpectedOpenCardCount(inv, { cardsPerProductUnit: 100 })).toBe(200);
  });
});

describe("computeCostBasisPerUnit", () => {
  it("divides (cost - sealed_flip_proceeds) by total opened", () => {
    const inv = boxInvestment({
      sealed_flips: [{ recorded_at: new Date(), unit_count: 2, proceeds_eur: 170 }],
    });
    const totalOpened = 4800;
    expect(computeCostBasisPerUnit(inv, totalOpened)).toBeCloseTo((900 - 170) / 4800, 10);
  });

  it("returns null when totalOpened is 0", () => {
    expect(computeCostBasisPerUnit(boxInvestment(), 0)).toBeNull();
  });

  it("returns null when denominator is negative (shouldn't happen but guard)", () => {
    expect(computeCostBasisPerUnit(boxInvestment(), -5)).toBeNull();
  });
});

describe("sumSealedFlipProceeds", () => {
  it("sums proceeds_eur across flips", () => {
    const flips: SealedFlip[] = [
      { recorded_at: new Date(), unit_count: 1, proceeds_eur: 85 },
      { recorded_at: new Date(), unit_count: 2, proceeds_eur: 160 },
    ];
    expect(sumSealedFlipProceeds(flips)).toBe(245);
  });

  it("handles empty", () => {
    expect(sumSealedFlipProceeds([])).toBe(0);
  });
});

describe("collection-kind expected_open_card_count", () => {
  it("uses source.card_count directly, ignoring sealed flips", () => {
    const inv: Investment = {
      ...boxInvestment(),
      source: {
        kind: "collection",
        appraiser_collection_id: "abcdef0123456789abcdef01",
        card_count: 47,
      },
      sealed_flips: [{ recorded_at: new Date(), unit_count: 5, proceeds_eur: 99 }],
    };
    expect(computeExpectedOpenCardCount(inv)).toBe(47);
  });
});
