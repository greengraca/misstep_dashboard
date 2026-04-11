# Canonical Storage — Sub-Plan 1: Scryfall Full-Catalog Sync

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the EV Scryfall sync in `lib/ev.ts` to pull the full Scryfall card catalog via the `/bulk-data` endpoint, store the sort-critical fields (`colors`, `color_identity`, `cmc`, `released_at`, `layout`, `parent_set_code`), and move the existing EV-only filter (`BOOSTER_SET_TYPES`, `released_at >= 2020`) from write time to read time so the EV calculator UI is unchanged while the upcoming canonical-sort code sees every card.

**Architecture:** A new pure parser module `lib/scryfall-bulk.ts` handles the bulk-data fetch, stream-parses the gzipped JSON array using `stream-json`, and returns canonical `EvCard` docs one at a time. The existing `syncSets` and `syncCards` functions in `lib/ev.ts` are extended in place: `syncSets` drops its relevance filter and starts capturing `parent_set_code` and `set_type`, `syncCards` adds the four new fields, and a new orchestrator `refreshAllScryfall` wires the bulk-data stream into Mongo via batched `bulkWrite`. `getSets` gains a read-time filter so the EV set picker continues to show only booster sets ≥ 2020. A new `POST /api/ev/sync-all` route exposes the orchestrator to the UI.

**Tech Stack:** Next.js 16 App Router (API route), MongoDB native driver 7, Node 18+ native `DecompressionStream`, `stream-json` for JSON array streaming, Vitest for unit tests (newly added), TypeScript 5.9.

---

## Pre-flight: Testing infrastructure

This project has no test runner today. This sub-plan adds Vitest because sub-plans 2 and 3 will rely heavily on unit tests for pure functions. If the user prefers to remain test-free, they can delete Tasks 0 and any `.test.ts` files added downstream and the rest of the plan still works — manual verification steps are included for every task.

## File Structure

**New files (created by this sub-plan):**

| Path | Responsibility |
|---|---|
| `vitest.config.ts` | Vitest configuration: node environment, `lib/**/*.test.ts` include pattern |
| `lib/scryfall-bulk.ts` | Pure helpers for bulk-data fetching and parsing. Exports `parseScryfallCardToDoc`, `fetchBulkDataIndex`, `findDefaultCardsEntry`, `streamBulkCards` |
| `lib/__tests__/scryfall-bulk.test.ts` | Unit tests for the pure helpers above |
| `lib/__tests__/fixtures/scryfall-cards-sample.json` | Small (~5-card) fixture file: one mono-color card, one DFC, one token, one colorless artifact, one basic land |
| `lib/__tests__/fixtures/scryfall-bulk-index.json` | Fixture bulk-data index (what `GET /bulk-data` returns) |
| `app/api/ev/sync-all/route.ts` | `POST /api/ev/sync-all` — calls `syncSets()` then `refreshAllScryfall()`, logs activity, returns counts |

**Modified files:**

| Path | Change |
|---|---|
| `package.json` | Add `vitest` and `stream-json` dependencies, add `test` script |
| `lib/types.ts` | Extend `EvSet` with `parent_set_code`; extend `EvCard` with `colors`, `color_identity`, `cmc`, `released_at`, `layout` |
| `lib/ev.ts` | Drop `isRelevantSet` filter from `syncSets`, capture `parent_set_code` and `set_type`; add read-time filter in `getSets`; add new `getAllSets` export; add new fields in `syncCards` doc assembly; export `refreshAllScryfall` orchestrator |

**Nothing else should be touched in this sub-plan.** The EV calculator UI, config, snapshots, jumpstart, and simulation code are all out of scope.

---

## Task 0: Add Vitest and `stream-json` dependencies

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install dev and runtime dependencies**

Run:
```bash
npm install --save-dev vitest@^2
npm install stream-json@^1
```

Expected: `package.json` gains `"vitest": "^2.x.x"` under `devDependencies` and `"stream-json": "^1.x.x"` under `dependencies`. Lockfile updates.

- [ ] **Step 2: Add `test` script to `package.json`**

Open `package.json` and add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

The full `scripts` block becomes:
```json
"scripts": {
  "dev": "next dev --turbopack -p 3025",
  "build": "next build",
  "start": "next start -p 3025",
  "lint": "next lint",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
    globals: false,
  },
});
```

- [ ] **Step 4: Smoke-test the runner**

