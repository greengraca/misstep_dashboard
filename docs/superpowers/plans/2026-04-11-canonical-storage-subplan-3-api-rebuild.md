# Canonical Storage — Sub-Plan 3: API Routes + Rebuild Pipeline + Collection Schema

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire sub-plan 2's pure core (`lib/storage.ts`) through to MongoDB and expose it as REST API routes. Adds the rebuild orchestrator, Mongo indexes, transactional slot collection swap, and nine `/api/storage/*` endpoints. No UI — the feature becomes curl-accessible.

**Architecture:** A new module `lib/storage-db.ts` handles all MongoDB interaction for the storage feature: loads stock/cards/sets, runs the pure core, writes results via transactional scratch-collection swap, and provides read helpers for paginated slot queries and stats aggregations. API routes are thin wrappers over `lib/storage-db.ts` functions, using the existing `withAuth`/`withAuthRead` helpers from `lib/api-helpers.ts`.

**Tech Stack:** Next.js 16 App Router, MongoDB native driver 7, Vitest for the one testable pure helper. No new dependencies.

---

## File Structure

**New files:**

| Path | Responsibility |
|---|---|
| `lib/storage-db.ts` | DB integration layer. Exports `rebuildStorageSlots`, `queryStorageSlots`, `getStorageStats`, layout CRUD, override CRUD. |
| `lib/__tests__/storage-db.test.ts` | Unit tests for the pure projection helpers that convert DB docs → pure core inputs. |
| `scripts/storage-indexes.ts` | One-shot migration script to create the Mongo indexes for the new collections. |
| `app/api/storage/rebuild/route.ts` | POST — runs the rebuild orchestrator, returns counts. |
| `app/api/storage/slots/route.ts` | GET — paginated + filtered slot query. |
| `app/api/storage/stats/route.ts` | GET — aggregate stats. |
| `app/api/storage/layout/route.ts` | GET + PUT layout config. |
| `app/api/storage/overrides/route.ts` | GET + POST overrides. |
| `app/api/storage/overrides/[id]/route.ts` | DELETE one override. |
| `app/api/storage/overrides/clear-stale/route.ts` | POST — bulk-delete stale overrides. |

**No existing files are modified** except `lib/constants.ts` may get new collection name constants (or they can live inside `lib/storage-db.ts` — decide in Task 1).

## Collection schemas (reference)

All collections prefixed with `dashboard_`.

- `dashboard_storage_slots` — one doc per `PlacedCell` (either a `PlacedSlot` or `EmptyReservedCell`). Lives as the source of truth for `/storage` reads. Wiped and re-populated atomically on every rebuild.
- `dashboard_storage_slots_next` — scratch collection used during rebuild. Written, validated, then swapped with the live collection via `renameCollection({ dropTarget: true })`.
- `dashboard_storage_layout` — singleton doc, `_id: "current"`. Holds the shelf-row → box structure.
- `dashboard_storage_overrides` — one doc per `CutOverride`. Holds user drag overrides.
- `dashboard_storage_rebuild_log` — small append-only log of rebuild runs (duration, counts, unmatched summary). Used for the "last rebuild at" display and debugging.

## Mongo indexes

Created by `scripts/storage-indexes.ts` (idempotent — all `createIndex` calls ignore "already exists" errors).

- `dashboard_storage_slots`:
  - `{ position: 1 }` unique, name `position_unique`
  - `{ shelfRowIndex: 1, boxIndexInRow: 1, boxRowIndex: 1, positionInBoxRow: 1 }` name `placement_compound`
  - `{ set: 1 }` name `set_idx`
  - `{ colorGroup: 1 }` name `color_idx`
  - `{ variantKey: 1 }` name `variant_idx`
  - Text index on `{ name: "text" }` name `name_text`
- `dashboard_storage_layout`: `{ _id: 1 }` is automatic. No additional indexes.
- `dashboard_storage_overrides`:
  - `{ anchorSlotKey: 1 }` name `anchor_idx`
  - `{ targetBoxId: 1 }` name `target_idx`
  - `{ lastStatus: 1 }` name `status_idx`
- `dashboard_storage_rebuild_log`: `{ startedAt: -1 }` name `started_desc`

---

## Task 1: Mongo index migration script + constants

**Files:**
- Create: `scripts/storage-indexes.ts`

- [ ] **Step 1.1: Create the migration script**

