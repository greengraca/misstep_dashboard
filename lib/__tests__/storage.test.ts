// lib/__tests__/storage.test.ts
import { describe, it, expect } from "vitest";
import {
  SLOT_CAPACITY,
  ROW_CAPACITY_SLOTS,
  BOX_ROWS,
  deriveSortFields,
  aggregateStock,
  computeCanonicalSort,
  flowIntoLayout,
  applyOverrides,
  type CardMeta,
  type SetMeta,
  type StockRow,
  type CanonicalSortResult,
  type ShelfLayout,
  type Slot,
  type PlacedSlot,
  type EmptyReservedCell,
  type CutOverride,
} from "../storage";

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

// Helper to build a CardMeta test fixture with sensible defaults.
function card(overrides: Partial<CardMeta> & Pick<CardMeta, "name" | "set">): CardMeta {
  return {
    collector_number: "1",
    rarity: "common",
    type_line: "Creature",
    colors: [],
    color_identity: [],
    cmc: 0,
    layout: "normal",
    image_uri: null,
    released_at: "2022-01-01",
    ...overrides,
  };
}

function set(code: string, released_at: string, opts: Partial<SetMeta> = {}): SetMeta {
  return {
    code,
    name: code.toUpperCase(),
    released_at,
    set_type: "expansion",
    parent_set_code: null,
    ...opts,
  };
}

describe("deriveSortFields — color group", () => {
  it("mono-white creature → W", () => {
    const f = deriveSortFields(card({ name: "Angel", set: "dmu", color_identity: ["W"] }), new Map());
    expect(f.colorGroup).toBe("W");
    expect(f.landTier).toBe(0);
  });

  it("mono-blue instant → U", () => {
    const f = deriveSortFields(card({ name: "Counterspell", set: "dmu", color_identity: ["U"] }), new Map());
    expect(f.colorGroup).toBe("U");
  });

  it("mono-black, mono-red, mono-green all route to their letter", () => {
    expect(deriveSortFields(card({ name: "x", set: "dmu", color_identity: ["B"] }), new Map()).colorGroup).toBe("B");
    expect(deriveSortFields(card({ name: "x", set: "dmu", color_identity: ["R"] }), new Map()).colorGroup).toBe("R");
    expect(deriveSortFields(card({ name: "x", set: "dmu", color_identity: ["G"] }), new Map()).colorGroup).toBe("G");
  });

  it("two-color card → M", () => {
    const f = deriveSortFields(card({ name: "Lightning Helix", set: "dmu", color_identity: ["R", "W"] }), new Map());
    expect(f.colorGroup).toBe("M");
  });

  it("mono-hybrid {W/U}{W/U} → M (because color_identity has 2 colors)", () => {
    const f = deriveSortFields(card({ name: "Judge's Familiar", set: "dmu", color_identity: ["W", "U"] }), new Map());
    expect(f.colorGroup).toBe("M");
  });

  it("colorless artifact → C", () => {
    const f = deriveSortFields(
      card({ name: "Sol Ring", set: "dmu", color_identity: [], type_line: "Artifact" }),
      new Map()
    );
    expect(f.colorGroup).toBe("C");
  });

  it("colorless Eldrazi (non-artifact, non-land) → C", () => {
    const f = deriveSortFields(
      card({ name: "Emrakul", set: "dmu", color_identity: [], type_line: "Legendary Creature — Eldrazi" }),
      new Map()
    );
    expect(f.colorGroup).toBe("C");
  });
});

describe("deriveSortFields — land bucket", () => {
  it("basic land → L, landTier 1", () => {
    const f = deriveSortFields(
      card({ name: "Forest", set: "dmu", type_line: "Basic Land — Forest", color_identity: ["G"] }),
      new Map()
    );
    expect(f.colorGroup).toBe("L");
    expect(f.landTier).toBe(1);
  });

  it("nonbasic land → L, landTier 0", () => {
    const f = deriveSortFields(
      card({ name: "Command Tower", set: "dmu", type_line: "Land" }),
      new Map()
    );
    expect(f.colorGroup).toBe("L");
    expect(f.landTier).toBe(0);
  });

  it("token card → L, landTier 2", () => {
    const f = deriveSortFields(
      card({ name: "Soldier", set: "tdmu", layout: "token", type_line: "Token Creature — Soldier" }),
      new Map([["tdmu", "dmu"]])
    );
    expect(f.colorGroup).toBe("L");
    expect(f.landTier).toBe(2);
  });

  it("type_line containing 'Token' without layout=token still classifies as L/2", () => {
    const f = deriveSortFields(
      card({ name: "Treasure Token", set: "tdmu", type_line: "Token Artifact — Treasure" }),
      new Map([["tdmu", "dmu"]])
    );
    expect(f.colorGroup).toBe("L");
    expect(f.landTier).toBe(2);
  });
});

