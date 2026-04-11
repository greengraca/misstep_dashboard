# Canonical Storage — Sub-Plan 2: Pure Sort / Flow / Override Core

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `lib/storage.ts` — three pure functions (`computeCanonicalSort`, `flowIntoLayout`, `applyOverrides`) plus their helpers — that take stock rows, card metadata, a shelf layout, and override records, and return a deterministic slot placement. Zero I/O, zero framework, zero DB. Everything is unit-testable via Vitest fixtures.

**Architecture:** One module, one export surface, three main functions composed over shared helpers. `computeCanonicalSort` aggregates stock by `(name, set)`, derives sort fields, sorts, and splits into 8-card slots. `flowIntoLayout` walks the sorted sequence and assigns each slot to a physical `(shelfRow, box, boxRow, positionInBoxRow)` respecting the "no set spans a shelf row" constraint and snake reading order. `applyOverrides` extends the flow walker with cut-before-anchor jumps, stale detection, and empty-reserved gap emission.

**Tech Stack:** TypeScript 5.9, Vitest 2 (already installed), no new dependencies.

---

## File Structure

**New files (created by this sub-plan):**

| Path | Responsibility |
|---|---|
| `lib/storage.ts` | The pure core. Types + three main functions + helpers (`deriveSortFields`, `aggregateStock`, `splitIntoSlots`, `partitionSetBlocks`, `walkLayoutCursor`). ~600 lines estimated. |
| `lib/__tests__/storage.test.ts` | Unit tests for every helper and every main function. ~45 tests estimated. |
| `lib/__tests__/fixtures/storage-cards.json` | ~30 card metadata fixtures covering every color-group/rarity/cmc/land-tier edge case. |
| `lib/__tests__/fixtures/storage-sets.json` | ~8 set fixtures with chronological release dates including one token set with `parent_set_code`. |
| `lib/__tests__/fixtures/storage-stock.json` | ~25 stock rows with qty variations to test aggregation and slot splitting. |
| `lib/__tests__/fixtures/storage-layout.json` | A small `ShelfLayout` fixture — 2 shelf rows, mixed 1k/2k/4k boxes. |

**No existing files are modified in this sub-plan.** The new module is mergeable in isolation; nothing imports it yet.

## Constants (named, defined at top of `lib/storage.ts`)

```ts
export const SLOT_CAPACITY = 8;              // cards per penny sleeve
export const ROW_CAPACITY_SLOTS = 125;       // 1000 cards / 8 — derived from "1k = 1 row"
export const BOX_ROWS: Record<BoxType, number> = { "1k": 1, "2k": 2, "4k": 4 };
export const COLOR_GROUP_ORDER: Record<ColorGroup, number> = {
  W: 0, U: 1, B: 2, R: 3, G: 4, M: 5, C: 6, L: 7,
};
export const RARITY_ORDER: Record<string, number> = {
  mythic: 0, special: 0, bonus: 0, rare: 1, uncommon: 2, common: 3,
};
```

All three are exported so tests can reference them without duplicating the magic numbers.

---

## Task 1: Types + module skeleton

**Files:**
- Create: `lib/storage.ts`
- Create: `lib/__tests__/storage.test.ts`

- [ ] **Step 1.1: Create `lib/storage.ts` with types only**