```ts
// scripts/storage-indexes.ts
//
// One-shot migration to create indexes on the dashboard_storage_* collections.
// Idempotent — run it whenever. Safe to re-run.
//
// Usage: npx tsx scripts/storage-indexes.ts

import { getDb } from "../lib/mongodb";

const COL_SLOTS = "dashboard_storage_slots";
const COL_LAYOUT = "dashboard_storage_layout";
const COL_OVERRIDES = "dashboard_storage_overrides";
const COL_REBUILD_LOG = "dashboard_storage_rebuild_log";

async function safeCreateIndex(
  col: ReturnType<Awaited<ReturnType<typeof getDb>>["collection"]>,
  spec: Record<string, 1 | -1 | "text">,
  options: { name: string; unique?: boolean }
): Promise<void> {
  try {
    await col.createIndex(spec, options);
    console.log(`  + ${options.name}`);
  } catch (err) {
    // Index already exists or conflicts — log and continue.
    console.log(`  = ${options.name} (${(err as Error).message})`);
  }
}

async function main() {
  const db = await getDb();

  console.log("dashboard_storage_slots:");
  const slots = db.collection(COL_SLOTS);
  await safeCreateIndex(slots, { position: 1 }, { name: "position_unique", unique: true });
  await safeCreateIndex(
    slots,
    { shelfRowIndex: 1, boxIndexInRow: 1, boxRowIndex: 1, positionInBoxRow: 1 },
    { name: "placement_compound" }
  );
  await safeCreateIndex(slots, { set: 1 }, { name: "set_idx" });
  await safeCreateIndex(slots, { colorGroup: 1 }, { name: "color_idx" });
  await safeCreateIndex(slots, { variantKey: 1 }, { name: "variant_idx" });
  await safeCreateIndex(slots, { name: "text" }, { name: "name_text" });

  console.log("dashboard_storage_overrides:");
  const overrides = db.collection(COL_OVERRIDES);
  await safeCreateIndex(overrides, { anchorSlotKey: 1 }, { name: "anchor_idx" });
  await safeCreateIndex(overrides, { targetBoxId: 1 }, { name: "target_idx" });
  await safeCreateIndex(overrides, { lastStatus: 1 }, { name: "status_idx" });

  console.log("dashboard_storage_rebuild_log:");
  const log = db.collection(COL_REBUILD_LOG);
  await safeCreateIndex(log, { startedAt: -1 }, { name: "started_desc" });

  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 1.2: Verify `tsx` is available**

Run: `npx tsx --version`
Expected: version string. If not installed, run `npm install --save-dev tsx` and commit that separately before continuing. If `tsx` is already installed, skip the install step.

- [ ] **Step 1.3: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 1.4: Commit**

```bash
git add scripts/storage-indexes.ts
git commit -m "Add storage collection index migration script"
```

---

## Task 2: `lib/storage-db.ts` skeleton + pure projection helpers

**Files:**
- Create: `lib/storage-db.ts`
- Create: `lib/__tests__/storage-db.test.ts`

The module starts with constants and two pure helpers that project DB documents into the shapes sub-plan 2's core expects. These are the only unit-tested functions in sub-plan 3 — everything else is DB plumbing and is verified manually via curl in Task 9.

- [ ] **Step 2.1: Write failing tests first**

Create `lib/__tests__/storage-db.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { projectStockRow, projectCardMeta, projectSetMeta } from "../storage-db";

describe("projectStockRow", () => {
  it("reduces a CmStockListing to (name, set, qty)", () => {
    const cm = {
      _id: "abc",
      name: "Sol Ring",
      set: "cmr",
      qty: 3,
      price: 1.5,
      condition: "NM",
      language: "English",
      foil: false,
      dedupKey: "Sol Ring|3|1.5|NM|false|cmr",
      source: "stock_page" as const,
    };
    expect(projectStockRow(cm)).toEqual({ name: "Sol Ring", set: "cmr", qty: 3 });
  });
});

describe("projectCardMeta", () => {
  it("reduces an EvCard to the sort-critical fields", () => {
    const ev = {
      _id: "abc",
      scryfall_id: "x",
      set: "dmu",
      name: "Liliana",
      collector_number: "97",
      rarity: "mythic",
      price_eur: null,
      price_eur_foil: null,
      finishes: ["nonfoil"],
      booster: true,
      image_uri: "https://example.com/x.jpg",
      cardmarket_id: null,
      type_line: "Legendary Planeswalker — Liliana",
      frame_effects: [],
      promo_types: [],
      border_color: "black",
      treatment: "normal",
      prices_updated_at: "2026-04-11T00:00:00Z",
      synced_at: "2026-04-11T00:00:00Z",
      colors: ["B"],
      color_identity: ["B"],
      cmc: 3,
      released_at: "2022-09-09",
      layout: "normal",
    };
    expect(projectCardMeta(ev)).toEqual({
      name: "Liliana",
      set: "dmu",
      collector_number: "97",
      rarity: "mythic",
      type_line: "Legendary Planeswalker — Liliana",
      colors: ["B"],
      color_identity: ["B"],
      cmc: 3,
      layout: "normal",
      image_uri: "https://example.com/x.jpg",
      released_at: "2022-09-09",
    });
  });

  it("defaults missing optional fields safely", () => {
    const ev = {
      _id: "abc",
      scryfall_id: "x",
      set: "old",
      name: "Ancient",
      collector_number: "1",
      rarity: "common",
      price_eur: null,
      price_eur_foil: null,
      finishes: [],
      booster: false,
      image_uri: null,
      cardmarket_id: null,
      type_line: "Creature",
      frame_effects: [],
      promo_types: [],
      border_color: "black",
      treatment: "normal",
      prices_updated_at: "2026-04-11T00:00:00Z",
      synced_at: "2026-04-11T00:00:00Z",
      colors: [],
      color_identity: [],
      cmc: 0,
      released_at: "1993-08-05",
      layout: "normal",
    };
    expect(projectCardMeta(ev).image_uri).toBeNull();
    expect(projectCardMeta(ev).color_identity).toEqual([]);
  });
});