describe("deriveSortFields — token re-homing", () => {
  it("rewrites token set to parent set via map", () => {
    const f = deriveSortFields(
      card({ name: "Soldier", set: "tdmu", layout: "token", type_line: "Token Creature — Soldier" }),
      new Map([["tdmu", "dmu"]])
    );
    expect(f.effectiveSet).toBe("dmu");
  });

  it("leaves non-token set unchanged even if parent_set_code exists in map (defensive)", () => {
    const f = deriveSortFields(
      card({ name: "Sol Ring", set: "cmr", type_line: "Artifact" }),
      new Map([["cmr", "foo"]])
    );
    expect(f.effectiveSet).toBe("cmr");
  });

  it("token set without parent map entry falls back to its own code", () => {
    const f = deriveSortFields(
      card({ name: "Orphan Token", set: "torphan", layout: "token", type_line: "Token Creature" }),
      new Map()
    );
    expect(f.effectiveSet).toBe("torphan");
  });
});

describe("deriveSortFields — rarity", () => {
  it("mythic → 0", () => {
    expect(deriveSortFields(card({ name: "x", set: "dmu", rarity: "mythic" }), new Map()).rarityOrder).toBe(0);
  });
  it("rare → 1", () => {
    expect(deriveSortFields(card({ name: "x", set: "dmu", rarity: "rare" }), new Map()).rarityOrder).toBe(1);
  });
  it("uncommon → 2", () => {
    expect(deriveSortFields(card({ name: "x", set: "dmu", rarity: "uncommon" }), new Map()).rarityOrder).toBe(2);
  });
  it("common → 3", () => {
    expect(deriveSortFields(card({ name: "x", set: "dmu", rarity: "common" }), new Map()).rarityOrder).toBe(3);
  });
  it("special → 0 (treated as mythic)", () => {
    expect(deriveSortFields(card({ name: "x", set: "dmu", rarity: "special" }), new Map()).rarityOrder).toBe(0);
  });
  it("bonus → 0 (treated as mythic)", () => {
    expect(deriveSortFields(card({ name: "x", set: "dmu", rarity: "bonus" }), new Map()).rarityOrder).toBe(0);
  });
  it("unknown rarity defaults to common (3)", () => {
    expect(deriveSortFields(card({ name: "x", set: "dmu", rarity: "weird" }), new Map()).rarityOrder).toBe(3);
  });
});

describe("deriveSortFields — cmc bucket", () => {
  it("cmc 0 → bucket 0", () => {
    expect(deriveSortFields(card({ name: "x", set: "dmu", cmc: 0 }), new Map()).cmcBucket).toBe(0);
  });
  it("cmc 3 → bucket 3", () => {
    expect(deriveSortFields(card({ name: "x", set: "dmu", cmc: 3 }), new Map()).cmcBucket).toBe(3);
  });
  it("cmc 6 → bucket 6", () => {
    expect(deriveSortFields(card({ name: "x", set: "dmu", cmc: 6 }), new Map()).cmcBucket).toBe(6);
  });
  it("cmc 7 → bucket 7", () => {
    expect(deriveSortFields(card({ name: "x", set: "dmu", cmc: 7 }), new Map()).cmcBucket).toBe(7);
  });
  it("cmc 15 → bucket 7", () => {
    expect(deriveSortFields(card({ name: "x", set: "dmu", cmc: 15 }), new Map()).cmcBucket).toBe(7);
  });
  it("fractional cmc (e.g. 1.5 from half-mana) floors to integer bucket", () => {
    expect(deriveSortFields(card({ name: "x", set: "dmu", cmc: 1.5 }), new Map()).cmcBucket).toBe(1);
  });
});

describe("deriveSortFields — name lowercase", () => {
  it("produces case-insensitive sort key", () => {
    const f = deriveSortFields(card({ name: "Zzyzx's Wrath", set: "dmu" }), new Map());
    expect(f.nameLower).toBe("zzyzx's wrath");
    expect(f.name).toBe("Zzyzx's Wrath");
  });
});