```ts
// lib/storage.ts
//
// Pure core of the canonical-storage feature. Takes stock rows, card metadata,
// a shelf layout, and override records, returns a deterministic slot placement.
// No I/O, no DB, no framework. Everything here is unit-testable in isolation.

// ── Constants ──────────────────────────────────────────────────

export type BoxType = "1k" | "2k" | "4k";
export type ColorGroup = "W" | "U" | "B" | "R" | "G" | "M" | "C" | "L";
export type Rarity = "mythic" | "rare" | "uncommon" | "common";

export const SLOT_CAPACITY = 8;
export const ROW_CAPACITY_SLOTS = 125;
export const BOX_ROWS: Record<BoxType, number> = { "1k": 1, "2k": 2, "4k": 4 };
export const COLOR_GROUP_ORDER: Record<ColorGroup, number> = {
  W: 0, U: 1, B: 2, R: 3, G: 4, M: 5, C: 6, L: 7,
};
export const RARITY_ORDER: Record<string, number> = {
  mythic: 0, special: 0, bonus: 0, rare: 1, uncommon: 2, common: 3,
};

// ── Input types (subsets of domain models) ─────────────────────

export interface StockRow {
  name: string;
  set: string;
  qty: number;
  // Other CmStockListing fields are ignored by the pure core.
}

export interface CardMeta {
  name: string;
  set: string;
  collector_number?: string;
  rarity: string;
  type_line: string;
  colors: string[];
  color_identity: string[];
  cmc: number;
  layout: string;
  image_uri: string | null;
  released_at: string;
}

export interface SetMeta {
  code: string;
  name: string;
  released_at: string;
  set_type: string;
  parent_set_code?: string | null;
}

// ── Layout / override types ────────────────────────────────────

export interface BoxConfig {
  id: string;
  type: BoxType;
  label?: string;
}

export interface ShelfRowConfig {
  id: string;
  label: string;
  boxes: BoxConfig[];
}

export interface ShelfLayout {
  shelfRows: ShelfRowConfig[];
}

export interface CutOverride {
  id: string;
  anchorSlotKey: string;
  targetBoxId: string;
  targetBoxRowIndex: number;
}

// ── Intermediate types ─────────────────────────────────────────

/** An aggregated stock variant — one per unique (name, set) with qty summed. */
export interface Variant {
  name: string;
  set: string;             // original set code, before token re-homing
  effectiveSet: string;    // after token re-homing
  qty: number;
}

/** Sort-critical fields derived from a card's metadata. */
export interface SortFields {
  effectiveSet: string;
  colorGroup: ColorGroup;
  landTier: 0 | 1 | 2;
  rarityOrder: number;
  cmcBucket: number;
  rarity: Rarity;
  cmc: number;
  name: string;
  nameLower: string;
  releasedAt: string;
}

// ── Output types ───────────────────────────────────────────────

export interface Slot {
  slotKey: string;
  variantKey: string;
  position: number;
  name: string;
  set: string;
  setName: string;
  setReleaseDate: string;
  collectorNumber?: string;
  colorGroup: ColorGroup;
  landTier: 0 | 1 | 2;
  cmc: number;
  cmcBucket: number;
  rarity: Rarity;
  qtyInSlot: number;
  slotIndexInVariant: number;
  imageUri: string | null;
}

export type ReadingDirection = "far-to-near" | "near-to-far";

export interface PlacedSlot extends Slot {
  shelfRowId: string;
  shelfRowIndex: number;
  boxId: string;
  boxIndexInRow: number;
  boxRowIndex: number;
  readingDirection: ReadingDirection;
  positionInBoxRow: number;
  spansShelfRow?: true;
  unplaced?: true;
}

export interface EmptyReservedCell {
  kind: "empty-reserved";
  shelfRowId: string;
  shelfRowIndex: number;
  boxId: string;
  boxIndexInRow: number;
  boxRowIndex: number;
  readingDirection: ReadingDirection;
  positionInBoxRow: number;
  reason: "override-gap";
}

export type PlacedCell = PlacedSlot | EmptyReservedCell;

export interface UnmatchedVariant {
  name: string;
  set: string;
  qty: number;
}

export type OverrideStatus =
  | "applied"
  | "stale-missing-slot"
  | "stale-missing-target"
  | "stale-regression";

export interface StaleOverrideReport {
  override: CutOverride;
  status: Exclude<OverrideStatus, "applied">;
}

export interface CanonicalSortResult {
  slots: Slot[];
  unmatched: UnmatchedVariant[];
}

export interface ApplyOverridesResult {
  cells: PlacedCell[];
  staleOverrides: StaleOverrideReport[];
}

// ── Main functions (implemented in later tasks) ────────────────

// Task 4 — computeCanonicalSort
// Task 5 — flowIntoLayout
// Task 6 — applyOverrides
```

- [ ] **Step 1.2: Create `lib/__tests__/storage.test.ts` with a trivial passing test**

```ts
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
```

- [ ] **Step 1.3: Run tests + type-check**

```bash
npm test
npx tsc --noEmit
```
Expected: new tests pass (14 scryfall + 3 storage = 17 total passing). Type-check clean.

- [ ] **Step 1.4: Commit**

```bash
git add lib/storage.ts lib/__tests__/storage.test.ts
git commit -m "Add storage module skeleton with types and constants"
```

---

## Task 2: `deriveSortFields` helper

**Files:**
- Modify: `lib/storage.ts` (add helper + export)
- Modify: `lib/__tests__/storage.test.ts` (add tests)

The helper computes every sort-critical field for one card, given the card's metadata and a map from `setCode → parent_set_code` (used to rewrite token sets to their parent).

- [ ] **Step 2.1: Append failing tests to `lib/__tests__/storage.test.ts`**

```ts
import { deriveSortFields, type CardMeta } from "../storage";

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
```

- [ ] **Step 2.2: Run tests to confirm failure**

```bash
npm test
```
Expected: failures referencing `deriveSortFields is not defined` (or missing export).

- [ ] **Step 2.3: Implement `deriveSortFields` in `lib/storage.ts`**

Append to `lib/storage.ts` (below the type declarations, before the "Main functions" comment):