describe("projectSetMeta", () => {
  it("reduces an EvSet to (code, name, released_at, set_type, parent_set_code)", () => {
    const ev = {
      _id: "abc",
      code: "dmu",
      name: "Dominaria United",
      released_at: "2022-09-09",
      card_count: 281,
      icon_svg_uri: "https://example.com/dmu.svg",
      set_type: "expansion",
      scryfall_id: "ss",
      parent_set_code: null,
      synced_at: "2026-04-11T00:00:00Z",
    };
    expect(projectSetMeta(ev)).toEqual({
      code: "dmu",
      name: "Dominaria United",
      released_at: "2022-09-09",
      set_type: "expansion",
      parent_set_code: null,
    });
  });

  it("preserves parent_set_code when present (token sets)", () => {
    const ev = {
      _id: "abc",
      code: "tdmu",
      name: "Dominaria United Tokens",
      released_at: "2022-09-09",
      card_count: 12,
      icon_svg_uri: "https://example.com/tdmu.svg",
      set_type: "token",
      scryfall_id: "ss",
      parent_set_code: "dmu",
      synced_at: "2026-04-11T00:00:00Z",
    };
    expect(projectSetMeta(ev).parent_set_code).toBe("dmu");
  });
});
```

- [ ] **Step 2.2: Run tests to confirm failure**

Run: `npm test`
Expected: failures on missing `../storage-db` module.

- [ ] **Step 2.3: Create `lib/storage-db.ts` with constants and projection helpers**

```ts
// lib/storage-db.ts
//
// DB integration layer for the canonical-storage feature. Composes the pure
// core in lib/storage.ts with MongoDB reads and writes.

import type { CmStockListing, EvCard, EvSet } from "@/lib/types";
import type {
  StockRow,
  CardMeta,
  SetMeta,
} from "@/lib/storage";

// ── Collection names ───────────────────────────────────────────

export const COL_STORAGE_SLOTS = "dashboard_storage_slots";
export const COL_STORAGE_SLOTS_NEXT = "dashboard_storage_slots_next";
export const COL_STORAGE_LAYOUT = "dashboard_storage_layout";
export const COL_STORAGE_OVERRIDES = "dashboard_storage_overrides";
export const COL_STORAGE_REBUILD_LOG = "dashboard_storage_rebuild_log";

// Existing collections we read from
const COL_CM_STOCK = "dashboard_cm_stock";
const COL_EV_CARDS = "dashboard_ev_cards";
const COL_EV_SETS = "dashboard_ev_sets";

// ── Pure projection helpers ────────────────────────────────────

export function projectStockRow(cm: CmStockListing): StockRow {
  return { name: cm.name, set: cm.set, qty: cm.qty };
}

export function projectCardMeta(ev: EvCard): CardMeta {
  return {
    name: ev.name,
    set: ev.set,
    collector_number: ev.collector_number,
    rarity: ev.rarity,
    type_line: ev.type_line,
    colors: ev.colors,
    color_identity: ev.color_identity,
    cmc: ev.cmc,
    layout: ev.layout,
    image_uri: ev.image_uri,
    released_at: ev.released_at,
  };
}

export function projectSetMeta(ev: EvSet): SetMeta {
  return {
    code: ev.code,
    name: ev.name,
    released_at: ev.released_at,
    set_type: ev.set_type,
    parent_set_code: ev.parent_set_code ?? null,
  };
}
```

- [ ] **Step 2.4: Run tests + type-check**

Run: `npm test`
Expected: all tests pass including the 4 new projection tests. Total ~82.

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 2.5: Commit**

```bash
git add lib/storage-db.ts lib/__tests__/storage-db.test.ts
git commit -m "Add storage-db module with pure DB projection helpers"
```

---

## Task 3: `rebuildStorageSlots` orchestrator

**Files:**
- Modify: `lib/storage-db.ts`

The rebuild orchestrator is the beating heart of sub-plan 3. It loads inputs from Mongo, runs the pure core, and swaps the live collection transactionally.

- [ ] **Step 3.1: Append to `lib/storage-db.ts`**

```ts
import { getDb } from "@/lib/mongodb";
import {
  computeCanonicalSort,
  applyOverrides,
  type ShelfLayout,
  type CutOverride,
  type PlacedCell,
  type StaleOverrideReport,
  type UnmatchedVariant,
} from "@/lib/storage";

// ── Rebuild orchestrator ───────────────────────────────────────

export interface RebuildCounts {
  stockRows: number;
  variantsMatched: number;
  variantsUnmatched: number;
  slots: number;
  placedSlots: number;
  unplacedSlots: number;
  spansShelfRowCount: number;
}

export interface RebuildResult {
  durationMs: number;
  counts: RebuildCounts;
  overrides: {
    applied: number;
    staleMissingSlot: StaleOverrideReport[];
    staleMissingTarget: StaleOverrideReport[];
    staleRegression: StaleOverrideReport[];
  };
  unmatchedVariants: UnmatchedVariant[];  // first 50
}