describe("aggregateStock", () => {
  it("returns an empty array for empty input", () => {
    expect(aggregateStock([])).toEqual([]);
  });

  it("passes through a single row", () => {
    const rows: StockRow[] = [{ name: "Sol Ring", set: "cmr", qty: 1 }];
    expect(aggregateStock(rows)).toEqual([
      { name: "Sol Ring", set: "cmr", effectiveSet: "cmr", qty: 1 },
    ]);
  });

  it("sums qty across duplicate (name, set) rows", () => {
    const rows: StockRow[] = [
      { name: "Sol Ring", set: "cmr", qty: 3 },
      { name: "Sol Ring", set: "cmr", qty: 2 },
      { name: "Sol Ring", set: "cmr", qty: 1 },
    ];
    const result = aggregateStock(rows);
    expect(result).toHaveLength(1);
    expect(result[0].qty).toBe(6);
  });

  it("does not merge same name in different sets", () => {
    const rows: StockRow[] = [
      { name: "Sol Ring", set: "cmr", qty: 2 },
      { name: "Sol Ring", set: "cmm", qty: 1 },
    ];
    const result = aggregateStock(rows);
    expect(result).toHaveLength(2);
    expect(result.find((v) => v.set === "cmr")?.qty).toBe(2);
    expect(result.find((v) => v.set === "cmm")?.qty).toBe(1);
  });

  it("drops rows with qty <= 0", () => {
    const rows: StockRow[] = [
      { name: "Sol Ring", set: "cmr", qty: 0 },
      { name: "Mana Vault", set: "cmr", qty: -1 },
      { name: "Basalt Monolith", set: "cmr", qty: 2 },
    ];
    const result = aggregateStock(rows);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Basalt Monolith");
  });

  it("treats a group that sums to 0 as dropped", () => {
    // Defensive: if the sum zeroes out (e.g. refund rows), skip the variant.
    const rows: StockRow[] = [
      { name: "Sol Ring", set: "cmr", qty: 3 },
      { name: "Sol Ring", set: "cmr", qty: -3 },
    ];
    expect(aggregateStock(rows)).toEqual([]);
  });
});

describe("computeCanonicalSort — basic sort order", () => {
  it("sorts by set release date, oldest first", () => {
    const stock: StockRow[] = [
      { name: "Card A", set: "new", qty: 1 },
      { name: "Card B", set: "old", qty: 1 },
    ];
    const cards = new Map<string, CardMeta>([
      ["Card A|new", card({ name: "Card A", set: "new", color_identity: ["W"], rarity: "common", cmc: 0 })],
      ["Card B|old", card({ name: "Card B", set: "old", color_identity: ["W"], rarity: "common", cmc: 0 })],
    ]);
    const sets = [set("old", "2020-01-01"), set("new", "2024-01-01")];
    const result = computeCanonicalSort(stock, cards, sets);
    expect(result.slots).toHaveLength(2);
    expect(result.slots[0].set).toBe("old");
    expect(result.slots[1].set).toBe("new");
  });

  it("within a set, orders by color group W→U→B→R→G→M→C→L", () => {
    const stock: StockRow[] = [
      { name: "Land", set: "s", qty: 1 },
      { name: "Multi", set: "s", qty: 1 },
      { name: "White", set: "s", qty: 1 },
      { name: "Blue", set: "s", qty: 1 },
      { name: "Colorless", set: "s", qty: 1 },
    ];
    const cards = new Map<string, CardMeta>([
      ["Land|s", card({ name: "Land", set: "s", type_line: "Land", color_identity: [] })],
      ["Multi|s", card({ name: "Multi", set: "s", color_identity: ["W", "U"] })],
      ["White|s", card({ name: "White", set: "s", color_identity: ["W"] })],
      ["Blue|s", card({ name: "Blue", set: "s", color_identity: ["U"] })],
      ["Colorless|s", card({ name: "Colorless", set: "s", color_identity: [], type_line: "Artifact" })],
    ]);
    const sets = [set("s", "2022-01-01")];
    const result = computeCanonicalSort(stock, cards, sets);
    expect(result.slots.map((s) => s.name)).toEqual([
      "White", "Blue", "Multi", "Colorless", "Land",
    ]);
  });

  it("within a color, orders by rarity mythic→rare→uncommon→common", () => {
    const stock: StockRow[] = [
      { name: "Common", set: "s", qty: 1 },
      { name: "Mythic", set: "s", qty: 1 },
      { name: "Uncommon", set: "s", qty: 1 },
      { name: "Rare", set: "s", qty: 1 },
    ];
    const cards = new Map<string, CardMeta>([
      ["Common|s", card({ name: "Common", set: "s", color_identity: ["W"], rarity: "common" })],
      ["Mythic|s", card({ name: "Mythic", set: "s", color_identity: ["W"], rarity: "mythic" })],
      ["Uncommon|s", card({ name: "Uncommon", set: "s", color_identity: ["W"], rarity: "uncommon" })],
      ["Rare|s", card({ name: "Rare", set: "s", color_identity: ["W"], rarity: "rare" })],
    ]);
    const sets = [set("s", "2022-01-01")];
    const result = computeCanonicalSort(stock, cards, sets);
    expect(result.slots.map((s) => s.name)).toEqual(["Mythic", "Rare", "Uncommon", "Common"]);
  });

  it("within a rarity, orders by cmc ascending with 7+ bucket", () => {
    const stock: StockRow[] = [
      { name: "Seven-plus", set: "s", qty: 1 },
      { name: "One", set: "s", qty: 1 },
      { name: "Four", set: "s", qty: 1 },
      { name: "Zero", set: "s", qty: 1 },
      { name: "Fifteen", set: "s", qty: 1 },
    ];
    const cards = new Map<string, CardMeta>([
      ["Seven-plus|s", card({ name: "Seven-plus", set: "s", color_identity: ["W"], rarity: "mythic", cmc: 8 })],
      ["One|s", card({ name: "One", set: "s", color_identity: ["W"], rarity: "mythic", cmc: 1 })],
      ["Four|s", card({ name: "Four", set: "s", color_identity: ["W"], rarity: "mythic", cmc: 4 })],
      ["Zero|s", card({ name: "Zero", set: "s", color_identity: ["W"], rarity: "mythic", cmc: 0 })],
      ["Fifteen|s", card({ name: "Fifteen", set: "s", color_identity: ["W"], rarity: "mythic", cmc: 15 })],
    ]);
    const sets = [set("s", "2022-01-01")];
    const result = computeCanonicalSort(stock, cards, sets);
    // cmc 8 and 15 both bucket to 7; the name tiebreaker puts Fifteen before Seven-plus.
    expect(result.slots.map((s) => s.name)).toEqual(["Zero", "One", "Four", "Fifteen", "Seven-plus"]);
  });

  it("within a cmc bucket, orders by name A→Z case-insensitive", () => {
    const stock: StockRow[] = [
      { name: "banana", set: "s", qty: 1 },
      { name: "Apple", set: "s", qty: 1 },
      { name: "Cherry", set: "s", qty: 1 },
    ];
    const cards = new Map<string, CardMeta>([
      ["banana|s", card({ name: "banana", set: "s", color_identity: ["W"], rarity: "mythic", cmc: 1 })],
      ["Apple|s", card({ name: "Apple", set: "s", color_identity: ["W"], rarity: "mythic", cmc: 1 })],
      ["Cherry|s", card({ name: "Cherry", set: "s", color_identity: ["W"], rarity: "mythic", cmc: 1 })],
    ]);
    const sets = [set("s", "2022-01-01")];
    const result = computeCanonicalSort(stock, cards, sets);
    expect(result.slots.map((s) => s.name)).toEqual(["Apple", "banana", "Cherry"]);
  });
});