```ts
// ── Helpers ────────────────────────────────────────────────────

function normalizeRarity(raw: string): Rarity {
  if (raw === "mythic" || raw === "special" || raw === "bonus") return "mythic";
  if (raw === "rare") return "rare";
  if (raw === "uncommon") return "uncommon";
  return "common";
}

function colorGroupFor(card: CardMeta): ColorGroup {
  // Tokens go to L regardless of color.
  if (card.layout === "token") return "L";
  if (card.type_line.includes("Token")) return "L";
  // Lands go to L.
  if (card.type_line.includes("Land")) return "L";
  // No color identity → colorless bucket.
  if (card.color_identity.length === 0) return "C";
  // Single-color card → that color's bucket.
  if (card.color_identity.length === 1) {
    const c = card.color_identity[0];
    if (c === "W" || c === "U" || c === "B" || c === "R" || c === "G") return c;
    return "C"; // defensive: unknown color letter falls back to C
  }
  // Two or more colors (including mono-hybrid with multi-letter color_identity) → M.
  return "M";
}

function landTierFor(card: CardMeta, colorGroup: ColorGroup): 0 | 1 | 2 {
  if (colorGroup !== "L") return 0;
  if (card.layout === "token" || card.type_line.includes("Token")) return 2;
  if (card.type_line.includes("Basic")) return 1;
  return 0;
}

function effectiveSetFor(card: CardMeta, parentSetMap: Map<string, string>): string {
  // Token re-homing: rewrite set to parent_set_code if this is a token card
  // AND the set is mapped. Non-token cards are left alone even if the map has
  // an entry for their set (defensive against map pollution).
  const isToken = card.layout === "token" || card.type_line.includes("Token");
  if (!isToken) return card.set;
  const parent = parentSetMap.get(card.set);
  return parent ?? card.set;
}

export function deriveSortFields(
  card: CardMeta,
  parentSetMap: Map<string, string>
): SortFields {
  const colorGroup = colorGroupFor(card);
  const landTier = landTierFor(card, colorGroup);
  const rarity = normalizeRarity(card.rarity);
  const rarityOrder = RARITY_ORDER[rarity] ?? 3;
  const cmc = typeof card.cmc === "number" ? card.cmc : 0;
  const cmcBucket = Math.min(Math.floor(cmc), 7);
  const effectiveSet = effectiveSetFor(card, parentSetMap);

  return {
    effectiveSet,
    colorGroup,
    landTier,
    rarityOrder,
    cmcBucket,
    rarity,
    cmc,
    name: card.name,
    nameLower: card.name.toLowerCase(),
    releasedAt: card.released_at,
  };
}
```

- [ ] **Step 2.4: Run tests to verify they pass**

```bash
npm test
```
Expected: all derive-sort-fields tests pass (adds ~30 to the suite).

- [ ] **Step 2.5: Type-check and commit**

```bash
npx tsc --noEmit
git add lib/storage.ts lib/__tests__/storage.test.ts
git commit -m "Add deriveSortFields helper with edge-case tests"
```

---

## Task 3: `aggregateStock` helper

**Files:**
- Modify: `lib/storage.ts`
- Modify: `lib/__tests__/storage.test.ts`

Groups stock rows by `(name, set)` and sums qty. Pure, no metadata needed — just stock math.

- [ ] **Step 3.1: Append failing tests**

```ts
import { aggregateStock, type StockRow } from "../storage";

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
```

- [ ] **Step 3.2: Run tests to confirm failure**

Run: `npm test`
Expected: failures on `aggregateStock is not defined`.

- [ ] **Step 3.3: Implement `aggregateStock`**

Append to `lib/storage.ts` in the Helpers section:

```ts
export function aggregateStock(rows: StockRow[]): Variant[] {
  const grouped = new Map<string, Variant>();
  for (const row of rows) {
    if (row.qty <= 0) continue;
    const key = `${row.name}|${row.set}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.qty += row.qty;
    } else {
      grouped.set(key, {
        name: row.name,
        set: row.set,
        effectiveSet: row.set,  // filled in properly by computeCanonicalSort after deriveSortFields runs
        qty: row.qty,
      });
    }
  }
  // Drop any variant whose final qty is not positive.
  return Array.from(grouped.values()).filter((v) => v.qty > 0);
}
```

- [ ] **Step 3.4: Run tests**

Run: `npm test`
Expected: all aggregateStock tests pass.

- [ ] **Step 3.5: Commit**

```bash
git add lib/storage.ts lib/__tests__/storage.test.ts
git commit -m "Add aggregateStock helper with tests"
```

---

## Task 4: `computeCanonicalSort` main function

**Files:**
- Modify: `lib/storage.ts`
- Modify: `lib/__tests__/storage.test.ts`

The first main function. Composes `aggregateStock` + `deriveSortFields` + sort + slot-split. Returns slots and unmatched variants.

- [ ] **Step 4.1: Append failing tests**

```ts
import {
  computeCanonicalSort,
  type CanonicalSortResult,
  type SetMeta,
} from "../storage";

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
```

- [ ] **Step 4.2: Run tests to confirm failure**

Run: `npm test`
Expected: failures on `computeCanonicalSort is not defined`.

- [ ] **Step 4.3: Implement `computeCanonicalSort`**

Append to `lib/storage.ts`:

```ts
// ── Main functions ─────────────────────────────────────────────

