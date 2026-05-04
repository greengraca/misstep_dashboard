import { describe, it, expect } from "vitest";
import { generateManualSaleId } from "../investments/manual-sales";

describe("generateManualSaleId", () => {
  it("returns the manual: prefix + 8 hex chars", () => {
    const id = generateManualSaleId();
    expect(id).toMatch(/^manual:[0-9a-f]{8}$/);
  });

  it("returns distinct values across calls", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateManualSaleId()));
    expect(ids.size).toBe(100);
  });
});