describe("computeCanonicalSort — L bucket sub-order", () => {
  it("orders L as nonbasic → basic → token, each sub-bucket alphabetical", () => {
    const stock: StockRow[] = [
      { name: "Soldier Token", set: "tdmu", qty: 1 },
      { name: "Forest", set: "dmu", qty: 1 },
      { name: "Command Tower", set: "dmu", qty: 1 },
    ];
    const cards = new Map<string, CardMeta>([
      ["Command Tower|dmu", card({ name: "Command Tower", set: "dmu", type_line: "Land" })],
      ["Forest|dmu", card({ name: "Forest", set: "dmu", type_line: "Basic Land — Forest", color_identity: ["G"] })],
      ["Soldier Token|tdmu", card({ name: "Soldier Token", set: "tdmu", layout: "token", type_line: "Token Creature — Soldier" })],
    ]);
    const sets = [
      set("dmu", "2022-09-09"),
      set("tdmu", "2022-09-09", { set_type: "token", parent_set_code: "dmu" }),
    ];
    const result = computeCanonicalSort(stock, cards, sets);
    // After token re-homing, Soldier Token lives in the dmu L bucket at tail.
    expect(result.slots.map((s) => s.name)).toEqual([
      "Command Tower",   // nonbasic
      "Forest",          // basic
      "Soldier Token",   // token
    ]);
  });
});