export function computeCanonicalSort(
  stockRows: StockRow[],
  cardMetaByKey: Map<string, CardMeta>,
  sets: SetMeta[]
): CanonicalSortResult {
  // 1. Build parent-set lookup map for token re-homing.
  const parentSetMap = new Map<string, string>();
  for (const s of sets) {
    if (s.parent_set_code) parentSetMap.set(s.code, s.parent_set_code);
  }

  // 2. Build set metadata lookup + chronological rank.
  const setsByCode = new Map<string, SetMeta>();
  for (const s of sets) setsByCode.set(s.code, s);
  const sortedSets = [...sets].sort((a, b) => {
    const ar = a.released_at || "9999-12-31";
    const br = b.released_at || "9999-12-31";
    return ar.localeCompare(br);
  });
  const setOrder = new Map<string, number>();
  sortedSets.forEach((s, i) => setOrder.set(s.code, i));

  // 3. Aggregate stock into variants.
  const variants = aggregateStock(stockRows);

  // 4. Derive sort fields for each matched variant; collect unmatched.
  interface VariantWithFields {
    variant: Variant;
    fields: SortFields;
    setName: string;
    setReleaseDate: string;
    collectorNumber?: string;
    imageUri: string | null;
  }
  const withFields: VariantWithFields[] = [];
  const unmatched: UnmatchedVariant[] = [];

  for (const v of variants) {
    const card = cardMetaByKey.get(`${v.name}|${v.set}`);
    if (!card) {
      unmatched.push({ name: v.name, set: v.set, qty: v.qty });
      continue;
    }
    const fields = deriveSortFields(card, parentSetMap);
    v.effectiveSet = fields.effectiveSet;
    const effSet = setsByCode.get(fields.effectiveSet);
    withFields.push({
      variant: v,
      fields,
      setName: effSet?.name ?? fields.effectiveSet,
      setReleaseDate: effSet?.released_at ?? "9999-12-31",
      collectorNumber: card.collector_number,
      imageUri: card.image_uri,
    });
  }

  // 5. Sort by composite key.
  withFields.sort((a, b) => {
    const aSetOrder = setOrder.get(a.fields.effectiveSet) ?? Number.MAX_SAFE_INTEGER;
    const bSetOrder = setOrder.get(b.fields.effectiveSet) ?? Number.MAX_SAFE_INTEGER;
    if (aSetOrder !== bSetOrder) return aSetOrder - bSetOrder;

    const aCg = COLOR_GROUP_ORDER[a.fields.colorGroup];
    const bCg = COLOR_GROUP_ORDER[b.fields.colorGroup];
    if (aCg !== bCg) return aCg - bCg;

    if (a.fields.landTier !== b.fields.landTier) return a.fields.landTier - b.fields.landTier;
    if (a.fields.rarityOrder !== b.fields.rarityOrder) return a.fields.rarityOrder - b.fields.rarityOrder;
    if (a.fields.cmcBucket !== b.fields.cmcBucket) return a.fields.cmcBucket - b.fields.cmcBucket;
    return a.fields.nameLower.localeCompare(b.fields.nameLower);
  });

  // 6. Split into slots, assign positions.
  const slots: Slot[] = [];
  let position = 1;
  for (const w of withFields) {
    const slotCount = Math.max(1, Math.ceil(w.variant.qty / SLOT_CAPACITY));
    let remaining = w.variant.qty;
    for (let i = 0; i < slotCount; i++) {
      const qtyInSlot = Math.min(remaining, SLOT_CAPACITY);
      remaining -= qtyInSlot;
      slots.push({
        slotKey: `${w.variant.name}|${w.variant.effectiveSet}|${i}`,
        variantKey: `${w.variant.name}|${w.variant.effectiveSet}`,
        position: position++,
        name: w.variant.name,
        set: w.variant.effectiveSet,
        setName: w.setName,
        setReleaseDate: w.setReleaseDate,
        collectorNumber: w.collectorNumber,
        colorGroup: w.fields.colorGroup,
        landTier: w.fields.landTier,
        cmc: w.fields.cmc,
        cmcBucket: w.fields.cmcBucket,
        rarity: w.fields.rarity,
        qtyInSlot,
        slotIndexInVariant: i,
        imageUri: w.imageUri,
      });
    }
  }

  return { slots, unmatched };
}
```

- [ ] **Step 4.4: Run tests to verify they pass**

Run: `npm test`
Expected: all computeCanonicalSort tests pass.

- [ ] **Step 4.5: Commit**

```bash
git add lib/storage.ts lib/__tests__/storage.test.ts
git commit -m "Add computeCanonicalSort with sort-order and slot-split tests"
```

---

## Task 5: `flowIntoLayout` main function

**Files:**
- Modify: `lib/storage.ts`
- Modify: `lib/__tests__/storage.test.ts`

Walks the sorted slot sequence and assigns each slot a physical `(shelfRow, box, boxRow, positionInBoxRow)`. Enforces "no set block spans a shelf row" and snake reading order.

- [ ] **Step 5.1: Append failing tests**

```ts
import {
  flowIntoLayout,
  type ShelfLayout,
  type Slot,
  BOX_ROWS,
  ROW_CAPACITY_SLOTS,
} from "../storage";

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
```

- [ ] **Step 5.2: Run tests to confirm failure**

Run: `npm test`
Expected: failures on `flowIntoLayout is not defined`.

- [ ] **Step 5.3: Implement `flowIntoLayout`**

This is the biggest helper in the file. It delegates to `applyOverrides` with an empty overrides list to keep the implementation single-sourced. Wait — that's a forward dependency. Let me re-architect: implement the full walker here in a private helper, and `applyOverrides` in Task 6 will pass its own override handling to the same walker.

Append to `lib/storage.ts`:

```ts
// Internal walker used by both flowIntoLayout and applyOverrides.
interface WalkerCursor {
  shelfRowIdx: number;
  boxIdx: number;       // index into current shelf row's boxes
  boxRowIdx: number;    // index into current box's internal rows
  posInBoxRow: number;  // 1-based
}