Create a temporary file `lib/__tests__/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `npm test`
Expected: one test passes, output includes `1 passed`.

- [ ] **Step 5: Delete the smoke test**

```bash
rm lib/__tests__/smoke.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "Add Vitest and stream-json dependencies"
```

---

## Task 1: Extend `EvSet` type with `parent_set_code`

**Files:**
- Modify: `lib/types.ts:182` (the `EvSet` interface)

- [ ] **Step 1: Add `parent_set_code` to `EvSet`**

In `lib/types.ts`, find the `EvSet` interface (around line 182) and add `parent_set_code`:

```ts
export interface EvSet {
  _id: string;
  code: string;
  name: string;
  released_at: string;
  card_count: number;
  icon_svg_uri: string;
  set_type: string;
  scryfall_id: string;
  synced_at: string;
  parent_set_code?: string;     // ← NEW, optional: only present on child sets (tokens, promos, etc.)
  play_ev_net?: number | null;
  collector_ev_net?: number | null;
  cards_priced?: number;
  config_exists?: boolean;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "Extend EvSet with parent_set_code for token re-homing"
```

---

## Task 2: Extend `EvCard` type with sort-critical fields

**Files:**
- Modify: `lib/types.ts:198` (the `EvCard` interface)

- [ ] **Step 1: Add the five new fields**

In `lib/types.ts`, find the `EvCard` interface (around line 198) and add the new fields. The interface becomes:

```ts
export interface EvCard {
  _id: string;
  scryfall_id: string;
  set: string;
  name: string;
  collector_number: string;
  rarity: string;
  price_eur: number | null;
  price_eur_foil: number | null;
  finishes: string[];
  booster: boolean;
  image_uri: string | null;
  cardmarket_id: number | null;
  type_line: string;
  frame_effects: string[];
  promo_types: string[];
  border_color: string;
  treatment: string;
  prices_updated_at: string;
  synced_at: string;
  // Canonical-sort fields (added in sub-plan 1)
  colors: string[];             // ← NEW — mana-cost colors (rarely used for sort, kept for completeness)
  color_identity: string[];     // ← NEW — primary signal for the color-group bucket
  cmc: number;                  // ← NEW — mana value, stored raw
  released_at: string;          // ← NEW — mirror of set.released_at for sort stability
  layout: string;               // ← NEW — "normal", "token", "transform", "modal_dfc", "split", etc.
  pull_rate_per_box?: number;
  ev_contribution?: number;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: errors in `lib/ev.ts` because `syncCards` now builds a doc that doesn't satisfy the new required fields. **This is expected** — we fix it in Task 10. Leave the type changes in place for now.

If any OTHER files outside `lib/ev.ts` fail type-checking, stop and investigate.

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "Extend EvCard with canonical-sort fields"
```

---

## Task 3: Pure parser `parseScryfallCardToDoc` — write failing tests

**Files:**
- Create: `lib/__tests__/fixtures/scryfall-cards-sample.json`
- Create: `lib/__tests__/scryfall-bulk.test.ts`

- [ ] **Step 1: Create the fixture file**

`lib/__tests__/fixtures/scryfall-cards-sample.json` — paste exactly this content. These are simplified but schema-correct Scryfall card objects, one per edge case:

```json
[
  {
    "object": "card",
    "id": "aaaaaaaa-0000-0000-0000-000000000001",
    "name": "Lightning Bolt",
    "released_at": "2021-09-24",
    "layout": "normal",
    "set": "mh2",
    "set_type": "masters",
    "collector_number": "134",
    "rarity": "uncommon",
    "type_line": "Instant",
    "cmc": 1,
    "colors": ["R"],
    "color_identity": ["R"],
    "border_color": "black",
    "frame_effects": [],
    "promo_types": [],
    "finishes": ["nonfoil", "foil"],
    "booster": true,
    "prices": { "eur": "0.85", "eur_foil": "2.50" },
    "image_uris": { "small": "https://example.com/bolt-small.jpg" },
    "cardmarket_id": 123456
  },
  {
    "object": "card",
    "id": "aaaaaaaa-0000-0000-0000-000000000002",
    "name": "Delver of Secrets // Insectile Aberration",
    "released_at": "2021-09-24",
    "layout": "transform",
    "set": "mh2",
    "set_type": "masters",
    "collector_number": "42",
    "rarity": "common",
    "type_line": "Creature — Human Wizard // Creature — Human Insect",
    "cmc": 1,
    "colors": ["U"],
    "color_identity": ["U"],
    "border_color": "black",
    "frame_effects": ["sunmoondfc"],
    "promo_types": [],
    "finishes": ["nonfoil", "foil"],
    "booster": true,
    "prices": { "eur": null, "eur_foil": null },
    "card_faces": [
      { "image_uris": { "small": "https://example.com/delver-front.jpg" } },
      { "image_uris": { "small": "https://example.com/delver-back.jpg" } }
    ],
    "cardmarket_id": 234567
  },
  {
    "object": "card",
    "id": "aaaaaaaa-0000-0000-0000-000000000003",
    "name": "Soldier Token",
    "released_at": "2022-09-09",
    "layout": "token",
    "set": "tdmu",
    "set_type": "token",
    "collector_number": "4",
    "rarity": "common",
    "type_line": "Token Creature — Soldier",
    "cmc": 0,
    "colors": ["W"],
    "color_identity": ["W"],
    "border_color": "black",
    "frame_effects": [],
    "promo_types": [],
    "finishes": ["nonfoil"],
    "booster": false,
    "prices": { "eur": null, "eur_foil": null },
    "image_uris": { "small": "https://example.com/soldier.jpg" },
    "cardmarket_id": null
  },
  {
    "object": "card",
    "id": "aaaaaaaa-0000-0000-0000-000000000004",
    "name": "Sol Ring",
    "released_at": "2021-06-18",
    "layout": "normal",
    "set": "cmr",
    "set_type": "draft_innovation",
    "collector_number": "252",
    "rarity": "uncommon",
    "type_line": "Artifact",
    "cmc": 1,
    "colors": [],
    "color_identity": [],
    "border_color": "black",
    "frame_effects": [],
    "promo_types": [],
    "finishes": ["nonfoil", "foil"],
    "booster": true,
    "prices": { "eur": "1.20", "eur_foil": "3.50" },
    "image_uris": { "small": "https://example.com/solring.jpg" },
    "cardmarket_id": 345678
  },
  {
    "object": "card",
    "id": "aaaaaaaa-0000-0000-0000-000000000005",
    "name": "Forest",
    "released_at": "2022-09-09",
    "layout": "normal",
    "set": "dmu",
    "set_type": "expansion",
    "collector_number": "273",
    "rarity": "common",
    "type_line": "Basic Land — Forest",
    "cmc": 0,
    "colors": [],
    "color_identity": ["G"],
    "border_color": "black",
    "frame_effects": [],
    "promo_types": [],
    "finishes": ["nonfoil"],
    "booster": true,
    "prices": { "eur": "0.10", "eur_foil": null },
    "image_uris": { "small": "https://example.com/forest.jpg" },
    "cardmarket_id": 456789
  }
]
```

- [ ] **Step 2: Write the failing test file**

Create `lib/__tests__/scryfall-bulk.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import fixture from "./fixtures/scryfall-cards-sample.json";
import { parseScryfallCardToDoc } from "../scryfall-bulk";

describe("parseScryfallCardToDoc", () => {
  it("maps a standard single-face card with prices", () => {
    const now = "2026-04-11T00:00:00.000Z";
    const doc = parseScryfallCardToDoc(fixture[0], now);

    expect(doc.scryfall_id).toBe("aaaaaaaa-0000-0000-0000-000000000001");
    expect(doc.name).toBe("Lightning Bolt");
    expect(doc.set).toBe("mh2");
    expect(doc.collector_number).toBe("134");
    expect(doc.rarity).toBe("uncommon");
    expect(doc.cmc).toBe(1);
    expect(doc.colors).toEqual(["R"]);
    expect(doc.color_identity).toEqual(["R"]);
    expect(doc.type_line).toBe("Instant");
    expect(doc.layout).toBe("normal");
    expect(doc.released_at).toBe("2021-09-24");
    expect(doc.price_eur).toBe(0.85);
    expect(doc.price_eur_foil).toBe(2.50);
    expect(doc.image_uri).toBe("https://example.com/bolt-small.jpg");
    expect(doc.cardmarket_id).toBe(123456);
    expect(doc.finishes).toEqual(["nonfoil", "foil"]);
    expect(doc.booster).toBe(true);
    expect(doc.treatment).toBe("normal");
    expect(doc.synced_at).toBe(now);
    expect(doc.prices_updated_at).toBe(now);
  });

  it("falls back to card_faces[0].image_uris for DFC cards", () => {
    const doc = parseScryfallCardToDoc(fixture[1], "2026-04-11T00:00:00.000Z");
    expect(doc.image_uri).toBe("https://example.com/delver-front.jpg");
    expect(doc.layout).toBe("transform");
  });

  it("handles missing prices as null", () => {
    const doc = parseScryfallCardToDoc(fixture[1], "2026-04-11T00:00:00.000Z");
    expect(doc.price_eur).toBeNull();
    expect(doc.price_eur_foil).toBeNull();
  });

  it("parses a token card", () => {
    const doc = parseScryfallCardToDoc(fixture[2], "2026-04-11T00:00:00.000Z");
    expect(doc.layout).toBe("token");
    expect(doc.set).toBe("tdmu");
    expect(doc.type_line).toContain("Token");
  });

  it("parses a colorless artifact with empty colors arrays", () => {
    const doc = parseScryfallCardToDoc(fixture[3], "2026-04-11T00:00:00.000Z");
    expect(doc.colors).toEqual([]);
    expect(doc.color_identity).toEqual([]);
    expect(doc.type_line).toBe("Artifact");
  });

  it("parses a basic land with color_identity but empty colors", () => {
    const doc = parseScryfallCardToDoc(fixture[4], "2026-04-11T00:00:00.000Z");
    expect(doc.colors).toEqual([]);
    expect(doc.color_identity).toEqual(["G"]);
    expect(doc.type_line).toContain("Basic Land");
  });

  it("defaults missing array fields to empty arrays", () => {
    const stripped = {
      ...fixture[0],
      frame_effects: undefined,
      promo_types: undefined,
      colors: undefined,
      color_identity: undefined,
      finishes: undefined,
    };
    const doc = parseScryfallCardToDoc(stripped, "2026-04-11T00:00:00.000Z");
    expect(doc.frame_effects).toEqual([]);
    expect(doc.promo_types).toEqual([]);
    expect(doc.colors).toEqual([]);
    expect(doc.color_identity).toEqual([]);
    expect(doc.finishes).toEqual([]);
  });

  it("defaults missing cmc to 0", () => {
    const stripped = { ...fixture[0], cmc: undefined };
    const doc = parseScryfallCardToDoc(stripped, "2026-04-11T00:00:00.000Z");
    expect(doc.cmc).toBe(0);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL with `Cannot find module '../scryfall-bulk'` or similar — the module doesn't exist yet.

---

## Task 4: Implement `parseScryfallCardToDoc`

**Files:**
- Create: `lib/scryfall-bulk.ts`

- [ ] **Step 1: Create the module with the parser**

```ts
// lib/scryfall-bulk.ts
//
// Pure helpers for Scryfall bulk-data ingestion. The functions in this file do
// not touch MongoDB — they accept a `fetch`-like callable and return plain
// data, which keeps them unit-testable without network or DB.

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface EvCardDoc {
  scryfall_id: string;
  set: string;
  name: string;
  collector_number: string;
  rarity: string;
  price_eur: number | null;
  price_eur_foil: number | null;
  finishes: string[];
  booster: boolean;
  image_uri: string | null;
  cardmarket_id: number | null;
  type_line: string;
  frame_effects: string[];
  promo_types: string[];
  border_color: string;
  treatment: string;
  colors: string[];
  color_identity: string[];
  cmc: number;
  released_at: string;
  layout: string;
  prices_updated_at: string;
  synced_at: string;
}

function deriveCardTreatment(card: any): string {
  if (card.border_color === "borderless") return "borderless";
  const fe: string[] = card.frame_effects || [];
  if (fe.includes("showcase")) return "showcase";
  if (fe.includes("extendedart")) return "extended_art";
  const pt: string[] = card.promo_types || [];
  if (pt.includes("textured")) return "textured";
  if (pt.includes("serialized")) return "serialized";
  if (pt.includes("galaxyfoil")) return "galaxy_foil";
  if (pt.includes("surgefoil")) return "surge_foil";
  return "normal";
}

export function parseScryfallCardToDoc(card: any, nowIso: string): EvCardDoc {
  const imageUri =
    card.image_uris?.small ??
    card.card_faces?.[0]?.image_uris?.small ??
    null;

  const priceEur = card.prices?.eur ? parseFloat(card.prices.eur) : null;
  const priceEurFoil = card.prices?.eur_foil ? parseFloat(card.prices.eur_foil) : null;

  return {
    scryfall_id: card.id,
    set: card.set,
    name: card.name,
    collector_number: card.collector_number,
    rarity: card.rarity,
    price_eur: priceEur,
    price_eur_foil: priceEurFoil,
    finishes: card.finishes ?? [],
    booster: card.booster ?? false,
    image_uri: imageUri,
    cardmarket_id: card.cardmarket_id ?? null,
    type_line: card.type_line ?? "",
    frame_effects: card.frame_effects ?? [],
    promo_types: card.promo_types ?? [],
    border_color: card.border_color ?? "black",
    treatment: deriveCardTreatment(card),
    colors: card.colors ?? [],
    color_identity: card.color_identity ?? [],
    cmc: typeof card.cmc === "number" ? card.cmc : 0,
    released_at: card.released_at ?? "9999-12-31",
    layout: card.layout ?? "normal",
    prices_updated_at: nowIso,
    synced_at: nowIso,
  };
}
```

- [ ] **Step 2: Run the tests to verify they pass**

Run: `npm test`
Expected: 8 tests pass (the 7 listed in Task 3 plus any auto-discovered). Output includes `Tests  8 passed`.

- [ ] **Step 3: Commit**

```bash
git add lib/scryfall-bulk.ts lib/__tests__/scryfall-bulk.test.ts lib/__tests__/fixtures/scryfall-cards-sample.json
git commit -m "Add pure parseScryfallCardToDoc helper with tests"
```

---

## Task 5: Pure helper `findDefaultCardsEntry` — TDD

**Files:**
- Modify: `lib/__tests__/scryfall-bulk.test.ts`
- Create: `lib/__tests__/fixtures/scryfall-bulk-index.json`
- Modify: `lib/scryfall-bulk.ts`

- [ ] **Step 1: Create the fixture file**

`lib/__tests__/fixtures/scryfall-bulk-index.json`:

```json
{
  "object": "list",
  "has_more": false,
  "data": [
    {
      "object": "bulk_data",
      "id": "bulk-oracle-id",
      "type": "oracle_cards",
      "updated_at": "2026-04-11T06:00:00.000+00:00",
      "size": 111111111,
      "download_uri": "https://data.scryfall.io/oracle-cards/oracle-cards.json"
    },
    {
      "object": "bulk_data",
      "id": "bulk-default-id",
      "type": "default_cards",
      "updated_at": "2026-04-11T06:00:00.000+00:00",
      "size": 444444444,
      "download_uri": "https://data.scryfall.io/default-cards/default-cards.json"
    },
    {
      "object": "bulk_data",
      "id": "bulk-all-id",
      "type": "all_cards",
      "updated_at": "2026-04-11T06:00:00.000+00:00",
      "size": 888888888,
      "download_uri": "https://data.scryfall.io/all-cards/all-cards.json"
    }
  ]
}
```

- [ ] **Step 2: Add failing tests**

Append to `lib/__tests__/scryfall-bulk.test.ts`:

```ts
import bulkIndexFixture from "./fixtures/scryfall-bulk-index.json";
import { findDefaultCardsEntry } from "../scryfall-bulk";

describe("findDefaultCardsEntry", () => {
  it("returns the default_cards entry from a bulk-data index", () => {
    const entry = findDefaultCardsEntry(bulkIndexFixture);
    expect(entry.type).toBe("default_cards");
    expect(entry.download_uri).toBe("https://data.scryfall.io/default-cards/default-cards.json");
  });

  it("throws if no default_cards entry exists", () => {
    const noDefault = { ...bulkIndexFixture, data: bulkIndexFixture.data.filter((e: any) => e.type !== "default_cards") };
    expect(() => findDefaultCardsEntry(noDefault)).toThrow(/default_cards/);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: 2 new failures — `findDefaultCardsEntry is not defined`.

- [ ] **Step 4: Implement `findDefaultCardsEntry`**

Append to `lib/scryfall-bulk.ts`:

```ts
export interface ScryfallBulkEntry {
  object: "bulk_data";
  id: string;
  type: string;
  updated_at: string;
  size: number;
  download_uri: string;
}

export interface ScryfallBulkIndex {
  data: ScryfallBulkEntry[];
}

export function findDefaultCardsEntry(index: ScryfallBulkIndex): ScryfallBulkEntry {
  const entry = index.data.find((e) => e.type === "default_cards");
  if (!entry) throw new Error("Scryfall bulk-data index has no default_cards entry");
  return entry;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: all tests (including the 2 new ones) pass.

- [ ] **Step 6: Commit**

```bash
git add lib/scryfall-bulk.ts lib/__tests__/scryfall-bulk.test.ts lib/__tests__/fixtures/scryfall-bulk-index.json
git commit -m "Add findDefaultCardsEntry helper with tests"
```

---

## Task 6: Bulk-data index fetcher `fetchBulkDataIndex` — TDD

**Files:**
- Modify: `lib/__tests__/scryfall-bulk.test.ts`
- Modify: `lib/scryfall-bulk.ts`

- [ ] **Step 1: Add failing test that mocks fetch**

Append to `lib/__tests__/scryfall-bulk.test.ts`:

```ts
import { fetchBulkDataIndex } from "../scryfall-bulk";

describe("fetchBulkDataIndex", () => {
  it("fetches the /bulk-data endpoint and returns parsed JSON", async () => {
    const mockFetch = async (url: string, init?: RequestInit) => {
      expect(url).toBe("https://api.scryfall.com/bulk-data");
      expect(init?.headers).toMatchObject({ "User-Agent": expect.any(String) });
      return new Response(JSON.stringify(bulkIndexFixture), { status: 200 });
    };
    const index = await fetchBulkDataIndex(mockFetch as unknown as typeof fetch);
    expect(index.data).toHaveLength(3);
  });

  it("throws on non-2xx response", async () => {
    const mockFetch = async () => new Response("nope", { status: 503 });
    await expect(
      fetchBulkDataIndex(mockFetch as unknown as typeof fetch)
    ).rejects.toThrow(/503/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: 2 new failures — `fetchBulkDataIndex is not defined`.

- [ ] **Step 3: Implement `fetchBulkDataIndex`**

Append to `lib/scryfall-bulk.ts`:

```ts
const SCRYFALL_BASE = "https://api.scryfall.com";
const SCRYFALL_UA = "MISSTEP/1.0";

export async function fetchBulkDataIndex(
  fetchFn: typeof fetch = fetch
): Promise<ScryfallBulkIndex> {
  const res = await fetchFn(`${SCRYFALL_BASE}/bulk-data`, {
    headers: { "User-Agent": SCRYFALL_UA, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Scryfall bulk-data index fetch failed: ${res.status}`);
  }
  return (await res.json()) as ScryfallBulkIndex;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/scryfall-bulk.ts lib/__tests__/scryfall-bulk.test.ts
git commit -m "Add fetchBulkDataIndex with injectable fetch for tests"
```

---

## Task 7: Streaming bulk parser `streamBulkCards` — TDD

**Files:**
- Modify: `lib/__tests__/scryfall-bulk.test.ts`
- Modify: `lib/scryfall-bulk.ts`

- [ ] **Step 1: Add failing test using an in-memory readable stream**

The test feeds an in-memory `ReadableStream` containing the JSON array fixture (not gzipped — gzip handling is covered in the orchestrator test in Task 8). `streamBulkCards` accepts the stream directly, so we sidestep decompression here and test the JSON-parse + batch path in isolation.

Append to `lib/__tests__/scryfall-bulk.test.ts`:

```ts
import { streamBulkCards } from "../scryfall-bulk";

function jsonArrayStream(items: unknown[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const body = encoder.encode(JSON.stringify(items));
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(body);
      controller.close();
    },
  });
}

describe("streamBulkCards", () => {
  it("parses the JSON array and delivers cards in batches", async () => {
    const stream = jsonArrayStream(fixture);
    const batches: unknown[][] = [];
    await streamBulkCards(stream, {
      batchSize: 2,
      onBatch: async (batch) => {
        batches.push(batch);
      },
    });

    // 5 fixture cards with batchSize 2 → batches of 2, 2, 1
    expect(batches).toHaveLength(3);
    expect(batches[0]).toHaveLength(2);
    expect(batches[1]).toHaveLength(2);
    expect(batches[2]).toHaveLength(1);

    const allCards = batches.flat() as Array<{ scryfall_id: string }>;
    expect(allCards).toHaveLength(5);
    expect(allCards[0].scryfall_id).toBe("aaaaaaaa-0000-0000-0000-000000000001");
    expect(allCards[4].scryfall_id).toBe("aaaaaaaa-0000-0000-0000-000000000005");
  });

  it("returns total processed count", async () => {
    const stream = jsonArrayStream(fixture);
    const result = await streamBulkCards(stream, {
      batchSize: 10,
      onBatch: async () => {},
    });
    expect(result.processed).toBe(5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: 2 new failures — `streamBulkCards is not defined`.

- [ ] **Step 3: Implement `streamBulkCards`**

Append to `lib/scryfall-bulk.ts`:

```ts
// eslint-disable-next-line @typescript-eslint/no-require-imports
const StreamArray = require("stream-json/streamers/StreamArray");
import { Readable } from "node:stream";

export interface StreamBulkCardsOptions {
  batchSize: number;
  onBatch: (batch: EvCardDoc[]) => Promise<void>;
  now?: string;
}

export async function streamBulkCards(
  body: ReadableStream<Uint8Array>,
  opts: StreamBulkCardsOptions
): Promise<{ processed: number }> {
  const nowIso = opts.now ?? new Date().toISOString();
  // Adapt the Web ReadableStream (from fetch().body) to a Node Readable.
  // Node 18+ provides Readable.fromWeb. The cast silences a variance error
  // between lib.dom and node stream types.
  const nodeStream = Readable.fromWeb(body as any);

  // StreamArray.withParser() returns a single transform that includes the
  // JSON tokenizer AND the array-element streamer — do NOT chain a separate
  // parser() before it or each element will be double-parsed.
  const pipeline = nodeStream.pipe(StreamArray.withParser());

  let batch: EvCardDoc[] = [];
  let processed = 0;

  for await (const chunk of pipeline as AsyncIterable<{ key: number; value: unknown }>) {
    const doc = parseScryfallCardToDoc(chunk.value, nowIso);
    batch.push(doc);
    processed++;
    if (batch.length >= opts.batchSize) {
      await opts.onBatch(batch);
      batch = [];
    }
  }
  if (batch.length > 0) {
    await opts.onBatch(batch);
  }
  return { processed };
}
```

Note on the `require` for `StreamArray`: `stream-json` v1 ships as CommonJS and its submodule exports don't play well with TypeScript's ESM default-import resolution. Using `require` with an eslint-disable is the simplest path and matches stream-json's own documented usage. If you see a TypeScript error on the `require` line, ensure `tsconfig.json` has `"esModuleInterop": true` and `"allowSyntheticDefaultImports": true` — both are Next.js defaults.

- [ ] **Step 4: Add a type shim for `stream-json` if needed**

`stream-json` ships JS with bundled types; if TypeScript complains about missing declarations, add this line at the top of `lib/scryfall-bulk.ts` (below the eslint-disable):

```ts
// @ts-expect-error — stream-json types are incomplete for the submodules we import
```

Only add it if the type-check in Step 5 fails.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: all tests pass. Also run `npx tsc --noEmit` and confirm the new file has no errors (errors elsewhere in `lib/ev.ts` from Task 2 are still expected).

- [ ] **Step 6: Commit**

```bash
git add lib/scryfall-bulk.ts lib/__tests__/scryfall-bulk.test.ts
git commit -m "Add streaming bulk-data parser with stream-json"
```

---

## Task 8: Orchestrator `refreshAllScryfall` in `lib/ev.ts`

**Files:**
- Modify: `lib/ev.ts`

This task does not add a dedicated unit test — the orchestrator pulls together network fetch, gzip decompression, stream parsing, and MongoDB writes, and meaningful coverage requires an end-to-end integration with real Scryfall or a recorded response. The pieces it composes (`parseScryfallCardToDoc`, `findDefaultCardsEntry`, `fetchBulkDataIndex`, `streamBulkCards`) are each already covered. Manual verification in Task 13 exercises the orchestrator against real Scryfall.

- [ ] **Step 1: Add the orchestrator function to `lib/ev.ts`**

At the end of `lib/ev.ts`, below the last existing export, add:

```ts
// ── Scryfall Sync: Full Catalog (bulk data) ────────────────────

import {
  fetchBulkDataIndex,
  findDefaultCardsEntry,
  streamBulkCards,
} from "@/lib/scryfall-bulk";

export async function refreshAllScryfall(): Promise<{
  setsUpserted: number;
  cardsUpserted: number;
  durationMs: number;
}> {
  const started = Date.now();
  await ensureIndexes();

  // 1. Refresh sets (full catalog — filter dropped in Task 9)
  const setResult = await syncSets();
  const setsUpserted = setResult.added + setResult.updated;

  // 2. Fetch bulk-data index and locate default_cards
  const index = await fetchBulkDataIndex();
  const entry = findDefaultCardsEntry(index);

  // 3. Download + decompress stream
  const fileRes = await fetch(entry.download_uri, {
    headers: { "User-Agent": SCRYFALL_UA },
  });
  if (!fileRes.ok || !fileRes.body) {
    throw new Error(`Scryfall bulk-data download failed: ${fileRes.status}`);
  }

  // Scryfall ships the bulk JSON ungzipped at the CDN URL; DecompressionStream
  // is a no-op unless the CDN decides to start gzipping. Use the raw body.
  const body = fileRes.body;

  // 4. Stream-parse and bulk-upsert
  const db = await getDb();
  const col = db.collection(COL_CARDS);
  let cardsUpserted = 0;

  await streamBulkCards(body, {
    batchSize: 1000,
    onBatch: async (batch) => {
      const ops = batch.map((doc) => ({
        updateOne: {
          filter: { scryfall_id: doc.scryfall_id },
          update: { $set: doc },
          upsert: true,
        },
      }));
      const result = await col.bulkWrite(ops, { ordered: false });
      cardsUpserted += (result.upsertedCount ?? 0) + (result.modifiedCount ?? 0);
    },
  });

  return {
    setsUpserted,
    cardsUpserted,
    durationMs: Date.now() - started,
  };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: errors in `lib/ev.ts` from the pre-existing `syncCards` missing the new EvCard fields (Task 2's expected break). **No new errors in `refreshAllScryfall` itself.**

- [ ] **Step 3: Commit**

```bash
git add lib/ev.ts
git commit -m "Add refreshAllScryfall orchestrator using bulk data"
```

---

## Task 9: Drop filter from `syncSets`, capture `parent_set_code`

**Files:**
- Modify: `lib/ev.ts:102-140`

- [ ] **Step 1: Remove the `isRelevantSet` filter and capture new set fields**

Replace lines 102-140 of `lib/ev.ts` (from `function isRelevantSet` through the end of `syncSets`) with:

```ts
// NOTE: isRelevantSet removed — EV-specific filtering moved to getSets (read time)
// so canonical-sort can see every set while the EV UI remains unchanged.

export async function syncSets(): Promise<{ added: number; updated: number }> {
  await ensureIndexes();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = (await scryfallGet("/sets")) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sets = res.data as any[];
  const db = await getDb();
  const col = db.collection(COL_SETS);
  const now = new Date().toISOString();
  let added = 0, updated = 0;

  for (const s of sets) {
    const result = await col.updateOne(
      { code: s.code },
      {
        $set: {
          name: s.name,
          released_at: s.released_at,
          card_count: s.card_count,
          icon_svg_uri: s.icon_svg_uri,
          set_type: s.set_type,
          scryfall_id: s.id,
          parent_set_code: s.parent_set_code ?? null,
          digital: s.digital ?? false,
          synced_at: now,
        },
      },
      { upsert: true }
    );
    if (result.upsertedCount) added++;
    else if (result.modifiedCount) updated++;
  }
  return { added, updated };
}
```

Notes on what changed:
- Deleted the `isRelevantSet` helper entirely.
- Removed the `.filter(isRelevantSet)` call.
- Added `parent_set_code` (for token re-homing in sub-plan 2) and `digital` (read-time filter signal).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: same pre-existing errors from `syncCards` field mismatch; no new errors.

- [ ] **Step 3: Commit**

```bash
git add lib/ev.ts
git commit -m "Drop BOOSTER_SET_TYPES filter from syncSets, capture parent_set_code"
```

---

## Task 10: Add read-time filter in `getSets`, expose `getAllSets`

**Files:**
- Modify: `lib/ev.ts:142-183`

- [ ] **Step 1: Add the read-time filter and a new `getAllSets` export**

Replace lines 142-183 (the `getSets` function) with two functions:

```ts
export async function getSets(): Promise<EvSet[]> {
  await ensureIndexes();
  const db = await getDb();

  // Read-time filter: EV calculator UI only wants booster sets released in 2020+,
  // excluding digital-only. The underlying collection may contain every Scryfall set
  // (since refreshAllScryfall populates the full catalog for canonical sort).
  const sets = await db
    .collection(COL_SETS)
    .find({
      set_type: { $in: Array.from(BOOSTER_SET_TYPES) },
      released_at: { $gte: `${MIN_RELEASE_YEAR}-01-01` },
      $or: [{ digital: { $ne: true } }, { digital: { $exists: false } }],
    })
    .sort({ released_at: -1 })
    .toArray();

  // Enrich with latest snapshot EV and config existence
  const configCodes = await db
    .collection(COL_CONFIG)
    .find({}, { projection: { set_code: 1 } })
    .toArray();
  const configSet = new Set(configCodes.map((c) => c.set_code));

  // Check which sets have jumpstart themes in DB
  const jumpstartCodes = await db
    .collection(COL_JUMPSTART_THEMES)
    .aggregate([
      { $group: { _id: "$set_code" } },
    ])
    .toArray();
  const jumpstartSet = new Set(jumpstartCodes.map((c) => c._id));

  // Get latest snapshot per set
  const latestSnapshots = await db
    .collection(COL_SNAPSHOTS)
    .aggregate([
      { $sort: { date: -1 } },
      { $group: { _id: "$set_code", doc: { $first: "$$ROOT" } } },
    ])
    .toArray();
  const snapMap = new Map(latestSnapshots.map((s) => [s._id, s.doc]));

  return sets.map((s) => {
    const snap = snapMap.get(s.code);
    return {
      ...s,
      _id: s._id.toString(),
      config_exists: configSet.has(s.code) || jumpstartSet.has(s.code) || s.code in JUMPSTART_SEED_DATA,
      play_ev_net: snap?.play_ev_net ?? null,
      collector_ev_net: snap?.collector_ev_net ?? null,
    } as EvSet;
  });
}

/**
 * Unfiltered set list — used by canonical-sort in sub-plan 2.
 * Returns every set in the collection, sorted chronologically (oldest first).
 */
export async function getAllSets(): Promise<EvSet[]> {
  await ensureIndexes();
  const db = await getDb();
  const sets = await db
    .collection(COL_SETS)
    .find()
    .sort({ released_at: 1 })
    .toArray();
  return sets.map((s) => ({ ...s, _id: s._id.toString() }) as EvSet);
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors (the pre-existing `syncCards` errors are still there).

- [ ] **Step 3: Commit**

```bash
git add lib/ev.ts
git commit -m "Filter EV set list at read time, add getAllSets for canonical sort"
```

---

## Task 11: Extend `syncCards` with new fields

**Files:**
- Modify: `lib/ev.ts:195-245`

- [ ] **Step 1: Add the five new fields to the doc assembly**

In `lib/ev.ts`, locate the `syncCards` function (around line 195). Inside the `for (const card of page.data as any[])` loop, the `const doc = { ... }` assembly builds the upsert document. Replace that `doc` literal with:

```ts
      const doc = {
        scryfall_id: card.id,
        set: card.set,
        name: card.name,
        collector_number: card.collector_number,
        rarity: card.rarity,
        price_eur: card.prices?.eur ? parseFloat(card.prices.eur) : null,
        price_eur_foil: card.prices?.eur_foil ? parseFloat(card.prices.eur_foil) : null,
        finishes: card.finishes || [],
        booster: card.booster ?? false,
        image_uri: card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small || null,
        cardmarket_id: card.cardmarket_id ?? null,
        type_line: card.type_line || "",
        frame_effects: card.frame_effects || [],
        promo_types: card.promo_types || [],
        border_color: card.border_color || "black",
        treatment,
        // Canonical-sort fields
        colors: card.colors ?? [],
        color_identity: card.color_identity ?? [],
        cmc: typeof card.cmc === "number" ? card.cmc : 0,
        released_at: card.released_at ?? "9999-12-31",
        layout: card.layout ?? "normal",
        prices_updated_at: now,
        synced_at: now,
      };
```

This keeps the per-set `syncCards` in lockstep with `parseScryfallCardToDoc` in `lib/scryfall-bulk.ts`. (They could share the helper — noted as a DRY refactor candidate, but keeping them separate for this sub-plan to avoid touching the hot path of the per-set price refresh in case the shared helper has any behavior deltas we haven't caught.)

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: **zero errors**. The pre-existing Task 2 errors should now be resolved because `syncCards` produces a fully-populated `EvCard` doc.

If any errors remain, read them carefully — they likely indicate a field typo.

- [ ] **Step 3: Commit**

```bash
git add lib/ev.ts
git commit -m "Add canonical-sort fields to per-set syncCards"
```

---

## Task 12: `POST /api/ev/sync-all` route

**Files:**
- Create: `app/api/ev/sync-all/route.ts`

- [ ] **Step 1: Create the route file**

```ts
// app/api/ev/sync-all/route.ts
import { after } from "next/server";
import { withAuth } from "@/lib/api-helpers";
import { refreshAllScryfall } from "@/lib/ev";
import { logActivity } from "@/lib/activity";
import type { DashboardSession } from "@/lib/types";

export const POST = withAuth(async (_req, session) => {
  // withAuth passes a plain next-auth Session; cast to DashboardSession to
  // access the `id` field our auth callbacks attach.
  const s = session as DashboardSession;
  const result = await refreshAllScryfall();

  after(() =>
    logActivity({
      action: "ev.scryfall.sync_all",
      entity_type: "ev_card",
      details: `sets=${result.setsUpserted} cards=${result.cardsUpserted} durationMs=${result.durationMs}`,
      user_id: s.user.id,
      user_name: s.user.name ?? "unknown",
    }).catch(() => {})
  );

  return result;
}, "POST /api/ev/sync-all");
```

Note on `logActivity`: the call above assumes `logActivity` accepts an object matching `ActivityLogEntry` from `lib/types.ts:9` (minus the `timestamp`, which is typically added inside the logger). **Before running Step 2**, open `lib/activity.ts` and look at the `logActivity` function's exported signature. If it takes positional arguments or a different object shape, adapt the call site to match — do NOT modify `lib/activity.ts`. This is the one place in this plan where you need to look at a file outside the modified-files list, because the plan was written without inspecting that specific helper.

- [ ] **Step 2: Verify `logActivity` signature matches**

Run:
```bash
npx tsc --noEmit
```

Expected: no errors. If `logActivity` has a different signature in `lib/activity.ts`, adjust the call site to match — do NOT change `lib/activity.ts`. The `action`, `entity_type`, `details`, `user_id`, `user_name` fields come from the `ActivityLogEntry` type in `lib/types.ts:9` — confirm the call matches that shape.

- [ ] **Step 3: Dev smoke test — server starts**

Run: `npm run dev`
Expected: server starts on port 3025, no startup errors. Ctrl-C to stop.

- [ ] **Step 4: Commit**

```bash
git add app/api/ev/sync-all/route.ts
git commit -m "Add POST /api/ev/sync-all route"
```

---

## Task 13: Manual verification

This task is not TDD — it's the end-to-end verification that the full pipeline works against real Scryfall and real MongoDB. Do each step in order and stop at any failure.

- [ ] **Step 1: Capture baseline card count**

Open a Mongo shell or the driver of your choice and run:
```js
db.dashboard_ev_cards.countDocuments()
```
Record the result as `BEFORE_COUNT`.

- [ ] **Step 2: Run the dev server**

```bash
npm run dev
```

Leave it running in one terminal. Open a second terminal for the remaining steps.

- [ ] **Step 3: Log in**

Open `http://localhost:3025/login` in a browser and sign in with the dashboard PIN so the session cookie is set.

- [ ] **Step 4: Trigger the sync**

From the browser's devtools console (while on any dashboard page so the session cookie is attached):

```js
await fetch("/api/ev/sync-all", { method: "POST" }).then(r => r.json())
```

Expected: response like `{ setsUpserted: 900, cardsUpserted: 105000, durationMs: 180000 }` (exact numbers vary). The call may take 2-5 minutes. If the request hangs beyond 10 minutes, kill the dev server and investigate.

- [ ] **Step 5: Verify the card count jumped**

Re-run in the Mongo shell:
```js
db.dashboard_ev_cards.countDocuments()
```
Expected: substantially larger than `BEFORE_COUNT` (~100k range).

- [ ] **Step 6: Verify new fields are populated**

Run in the Mongo shell:
```js
db.dashboard_ev_cards.findOne({ set: "dmu" }, { name: 1, colors: 1, color_identity: 1, cmc: 1, released_at: 1, layout: 1 })
```

Expected: document has all five new fields populated.

- [ ] **Step 7: Verify `parent_set_code` on a token set**

```js
db.dashboard_ev_sets.findOne({ set_type: "token" }, { code: 1, parent_set_code: 1 })
```

Expected: a doc with `parent_set_code` pointing at a regular set code (e.g., `parent_set_code: "dmu"`).

- [ ] **Step 8: Verify EV calculator UI is unaffected**

Open `http://localhost:3025/ev` in the browser.
Expected: the set picker shows the same sets it showed before (booster sets from 2020 onward). If pre-2020 or non-booster sets now appear in the EV picker, Task 10's read-time filter is wrong — revisit.

- [ ] **Step 9: Verify a per-set price refresh still works**

On the EV calculator page, pick a set and click its refresh-prices button (whichever button currently triggers `syncCards` for a single set).
Expected: no errors, prices update.

- [ ] **Step 10: Commit nothing — this is just verification**

If all steps pass, sub-plan 1 is complete and ready for code review before moving on to sub-plan 2 (pure sort + flow + override core).

---

## Self-Review Checklist

When implementing, re-read this plan from the top and confirm:

- [ ] Every modified line matches one of the Task 9/10/11 patches exactly — no ad-hoc edits to `lib/ev.ts` outside those tasks.
- [ ] `parseScryfallCardToDoc` in `lib/scryfall-bulk.ts` and the inline doc assembly in `syncCards` produce **the same shape**. Any field in one must be in the other.
- [ ] `BOOSTER_SET_TYPES` and `MIN_RELEASE_YEAR` are still declared at the top of `lib/ev.ts` (they're used by `getSets` now, not `syncSets`). Don't delete them.
- [ ] The `test` script in `package.json` runs `vitest run`, and CI (if any) can invoke it without extra setup.
- [ ] No code outside the files listed in "File Structure" has been touched.

## Exit Criteria

Sub-plan 1 is done when:

1. `npm test` passes all tests (from Tasks 3-7).
2. `npx tsc --noEmit` reports zero errors.
3. `npm run build` succeeds.
4. Manual verification (Task 13) completes without errors.
5. `dashboard_ev_cards.countDocuments()` returns ~100k (full Scryfall catalog).
6. The EV calculator set picker at `/ev` shows the same sets it showed before the sync.

Once these are all green, sub-plan 2 can start: pure sort + flow + override core in `lib/storage.ts`.