describe("computeCanonicalSort — slot splitting", () => {
  it("qty 1 → 1 slot", () => {
    const stock: StockRow[] = [{ name: "x", set: "s", qty: 1 }];
    const cards = new Map<string, CardMeta>([
      ["x|s", card({ name: "x", set: "s", color_identity: ["W"] })],
    ]);
    const result = computeCanonicalSort(stock, cards, [set("s", "2022-01-01")]);
    expect(result.slots).toHaveLength(1);
    expect(result.slots[0].qtyInSlot).toBe(1);
    expect(result.slots[0].slotIndexInVariant).toBe(0);
  });

  it("qty 8 → 1 slot of 8", () => {
    const stock: StockRow[] = [{ name: "x", set: "s", qty: 8 }];
    const cards = new Map<string, CardMeta>([
      ["x|s", card({ name: "x", set: "s", color_identity: ["W"] })],
    ]);
    const result = computeCanonicalSort(stock, cards, [set("s", "2022-01-01")]);
    expect(result.slots).toHaveLength(1);
    expect(result.slots[0].qtyInSlot).toBe(8);
  });

  it("qty 9 → 2 slots (8, 1)", () => {
    const stock: StockRow[] = [{ name: "x", set: "s", qty: 9 }];
    const cards = new Map<string, CardMeta>([
      ["x|s", card({ name: "x", set: "s", color_identity: ["W"] })],
    ]);
    const result = computeCanonicalSort(stock, cards, [set("s", "2022-01-01")]);
    expect(result.slots).toHaveLength(2);
    expect(result.slots[0].qtyInSlot).toBe(8);
    expect(result.slots[1].qtyInSlot).toBe(1);
    expect(result.slots[0].slotIndexInVariant).toBe(0);
    expect(result.slots[1].slotIndexInVariant).toBe(1);
  });

  it("qty 17 → 3 slots (8, 8, 1)", () => {
    const stock: StockRow[] = [{ name: "x", set: "s", qty: 17 }];
    const cards = new Map<string, CardMeta>([
      ["x|s", card({ name: "x", set: "s", color_identity: ["W"] })],
    ]);
    const result = computeCanonicalSort(stock, cards, [set("s", "2022-01-01")]);
    expect(result.slots.map((s) => s.qtyInSlot)).toEqual([8, 8, 1]);
  });

  it("position index increments across split slots and across variants", () => {
    const stock: StockRow[] = [
      { name: "A", set: "s", qty: 9 },
      { name: "B", set: "s", qty: 3 },
    ];
    const cards = new Map<string, CardMeta>([
      ["A|s", card({ name: "A", set: "s", color_identity: ["W"], rarity: "mythic" })],
      ["B|s", card({ name: "B", set: "s", color_identity: ["W"], rarity: "mythic" })],
    ]);
    const result = computeCanonicalSort(stock, cards, [set("s", "2022-01-01")]);
    expect(result.slots.map((s) => s.position)).toEqual([1, 2, 3]);
    // A splits into 2 slots, B is 1 slot
    expect(result.slots.map((s) => s.name)).toEqual(["A", "A", "B"]);
  });
});

describe("computeCanonicalSort — unmatched variants", () => {
  it("returns unmatched list for stock with no metadata", () => {
    const stock: StockRow[] = [
      { name: "Known", set: "s", qty: 2 },
      { name: "Unknown", set: "s", qty: 3 },
    ];
    const cards = new Map<string, CardMeta>([
      ["Known|s", card({ name: "Known", set: "s", color_identity: ["W"] })],
    ]);
    const result = computeCanonicalSort(stock, cards, [set("s", "2022-01-01")]);
    expect(result.slots).toHaveLength(1);
    expect(result.slots[0].name).toBe("Known");
    expect(result.unmatched).toEqual([{ name: "Unknown", set: "s", qty: 3 }]);
  });
});

describe("computeCanonicalSort — determinism", () => {
  it("running twice on the same input produces identical output", () => {
    const stock: StockRow[] = [
      { name: "C", set: "s", qty: 2 },
      { name: "A", set: "s", qty: 1 },
      { name: "B", set: "s", qty: 3 },
    ];
    const cards = new Map<string, CardMeta>([
      ["A|s", card({ name: "A", set: "s", color_identity: ["W"] })],
      ["B|s", card({ name: "B", set: "s", color_identity: ["W"] })],
      ["C|s", card({ name: "C", set: "s", color_identity: ["W"] })],
    ]);
    const sets = [set("s", "2022-01-01")];
    const r1 = computeCanonicalSort(stock, cards, sets);
    const r2 = computeCanonicalSort(stock, cards, sets);
    expect(r1).toEqual(r2);
  });
});

// ── Task 5 & 6 helpers ────────────────────────────────────────────

// Test helper: build a slot with defaults.
function slot(overrides: Partial<Slot> & Pick<Slot, "position" | "set" | "name">): Slot {
  return {
    slotKey: `${overrides.name}|${overrides.set}|0`,
    variantKey: `${overrides.name}|${overrides.set}`,
    setName: overrides.set.toUpperCase(),
    setReleaseDate: "2022-01-01",
    colorGroup: "W",
    landTier: 0,
    cmc: 1,
    cmcBucket: 1,
    rarity: "common",
    qtyInSlot: 1,
    slotIndexInVariant: 0,
    imageUri: null,
    ...overrides,
  };
}

// Test helper: build a simple layout.
function layout(shelfRows: { id: string; label: string; boxes: { id: string; type: "1k" | "2k" | "4k" }[] }[]): ShelfLayout {
  return { shelfRows };
}

// ── Task 5: flowIntoLayout ────────────────────────────────────────