function partitionSetBlocks(slots: Slot[]): Slot[][] {
  const blocks: Slot[][] = [];
  let current: Slot[] = [];
  let currentSet: string | null = null;
  for (const s of slots) {
    if (currentSet === null || s.set === currentSet) {
      current.push(s);
      currentSet = s.set;
    } else {
      blocks.push(current);
      current = [s];
      currentSet = s.set;
    }
  }
  if (current.length > 0) blocks.push(current);
  return blocks;
}

function shelfRowCapacity(row: ShelfRowConfig): number {
  return row.boxes.reduce((sum, box) => sum + BOX_ROWS[box.type] * ROW_CAPACITY_SLOTS, 0);
}

function remainingCapacityInShelfRow(row: ShelfRowConfig, cursor: WalkerCursor): number {
  // Sum remaining slots across all boxes from cursor.boxIdx onwards.
  let remaining = 0;
  for (let b = cursor.boxIdx; b < row.boxes.length; b++) {
    const box = row.boxes[b];
    const totalRows = BOX_ROWS[box.type];
    if (b === cursor.boxIdx) {
      // Current box: respect current box-row and position.
      const remainingInCurrentBoxRow = ROW_CAPACITY_SLOTS - (cursor.posInBoxRow - 1);
      remaining += remainingInCurrentBoxRow;
      remaining += (totalRows - cursor.boxRowIdx - 1) * ROW_CAPACITY_SLOTS;
    } else {
      remaining += totalRows * ROW_CAPACITY_SLOTS;
    }
  }
  return remaining;
}

function advanceCursor(
  cursor: WalkerCursor,
  layout: ShelfLayout
): { cursor: WalkerCursor; overflowed: boolean } {
  // Advance one slot position. If we run out of positions in the current
  // box-row, flip to the next box-row. If we run out of box-rows, move to
  // the next box in the shelf row. If we run out of boxes, move to the next
  // shelf row. If we run out of shelf rows, set overflowed=true.
  const next = { ...cursor };
  const shelfRow = layout.shelfRows[next.shelfRowIdx];
  if (!shelfRow) return { cursor: next, overflowed: true };
  const box = shelfRow.boxes[next.boxIdx];
  if (!box) return { cursor: next, overflowed: true };
  next.posInBoxRow++;
  if (next.posInBoxRow > ROW_CAPACITY_SLOTS) {
    next.posInBoxRow = 1;
    next.boxRowIdx++;
    if (next.boxRowIdx >= BOX_ROWS[box.type]) {
      next.boxRowIdx = 0;
      next.boxIdx++;
      if (next.boxIdx >= shelfRow.boxes.length) {
        next.boxIdx = 0;
        next.shelfRowIdx++;
        if (next.shelfRowIdx >= layout.shelfRows.length) {
          return { cursor: next, overflowed: true };
        }
      }
    }
  }
  return { cursor: next, overflowed: false };
}

function placeSlotAtCursor(
  slot: Slot,
  cursor: WalkerCursor,
  layout: ShelfLayout,
  flags: { spansShelfRow?: true; unplaced?: true } = {}
): PlacedSlot {
  const shelfRow = layout.shelfRows[cursor.shelfRowIdx];
  const box = shelfRow?.boxes[cursor.boxIdx];
  const readingDirection: ReadingDirection =
    cursor.boxRowIdx % 2 === 0 ? "far-to-near" : "near-to-far";
  return {
    ...slot,
    shelfRowId: shelfRow?.id ?? "",
    shelfRowIndex: cursor.shelfRowIdx,
    boxId: box?.id ?? "",
    boxIndexInRow: cursor.boxIdx,
    boxRowIndex: cursor.boxRowIdx,
    readingDirection,
    positionInBoxRow: cursor.posInBoxRow,
    ...flags,
  };
}

export function flowIntoLayout(
  slots: Slot[],
  layout: ShelfLayout
): ApplyOverridesResult {
  return applyOverrides(slots, layout, []);
}
```

Notice `flowIntoLayout` is now a trivial wrapper around `applyOverrides`. But `applyOverrides` doesn't exist yet — so the test step in this task will still fail. We defer the actual implementation to Task 6 and expect these tests to remain red until then.

**Important:** since `applyOverrides` isn't implemented yet, all tests in this Task 5 will still fail at this point. That's OK — commit the wrapper + walker helpers + tests together, and Task 6 will make the tests green.

Actually, that violates the TDD ordering. Let me restructure: **inline the full walker in `flowIntoLayout`** (no override handling), and then Task 6 replaces it with a version that delegates to `applyOverrides`.

Revised Step 5.3:

Append to `lib/storage.ts` (replacing the stub wrapper approach above):

```ts
// (partitionSetBlocks, shelfRowCapacity, remainingCapacityInShelfRow,
//  advanceCursor, placeSlotAtCursor — as above)