export async function rebuildStorageSlots(): Promise<RebuildResult> {
  const started = Date.now();
  const db = await getDb();

  // 1. Load inputs.
  const [stockDocs, cardDocs, setDocs, layoutDoc, overrideDocs] = await Promise.all([
    db.collection<CmStockListing>(COL_CM_STOCK).find({}).toArray(),
    db.collection<EvCard>(COL_EV_CARDS)
      .find({}, {
        projection: {
          name: 1, set: 1, collector_number: 1, rarity: 1, type_line: 1,
          colors: 1, color_identity: 1, cmc: 1, layout: 1, image_uri: 1, released_at: 1,
        },
      })
      .toArray(),
    db.collection<EvSet>(COL_EV_SETS).find({}).toArray(),
    db.collection<ShelfLayout & { _id: string }>(COL_STORAGE_LAYOUT).findOne({ _id: "current" }),
    db.collection<CutOverride>(COL_STORAGE_OVERRIDES).find({}).toArray(),
  ]);

  // 2. Project to pure core inputs.
  const stock = stockDocs.map(projectStockRow);
  const cardMetaByKey = new Map<string, CardMeta>();
  for (const c of cardDocs) {
    cardMetaByKey.set(`${c.name}|${c.set}`, projectCardMeta(c));
  }
  const sets = setDocs.map(projectSetMeta);

  // 3. Run pure core.
  const sortResult = computeCanonicalSort(stock, cardMetaByKey, sets);
  const layout: ShelfLayout = layoutDoc ? { shelfRows: layoutDoc.shelfRows } : { shelfRows: [] };
  const placedResult = applyOverrides(sortResult.slots, layout, overrideDocs);

  // 4. Count stats.
  const placedSlots = placedResult.cells.filter(
    (c) => c.kind !== "empty-reserved" && !("unplaced" in c && c.unplaced)
  ).length;
  const unplacedSlots = placedResult.cells.filter(
    (c) => c.kind !== "empty-reserved" && "unplaced" in c && c.unplaced === true
  ).length;
  const spansShelfRowCount = placedResult.cells.filter(
    (c) => c.kind !== "empty-reserved" && "spansShelfRow" in c && c.spansShelfRow === true
  ).length;

  // 5. Transactional write: scratch collection → drop live → rename.
  const slotsCol = db.collection(COL_STORAGE_SLOTS);
  const scratchCol = db.collection(COL_STORAGE_SLOTS_NEXT);

  // Wipe scratch if a previous rebuild left debris.
  try {
    await scratchCol.drop();
  } catch {
    // Didn't exist — fine.
  }

  if (placedResult.cells.length > 0) {
    // Batch inserts. Each cell already has all fields we want.
    const batchSize = 1000;
    for (let i = 0; i < placedResult.cells.length; i += batchSize) {
      const batch = placedResult.cells.slice(i, i + batchSize);
      await scratchCol.insertMany(batch as PlacedCell[], { ordered: false });
    }
  }

  // Drop live, rename scratch to live.
  try {
    await slotsCol.drop();
  } catch {
    // Collection didn't exist — first rebuild.
  }
  if (placedResult.cells.length > 0) {
    await scratchCol.rename(COL_STORAGE_SLOTS);
  }

  // 6. Update override lastStatus for all overrides (applied/stale tracking).
  const appliedIds = new Set(overrideDocs.map((o) => o.id));
  for (const stale of placedResult.staleOverrides) appliedIds.delete(stale.override.id);
  const overridesCol = db.collection<CutOverride>(COL_STORAGE_OVERRIDES);
  await Promise.all([
    ...Array.from(appliedIds).map((id) =>
      overridesCol.updateOne(
        { id },
        { $set: { lastStatus: "applied", lastCheckedAt: new Date() } }
      )
    ),
    ...placedResult.staleOverrides.map((s) =>
      overridesCol.updateOne(
        { id: s.override.id },
        { $set: { lastStatus: s.status, lastCheckedAt: new Date() } }
      )
    ),
  ]);

  // 7. Write rebuild log entry.
  const counts: RebuildCounts = {
    stockRows: stockDocs.length,
    variantsMatched: sortResult.slots.length > 0 ? new Set(sortResult.slots.map((s) => s.variantKey)).size : 0,
    variantsUnmatched: sortResult.unmatched.length,
    slots: sortResult.slots.length,
    placedSlots,
    unplacedSlots,
    spansShelfRowCount,
  };

  const durationMs = Date.now() - started;

  await db.collection(COL_STORAGE_REBUILD_LOG).insertOne({
    startedAt: new Date(started),
    durationMs,
    counts,
    overridesApplied: appliedIds.size,
    staleOverrideCount: placedResult.staleOverrides.length,
  });

  // 8. Build response.
  const byStatus = {
    staleMissingSlot: placedResult.staleOverrides.filter((s) => s.status === "stale-missing-slot"),
    staleMissingTarget: placedResult.staleOverrides.filter((s) => s.status === "stale-missing-target"),
    staleRegression: placedResult.staleOverrides.filter((s) => s.status === "stale-regression"),
  };

  return {
    durationMs,
    counts,
    overrides: {
      applied: appliedIds.size,
      ...byStatus,
    },
    unmatchedVariants: sortResult.unmatched.slice(0, 50),
  };
}
```

- [ ] **Step 3.2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean. If you get errors about `CmStockListing` or `EvCard` imports — check the import path matches `@/lib/types`.

- [ ] **Step 3.3: Run tests**

Run: `npm test`
Expected: still passing. No new tests in this task.

- [ ] **Step 3.4: Commit**

```bash
git add lib/storage-db.ts
git commit -m "Add rebuildStorageSlots orchestrator with transactional swap"
```

---

## Task 4: `POST /api/storage/rebuild` route

**Files:**
- Create: `app/api/storage/rebuild/route.ts`

- [ ] **Step 4.1: Create the route**

```ts
// app/api/storage/rebuild/route.ts
import { withAuth } from "@/lib/api-helpers";
import { rebuildStorageSlots } from "@/lib/storage-db";
import { logActivity } from "@/lib/activity";

