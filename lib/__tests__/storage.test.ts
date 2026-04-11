// lib/__tests__/storage.test.ts
import { describe, it, expect } from "vitest";
import {
  SLOT_CAPACITY,
  ROW_CAPACITY_SLOTS,
  BOX_ROWS,
  deriveSortFields,
  type CardMeta,
  type SetMeta,
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
