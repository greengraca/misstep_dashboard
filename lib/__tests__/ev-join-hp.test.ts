import { describe, it, expect } from "vitest";
import { isHeavilyPlayedCondition } from "../appraiser/ev-join";

describe("isHeavilyPlayedCondition", () => {
  it("returns false for null/undefined/empty", () => {
    expect(isHeavilyPlayedCondition(null)).toBe(false);
    expect(isHeavilyPlayedCondition(undefined)).toBe(false);
    expect(isHeavilyPlayedCondition("")).toBe(false);
    expect(isHeavilyPlayedCondition("   ")).toBe(false);
  });

  it("returns true for HP / Heavily Played variants", () => {
    expect(isHeavilyPlayedCondition("HP")).toBe(true);
    expect(isHeavilyPlayedCondition("hp")).toBe(true);
    expect(isHeavilyPlayedCondition(" hp ")).toBe(true);
    expect(isHeavilyPlayedCondition("Heavily Played")).toBe(true);
    expect(isHeavilyPlayedCondition("heavily played")).toBe(true);
  });

  it("returns true for Poor / PO / Damaged", () => {
    expect(isHeavilyPlayedCondition("Poor")).toBe(true);
    expect(isHeavilyPlayedCondition("PO")).toBe(true);
    expect(isHeavilyPlayedCondition("po")).toBe(true);
    expect(isHeavilyPlayedCondition("Damaged")).toBe(true);
    expect(isHeavilyPlayedCondition("damaged")).toBe(true);
  });

  it("returns true for Played / PL / Moderately Played / MP", () => {
    expect(isHeavilyPlayedCondition("Played")).toBe(true);
    expect(isHeavilyPlayedCondition("PL")).toBe(true);
    expect(isHeavilyPlayedCondition("pl")).toBe(true);
    expect(isHeavilyPlayedCondition("Moderately Played")).toBe(true);
    expect(isHeavilyPlayedCondition("MP")).toBe(true);
    expect(isHeavilyPlayedCondition("mp")).toBe(true);
  });

  it("returns FALSE for NM-tier conditions", () => {
    expect(isHeavilyPlayedCondition("Mint")).toBe(false);
    expect(isHeavilyPlayedCondition("MT")).toBe(false);
    expect(isHeavilyPlayedCondition("Near Mint")).toBe(false);
    expect(isHeavilyPlayedCondition("NM")).toBe(false);
    expect(isHeavilyPlayedCondition("Excellent")).toBe(false);
    expect(isHeavilyPlayedCondition("EX")).toBe(false);
  });

  it("returns FALSE for Lightly Played (LP) — explicit non-HP", () => {
    expect(isHeavilyPlayedCondition("Lightly Played")).toBe(false);
    expect(isHeavilyPlayedCondition("LP")).toBe(false);
    expect(isHeavilyPlayedCondition("lp")).toBe(false);
  });

  it("returns FALSE for Good / GD", () => {
    expect(isHeavilyPlayedCondition("Good")).toBe(false);
    expect(isHeavilyPlayedCondition("GD")).toBe(false);
  });
});
