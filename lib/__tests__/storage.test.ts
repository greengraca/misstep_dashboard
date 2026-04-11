// lib/__tests__/storage.test.ts
import { describe, it, expect } from "vitest";
import { SLOT_CAPACITY, ROW_CAPACITY_SLOTS, BOX_ROWS } from "../storage";

describe("storage constants", () => {
  it("SLOT_CAPACITY is 8", () => {
    expect(SLOT_CAPACITY).toBe(8);
  });

  it("ROW_CAPACITY_SLOTS is 125", () => {
    expect(ROW_CAPACITY_SLOTS).toBe(125);
  });

  it("BOX_ROWS matches box capacity spec", () => {
    expect(BOX_ROWS).toEqual({ "1k": 1, "2k": 2, "4k": 4 });
  });
});