export const POST = withAuth(async (_req, session) => {
  const result = await rebuildStorageSlots();

  logActivity(
    "sync",
    "storage_slots",
    "rebuild",
    `slots=${result.counts.slots} placed=${result.counts.placedSlots} stale=${result.overrides.staleMissingSlot.length + result.overrides.staleMissingTarget.length + result.overrides.staleRegression.length} durationMs=${result.durationMs}`,
    "system",
    session.user?.name ?? "unknown"
  );

  return { data: result };
}, "storage-rebuild");
```

- [ ] **Step 4.2: Type-check + build**

```bash
npx tsc --noEmit
npm run build 2>&1 | grep -E "storage/rebuild|error" | head -5
```
Expected: clean type-check, route appears in build output.

- [ ] **Step 4.3: Commit**

```bash
git add app/api/storage/rebuild/route.ts
git commit -m "Add POST /api/storage/rebuild route"
```

---

## Task 5: `GET /api/storage/slots` — paginated slot query

**Files:**
- Modify: `lib/storage-db.ts` (add `queryStorageSlots`)
- Create: `app/api/storage/slots/route.ts`

- [ ] **Step 5.1: Add `queryStorageSlots` to `lib/storage-db.ts`**

Append:

```ts
// ── Read helpers ───────────────────────────────────────────────

export interface QueryStorageSlotsParams {
  shelfRowId?: string;
  boxId?: string;
  set?: string;
  colorGroup?: string;
  search?: string;
  page: number;
  pageSize: number;
}

export interface QueryStorageSlotsResult {
  slots: PlacedCell[];
  total: number;
  page: number;
  pageSize: number;
}

export async function queryStorageSlots(
  params: QueryStorageSlotsParams
): Promise<QueryStorageSlotsResult> {
  const db = await getDb();
  const col = db.collection<PlacedCell>(COL_STORAGE_SLOTS);

  const filter: Record<string, unknown> = {};
  if (params.shelfRowId) filter.shelfRowId = params.shelfRowId;
  if (params.boxId) filter.boxId = params.boxId;
  if (params.set) filter.set = params.set;
  if (params.colorGroup) filter.colorGroup = params.colorGroup;
  if (params.search && params.search.trim()) {
    // Case-insensitive substring match on name. Intentionally NOT using the
    // text index — substring matches like "bolt" → "Lightning Bolt" don't work
    // with Mongo's text index word-boundary semantics, and this is a small
    // collection (~15k docs) so regex is fast enough.
    const escaped = params.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.name = { $regex: escaped, $options: "i" };
  }

  const skip = (params.page - 1) * params.pageSize;
  const [slots, total] = await Promise.all([
    col
      .find(filter)
      .sort({ position: 1 })
      .skip(skip)
      .limit(params.pageSize)
      .toArray(),
    col.countDocuments(filter),
  ]);

  return {
    slots: slots as unknown as PlacedCell[],
    total,
    page: params.page,
    pageSize: params.pageSize,
  };
}
```

- [ ] **Step 5.2: Create the route**

`app/api/storage/slots/route.ts`:

```ts
import { withAuthRead } from "@/lib/api-helpers";
import { queryStorageSlots } from "@/lib/storage-db";

export const GET = withAuthRead(async (req) => {
  const params = req.nextUrl.searchParams;
  const result = await queryStorageSlots({
    shelfRowId: params.get("shelfRowId") ?? undefined,
    boxId: params.get("boxId") ?? undefined,
    set: params.get("set") ?? undefined,
    colorGroup: params.get("colorGroup") ?? undefined,
    search: params.get("search") ?? undefined,
    page: Math.max(1, parseInt(params.get("page") ?? "1", 10)),
    pageSize: Math.min(500, Math.max(1, parseInt(params.get("pageSize") ?? "200", 10))),
  });
  return { data: result };
}, "storage-slots");
```

- [ ] **Step 5.3: Type-check + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add lib/storage-db.ts app/api/storage/slots/route.ts
git commit -m "Add GET /api/storage/slots with filter and pagination"
```

---

## Task 6: `GET /api/storage/stats`

**Files:**
- Modify: `lib/storage-db.ts` (add `getStorageStats`)
- Create: `app/api/storage/stats/route.ts`

- [ ] **Step 6.1: Add `getStorageStats` to `lib/storage-db.ts`**

Append:

```ts
export interface StorageStats {
  totalVariants: number;
  totalCards: number;
  totalSlots: number;
  placedSlots: number;
  unplacedSlots: number;
  perSet: { set: string; setName: string; slots: number; variants: number }[];
  perColor: { colorGroup: string; slots: number }[];
  lastRebuildAt: string | null;
  lastRebuildDurationMs: number | null;
}

export async function getStorageStats(): Promise<StorageStats> {
  const db = await getDb();
  const slots = db.collection(COL_STORAGE_SLOTS);

  const [totals, perSet, perColor, lastRebuild] = await Promise.all([
    slots
      .aggregate([
        { $match: { kind: { $ne: "empty-reserved" } } },
        {
          $group: {
            _id: null,
            totalSlots: { $sum: 1 },
            totalCards: { $sum: "$qtyInSlot" },
            distinctVariants: { $addToSet: "$variantKey" },
            placedSlots: {
              $sum: { $cond: [{ $eq: ["$unplaced", true] }, 0, 1] },
            },
            unplacedSlots: {
              $sum: { $cond: [{ $eq: ["$unplaced", true] }, 1, 0] },
            },
          },
        },
      ])
      .toArray(),
    slots
      .aggregate([
        { $match: { kind: { $ne: "empty-reserved" } } },
        {
          $group: {
            _id: { set: "$set", setName: "$setName" },
            slots: { $sum: 1 },
            variants: { $addToSet: "$variantKey" },
          },
        },
        {
          $project: {
            _id: 0,
            set: "$_id.set",
            setName: "$_id.setName",
            slots: 1,
            variants: { $size: "$variants" },
          },
        },
        { $sort: { set: 1 } },
      ])
      .toArray(),
    slots
      .aggregate([
        { $match: { kind: { $ne: "empty-reserved" } } },
        { $group: { _id: "$colorGroup", slots: { $sum: 1 } } },
        { $project: { _id: 0, colorGroup: "$_id", slots: 1 } },
      ])
      .toArray(),
    db
      .collection(COL_STORAGE_REBUILD_LOG)
      .find({})
      .sort({ startedAt: -1 })
      .limit(1)
      .toArray(),
  ]);

  const t = totals[0] || {};
  const last = lastRebuild[0];

  return {
    totalVariants: Array.isArray(t.distinctVariants) ? t.distinctVariants.length : 0,
    totalCards: t.totalCards ?? 0,
    totalSlots: t.totalSlots ?? 0,
    placedSlots: t.placedSlots ?? 0,
    unplacedSlots: t.unplacedSlots ?? 0,
    perSet: perSet as StorageStats["perSet"],
    perColor: perColor as StorageStats["perColor"],
    lastRebuildAt: last ? new Date(last.startedAt).toISOString() : null,
    lastRebuildDurationMs: last?.durationMs ?? null,
  };
}
```