describe("flowIntoLayout — basic placement", () => {
  it("places a single slot into box-row 0 position 1", () => {
    const slots = [slot({ position: 1, set: "a", name: "alpha" })];
    const lay = layout([
      { id: "sr1", label: "top", boxes: [{ id: "b1", type: "1k" }] },
    ]);
    const result = flowIntoLayout(slots, lay);
    expect(result.cells).toHaveLength(1);
    const placed = result.cells[0];
    if (placed.kind === "empty-reserved") throw new Error("expected PlacedSlot");
    expect(placed.shelfRowId).toBe("sr1");
    expect(placed.boxId).toBe("b1");
    expect(placed.boxRowIndex).toBe(0);
    expect(placed.positionInBoxRow).toBe(1);
    expect(placed.readingDirection).toBe("far-to-near");
  });

  it("fills box-row 0, then moves to box-row 1 with snake direction flip", () => {
    const slots: Slot[] = [];
    for (let i = 0; i < ROW_CAPACITY_SLOTS + 1; i++) {
      slots.push(slot({ position: i + 1, set: "a", name: `card${i}` }));
    }
    const lay = layout([
      { id: "sr1", label: "top", boxes: [{ id: "b1", type: "2k" }] },
    ]);
    const result = flowIntoLayout(slots, lay);
    const placed = result.cells.filter((c): c is Extract<typeof c, { kind?: undefined }> => c.kind !== "empty-reserved");
    expect(placed).toHaveLength(ROW_CAPACITY_SLOTS + 1);
    // First slot in box-row 0 (far→near)
    const first = placed[0];
    if ("kind" in first) throw new Error("");
    expect(first.boxRowIndex).toBe(0);
    expect(first.readingDirection).toBe("far-to-near");
    expect(first.positionInBoxRow).toBe(1);
    // Slot 126 (index 125) starts box-row 1 (near→far)
    const overflowed = placed[ROW_CAPACITY_SLOTS];
    if ("kind" in overflowed) throw new Error("");
    expect(overflowed.boxRowIndex).toBe(1);
    expect(overflowed.readingDirection).toBe("near-to-far");
    expect(overflowed.positionInBoxRow).toBe(1);
  });

  it("spans box boundaries within a single shelf row", () => {
    const slots: Slot[] = [];
    for (let i = 0; i < ROW_CAPACITY_SLOTS + 5; i++) {
      slots.push(slot({ position: i + 1, set: "a", name: `card${i}` }));
    }
    const lay = layout([
      { id: "sr1", label: "top", boxes: [{ id: "b1", type: "1k" }, { id: "b2", type: "1k" }] },
    ]);
    const result = flowIntoLayout(slots, lay);
    const cells = result.cells.filter((c): c is Extract<typeof c, PlacedSlot> => c.kind !== "empty-reserved") as PlacedSlot[];
    expect(cells[ROW_CAPACITY_SLOTS - 1].boxId).toBe("b1");
    expect(cells[ROW_CAPACITY_SLOTS].boxId).toBe("b2");
    expect(cells[ROW_CAPACITY_SLOTS].positionInBoxRow).toBe(1);
  });
});

describe("flowIntoLayout — shelf row atomicity", () => {
  it("a set block that doesn't fit in the remaining shelf row jumps to the next shelf row", () => {
    // Layout: 2 shelf rows, each one 1k box (125 slots).
    // Stock: 100 slots of set A, then 50 slots of set B.
    // Expected: set A fills positions 1-100 in shelf row 1. Set B would not fit
    // in the remaining 25 slots, so it jumps to shelf row 2 and starts at position 1.
    const slots: Slot[] = [];
    for (let i = 0; i < 100; i++) slots.push(slot({ position: i + 1, set: "a", name: `a${i}` }));
    for (let i = 0; i < 50; i++) slots.push(slot({ position: 100 + i + 1, set: "b", name: `b${i}` }));
    const lay = layout([
      { id: "sr1", label: "top", boxes: [{ id: "b1", type: "1k" }] },
      { id: "sr2", label: "middle", boxes: [{ id: "b2", type: "1k" }] },
    ]);
    const result = flowIntoLayout(slots, lay);
    const placed = result.cells.filter((c): c is PlacedSlot => c.kind !== "empty-reserved");
    // First 100 cards in sr1
    expect(placed[0].shelfRowId).toBe("sr1");
    expect(placed[99].shelfRowId).toBe("sr1");
    // Card 101 (first B) should be in sr2
    expect(placed[100].shelfRowId).toBe("sr2");
    expect(placed[100].positionInBoxRow).toBe(1);
  });

  it("a set block bigger than any shelf row is flagged spansShelfRow and still placed", () => {
    // Layout: one shelf row with 1k box (125 slots). Stock: 150 slots of set A.
    const slots: Slot[] = [];
    for (let i = 0; i < 150; i++) slots.push(slot({ position: i + 1, set: "a", name: `a${i}` }));
    const lay = layout([
      { id: "sr1", label: "top", boxes: [{ id: "b1", type: "1k" }] },
    ]);
    const result = flowIntoLayout(slots, lay);
    const placed = result.cells.filter((c): c is PlacedSlot => c.kind !== "empty-reserved");
    // Every slot of set A should be flagged spansShelfRow.
    for (const p of placed) {
      expect(p.spansShelfRow).toBe(true);
    }
    // First 125 in shelf row 1 box 1; remaining 25 spill. With `spansShelfRow`
    // the placement is best-effort, not constrained — just mark the slots.
    expect(placed).toHaveLength(150);
  });

  it("slots beyond total layout capacity are marked unplaced", () => {
    const slots: Slot[] = [];
    for (let i = 0; i < 130; i++) slots.push(slot({ position: i + 1, set: "a", name: `a${i}` }));
    const lay = layout([
      { id: "sr1", label: "top", boxes: [{ id: "b1", type: "1k" }] },  // 125 slots total
    ]);
    const result = flowIntoLayout(slots, lay);
    const placed = result.cells.filter((c): c is PlacedSlot => c.kind !== "empty-reserved");
    const unplaced = placed.filter((p) => p.unplaced);
    expect(unplaced.length).toBeGreaterThanOrEqual(5);  // at least 5 overflow
  });
});