export function flowIntoLayout(
  slots: Slot[],
  layout: ShelfLayout
): ApplyOverridesResult {
  const cells: PlacedCell[] = [];
  if (layout.shelfRows.length === 0) {
    // No layout — mark everything unplaced.
    for (const s of slots) {
      cells.push({
        ...s,
        shelfRowId: "",
        shelfRowIndex: -1,
        boxId: "",
        boxIndexInRow: -1,
        boxRowIndex: -1,
        readingDirection: "far-to-near",
        positionInBoxRow: 0,
        unplaced: true,
      });
    }
    return { cells, staleOverrides: [] };
  }

  const blocks = partitionSetBlocks(slots);
  const cursor: WalkerCursor = { shelfRowIdx: 0, boxIdx: 0, boxRowIdx: 0, posInBoxRow: 1 };
  let overflowed = false;

  for (const block of blocks) {
    if (overflowed) {
      for (const s of block) {
        cells.push({
          ...s,
          shelfRowId: "",
          shelfRowIndex: -1,
          boxId: "",
          boxIndexInRow: -1,
          boxRowIndex: -1,
          readingDirection: "far-to-near",
          positionInBoxRow: 0,
          unplaced: true,
        });
      }
      continue;
    }

    // Check if block fits in remaining capacity of current shelf row.
    const shelfRow = layout.shelfRows[cursor.shelfRowIdx];
    const remaining = remainingCapacityInShelfRow(shelfRow, cursor);
    const shelfRowTotal = shelfRowCapacity(shelfRow);

    if (block.length > remaining) {
      // Doesn't fit. Two sub-cases.
      if (block.length > shelfRowTotal) {
        // Even a fresh shelf row couldn't hold it — force spanning.
        // Place every slot of the block with spansShelfRow=true, advancing the cursor.
        for (const s of block) {
          if (overflowed) {
            cells.push({
              ...s,
              shelfRowId: "",
              shelfRowIndex: -1,
              boxId: "",
              boxIndexInRow: -1,
              boxRowIndex: -1,
              readingDirection: "far-to-near",
              positionInBoxRow: 0,
              unplaced: true,
            });
            continue;
          }
          cells.push(placeSlotAtCursor(s, cursor, layout, { spansShelfRow: true }));
          const adv = advanceCursor(cursor, layout);
          Object.assign(cursor, adv.cursor);
          if (adv.overflowed) overflowed = true;
        }
        continue;
      }
      // Block fits in a fresh shelf row but not in the remaining tail.
      // Jump to next shelf row.
      cursor.shelfRowIdx++;
      cursor.boxIdx = 0;
      cursor.boxRowIdx = 0;
      cursor.posInBoxRow = 1;
      if (cursor.shelfRowIdx >= layout.shelfRows.length) {
        overflowed = true;
        for (const s of block) {
          cells.push({
            ...s,
            shelfRowId: "",
            shelfRowIndex: -1,
            boxId: "",
            boxIndexInRow: -1,
            boxRowIndex: -1,
            readingDirection: "far-to-near",
            positionInBoxRow: 0,
            unplaced: true,
          });
        }
        continue;
      }
    }

    // Place the block contiguously from cursor.
    for (const s of block) {
      if (overflowed) {
        cells.push({
          ...s,
          shelfRowId: "",
          shelfRowIndex: -1,
          boxId: "",
          boxIndexInRow: -1,
          boxRowIndex: -1,
          readingDirection: "far-to-near",
          positionInBoxRow: 0,
          unplaced: true,
        });
        continue;
      }
      cells.push(placeSlotAtCursor(s, cursor, layout));
      const adv = advanceCursor(cursor, layout);
      Object.assign(cursor, adv.cursor);
      if (adv.overflowed) overflowed = true;
    }
  }

  return { cells, staleOverrides: [] };
}
```

- [ ] **Step 5.4: Run tests**

Run: `npm test`
Expected: all flowIntoLayout tests pass.

- [ ] **Step 5.5: Commit**

```bash
git add lib/storage.ts lib/__tests__/storage.test.ts
git commit -m "Add flowIntoLayout with shelf-row atomicity and snake-pattern tests"
```

---

## Task 6: `applyOverrides` main function

**Files:**
- Modify: `lib/storage.ts`
- Modify: `lib/__tests__/storage.test.ts`

Extends `flowIntoLayout`'s walker with cut-before-anchor jumps, stale-override detection, and empty-reserved placeholder emission.

- [ ] **Step 6.1: Append failing tests**

```ts
import { applyOverrides, type CutOverride, type PlacedSlot, type EmptyReservedCell } from "../storage";

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
```

- [ ] **Step 6.2: Run tests to confirm failure**

Run: `npm test`
Expected: failures on `applyOverrides is not defined`.

- [ ] **Step 6.3: Implement `applyOverrides`**

This is the most complex function in the module. Strategy: run the same walker as `flowIntoLayout`, but before placing each slot, check if it has an override. If yes, determine validity:

- If the target box doesn't exist → stale-missing-target, skip the override and place naturally
- If the target position would be earlier than the current cursor → stale-regression, skip and place naturally
- Otherwise → jump the cursor to `(targetBoxId, targetBoxRowIndex, 1)`, emit empty-reserved cells for every skipped position between the old cursor and the jump target, mark the override applied

After the walk, any override whose anchor wasn't seen is stale-missing-slot.

Replace `flowIntoLayout` in `lib/storage.ts` with a trivial wrapper, and implement `applyOverrides` as the full walker:

```ts
export function flowIntoLayout(
  slots: Slot[],
  layout: ShelfLayout
): ApplyOverridesResult {
  return applyOverrides(slots, layout, []);
}