- [ ] **Step 6.2: Create the route**

`app/api/storage/stats/route.ts`:

```ts
import { withAuthRead } from "@/lib/api-helpers";
import { getStorageStats } from "@/lib/storage-db";

export const GET = withAuthRead(async () => {
  const data = await getStorageStats();
  return { data };
}, "storage-stats");
```

- [ ] **Step 6.3: Type-check + commit**

```bash
npx tsc --noEmit
git add lib/storage-db.ts app/api/storage/stats/route.ts
git commit -m "Add GET /api/storage/stats aggregation"
```

---

## Task 7: Layout CRUD (`GET` + `PUT /api/storage/layout`)

**Files:**
- Modify: `lib/storage-db.ts`
- Create: `app/api/storage/layout/route.ts`

- [ ] **Step 7.1: Add `getLayout` + `setLayout` to `lib/storage-db.ts`**

```ts
import { randomUUID } from "node:crypto";

export async function getLayout(): Promise<ShelfLayout> {
  const db = await getDb();
  const doc = await db
    .collection<ShelfLayout & { _id: string }>(COL_STORAGE_LAYOUT)
    .findOne({ _id: "current" });
  if (!doc) return { shelfRows: [] };
  return { shelfRows: doc.shelfRows };
}

export async function setLayout(layout: ShelfLayout): Promise<ShelfLayout> {
  const db = await getDb();

  // Ensure every shelfRow and box has a stable UUID. New rows/boxes from the
  // client may come in without IDs; we fill them here so the client doesn't
  // need to. Existing IDs are preserved.
  const normalized: ShelfLayout = {
    shelfRows: layout.shelfRows.map((row) => ({
      id: row.id || randomUUID(),
      label: row.label,
      boxes: row.boxes.map((box) => ({
        id: box.id || randomUUID(),
        type: box.type,
        label: box.label,
      })),
    })),
  };

  await db.collection(COL_STORAGE_LAYOUT).replaceOne(
    { _id: "current" },
    { _id: "current", ...normalized, updatedAt: new Date() },
    { upsert: true }
  );
  return normalized;
}
```

- [ ] **Step 7.2: Create the route**

`app/api/storage/layout/route.ts`:

```ts
import { withAuth, withAuthRead } from "@/lib/api-helpers";
import { getLayout, setLayout } from "@/lib/storage-db";
import { logActivity } from "@/lib/activity";
import type { ShelfLayout } from "@/lib/storage";

export const GET = withAuthRead(async () => {
  const data = await getLayout();
  return { data };
}, "storage-layout-get");

export const PUT = withAuth(async (req, session) => {
  const body = (await req.json()) as ShelfLayout;
  if (!body || !Array.isArray(body.shelfRows)) {
    return Response.json({ error: "Invalid layout body" }, { status: 400 });
  }
  const saved = await setLayout(body);
  logActivity(
    "update",
    "storage_layout",
    "current",
    `shelfRows=${saved.shelfRows.length} totalBoxes=${saved.shelfRows.reduce((n, r) => n + r.boxes.length, 0)}`,
    "system",
    session.user?.name ?? "unknown"
  );
  return { data: saved };
}, "storage-layout-put");
```

- [ ] **Step 7.3: Type-check + commit**

```bash
npx tsc --noEmit
git add lib/storage-db.ts app/api/storage/layout/route.ts
git commit -m "Add GET and PUT /api/storage/layout"
```

---

## Task 8: Overrides CRUD (`GET` + `POST` + `DELETE` + `clear-stale`)

**Files:**
- Modify: `lib/storage-db.ts`
- Create: `app/api/storage/overrides/route.ts`
- Create: `app/api/storage/overrides/[id]/route.ts`
- Create: `app/api/storage/overrides/clear-stale/route.ts`

- [ ] **Step 8.1: Add override CRUD helpers to `lib/storage-db.ts`**