describe("flowIntoLayout — box-row snake pattern", () => {
  it("4k box has rows 0, 1, 2, 3 alternating directions", () => {
    const slots: Slot[] = [];
    const slotsPer4kBox = BOX_ROWS["4k"] * ROW_CAPACITY_SLOTS;  // 500
    for (let i = 0; i < slotsPer4kBox; i++) {
      slots.push(slot({ position: i + 1, set: "a", name: `card${i}` }));
    }
    const lay = layout([
      { id: "sr1", label: "top", boxes: [{ id: "b1", type: "4k" }] },
    ]);
    const result = flowIntoLayout(slots, lay);
    const placed = result.cells.filter((c): c is PlacedSlot => c.kind !== "empty-reserved");
    expect(placed[0].readingDirection).toBe("far-to-near");         // row 0
    expect(placed[ROW_CAPACITY_SLOTS].readingDirection).toBe("near-to-far"); // row 1
    expect(placed[ROW_CAPACITY_SLOTS * 2].readingDirection).toBe("far-to-near"); // row 2
    expect(placed[ROW_CAPACITY_SLOTS * 3].readingDirection).toBe("near-to-far"); // row 3
  });
});

describe("flowIntoLayout — empty layout", () => {
  it("no shelf rows → everything marked unplaced", () => {
    const slots = [slot({ position: 1, set: "a", name: "x" })];
    const lay = layout([]);
    const result = flowIntoLayout(slots, lay);
    const placed = result.cells.filter((c): c is PlacedSlot => c.kind !== "empty-reserved");
    expect(placed[0].unplaced).toBe(true);
  });
});

// ── Task 6: applyOverrides ────────────────────────────────────────

describe("applyOverrides — basic application", () => {
  it("with empty overrides list, produces identical output to flowIntoLayout", () => {
    const slots: Slot[] = [];
    for (let i = 0; i < 10; i++) slots.push(slot({ position: i + 1, set: "a", name: `c${i}` }));
    const lay = layout([{ id: "sr1", label: "top", boxes: [{ id: "b1", type: "1k" }] }]);
    const flowResult = flowIntoLayout(slots, lay);
    const applyResult = applyOverrides(slots, lay, []);
    expect(applyResult.cells).toEqual(flowResult.cells);
    expect(applyResult.staleOverrides).toEqual([]);
  });

  it("override on slot 5 → cursor jumps to target row, empty-reserved fills the gap", () => {
    // 10 slots, 1k box (125 slot capacity). Override says slot 5 should start box-row 0
    // at position 50 (jumping past positions 5-49). NOTE: 1k has only 1 box-row (0),
    // so this test uses a 2k box. Override says slot 5 should start box-row 1 pos 1.
    const slots: Slot[] = [];
    for (let i = 0; i < 10; i++) slots.push(slot({ position: i + 1, set: "a", name: `c${i}` }));
    const lay = layout([{ id: "sr1", label: "top", boxes: [{ id: "b1", type: "2k" }] }]);
    const overrides: CutOverride[] = [
      { id: "o1", anchorSlotKey: "c4|a|0", targetBoxId: "b1", targetBoxRowIndex: 1 },
    ];
    const result = applyOverrides(slots, lay, overrides);
    expect(result.staleOverrides).toEqual([]);

    // The first 4 slots are in box-row 0 positions 1-4.
    const placed = result.cells.filter((c): c is PlacedSlot => c.kind !== "empty-reserved");
    expect(placed[0].boxRowIndex).toBe(0);
    expect(placed[3].boxRowIndex).toBe(0);
    expect(placed[3].positionInBoxRow).toBe(4);

    // Between slot 4 and the resumption at box-row 1, empty-reserved cells fill
    // the remainder of box-row 0 (positions 5..125 = 121 cells).
    const emptyReserved = result.cells.filter((c): c is EmptyReservedCell => c.kind === "empty-reserved");
    expect(emptyReserved.length).toBe(ROW_CAPACITY_SLOTS - 4);

    // Slot 5 (c4) lands at box-row 1 position 1.
    const slot5 = placed[4];
    expect(slot5.name).toBe("c4");
    expect(slot5.boxRowIndex).toBe(1);
    expect(slot5.positionInBoxRow).toBe(1);
  });
});