export function applyOverrides(
  slots: Slot[],
  layout: ShelfLayout,
  overrides: CutOverride[]
): ApplyOverridesResult {
  // Empty layout shortcut.
  if (layout.shelfRows.length === 0) {
    const cells: PlacedCell[] = slots.map((s) => ({
      ...s,
      shelfRowId: "",
      shelfRowIndex: -1,
      boxId: "",
      boxIndexInRow: -1,
      boxRowIndex: -1,
      readingDirection: "far-to-near" as ReadingDirection,
      positionInBoxRow: 0,
      unplaced: true,
    }));
    return { cells, staleOverrides: [] };
  }

  // Index overrides by anchor slot key.
  const overrideByKey = new Map<string, CutOverride>();
  for (const o of overrides) overrideByKey.set(o.anchorSlotKey, o);

  // Pre-validate targets. Targets that point at non-existent boxes are stale-missing-target
  // and are dropped before the walk.
  const boxLookup = new Map<string, { shelfRowIdx: number; boxIdx: number; boxType: BoxType }>();
  for (let sri = 0; sri < layout.shelfRows.length; sri++) {
    const row = layout.shelfRows[sri];
    for (let bi = 0; bi < row.boxes.length; bi++) {
      const box = row.boxes[bi];
      boxLookup.set(box.id, { shelfRowIdx: sri, boxIdx: bi, boxType: box.type });
    }
  }

  const staleOverrides: StaleOverrideReport[] = [];
  const usedOverrideIds = new Set<string>();

  // Pre-check missing targets.
  for (const o of overrides) {
    const target = boxLookup.get(o.targetBoxId);
    if (!target) {
      staleOverrides.push({ override: o, status: "stale-missing-target" });
      usedOverrideIds.add(o.id);
      // Remove from the active lookup so the walker ignores it.
      overrideByKey.delete(o.anchorSlotKey);
      continue;
    }
    if (o.targetBoxRowIndex < 0 || o.targetBoxRowIndex >= BOX_ROWS[target.boxType]) {
      staleOverrides.push({ override: o, status: "stale-missing-target" });
      usedOverrideIds.add(o.id);
      overrideByKey.delete(o.anchorSlotKey);
    }
  }

  const blocks = partitionSetBlocks(slots);
  const cells: PlacedCell[] = [];
  const cursor: WalkerCursor = { shelfRowIdx: 0, boxIdx: 0, boxRowIdx: 0, posInBoxRow: 1 };
  let overflowed = false;

  function cursorOrdinal(c: WalkerCursor): number {
    // A monotonic ordinal for comparing positions in the walk. Used for regression detection.
    let n = 0;
    for (let sr = 0; sr < c.shelfRowIdx; sr++) {
      n += shelfRowCapacity(layout.shelfRows[sr]);
    }
    const row = layout.shelfRows[c.shelfRowIdx];
    if (!row) return n;
    for (let b = 0; b < c.boxIdx; b++) {
      n += BOX_ROWS[row.boxes[b].type] * ROW_CAPACITY_SLOTS;
    }
    n += c.boxRowIdx * ROW_CAPACITY_SLOTS;
    n += c.posInBoxRow - 1;
    return n;
  }

  function markUnplaced(s: Slot): PlacedSlot {
    return {
      ...s,
      shelfRowId: "",
      shelfRowIndex: -1,
      boxId: "",
      boxIndexInRow: -1,
      boxRowIndex: -1,
      readingDirection: "far-to-near",
      positionInBoxRow: 0,
      unplaced: true,
    };
  }

  function emptyReservedAt(c: WalkerCursor): EmptyReservedCell {
    const sr = layout.shelfRows[c.shelfRowIdx];
    const box = sr?.boxes[c.boxIdx];
    return {
      kind: "empty-reserved",
      shelfRowId: sr?.id ?? "",
      shelfRowIndex: c.shelfRowIdx,
      boxId: box?.id ?? "",
      boxIndexInRow: c.boxIdx,
      boxRowIndex: c.boxRowIdx,
      readingDirection: c.boxRowIdx % 2 === 0 ? "far-to-near" : "near-to-far",
      positionInBoxRow: c.posInBoxRow,
      reason: "override-gap",
    };
  }

  function tryApplyOverride(slot: Slot): boolean {
    // Returns true if the override was applied and the cursor was updated.
    const o = overrideByKey.get(slot.slotKey);
    if (!o) return false;
    const target = boxLookup.get(o.targetBoxId);
    if (!target) return false;
    const targetCursor: WalkerCursor = {
      shelfRowIdx: target.shelfRowIdx,
      boxIdx: target.boxIdx,
      boxRowIdx: o.targetBoxRowIndex,
      posInBoxRow: 1,
    };
    // Regression check: target must not be earlier than or equal to current cursor.
    if (cursorOrdinal(targetCursor) <= cursorOrdinal(cursor)) {
      staleOverrides.push({ override: o, status: "stale-regression" });
      usedOverrideIds.add(o.id);
      overrideByKey.delete(o.anchorSlotKey);
      return false;
    }
    // Emit empty-reserved cells for the skipped range.
    const tempCursor = { ...cursor };
    while (cursorOrdinal(tempCursor) < cursorOrdinal(targetCursor)) {
      cells.push(emptyReservedAt(tempCursor));
      const adv = advanceCursor(tempCursor, layout);
      Object.assign(tempCursor, adv.cursor);
      if (adv.overflowed) break;
    }
    Object.assign(cursor, targetCursor);
    usedOverrideIds.add(o.id);
    overrideByKey.delete(o.anchorSlotKey);
    return true;
  }

  for (const block of blocks) {
    if (overflowed) {
      for (const s of block) cells.push(markUnplaced(s));
      continue;
    }

    const shelfRow = layout.shelfRows[cursor.shelfRowIdx];
    const remaining = remainingCapacityInShelfRow(shelfRow, cursor);
    const shelfRowTotal = shelfRowCapacity(shelfRow);

    if (block.length > remaining && block.length <= shelfRowTotal) {
      // Jump to next shelf row.
      cursor.shelfRowIdx++;
      cursor.boxIdx = 0;
      cursor.boxRowIdx = 0;
      cursor.posInBoxRow = 1;
      if (cursor.shelfRowIdx >= layout.shelfRows.length) {
        overflowed = true;
        for (const s of block) cells.push(markUnplaced(s));
        continue;
      }
    }

    const spanning = block.length > shelfRowTotal;

    for (const s of block) {
      if (overflowed) {
        cells.push(markUnplaced(s));
        continue;
      }
      // Check override before placing.
      tryApplyOverride(s);
      cells.push(placeSlotAtCursor(s, cursor, layout, spanning ? { spansShelfRow: true } : {}));
      const adv = advanceCursor(cursor, layout);
      Object.assign(cursor, adv.cursor);
      if (adv.overflowed) overflowed = true;
    }
  }

  // Any override that wasn't consumed is stale-missing-slot.
  for (const o of overrides) {
    if (!usedOverrideIds.has(o.id)) {
      staleOverrides.push({ override: o, status: "stale-missing-slot" });
    }
  }

  return { cells, staleOverrides };
}
```

- [ ] **Step 6.4: Remove the old `flowIntoLayout` walker body**

The implementation from Task 5.3 duplicates all the walker logic inside `flowIntoLayout`. Delete it and replace with the one-line wrapper: `export function flowIntoLayout(slots, layout) { return applyOverrides(slots, layout, []); }`.

- [ ] **Step 6.5: Run all tests**

Run: `npm test`
Expected: every test in the storage suite passes, including the Task 5 flowIntoLayout tests (because flowIntoLayout now delegates to applyOverrides) and the Task 6 applyOverrides tests.

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6.6: Commit**

```bash
git add lib/storage.ts lib/__tests__/storage.test.ts
git commit -m "Add applyOverrides with staleness detection, consolidate walker"
```

---

## Self-Review Checklist

After all tasks, verify:

- [ ] All sub-plan 2 tests pass (`npm test`).
- [ ] Sub-plan 1 tests still pass (the whole suite).
- [ ] `npx tsc --noEmit` clean.
- [ ] `npm run build` succeeds.
- [ ] `lib/storage.ts` has one clear responsibility — the pure core. No imports from `mongodb`, `next`, or other I/O modules.
- [ ] Every exported function is deterministic: same input → same output, including ordering.
- [ ] No `console.log`, no `Date.now()` inside the pure functions (only `releasedAt` date strings from metadata).

## Exit Criteria

Sub-plan 2 is done when:

1. All tests pass (existing 14 from sub-plan 1 + new ~45 from sub-plan 2 = ~59 total).
2. `tsc --noEmit` reports zero errors.
3. `npm run build` succeeds.
4. `lib/storage.ts` exports `computeCanonicalSort`, `flowIntoLayout`, `applyOverrides` and their supporting types.

No manual verification needed for this sub-plan — it's pure code validated by tests. Sub-plan 3 will wire these functions into API routes and expose them to real stock/metadata.