```ts
export interface CreateOverrideInput {
  anchorSlotKey: string;
  targetBoxId: string;
  targetBoxRowIndex: number;
  note?: string;
  createdBy: string;
}

export async function listOverrides(statusFilter?: "all" | "applied" | "stale"): Promise<CutOverride[]> {
  const db = await getDb();
  const col = db.collection<CutOverride>(COL_STORAGE_OVERRIDES);
  const filter: Record<string, unknown> = {};
  if (statusFilter === "applied") filter.lastStatus = "applied";
  else if (statusFilter === "stale") {
    filter.lastStatus = { $in: ["stale-missing-slot", "stale-missing-target", "stale-regression"] };
  }
  return col.find(filter).sort({ createdAt: -1 }).toArray();
}

export async function createOverride(input: CreateOverrideInput): Promise<CutOverride> {
  const db = await getDb();
  const doc: CutOverride & { createdAt: Date; createdBy: string; note?: string } = {
    id: randomUUID(),
    anchorSlotKey: input.anchorSlotKey,
    targetBoxId: input.targetBoxId,
    targetBoxRowIndex: input.targetBoxRowIndex,
    createdAt: new Date(),
    createdBy: input.createdBy,
    note: input.note,
  };
  await db.collection(COL_STORAGE_OVERRIDES).insertOne(doc);
  return doc;
}

export async function deleteOverride(id: string): Promise<boolean> {
  const db = await getDb();
  const result = await db.collection(COL_STORAGE_OVERRIDES).deleteOne({ id });
  return result.deletedCount === 1;
}

export async function clearStaleOverrides(): Promise<number> {
  const db = await getDb();
  const result = await db.collection(COL_STORAGE_OVERRIDES).deleteMany({
    lastStatus: { $in: ["stale-missing-slot", "stale-missing-target", "stale-regression"] },
  });
  return result.deletedCount ?? 0;
}
```

- [ ] **Step 8.2: Create `app/api/storage/overrides/route.ts`**

```ts
import { withAuth, withAuthRead } from "@/lib/api-helpers";
import { listOverrides, createOverride } from "@/lib/storage-db";
import { logActivity } from "@/lib/activity";

export const GET = withAuthRead(async (req) => {
  const status = req.nextUrl.searchParams.get("status") as "all" | "applied" | "stale" | null;
  const data = await listOverrides(status ?? "all");
  return { data };
}, "storage-overrides-list");

export const POST = withAuth(async (req, session) => {
  const body = (await req.json()) as {
    anchorSlotKey?: string;
    targetBoxId?: string;
    targetBoxRowIndex?: number;
    note?: string;
  };
  if (!body?.anchorSlotKey || !body?.targetBoxId || typeof body.targetBoxRowIndex !== "number") {
    return Response.json({ error: "anchorSlotKey, targetBoxId, targetBoxRowIndex required" }, { status: 400 });
  }
  const created = await createOverride({
    anchorSlotKey: body.anchorSlotKey,
    targetBoxId: body.targetBoxId,
    targetBoxRowIndex: body.targetBoxRowIndex,
    note: body.note,
    createdBy: session.user?.name ?? "unknown",
  });
  logActivity(
    "create",
    "storage_override",
    created.id,
    `anchor=${created.anchorSlotKey} target=${created.targetBoxId}/${created.targetBoxRowIndex}`,
    "system",
    session.user?.name ?? "unknown"
  );
  return { data: created };
}, "storage-overrides-create");
```

- [ ] **Step 8.3: Create `app/api/storage/overrides/[id]/route.ts`**

```ts
import { withAuthParams } from "@/lib/api-helpers";
import { deleteOverride } from "@/lib/storage-db";
import { logActivity } from "@/lib/activity";

export const DELETE = withAuthParams<{ id: string }>(async (_req, session, params) => {
  const ok = await deleteOverride(params.id);
  if (!ok) return Response.json({ error: "Not found" }, { status: 404 });
  logActivity(
    "delete",
    "storage_override",
    params.id,
    "deleted",
    "system",
    session.user?.name ?? "unknown"
  );
  return { data: { ok: true } };
}, "storage-override-delete");
```

- [ ] **Step 8.4: Create `app/api/storage/overrides/clear-stale/route.ts`**

```ts
import { withAuth } from "@/lib/api-helpers";
import { clearStaleOverrides } from "@/lib/storage-db";
import { logActivity } from "@/lib/activity";

export const POST = withAuth(async (_req, session) => {
  const deleted = await clearStaleOverrides();
  logActivity(
    "delete",
    "storage_override",
    "stale-bulk",
    `cleared=${deleted}`,
    "system",
    session.user?.name ?? "unknown"
  );
  return { data: { deleted } };
}, "storage-overrides-clear-stale");
```

- [ ] **Step 8.5: Type-check + build + commit**

```bash
npx tsc --noEmit
npm run build 2>&1 | grep -E "api/storage|error" | head -20
```
Expected: all 6 new storage routes appear in the build output.

```bash
git add lib/storage-db.ts app/api/storage/overrides
git commit -m "Add overrides CRUD and clear-stale routes"
```

---

## Task 9: Manual verification (user-driven)

Run the indexes migration and test each route via curl against the real DB.

- [ ] **Step 9.1: Run the index migration**

```bash
npx tsx scripts/storage-indexes.ts
```
Expected: output lines like `+ position_unique`, `+ placement_compound`, etc. All four collections should get their indexes.

- [ ] **Step 9.2: Start the dev server**

```bash
npm run dev
```
Leave it running. Open the dashboard at `http://localhost:3025` and log in with your PIN so the session cookie is set.

- [ ] **Step 9.3: Set a minimal test layout**

In the browser devtools console (on any dashboard page):