describe("applyOverrides — staleness detection", () => {
  it("stale-missing-slot: override anchor not in input slots", () => {
    const slots = [slot({ position: 1, set: "a", name: "only" })];
    const lay = layout([{ id: "sr1", label: "top", boxes: [{ id: "b1", type: "1k" }] }]);
    const overrides: CutOverride[] = [
      { id: "o1", anchorSlotKey: "ghost|a|0", targetBoxId: "b1", targetBoxRowIndex: 0 },
    ];
    const result = applyOverrides(slots, lay, overrides);
    expect(result.staleOverrides).toHaveLength(1);
    expect(result.staleOverrides[0].status).toBe("stale-missing-slot");
    expect(result.staleOverrides[0].override.id).toBe("o1");
  });

  it("stale-missing-target: target box doesn't exist in layout", () => {
    const slots = [slot({ position: 1, set: "a", name: "only" })];
    const lay = layout([{ id: "sr1", label: "top", boxes: [{ id: "b1", type: "1k" }] }]);
    const overrides: CutOverride[] = [
      { id: "o1", anchorSlotKey: "only|a|0", targetBoxId: "deleted-box", targetBoxRowIndex: 0 },
    ];
    const result = applyOverrides(slots, lay, overrides);
    expect(result.staleOverrides).toHaveLength(1);
    expect(result.staleOverrides[0].status).toBe("stale-missing-target");
  });

  it("stale-regression: override would place slot earlier than natural flow", () => {
    // Slots 1-10 naturally place in box-row 0 pos 1-10 of b1. Override says
    // slot 8 should start box-row 0 pos 1 of b1 — but natural flow already
    // put slot 8 at position 8, and jumping backward would place earlier slots
    // after it. Flag as regression.
    const slots: Slot[] = [];
    for (let i = 0; i < 10; i++) slots.push(slot({ position: i + 1, set: "a", name: `c${i}` }));
    const lay = layout([{ id: "sr1", label: "top", boxes: [{ id: "b1", type: "2k" }] }]);
    // Override: slot index 7 (c7) should start box-row 0 pos 1.
    // Natural flow puts c7 at box-row 0 pos 8, so the override's target (0,0,1)
    // is EARLIER in the stream — that's a regression.
    const overrides: CutOverride[] = [
      { id: "o1", anchorSlotKey: "c7|a|0", targetBoxId: "b1", targetBoxRowIndex: 0 },
    ];
    const result = applyOverrides(slots, lay, overrides);
    // The override anchor is at (box-row 0, pos 8) naturally, but targetBoxRowIndex=0
    // and we're already past position 1 there — should be flagged.
    // Actually the spec says "move slot earlier than natural flow" — that's the regression case.
    // Since targeting box-row 0 when we're already past it (cursor is at row 0 pos 8 when we hit c7),
    // jumping backward to (row 0, pos 0) is a regression.
    expect(result.staleOverrides).toHaveLength(1);
    expect(result.staleOverrides[0].status).toBe("stale-regression");
  });
});

describe("applyOverrides — multiple overrides", () => {
  it("applies two overrides in sort order", () => {
    const slots: Slot[] = [];
    for (let i = 0; i < 10; i++) slots.push(slot({ position: i + 1, set: "a", name: `c${i}` }));
    const lay = layout([
      { id: "sr1", label: "top", boxes: [{ id: "b1", type: "4k" }] },
    ]);
    // 4k has 4 box-rows. Override 1 says c3 starts row 1. Override 2 says c6 starts row 2.
    const overrides: CutOverride[] = [
      { id: "o1", anchorSlotKey: "c3|a|0", targetBoxId: "b1", targetBoxRowIndex: 1 },
      { id: "o2", anchorSlotKey: "c6|a|0", targetBoxId: "b1", targetBoxRowIndex: 2 },
    ];
    const result = applyOverrides(slots, lay, overrides);
    expect(result.staleOverrides).toEqual([]);
    const placed = result.cells.filter((c): c is PlacedSlot => c.kind !== "empty-reserved");
    // c0,c1,c2 in row 0
    expect(placed[0].boxRowIndex).toBe(0);
    expect(placed[2].boxRowIndex).toBe(0);
    // c3 starts row 1
    expect(placed[3].boxRowIndex).toBe(1);
    expect(placed[3].positionInBoxRow).toBe(1);
    // c6 starts row 2
    expect(placed[6].boxRowIndex).toBe(2);
    expect(placed[6].positionInBoxRow).toBe(1);
  });
});
