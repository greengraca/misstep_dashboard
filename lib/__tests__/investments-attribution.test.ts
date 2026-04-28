import { describe, it, expect } from "vitest";
import { parseInvestmentTag } from "../investments/codes";

describe("parseInvestmentTag", () => {
  it("extracts a clean code from a bare comment", () => {
    expect(parseInvestmentTag("MS-A4B2")).toBe("MS-A4B2");
  });

  it("uppercases lowercase input", () => {
    expect(parseInvestmentTag("ms-a4b2")).toBe("MS-A4B2");
  });

  it("extracts a code wrapped in surrounding text", () => {
    expect(parseInvestmentTag("LP+, MS-A4B2, free shipping €0")).toBe("MS-A4B2");
  });

  it("returns null on no match", () => {
    expect(parseInvestmentTag("just a normal seller comment")).toBe(null);
    expect(parseInvestmentTag("")).toBe(null);
    expect(parseInvestmentTag(null)).toBe(null);
    expect(parseInvestmentTag(undefined)).toBe(null);
  });

  it("ignores codes without word boundary anchoring", () => {
    expect(parseInvestmentTag("XMS-A4B2")).toBe(null);
    expect(parseInvestmentTag("MS-A4B2X")).toBe(null);
  });

  it("ignores wrong-length codes", () => {
    expect(parseInvestmentTag("MS-A4B")).toBe(null);
    expect(parseInvestmentTag("MS-A4B22")).toBe(null);
  });

  it("returns the first code when multiple are present", () => {
    expect(parseInvestmentTag("MS-A4B2 also see MS-FFFF")).toBe("MS-A4B2");
  });
});