```js
await fetch("/api/storage/layout", {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    shelfRows: [
      { id: "sr-top", label: "Top row", boxes: [
        { id: "b-1", type: "4k" },
        { id: "b-2", type: "4k" },
        { id: "b-3", type: "4k" },
      ]},
      { id: "sr-mid", label: "Middle row", boxes: [
        { id: "b-4", type: "4k" },
        { id: "b-5", type: "2k" },
      ]},
    ],
  }),
}).then(r => r.json())
```
Expected: `{ data: { shelfRows: [...] } }` echoing your layout.

- [ ] **Step 9.4: Trigger a rebuild**

```js
console.log("rebuilding at", new Date().toLocaleTimeString());
const t = Date.now();
fetch("/api/storage/rebuild", { method: "POST" })
  .then(r => r.json())
  .then(d => console.log(`REBUILD DONE in ${((Date.now() - t)/1000).toFixed(1)}s`, d))
  .catch(e => console.error("FAIL", e));
```
Expected: within 10-30 seconds (depending on stock size), a response like:
```
{ data: {
    durationMs: 4321,
    counts: {
      stockRows: 1234,
      variantsMatched: 800,
      variantsUnmatched: 50,
      slots: 850,
      placedSlots: 850,
      unplacedSlots: 0,
      spansShelfRowCount: 0,
    },
    overrides: { applied: 0, staleMissingSlot: [], staleMissingTarget: [], staleRegression: [] },
    unmatchedVariants: [...]
  }
}
```

**Take note of the unmatched count.** A large number (>10% of stockRows) suggests set-code mismatches between Cardmarket's scraper output and Scryfall's codes — this is the risk we flagged during brainstorming and will address in sub-plan 4 or via an alias table.

- [ ] **Step 9.5: Query some slots**

```js
await fetch("/api/storage/slots?pageSize=5").then(r => r.json())
```
Expected: `{ data: { slots: [...5 cells...], total: N, page: 1, pageSize: 5 } }`.

Search for a specific card:
```js
await fetch("/api/storage/slots?search=Sol+Ring&pageSize=5").then(r => r.json())
```
Expected: slots with "Sol Ring" in the name field.

Filter by set:
```js
await fetch("/api/storage/slots?set=dmu&pageSize=5").then(r => r.json())
```
Expected: slots from the `dmu` set, sorted by position.

- [ ] **Step 9.6: Get stats**

```js
await fetch("/api/storage/stats").then(r => r.json())
```
Expected: totals, perSet array, perColor array, lastRebuildAt timestamp.

- [ ] **Step 9.7: Create and delete an override**

```js
// First find a slot to anchor on
const slots = await fetch("/api/storage/slots?pageSize=1").then(r => r.json())
const anchorKey = slots.data.slots[0].slotKey
console.log("using anchor:", anchorKey)

// Create an override that jumps to box b-2 row 0
const created = await fetch("/api/storage/overrides", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ anchorSlotKey: anchorKey, targetBoxId: "b-2", targetBoxRowIndex: 0, note: "test" }),
}).then(r => r.json())
console.log("created:", created)

// List to confirm
await fetch("/api/storage/overrides").then(r => r.json())

// Delete it
await fetch(`/api/storage/overrides/${created.data.id}`, { method: "DELETE" }).then(r => r.json())

// Confirm gone
await fetch("/api/storage/overrides").then(r => r.json())
```
Expected: create → list (one result) → delete → list (empty).

- [ ] **Step 9.8: Run another rebuild to confirm override staleness flows**

```js
// Create an override with a bogus anchor
await fetch("/api/storage/overrides", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ anchorSlotKey: "ghost|ghost|0", targetBoxId: "b-1", targetBoxRowIndex: 0, note: "stale test" }),
}).then(r => r.json())

// Rebuild — expect the override to be flagged stale-missing-slot
await fetch("/api/storage/rebuild", { method: "POST" }).then(r => r.json())
```
Expected: the rebuild response's `overrides.staleMissingSlot` array contains one entry with the bogus override.

Clean up the stale:
```js
await fetch("/api/storage/overrides/clear-stale", { method: "POST" }).then(r => r.json())
```
Expected: `{ data: { deleted: 1 } }`.

If all eight verification steps pass, sub-plan 3 is complete and the feature is ready for sub-plan 4 (the `/storage` page UI).

---

## Self-Review Checklist

- [ ] All existing tests still pass (Vitest suite unchanged from sub-plan 2, plus Task 2's new projection tests).
- [ ] `npx tsc --noEmit` clean.
- [ ] `npm run build` succeeds; all 6 new routes appear.
- [ ] No new dependencies added.
- [ ] `dashboard_storage_*` is the collection prefix on every new collection.
- [ ] Activity log entries use valid `ActivityAction` values (`sync`, `create`, `update`, `delete`) per `lib/activity.ts:4`.
- [ ] API responses all use the `{ data: ... }` envelope to match existing EV/stock route conventions.
- [ ] Rebuild writes are transactional (scratch → drop live → rename).

## Exit Criteria

Sub-plan 3 is done when:

1. All tests pass.
2. Type-check and build both green.
3. Index migration runs successfully against the real DB.
4. All 8 manual verification steps in Task 9 produce the expected responses.
5. No regressions in the EV calculator or stock tab (spot-check by navigating to `/ev` and `/stock`).

Once done, sub-plan 4 (`/storage` page UI) becomes unblocked and you finally see the Storage tab appear in the sidebar.
