// lib/__tests__/storage.test.ts
import { describe, it, expect } from "vitest";
import {
  SLOT_CAPACITY,
  ROW_CAPACITY_SLOTS,
  BOX_ROWS,
  deriveSortFields,
  aggregateStock,
  computeCanonicalSort,
  type CardMeta,
  type SetMeta,
  type StockRow,
  type CanonicalSortResult,
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
