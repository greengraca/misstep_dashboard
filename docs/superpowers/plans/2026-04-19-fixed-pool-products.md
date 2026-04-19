# Fixed-Pool Products Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add preconstructed / fixed-content MTG products (Planeswalker Decks, Commander precons, Starter/Welcome, Duel, Challenger Decks) to the EV calculator as a separate product class with its own collection, API, UI tab, and skill-driven seeding workflow.

**Architecture:** New `dashboard_ev_products` collection parallel to `dashboard_ev_sets`. Pure calculation logic in a new `lib/ev-products.ts` (keeps `lib/ev.ts` focused on booster calc; makes unit testing trivial). Snapshots reuse `dashboard_ev_snapshots` with a `product_slug` discriminator. UI adds a second tab (`Sets` | `Products`) on the existing EV page. Seeding is manual, one product at a time, via a repo-local skill that resolves Scryfall IDs interactively.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, MongoDB native driver, Vitest, SWR. All existing — no new dependencies.

---

## Spec Reference

Design document: `docs/superpowers/specs/2026-04-19-fixed-pool-products-design.md`. Read it first.

## Conventions Used in This Plan

- **Tests first.** Every pure-logic task has a failing test written and verified-to-fail before implementation.
- **Auth helper names as they actually exist in the codebase:** `withAuth` (write, session), `withAuthRead` (read), `withAuthParams<P>` (write + params), `withAuthReadParams<P>` (read + params). The spec used `withAuthWrite` — that's not a real helper; use `withAuth` / `withAuthParams` instead.
- **Commit after every task** using Conventional Commits prefix (`feat:`, `test:`, `refactor:`, `chore:`). Never add `Co-Authored-By` (per project memory).
- **No emojis in code** or commit messages.
- **Hooks:** do not use `--no-verify`. If a pre-commit hook fails, fix the issue and make a new commit.

---

## File Structure

**New files:**
- `lib/ev-products.ts` — types, calc, DB access, snapshot generation (self-contained module)
- `lib/__tests__/ev-products.test.ts` — unit tests for pure calc
- `scripts/sync-ev-set.ts` — one-shot CLI to sync a parent set into `ev_sets` + `ev_cards`
- `scripts/migrate-ev-snapshots-index.ts` — drops old snapshot unique index, creates new compound
- `app/api/ev/products/route.ts` — GET list, POST create/overwrite
- `app/api/ev/products/[slug]/route.ts` — GET detail, DELETE
- `app/api/ev/products/[slug]/snapshot/route.ts` — POST single-product snapshot
- `app/(dashboard)/ev/product/[slug]/page.tsx` — product detail page route
- `components/ev/EvProductList.tsx` — grid of product cards (Products tab)
- `components/ev/EvProductCard.tsx` — single product card
- `components/ev/EvProductDetail.tsx` — detail page body
- `.claude/skills/add-ev-product/SKILL.md` — interactive seeding skill

**Modified files:**
- `lib/types.ts` — add `EvProduct`, `EvProductCard`, `IncludedBooster`, `EvProductResult`, update `EvSnapshot`
- `lib/ev.ts` — extend `generateAllSnapshots` to call into `ev-products`; extend `ensureIndexes` to create product indexes
- `components/ev/EvContent.tsx` — add tab switcher (Sets | Products), URL-synced via `?view=`

**Unchanged (important):** `lib/ev.ts` existing booster calc, snapshot format for sets, existing routes, cron workflow.

---

## Task 1: Add Product Types to `lib/types.ts`

**Files:**
- Modify: `D:/Projetos/misstep/lib/types.ts`

- [ ] **Step 1: Find where existing EV types live in `lib/types.ts`**

Run: `grep -n "EvSet\|EvCard\|EvSnapshot" lib/types.ts | head`
Expected: location of existing EV type block — append product types immediately after.

- [ ] **Step 2: Add product type definitions**

Append to `lib/types.ts` (after the existing EV types block):

```typescript
// ── EV Products (fixed-pool products — PW decks, precons, etc.) ─────

export type EvProductType =
  | "planeswalker_deck"
  | "commander"
  | "starter"
  | "welcome"
  | "duel"
  | "challenger"
  | "other";

export type EvProductCardRole =
  | "foil_premium_pw"
  | "commander"
  | "key_card";

export interface EvProductCard {
  scryfall_id: string;
  name: string;
  set_code: string;
  count: number;
  is_foil: boolean;
  role?: EvProductCardRole;
}

export interface IncludedBooster {
  set_code: string;
  count: number;
  sealed_price_eur?: number;
}

export interface EvProduct {
  _id?: string;
  slug: string;
  name: string;
  product_type: EvProductType;
  release_year: number;
  parent_set_code?: string;
  cards: EvProductCard[];
  included_boosters?: IncludedBooster[];
  image_uri?: string;
  notes?: string;
  seeded_at: Date;
}

export interface EvProductCardBreakdown extends EvProductCard {
  unit_price: number | null;
  line_total: number;
}

export interface EvProductBoosterBreakdown extends IncludedBooster {
  opened_unit_ev: number | null;
}

export interface EvProductResult {
  slug: string;
  name: string;
  product_type: EvProductType;
  card_count_total: number;
  unique_card_count: number;
  cards_subtotal_gross: number;
  boosters: {
    count_total: number;
    sealed: { available: boolean; gross: number; net: number };
    opened: { available: boolean; gross: number; net: number };
  } | null;
  totals: {
    sealed: { gross: number; net: number } | null;
    opened: { gross: number; net: number } | null;
    cards_only: { gross: number; net: number };
  };
  fee_rate: number;
  card_breakdown: EvProductCardBreakdown[];
  booster_breakdown: EvProductBoosterBreakdown[];
  missing_scryfall_ids: string[];
}
```

Also extend the existing `EvSnapshot` interface in the same file (locate it and add the new optional fields):

```typescript
export interface EvSnapshot {
  _id?: string;
  date: string;
  set_code?: string;          // was required — now optional; one of set_code/product_slug is set
  product_slug?: string;      // new
  play_ev_net?: number;       // existing (sets)
  collector_ev_net?: number;  // existing (sets)
  ev_net_sealed?: number;     // new (products)
  ev_net_opened?: number;     // new (products)
  ev_net_cards_only?: number; // new (products)
  fee_rate: number;
  created_at: Date;
}
```

If `set_code` was previously typed as required, change it to optional. Keep all other existing fields unchanged.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no new errors. Existing errors (if any) unchanged.

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add EvProduct types and extend EvSnapshot for products"
```

---

## Task 2: Pure Calc — `calculateProductEv` (TDD)

**Files:**
- Create: `D:/Projetos/misstep/lib/ev-products.ts`
- Create: `D:/Projetos/misstep/lib/__tests__/ev-products.test.ts`

- [ ] **Step 1: Write failing tests**

Create `lib/__tests__/ev-products.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { calculateProductEv } from "../ev-products";
import type { EvProduct, EvProductCard } from "../types";

// Minimal EvCard shape used by the calculator — only the fields it reads.
type EvCardLite = {
  scryfall_id: string;
  name: string;
  price_eur: number | null;
  price_eur_foil: number | null;
};

function card(id: string, name: string, eur: number | null, foil: number | null = null): EvCardLite {
  return { scryfall_id: id, name, price_eur: eur, price_eur_foil: foil };
}

function productCard(over: Partial<EvProductCard> & Pick<EvProductCard, "scryfall_id">): EvProductCard {
  return {
    name: "x",
    set_code: "tst",
    count: 1,
    is_foil: false,
    ...over,
  };
}

function product(over: Partial<EvProduct>): EvProduct {
  return {
    slug: "slug",
    name: "Name",
    product_type: "planeswalker_deck",
    release_year: 2017,
    cards: [],
    seeded_at: new Date(),
    ...over,
  };
}

describe("calculateProductEv — cards only", () => {
  it("sums unit price * count across cards", () => {
    const cards = [card("a", "A", 1.0), card("b", "B", 2.0)];
    const p = product({
      cards: [
        productCard({ scryfall_id: "a", count: 2 }),
        productCard({ scryfall_id: "b", count: 3 }),
      ],
    });
    const r = calculateProductEv(p, cards, { feeRate: 0 });
    expect(r.cards_subtotal_gross).toBe(2 * 1.0 + 3 * 2.0);
    expect(r.totals.cards_only.gross).toBe(8.0);
    expect(r.totals.cards_only.net).toBe(8.0);
    expect(r.boosters).toBeNull();
    expect(r.totals.sealed).toBeNull();
    expect(r.totals.opened).toBeNull();
  });

  it("uses foil price when is_foil=true", () => {
    const cards = [card("a", "A", 1.0, 5.0)];
    const p = product({ cards: [productCard({ scryfall_id: "a", is_foil: true })] });
    const r = calculateProductEv(p, cards, { feeRate: 0 });
    expect(r.cards_subtotal_gross).toBe(5.0);
  });

  it("treats missing price as 0 but reports scryfall_id in missing_scryfall_ids", () => {
    const cards = [card("a", "A", null)];
    const p = product({ cards: [productCard({ scryfall_id: "a" }), productCard({ scryfall_id: "b" })] });
    const r = calculateProductEv(p, cards, { feeRate: 0 });
    expect(r.cards_subtotal_gross).toBe(0);
    expect(r.missing_scryfall_ids).toEqual(["b"]);
  });

  it("applies feeRate to net", () => {
    const cards = [card("a", "A", 10.0)];
    const p = product({ cards: [productCard({ scryfall_id: "a" })] });
    const r = calculateProductEv(p, cards, { feeRate: 0.05 });
    expect(r.totals.cards_only.gross).toBe(10.0);
    expect(r.totals.cards_only.net).toBeCloseTo(9.5, 10);
  });

  it("card_count_total sums counts; unique_card_count counts entries", () => {
    const cards = [card("a", "A", 1), card("b", "B", 1)];
    const p = product({
      cards: [
        productCard({ scryfall_id: "a", count: 24 }),
        productCard({ scryfall_id: "b", count: 1 }),
      ],
    });
    const r = calculateProductEv(p, cards, { feeRate: 0 });
    expect(r.card_count_total).toBe(25);
    expect(r.unique_card_count).toBe(2);
  });
});

describe("calculateProductEv — included boosters", () => {
  it("computes sealed totals when every sealed_price is known", () => {
    const cards = [card("a", "A", 10)];
    const p = product({
      cards: [productCard({ scryfall_id: "a" })],
      included_boosters: [{ set_code: "akh", count: 2, sealed_price_eur: 2.5 }],
    });
    const r = calculateProductEv(p, cards, { feeRate: 0 });
    expect(r.boosters?.sealed.available).toBe(true);
    expect(r.boosters?.sealed.gross).toBe(2 * 2.5);
    expect(r.totals.sealed?.gross).toBe(15);
  });

  it("marks sealed unavailable when any sealed_price is missing", () => {
    const cards = [card("a", "A", 10)];
    const p = product({
      cards: [productCard({ scryfall_id: "a" })],
      included_boosters: [
        { set_code: "akh", count: 1, sealed_price_eur: 2.5 },
        { set_code: "hou", count: 1 }, // no sealed_price_eur
      ],
    });
    const r = calculateProductEv(p, cards, { feeRate: 0 });
    expect(r.boosters?.sealed.available).toBe(false);
    expect(r.totals.sealed).toBeNull();
  });

  it("computes opened totals from boosterEvBySet", () => {
    const cards = [card("a", "A", 10)];
    const p = product({
      cards: [productCard({ scryfall_id: "a" })],
      included_boosters: [{ set_code: "akh", count: 2 }],
    });
    const r = calculateProductEv(p, cards, {
      feeRate: 0,
      boosterEvBySet: { akh: 4.0 },
    });
    expect(r.boosters?.opened.available).toBe(true);
    expect(r.boosters?.opened.gross).toBe(2 * 4.0);
    expect(r.totals.opened?.gross).toBe(18);
  });

  it("marks opened unavailable when any set is missing from boosterEvBySet", () => {
    const cards = [card("a", "A", 10)];
    const p = product({
      cards: [productCard({ scryfall_id: "a" })],
      included_boosters: [
        { set_code: "akh", count: 1 },
        { set_code: "hou", count: 1 },
      ],
    });
    const r = calculateProductEv(p, cards, {
      feeRate: 0,
      boosterEvBySet: { akh: 4.0 },
    });
    expect(r.boosters?.opened.available).toBe(false);
    expect(r.totals.opened).toBeNull();
  });

  it("applies feeRate to both sealed and opened net totals", () => {
    const cards = [card("a", "A", 10)];
    const p = product({
      cards: [productCard({ scryfall_id: "a" })],
      included_boosters: [{ set_code: "akh", count: 2, sealed_price_eur: 3 }],
    });
    const r = calculateProductEv(p, cards, {
      feeRate: 0.1,
      boosterEvBySet: { akh: 5 },
    });
    expect(r.totals.sealed?.net).toBeCloseTo((10 + 6) * 0.9, 10);
    expect(r.totals.opened?.net).toBeCloseTo((10 + 10) * 0.9, 10);
  });
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `npm test -- lib/__tests__/ev-products.test.ts`
Expected: FAIL — module `../ev-products` does not exist.

- [ ] **Step 3: Implement `calculateProductEv`**

Create `lib/ev-products.ts` with **only** the calc function and its required types (DB helpers come in Task 3):

```typescript
import type {
  EvProduct,
  EvProductCard,
  EvProductResult,
  EvProductCardBreakdown,
  EvProductBoosterBreakdown,
} from "./types";

// The calc only reads these fields from ev_cards. Accepting a structural
// subset keeps the function trivially mockable in tests.
export interface EvCardPriceRef {
  scryfall_id: string;
  name?: string;
  price_eur: number | null;
  price_eur_foil: number | null;
}

export interface CalculateProductEvOptions {
  feeRate: number;
  /** Opened-box EV per included booster's parent set (e.g. { akh: 3.75 }). */
  boosterEvBySet?: Record<string, number>;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function calculateProductEv(
  product: EvProduct,
  cards: EvCardPriceRef[],
  options: CalculateProductEvOptions
): EvProductResult {
  const { feeRate, boosterEvBySet = {} } = options;

  const cardById = new Map<string, EvCardPriceRef>();
  for (const c of cards) cardById.set(c.scryfall_id, c);

  let cardsTotal = 0;
  let cardCountTotal = 0;
  const cardBreakdown: EvProductCardBreakdown[] = [];
  const missing: string[] = [];

  for (const pc of product.cards) {
    const c = cardById.get(pc.scryfall_id);
    const unit = c ? (pc.is_foil ? c.price_eur_foil : c.price_eur) : null;
    if (!c) missing.push(pc.scryfall_id);
    const price = unit ?? 0;
    const line = price * pc.count;
    cardsTotal += line;
    cardCountTotal += pc.count;
    cardBreakdown.push({ ...pc, unit_price: unit, line_total: round2(line) });
  }

  cardBreakdown.sort((a, b) => b.line_total - a.line_total);

  const ib = product.included_boosters ?? [];
  const hasBoosters = ib.length > 0;

  let sealedTotal = 0;
  let sealedAvailable = hasBoosters;
  let openedTotal = 0;
  let openedAvailable = hasBoosters;
  let boosterCountTotal = 0;
  const boosterBreakdown: EvProductBoosterBreakdown[] = [];

  for (const b of ib) {
    boosterCountTotal += b.count;
    if (b.sealed_price_eur !== undefined) {
      sealedTotal += b.sealed_price_eur * b.count;
    } else {
      sealedAvailable = false;
    }

    const openedUnit = boosterEvBySet[b.set_code];
    if (openedUnit !== undefined) {
      openedTotal += openedUnit * b.count;
    } else {
      openedAvailable = false;
    }

    boosterBreakdown.push({ ...b, opened_unit_ev: openedUnit ?? null });
  }

  const cardsOnlyGross = round2(cardsTotal);
  const cardsOnlyNet = round2(cardsTotal * (1 - feeRate));

  const boosters = hasBoosters
    ? {
        count_total: boosterCountTotal,
        sealed: {
          available: sealedAvailable,
          gross: round2(sealedTotal),
          net: round2(sealedTotal * (1 - feeRate)),
        },
        opened: {
          available: openedAvailable,
          gross: round2(openedTotal),
          net: round2(openedTotal * (1 - feeRate)),
        },
      }
    : null;

  const totals = {
    cards_only: { gross: cardsOnlyGross, net: cardsOnlyNet },
    sealed:
      hasBoosters && sealedAvailable
        ? {
            gross: round2(cardsTotal + sealedTotal),
            net: round2((cardsTotal + sealedTotal) * (1 - feeRate)),
          }
        : null,
    opened:
      hasBoosters && openedAvailable
        ? {
            gross: round2(cardsTotal + openedTotal),
            net: round2((cardsTotal + openedTotal) * (1 - feeRate)),
          }
        : null,
  };

  return {
    slug: product.slug,
    name: product.name,
    product_type: product.product_type,
    card_count_total: cardCountTotal,
    unique_card_count: product.cards.length,
    cards_subtotal_gross: cardsOnlyGross,
    boosters,
    totals,
    fee_rate: feeRate,
    card_breakdown: cardBreakdown,
    booster_breakdown: boosterBreakdown,
    missing_scryfall_ids: missing,
  };
}
```

- [ ] **Step 4: Run tests and verify all pass**

Run: `npm test -- lib/__tests__/ev-products.test.ts`
Expected: PASS — all 10 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/ev-products.ts lib/__tests__/ev-products.test.ts
git commit -m "feat: add calculateProductEv pure calc with dual sealed/opened totals"
```

---

## Task 3: DB Helpers — Collection, Indexes, CRUD

**Files:**
- Modify: `D:/Projetos/misstep/lib/ev.ts` (export `COL_SNAPSHOTS` if not already; add ensureProductIndexes)
- Modify: `D:/Projetos/misstep/lib/ev-products.ts`

- [ ] **Step 1: Add collection constant and index helper to `lib/ev-products.ts`**

Append to `lib/ev-products.ts`:

```typescript
import { getDb } from "./mongodb";

export const COL_PRODUCTS = "dashboard_ev_products";
export const COL_EV_SNAPSHOTS = "dashboard_ev_snapshots";

let productIndexesEnsured = false;

export async function ensureProductIndexes(): Promise<void> {
  if (productIndexesEnsured) return;
  try {
    const db = await getDb();
    await Promise.all([
      db.collection(COL_PRODUCTS).createIndex({ slug: 1 }, { unique: true, name: "slug_unique" }),
      db.collection(COL_PRODUCTS).createIndex({ parent_set_code: 1 }, { name: "parent_set_code" }),
      db.collection(COL_PRODUCTS).createIndex({ product_type: 1 }, { name: "product_type" }),
      db.collection(COL_EV_SNAPSHOTS).createIndex({ product_slug: 1, date: -1 }, { name: "product_slug_date" }),
    ]);
    productIndexesEnsured = true;
  } catch {
    productIndexesEnsured = true;
  }
}
```

Note: the *compound unique* snapshot index (`set_code + product_slug + date`) is installed via a separate migration script in Task 4 because it requires first dropping the legacy `set_code + date` unique index. That step is destructive enough to warrant an explicit migration.

- [ ] **Step 2: Add CRUD helpers to `lib/ev-products.ts`**

Append:

```typescript
import type { EvProduct } from "./types";

export async function listProducts(): Promise<EvProduct[]> {
  await ensureProductIndexes();
  const db = await getDb();
  const docs = await db
    .collection(COL_PRODUCTS)
    .find({})
    .sort({ release_year: -1, name: 1 })
    .toArray();
  return docs.map((d) => ({ ...d, _id: d._id.toString() }) as EvProduct);
}

export async function getProductBySlug(slug: string): Promise<EvProduct | null> {
  await ensureProductIndexes();
  const db = await getDb();
  const doc = await db.collection(COL_PRODUCTS).findOne({ slug });
  if (!doc) return null;
  return { ...doc, _id: doc._id.toString() } as EvProduct;
}

export interface UpsertProductInput extends Omit<EvProduct, "_id" | "seeded_at"> {}

export async function upsertProduct(input: UpsertProductInput, { overwrite }: { overwrite: boolean } = { overwrite: false }): Promise<{ created: boolean; slug: string }> {
  await ensureProductIndexes();
  const db = await getDb();
  const existing = await db.collection(COL_PRODUCTS).findOne({ slug: input.slug }, { projection: { _id: 1 } });
  if (existing && !overwrite) {
    throw new Error(`Product already exists: ${input.slug} (pass overwrite=true to replace)`);
  }
  const now = new Date();
  await db.collection(COL_PRODUCTS).updateOne(
    { slug: input.slug },
    { $set: { ...input, seeded_at: now } },
    { upsert: true }
  );
  return { created: !existing, slug: input.slug };
}

export async function deleteProduct(slug: string): Promise<{ deleted: boolean }> {
  await ensureProductIndexes();
  const db = await getDb();
  const res = await db.collection(COL_PRODUCTS).deleteOne({ slug });
  return { deleted: res.deletedCount === 1 };
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add lib/ev-products.ts
git commit -m "feat: add dashboard_ev_products collection, indexes, and CRUD helpers"
```

---

## Task 4: Snapshot Index Migration Script

**Files:**
- Create: `D:/Projetos/misstep/scripts/migrate-ev-snapshots-index.ts`

- [ ] **Step 1: Write the migration script**

Create `scripts/migrate-ev-snapshots-index.ts`:

```typescript
// Drops the legacy {set_code: 1, date: -1} unique index on dashboard_ev_snapshots
// and replaces it with the compound {set_code: 1, product_slug: 1, date: 1}
// unique index required to host both set and product snapshots in the same
// collection.
//
// Safe to run multiple times — checks existence before dropping/creating.
//
//   npx tsx scripts/migrate-ev-snapshots-index.ts

try { process.loadEnvFile(".env"); } catch {}

import { getDb, getClient } from "../lib/mongodb";

const COL = "dashboard_ev_snapshots";
const LEGACY = "set_code_date_unique";
const NEW = "set_code_product_slug_date_unique";

async function main() {
  const db = await getDb();
  const indexes = await db.collection(COL).listIndexes().toArray();
  const names = new Set(indexes.map((i) => i.name));

  if (names.has(LEGACY)) {
    console.log(`Dropping legacy index: ${LEGACY}`);
    await db.collection(COL).dropIndex(LEGACY);
  } else {
    console.log(`Legacy index ${LEGACY} not present — skipping drop.`);
  }

  if (names.has(NEW)) {
    console.log(`New index ${NEW} already present — skipping create.`);
  } else {
    console.log(`Creating new compound index: ${NEW}`);
    await db
      .collection(COL)
      .createIndex(
        { set_code: 1, product_slug: 1, date: 1 },
        { unique: true, name: NEW }
      );
  }

  const after = await db.collection(COL).listIndexes().toArray();
  console.log(`  ${COL} indexes: ${after.map((i) => i.name).join(", ")}`);
  await (await getClient()).close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Update `ensureIndexes` in `lib/ev.ts` to use the new index name**

Open `lib/ev.ts`, locate the `ensureIndexes` function, and replace the line that creates the legacy snapshot unique index:

Find:
```typescript
      db.collection(COL_SNAPSHOTS).createIndex(
        { set_code: 1, date: -1 },
        { unique: true, name: "set_code_date_unique" }
      ),
```

Replace with:
```typescript
      db.collection(COL_SNAPSHOTS).createIndex(
        { set_code: 1, product_slug: 1, date: 1 },
        { unique: true, name: "set_code_product_slug_date_unique" }
      ),
      db.collection(COL_SNAPSHOTS).createIndex(
        { product_slug: 1, date: -1 },
        { name: "product_slug_date" }
      ),
```

This makes fresh installs (where `ensureIndexes` runs against an empty collection) correct without needing the migration script; the migration is only for existing DBs that have the old unique index.

- [ ] **Step 3: Run the migration against the dev DB**

Run: `npx tsx scripts/migrate-ev-snapshots-index.ts`
Expected output:
```
Dropping legacy index: set_code_date_unique
Creating new compound index: set_code_product_slug_date_unique
  dashboard_ev_snapshots indexes: _id_, set_code_product_slug_date_unique
```
(If the legacy index was already dropped in an earlier run, the output will just log "skipping drop" instead.)

- [ ] **Step 4: Run typecheck and tests**

Run: `npm run typecheck && npm test`
Expected: pass. No behavioral changes to existing code.

- [ ] **Step 5: Commit**

```bash
git add lib/ev.ts scripts/migrate-ev-snapshots-index.ts
git commit -m "chore: migrate ev_snapshots unique index to host products alongside sets"
```

---

## Task 5: Parent-Set Sync Script

**Files:**
- Create: `D:/Projetos/misstep/scripts/sync-ev-set.ts`

Goal: single CLI that pulls one Scryfall set (and optionally a second auxiliary set for promos, e.g. `pakh`) into `ev_sets` + `ev_cards`, bypassing the UI-level `MIN_RELEASE_YEAR` filter.

- [ ] **Step 1: Check which sync functions `lib/ev.ts` exports**

Run: `grep -n "^export async function sync" lib/ev.ts`
Expected: functions including `syncSets` and `syncCards` (one-per-set). Note their signatures.

- [ ] **Step 2: Write the script**

Create `scripts/sync-ev-set.ts`:

```typescript
// Manually sync one Scryfall set (by code) into dashboard_ev_sets and
// dashboard_ev_cards, bypassing the UI-level MIN_RELEASE_YEAR filter.
// Used by the add-ev-product skill to pull in pre-2020 parent sets.
//
//   npx tsx scripts/sync-ev-set.ts akh
//   npx tsx scripts/sync-ev-set.ts akh pakh   # also syncs auxiliary promo set
//
// Does NOT call refreshAllScryfall — this is a targeted, cheap sync suitable
// for ad-hoc product seeding.

try { process.loadEnvFile(".env"); } catch {}

import { getClient } from "../lib/mongodb";
import { syncSets, syncCardsForSet } from "../lib/ev";

async function syncOne(code: string): Promise<void> {
  console.log(`\n── ${code} ─────────────────────────`);
  const setRes = await syncSets({ onlyCode: code });
  console.log(`  sets: +${setRes.added} new, ${setRes.updated} updated`);
  const cardRes = await syncCardsForSet(code);
  console.log(`  cards: +${cardRes.added} new, ${cardRes.updated} updated`);
}

async function main() {
  const codes = process.argv.slice(2).map((s) => s.toLowerCase()).filter(Boolean);
  if (codes.length === 0) {
    console.error("Usage: npx tsx scripts/sync-ev-set.ts <set_code> [aux_set_code ...]");
    process.exit(2);
  }
  for (const code of codes) {
    await syncOne(code);
  }
  await (await getClient()).close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 3: Reconcile `syncSets` / `syncCardsForSet` signatures**

The script above assumes:
- `syncSets({ onlyCode })` — syncs a single set by code (inserting or updating one row in `dashboard_ev_sets`), bypassing the release-year / set-type filter.
- `syncCardsForSet(code)` — fetches all cards for that set code from Scryfall and upserts into `dashboard_ev_cards`.

Run: `grep -n "export async function syncSets\|export async function syncCards" lib/ev.ts`

If these signatures do not exist:

**(a) If `syncSets` exists but has no `onlyCode` option:** extend it. Open `lib/ev.ts`, find `export async function syncSets(`, and add an optional param:
```typescript
export async function syncSets(opts: { onlyCode?: string } = {}): Promise<{ added: number; updated: number }> {
  // existing body — when opts.onlyCode is set, fetch `/sets/${opts.onlyCode}`
  // directly via scryfallGet() and upsert that single set document, skipping
  // the BOOSTER_SET_TYPES / MIN_RELEASE_YEAR filter. Otherwise existing behavior.
}
```

**(b) If `syncCardsForSet` does not exist:** extract the per-set card-sync loop already present inside `syncCards` / `refreshAllScryfall` into an exported helper:
```typescript
export async function syncCardsForSet(setCode: string): Promise<{ added: number; updated: number }> {
  // Use Scryfall `/cards/search?q=e:${setCode}&unique=prints` pagination
  // (the same loop that refreshAllScryfall runs per set). Upsert each card
  // into COL_CARDS by scryfall_id. Apply deriveCardTreatment and applyUsdFallback.
}
```
Pattern this after whatever the existing full-catalog sync does (`refreshAllScryfall`) — copy the per-set inner body, not the bulk-streaming outer shell. Keep the 80 ms `SCRYFALL_DELAY_MS` between paginated requests.

**(c) If both already exist with different names:** change the script's imports to match. Do not invent new export names.

- [ ] **Step 4: Dry-run with a tiny known set**

Pick a small, definitely-non-booster set for the smoke test — `pakh` (Amonkhet Promos) has ~30 cards. Amonkhet itself (`akh`) will be the real acceptance test in Task 13; pick something cheaper here.

Run: `npx tsx scripts/sync-ev-set.ts pakh`
Expected output:
```
── pakh ─────────────────────────
  sets: +1 new, 0 updated  (or: 0 new, 1 updated if run previously)
  cards: +<N> new, <M> updated
```

Verify in MongoDB:
```
Run: mongosh "$MONGODB_URI" --eval 'db.dashboard_ev_sets.findOne({code:"pakh"})' | head
Expected: a non-null document with code "pakh".
```

- [ ] **Step 5: Commit**

```bash
git add scripts/sync-ev-set.ts lib/ev.ts
git commit -m "feat: add sync-ev-set script for on-demand parent-set syncing"
```

---

## Task 6: Product Snapshot Generation

**Files:**
- Modify: `D:/Projetos/misstep/lib/ev-products.ts` (add `generateAllProductSnapshots`, `generateProductSnapshot`)
- Modify: `D:/Projetos/misstep/lib/ev.ts` (extend `generateAllSnapshots` to call into products)

- [ ] **Step 1: Add snapshot functions to `lib/ev-products.ts`**

Append (no new import lines needed — `calculateProductEv`, `EvCardPriceRef`, `COL_PRODUCTS`, `COL_EV_SNAPSHOTS`, `listProducts`, `getProductBySlug`, `ensureProductIndexes`, and `getDb` are all already in scope in this file from earlier tasks):

```typescript
/**
 * Reads the latest `play_ev_net` snapshot for each booster set referenced
 * by products. Used to populate `boosterEvBySet` for the "opened" valuation.
 */
async function latestPlayEvBySet(codes: string[]): Promise<Record<string, number>> {
  if (codes.length === 0) return {};
  const db = await getDb();
  const docs = await db
    .collection(COL_EV_SNAPSHOTS)
    .aggregate([
      { $match: { set_code: { $in: codes }, play_ev_net: { $ne: null } } },
      { $sort: { date: -1 } },
      { $group: { _id: "$set_code", play_ev_net: { $first: "$play_ev_net" } } },
    ])
    .toArray();
  const out: Record<string, number> = {};
  for (const d of docs) {
    if (typeof d.play_ev_net === "number") out[d._id as string] = d.play_ev_net;
  }
  return out;
}

async function fetchCardsByScryfallIds(ids: string[]): Promise<EvCardPriceRef[]> {
  if (ids.length === 0) return [];
  const db = await getDb();
  const docs = await db
    .collection("dashboard_ev_cards")
    .find(
      { scryfall_id: { $in: ids } },
      { projection: { scryfall_id: 1, name: 1, price_eur: 1, price_eur_foil: 1 } }
    )
    .toArray();
  return docs.map((d) => ({
    scryfall_id: d.scryfall_id as string,
    name: d.name as string | undefined,
    price_eur: (d.price_eur ?? null) as number | null,
    price_eur_foil: (d.price_eur_foil ?? null) as number | null,
  }));
}

async function getFeeRate(): Promise<number> {
  const db = await getDb();
  const cfg = await db.collection("dashboard_ev_config").findOne({}, { projection: { fee_rate: 1 } });
  return (cfg?.fee_rate as number | undefined) ?? 0.05;
}

export async function generateProductSnapshot(slug: string): Promise<{ written: boolean; reason?: string }> {
  await ensureProductIndexes();
  const product = await getProductBySlug(slug);
  if (!product) return { written: false, reason: "not_found" };

  const ids = product.cards.map((c) => c.scryfall_id);
  const cards = await fetchCardsByScryfallIds(ids);

  const boosterSetCodes = (product.included_boosters ?? []).map((b) => b.set_code);
  const boosterEvBySet = await latestPlayEvBySet([...new Set(boosterSetCodes)]);

  const feeRate = await getFeeRate();
  const result = calculateProductEv(product, cards, { feeRate, boosterEvBySet });

  const date = new Date().toISOString().slice(0, 10);
  const db = await getDb();
  await db.collection(COL_EV_SNAPSHOTS).updateOne(
    { product_slug: slug, date },
    {
      $set: {
        product_slug: slug,
        date,
        ev_net_cards_only: result.totals.cards_only.net,
        ev_net_sealed: result.totals.sealed?.net ?? null,
        ev_net_opened: result.totals.opened?.net ?? null,
        fee_rate: feeRate,
        created_at: new Date(),
      },
    },
    { upsert: true }
  );

  return { written: true };
}

export async function generateAllProductSnapshots(): Promise<{ generated: number; errors: string[] }> {
  const products = await listProducts();
  let generated = 0;
  const errors: string[] = [];
  for (const p of products) {
    try {
      const res = await generateProductSnapshot(p.slug);
      if (res.written) generated++;
    } catch (err) {
      errors.push(`${p.slug}: ${String(err)}`);
    }
  }
  return { generated, errors };
}

export async function getProductSnapshots(slug: string, days: number = 180) {
  const db = await getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const docs = await db
    .collection(COL_EV_SNAPSHOTS)
    .find({ product_slug: slug, date: { $gte: cutoffStr } })
    .sort({ date: 1 })
    .toArray();
  return docs.map((d) => ({ ...d, _id: d._id.toString() }));
}
```

- [ ] **Step 2: Extend `generateAllSnapshots` in `lib/ev.ts`**

Open `lib/ev.ts`, locate `export async function generateAllSnapshots`. Add an import at the top of the file:
```typescript
import { generateAllProductSnapshots } from "./ev-products";
```

At the end of `generateAllSnapshots`, after the existing for-loop that iterates `allCodes`, append:
```typescript
  // Products: run AFTER sets so latestPlayEvBySet picks up fresh snapshots
  const productRes = await generateAllProductSnapshots();
  generated += productRes.generated;
  errors.push(...productRes.errors);
```

Keep the rest of the function unchanged. Return the combined counts.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add lib/ev-products.ts lib/ev.ts
git commit -m "feat: generate per-product EV snapshots alongside set snapshots"
```

---

## Task 7: API — GET list + POST create/overwrite

**Files:**
- Create: `D:/Projetos/misstep/app/api/ev/products/route.ts`

- [ ] **Step 1: Write the route**

Create `app/api/ev/products/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { withAuthRead, withAuth } from "@/lib/api-helpers";
import {
  calculateProductEv,
  listProducts,
  upsertProduct,
} from "@/lib/ev-products";
import { getDb } from "@/lib/mongodb";
import { logActivity } from "@/lib/activity";
import type { EvProduct } from "@/lib/types";

async function latestProductSnapshotsMap(slugs: string[]) {
  if (slugs.length === 0) return new Map<string, Record<string, number | null>>();
  const db = await getDb();
  const docs = await db
    .collection("dashboard_ev_snapshots")
    .aggregate([
      { $match: { product_slug: { $in: slugs } } },
      { $sort: { date: -1 } },
      {
        $group: {
          _id: "$product_slug",
          ev_net_cards_only: { $first: "$ev_net_cards_only" },
          ev_net_sealed: { $first: "$ev_net_sealed" },
          ev_net_opened: { $first: "$ev_net_opened" },
          date: { $first: "$date" },
        },
      },
    ])
    .toArray();
  const map = new Map<string, Record<string, number | null>>();
  for (const d of docs) {
    map.set(d._id as string, {
      ev_net_cards_only: (d.ev_net_cards_only ?? null) as number | null,
      ev_net_sealed: (d.ev_net_sealed ?? null) as number | null,
      ev_net_opened: (d.ev_net_opened ?? null) as number | null,
    });
  }
  return map;
}

export const GET = withAuthRead(async () => {
  const products = await listProducts();
  const slugs = products.map((p) => p.slug);
  const snaps = await latestProductSnapshotsMap(slugs);
  const data = products.map((p) => ({
    ...p,
    latest_snapshot: snaps.get(p.slug) ?? null,
  }));
  return { data };
}, "ev-products-list");

export const POST = withAuth(async (req, session) => {
  const body = (await req.json()) as Partial<EvProduct> & { overwrite?: boolean };
  const overwrite = body.overwrite === true;
  const required: (keyof EvProduct)[] = ["slug", "name", "product_type", "release_year", "cards"];
  for (const k of required) {
    if (body[k] === undefined) {
      return NextResponse.json({ error: `Missing field: ${k}` }, { status: 400 });
    }
  }
  if (!Array.isArray(body.cards) || body.cards.length === 0) {
    return NextResponse.json({ error: "cards must be a non-empty array" }, { status: 400 });
  }
  const { overwrite: _drop, ...rest } = body as EvProduct & { overwrite?: boolean };
  void _drop;

  try {
    const res = await upsertProduct(rest as Omit<EvProduct, "_id" | "seeded_at">, { overwrite });
    logActivity(
      res.created ? "create" : "update",
      "ev_product",
      rest.slug,
      res.created ? `Created product ${rest.name}` : `Overwrote product ${rest.name}`,
      session.user?.id ?? "system",
      session.user?.name ?? "unknown"
    );
    return NextResponse.json({ data: { slug: res.slug, created: res.created } }, { status: res.created ? 201 : 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = /already exists/i.test(msg) ? 409 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}, "ev-products-upsert");
```

- [ ] **Step 2: Manual smoke test**

Start dev server: `npm run dev` (in a separate terminal if needed, or `run_in_background`).

List (empty): `curl http://localhost:3025/api/ev/products -b <auth-cookie>` → expect `{"data":[]}`.

Upsert (using a throwaway payload to confirm 201/409 paths):
```bash
curl -X POST http://localhost:3025/api/ev/products \
  -H "Content-Type: application/json" \
  -b <auth-cookie> \
  -d '{"slug":"smoke-test","name":"Smoke Test","product_type":"other","release_year":2026,"cards":[{"scryfall_id":"fake","name":"x","set_code":"tst","count":1,"is_foil":false}]}'
```
Expect: `201 {"data":{"slug":"smoke-test","created":true}}` on first call, `409 {"error":"Product already exists: smoke-test..."}` on repeat.

If manual auth cookie setup is painful, skip this step and rely on Task 13's end-to-end seed to exercise the routes.

- [ ] **Step 3: Clean up smoke test row if created**

Run: `mongosh "$MONGODB_URI" --eval 'db.dashboard_ev_products.deleteOne({slug:"smoke-test"})'`

- [ ] **Step 4: Commit**

```bash
git add app/api/ev/products/route.ts
git commit -m "feat: GET/POST /api/ev/products — list and create/overwrite"
```

---

## Task 8: API — GET detail + DELETE

**Files:**
- Create: `D:/Projetos/misstep/app/api/ev/products/[slug]/route.ts`

- [ ] **Step 1: Write the route**

Create `app/api/ev/products/[slug]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { withAuthReadParams, withAuthParams } from "@/lib/api-helpers";
import {
  calculateProductEv,
  deleteProduct,
  getProductBySlug,
} from "@/lib/ev-products";
import { getDb } from "@/lib/mongodb";
import { logActivity } from "@/lib/activity";
import type { EvCardPriceRef } from "@/lib/ev-products";

async function fetchCardsByScryfallIds(ids: string[]): Promise<EvCardPriceRef[]> {
  if (ids.length === 0) return [];
  const db = await getDb();
  const docs = await db
    .collection("dashboard_ev_cards")
    .find(
      { scryfall_id: { $in: ids } },
      { projection: { scryfall_id: 1, name: 1, price_eur: 1, price_eur_foil: 1, image_uri: 1 } }
    )
    .toArray();
  return docs.map((d) => ({
    scryfall_id: d.scryfall_id as string,
    name: d.name as string | undefined,
    price_eur: (d.price_eur ?? null) as number | null,
    price_eur_foil: (d.price_eur_foil ?? null) as number | null,
  }));
}

async function latestPlayEvBySet(codes: string[]): Promise<Record<string, number>> {
  if (codes.length === 0) return {};
  const db = await getDb();
  const docs = await db
    .collection("dashboard_ev_snapshots")
    .aggregate([
      { $match: { set_code: { $in: codes }, play_ev_net: { $ne: null } } },
      { $sort: { date: -1 } },
      { $group: { _id: "$set_code", play_ev_net: { $first: "$play_ev_net" } } },
    ])
    .toArray();
  const out: Record<string, number> = {};
  for (const d of docs) {
    if (typeof d.play_ev_net === "number") out[d._id as string] = d.play_ev_net;
  }
  return out;
}

async function getFeeRate(): Promise<number> {
  const db = await getDb();
  const cfg = await db.collection("dashboard_ev_config").findOne({}, { projection: { fee_rate: 1 } });
  return (cfg?.fee_rate as number | undefined) ?? 0.05;
}

export const GET = withAuthReadParams<{ slug: string }>(async (_req, { slug }) => {
  const product = await getProductBySlug(slug);
  if (!product) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const cards = await fetchCardsByScryfallIds(product.cards.map((c) => c.scryfall_id));
  const boosterCodes = (product.included_boosters ?? []).map((b) => b.set_code);
  const boosterEvBySet = await latestPlayEvBySet([...new Set(boosterCodes)]);
  const feeRate = await getFeeRate();
  const ev = calculateProductEv(product, cards, { feeRate, boosterEvBySet });

  return { data: { product, ev } };
}, "ev-product-detail");

export const DELETE = withAuthParams<{ slug: string }>(async (_req, session, { slug }) => {
  const res = await deleteProduct(slug);
  if (!res.deleted) return NextResponse.json({ error: "not_found" }, { status: 404 });
  logActivity(
    "delete",
    "ev_product",
    slug,
    `Deleted product ${slug}`,
    session.user?.id ?? "system",
    session.user?.name ?? "unknown"
  );
  return { data: { deleted: true } };
}, "ev-product-delete");
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add app/api/ev/products/\[slug\]/route.ts
git commit -m "feat: GET/DELETE /api/ev/products/[slug] with fresh EV calc"
```

---

## Task 9: API — per-product snapshot

**Files:**
- Create: `D:/Projetos/misstep/app/api/ev/products/[slug]/snapshot/route.ts`

- [ ] **Step 1: Write the route**

Create `app/api/ev/products/[slug]/snapshot/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { withAuthParams } from "@/lib/api-helpers";
import { generateProductSnapshot } from "@/lib/ev-products";
import { logActivity } from "@/lib/activity";

export const POST = withAuthParams<{ slug: string }>(async (_req, session, { slug }) => {
  const res = await generateProductSnapshot(slug);
  if (!res.written) {
    return NextResponse.json({ error: res.reason ?? "unknown" }, { status: 404 });
  }
  logActivity(
    "sync",
    "ev_product_snapshot",
    slug,
    `Generated snapshot for product ${slug}`,
    session.user?.id ?? "system",
    session.user?.name ?? "unknown"
  );
  return { data: { written: true, slug } };
}, "ev-product-snapshot");
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add app/api/ev/products/\[slug\]/snapshot/route.ts
git commit -m "feat: POST /api/ev/products/[slug]/snapshot — single-product snapshot"
```

---

## Task 10: UI — Products Tab Wiring

**Files:**
- Modify: `D:/Projetos/misstep/components/ev/EvContent.tsx`
- Create: `D:/Projetos/misstep/components/ev/EvProductList.tsx`
- Create: `D:/Projetos/misstep/components/ev/EvProductCard.tsx`

- [ ] **Step 1: Create `EvProductCard.tsx`**

Create `components/ev/EvProductCard.tsx`:

```typescript
"use client";

import Link from "next/link";
import type { EvProduct } from "@/lib/types";

interface Props {
  product: EvProduct & {
    latest_snapshot?: {
      ev_net_cards_only: number | null;
      ev_net_sealed: number | null;
      ev_net_opened: number | null;
    } | null;
  };
}

const TYPE_LABEL: Record<EvProduct["product_type"], string> = {
  planeswalker_deck: "PW DECK",
  commander: "COMMANDER",
  starter: "STARTER",
  welcome: "WELCOME",
  duel: "DUEL",
  challenger: "CHALLENGER",
  other: "OTHER",
};

function fmt(eur: number | null | undefined): string {
  if (eur == null) return "—";
  return `€${eur.toFixed(2)}`;
}

export default function EvProductCard({ product }: Props) {
  const s = product.latest_snapshot ?? null;
  return (
    <Link
      href={`/ev/product/${product.slug}`}
      style={{
        display: "block",
        padding: "16px",
        border: "1px solid var(--border)",
        borderRadius: "12px",
        background: "var(--card)",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      {product.image_uri && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={product.image_uri}
          alt={product.name}
          style={{ width: "100%", height: "120px", objectFit: "contain", marginBottom: "12px" }}
        />
      )}
      <div style={{ fontWeight: 600, fontSize: "15px", marginBottom: "4px" }}>
        {product.name}
      </div>
      <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "12px" }}>
        {TYPE_LABEL[product.product_type]} · {product.release_year}
      </div>
      <div style={{ fontSize: "13px", display: "grid", gap: "2px" }}>
        <div>Cards: <strong>{fmt(s?.ev_net_cards_only)}</strong></div>
        {s?.ev_net_sealed != null && (
          <div>+ sealed: <strong>{fmt(s.ev_net_sealed)}</strong></div>
        )}
        {s?.ev_net_opened != null && (
          <div>+ opened: <strong>{fmt(s.ev_net_opened)}</strong></div>
        )}
      </div>
    </Link>
  );
}
```

Note: the inline styles mirror the pattern in `EvSetCard.tsx`. If that file uses a different styling approach (CSS modules / Tailwind classes), match it instead — run `grep "className\|style=" components/ev/EvSetCard.tsx | head` to check, and adapt.

- [ ] **Step 2: Create `EvProductList.tsx`**

Create `components/ev/EvProductList.tsx`:

```typescript
"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { EvProduct } from "@/lib/types";
import EvProductCard from "./EvProductCard";

type ProductWithSnap = EvProduct & {
  latest_snapshot?: {
    ev_net_cards_only: number | null;
    ev_net_sealed: number | null;
    ev_net_opened: number | null;
  } | null;
};

export default function EvProductList() {
  const { data, isLoading, error } = useSWR<{ data: ProductWithSnap[] }>(
    "/api/ev/products",
    fetcher
  );

  if (isLoading) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "16px" }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton" style={{ height: "200px" }} />
        ))}
      </div>
    );
  }

  if (error) {
    return <div style={{ color: "var(--danger)" }}>Failed to load products: {String(error)}</div>;
  }

  const products = data?.data ?? [];

  if (products.length === 0) {
    return (
      <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--muted)" }}>
        <div style={{ fontSize: "16px", marginBottom: "8px" }}>No products yet.</div>
        <div style={{ fontSize: "13px" }}>
          Ask Claude to &quot;add an EV product&quot; to seed one.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "16px" }}>
      {products.map((p) => (
        <EvProductCard key={p.slug} product={p} />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Update `EvContent.tsx` to add tabs**

Replace the entire contents of `components/ev/EvContent.tsx`:

```typescript
"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import useSWR, { mutate as globalMutate } from "swr";
import { fetcher } from "@/lib/fetcher";
import type { EvSet } from "@/lib/types";
import EvSetList from "./EvSetList";
import EvSetDetail from "./EvSetDetail";
import EvProductList from "./EvProductList";

type TabKey = "sets" | "products";

export default function EvContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const initialTab: TabKey = searchParams.get("view") === "products" ? "products" : "sets";
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [selectedSetCode, setSelectedSetCode] = useState<string | null>(null);

  // Keep ?view= in sync with tab
  useEffect(() => {
    const current = searchParams.get("view");
    const desired = tab === "products" ? "products" : null;
    if (current === desired) return;
    const params = new URLSearchParams(searchParams.toString());
    if (desired) params.set("view", desired);
    else params.delete("view");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [tab, pathname, router, searchParams]);

  const { data: setsData, isLoading } = useSWR<{ data: EvSet[] }>(
    "/api/ev/sets",
    fetcher
  );
  const sets = setsData?.data ?? [];
  const selectedSet = selectedSetCode ? sets.find((s) => s.code === selectedSetCode) ?? null : null;

  async function handleRefreshSets() {
    await fetch("/api/ev/sets?refresh=true");
    globalMutate("/api/ev/sets");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Tab strip — hidden when a set detail is open */}
      {!selectedSet && (
        <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid var(--border)" }}>
          {(["sets", "products"] as TabKey[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              style={{
                padding: "8px 16px",
                background: "none",
                border: "none",
                borderBottom: tab === k ? "2px solid var(--accent)" : "2px solid transparent",
                color: tab === k ? "var(--fg)" : "var(--muted)",
                fontWeight: tab === k ? 600 : 400,
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {k}
            </button>
          ))}
        </div>
      )}

      {tab === "sets" ? (
        selectedSet ? (
          <EvSetDetail set={selectedSet} onBack={() => setSelectedSetCode(null)} />
        ) : isLoading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "16px" }}>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="skeleton" style={{ height: "140px" }} />
            ))}
          </div>
        ) : (
          <EvSetList sets={sets} onSelectSet={setSelectedSetCode} onRefresh={handleRefreshSets} />
        )
      ) : (
        <EvProductList />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Manual smoke test in browser**

Run: `npm run dev` (if not already running), then open `http://localhost:3025/ev`.
- Expect the new tab strip with `Sets` and `Products` tabs.
- Click `Products` → expect the empty state text.
- Refresh with `?view=products` in the URL → expect the Products tab to be selected.
- Click `Sets` → expect the URL to lose `?view=` and the existing set grid to render unchanged.

- [ ] **Step 5: Commit**

```bash
git add components/ev/EvContent.tsx components/ev/EvProductList.tsx components/ev/EvProductCard.tsx
git commit -m "feat: add Products tab to EV page with URL-synced state"
```

---

## Task 11: UI — Product Detail Page

**Files:**
- Create: `D:/Projetos/misstep/app/(dashboard)/ev/product/[slug]/page.tsx`
- Create: `D:/Projetos/misstep/components/ev/EvProductDetail.tsx`

- [ ] **Step 1: Write the page shell**

Create `app/(dashboard)/ev/product/[slug]/page.tsx`:

```typescript
import EvProductDetail from "@/components/ev/EvProductDetail";

export default async function EvProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <EvProductDetail slug={slug} />;
}
```

- [ ] **Step 2: Write the detail component**

Create `components/ev/EvProductDetail.tsx`:

```typescript
"use client";

import useSWR from "swr";
import Link from "next/link";
import { fetcher } from "@/lib/fetcher";
import type { EvProduct, EvProductResult } from "@/lib/types";

interface Props { slug: string }

function fmt(eur: number | null | undefined): string {
  if (eur == null) return "—";
  return `€${eur.toFixed(2)}`;
}

export default function EvProductDetail({ slug }: Props) {
  const { data, isLoading, error } = useSWR<{ data: { product: EvProduct; ev: EvProductResult } }>(
    `/api/ev/products/${slug}`,
    fetcher
  );

  if (isLoading) return <div className="skeleton" style={{ height: "400px" }} />;
  if (error || !data?.data) {
    return (
      <div style={{ padding: "24px" }}>
        <Link href="/ev?view=products" style={{ color: "var(--accent)" }}>← back</Link>
        <div style={{ color: "var(--danger)", marginTop: "12px" }}>
          Product not found or failed to load.
        </div>
      </div>
    );
  }

  const { product, ev } = data.data;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header */}
      <div>
        <Link href="/ev?view=products" style={{ color: "var(--accent)", fontSize: "13px" }}>
          ← Products
        </Link>
        <h1 style={{ margin: "8px 0 4px", fontSize: "24px" }}>{product.name}</h1>
        <div style={{ color: "var(--muted)", fontSize: "13px" }}>
          {product.product_type.replace("_", " ")} · {product.release_year}
          {product.parent_set_code && (
            <>
              {" · "}
              <Link href={`/ev?view=sets&set=${product.parent_set_code}`}>
                parent set: {product.parent_set_code}
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Totals summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
        <TotalCard label="Cards only (net)" value={ev.totals.cards_only.net} gross={ev.totals.cards_only.gross} />
        {ev.totals.sealed && (
          <TotalCard label="+ Sealed boosters (net)" value={ev.totals.sealed.net} gross={ev.totals.sealed.gross} />
        )}
        {ev.totals.opened && (
          <TotalCard label="+ Opened boosters (net)" value={ev.totals.opened.net} gross={ev.totals.opened.gross} />
        )}
      </div>

      {/* Missing cards warning */}
      {ev.missing_scryfall_ids.length > 0 && (
        <div style={{
          padding: "12px 16px",
          border: "1px solid var(--danger)",
          borderRadius: "8px",
          color: "var(--danger)",
          fontSize: "13px",
        }}>
          <strong>{ev.missing_scryfall_ids.length}</strong> card(s) not found in the ev_cards cache —
          parent set may not be synced. IDs: {ev.missing_scryfall_ids.slice(0, 5).join(", ")}
          {ev.missing_scryfall_ids.length > 5 && "…"}
        </div>
      )}

      {/* Decklist */}
      <section>
        <h2 style={{ fontSize: "16px", marginBottom: "8px" }}>Decklist</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
              <th style={{ padding: "8px" }}>#</th>
              <th style={{ padding: "8px" }}>Name</th>
              <th style={{ padding: "8px" }}>Set</th>
              <th style={{ padding: "8px" }}>Foil</th>
              <th style={{ padding: "8px" }}>Unit</th>
              <th style={{ padding: "8px", textAlign: "right" }}>Line total</th>
            </tr>
          </thead>
          <tbody>
            {ev.card_breakdown.map((c) => (
              <tr key={c.scryfall_id + (c.is_foil ? "-f" : "")} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <td style={{ padding: "8px" }}>{c.count}</td>
                <td style={{ padding: "8px" }}>
                  {c.name}
                  {c.role && (
                    <span style={{ marginLeft: "6px", fontSize: "11px", color: "var(--accent)" }}>
                      ({c.role.replace(/_/g, " ")})
                    </span>
                  )}
                </td>
                <td style={{ padding: "8px", color: "var(--muted)" }}>{c.set_code}</td>
                <td style={{ padding: "8px" }}>{c.is_foil ? "✓" : ""}</td>
                <td style={{ padding: "8px" }}>{fmt(c.unit_price)}</td>
                <td style={{ padding: "8px", textAlign: "right" }}>{fmt(c.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Included boosters */}
      {ev.booster_breakdown.length > 0 && (
        <section>
          <h2 style={{ fontSize: "16px", marginBottom: "8px" }}>Included boosters</h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                <th style={{ padding: "8px" }}>Set</th>
                <th style={{ padding: "8px" }}>Count</th>
                <th style={{ padding: "8px" }}>Sealed (each)</th>
                <th style={{ padding: "8px" }}>Opened EV (each)</th>
              </tr>
            </thead>
            <tbody>
              {ev.booster_breakdown.map((b, i) => (
                <tr key={b.set_code + i} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <td style={{ padding: "8px" }}>
                    <Link href={`/ev?view=sets&set=${b.set_code}`}>{b.set_code}</Link>
                  </td>
                  <td style={{ padding: "8px" }}>{b.count}</td>
                  <td style={{ padding: "8px" }}>{fmt(b.sealed_price_eur)}</td>
                  <td style={{ padding: "8px" }}>{fmt(b.opened_unit_ev)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function TotalCard({ label, value, gross }: { label: string; value: number; gross: number }) {
  return (
    <div style={{ padding: "12px 16px", border: "1px solid var(--border)", borderRadius: "8px", background: "var(--card)" }}>
      <div style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
        {label}
      </div>
      <div style={{ fontSize: "20px", fontWeight: 600, marginTop: "4px" }}>
        {fmt(value)}
      </div>
      <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "2px" }}>
        gross {fmt(gross)}
      </div>
    </div>
  );
}
```

This page deliberately omits the EV history chart (§ 6 item 4). Chart reuse is a follow-up — noted in "Deferred UI" at the end of this plan.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: pass.

- [ ] **Step 4: Smoke test**

Dev server running → navigate to `http://localhost:3025/ev/product/does-not-exist`. Expect the "Product not found" message + back link.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/ev/product/[slug]/page.tsx" components/ev/EvProductDetail.tsx
git commit -m "feat: product detail page with decklist and 3-column totals"
```

---

## Task 12: Seed Skill — `add-ev-product`

**Files:**
- Create: `D:/Projetos/misstep/.claude/skills/add-ev-product/SKILL.md`

Skills in this repo live at `.claude/skills/<name>/SKILL.md` (one markdown file per skill, consumed by the `Skill` tool). Pattern: the skill is prescriptive workflow text, not code — it tells Claude what to do step by step when invoked.

- [ ] **Step 1: Write the skill**

Create `.claude/skills/add-ev-product/SKILL.md`:

```markdown
---
name: add-ev-product
description: Interactively seed a fixed-pool product (Planeswalker Deck, Commander precon, Starter/Welcome/Duel/Challenger Deck) into the EV calculator. Resolves Scryfall IDs, verifies parent set is synced, and persists via POST /api/ev/products. Use when the user says "add an EV product", "seed a new precon", or pastes a product page (like a Wizards announcement) and asks to add it.
---

# Add EV Product

You are seeding a fixed-pool product into the MISSTEP EV calculator. This is a careful, interactive workflow — one question per message, never assume, never skip verification.

## Steps

### 1. Product identity

Ask the user, one at a time:

1. **Name** (e.g., `Amonkhet Planeswalker Deck — Liliana`)
2. **Type** — offer the enum: `planeswalker_deck`, `commander`, `starter`, `welcome`, `duel`, `challenger`, `other`.
3. **Release year** (e.g., `2017`)
4. **Parent set code** (Scryfall lowercase, e.g., `akh`). Optional — accept blank.

Derive a `slug` automatically: `<parent>-<type_short>-<kebab(name_tail)>`.
- `type_short` mapping: `planeswalker_deck → pw-deck`, `commander → cmdr`, `starter → starter`, `welcome → welcome`, `duel → duel`, `challenger → challenger`, `other → product`.
- `name_tail`: everything after the last `—` or `:` in the name, lowercased and kebab-cased.
- Example: `Amonkhet Planeswalker Deck — Liliana` + parent `akh` → `akh-pw-deck-liliana`.

Show the derived slug and ask user to confirm or override.

### 2. Parent-set prerequisite check

Run, via Bash:

    mongosh "$MONGODB_URI" --quiet --eval 'db.dashboard_ev_sets.findOne({code:"<parent>"},{code:1})'

(Use the actual value of `MONGODB_URI` from the shell env; do NOT embed credentials.)

- If the result is `null`: tell the user the parent set is missing and you need to sync it. Run:

      npx tsx scripts/sync-ev-set.ts <parent>

  Report the counts. Ask whether any auxiliary set (e.g., `p<parent>` for promos) should also be synced — this is required for the foil premium PW card in planeswalker decks. If yes, re-run the script with both codes:

      npx tsx scripts/sync-ev-set.ts <parent> p<parent>

- If the result is non-null, continue.

### 3. Decklist collection

Ask the user to paste the decklist. Accepted format, one card per line:

    <count> [*F*] <name>

Example:

    1 *F* Liliana, Death's Majesty
    1 Oashra Cultivator
    24 Swamp

Parse into `{ count: number, name: string, is_foil: boolean }[]`. Reject malformed lines (missing count or name) and ask for a fix.

### 4. Scryfall resolution (per card)

For each parsed line, resolve the exact `scryfall_id` using the Scryfall public API (no auth needed).

**Primary lookup:** `GET https://api.scryfall.com/cards/named?exact=<url-encoded-name>&set=<parent>`
**Fallback:** `GET https://api.scryfall.com/cards/search?q=!"<name>"+set:<parent>&unique=prints`

**Disambiguation rules (in order):**

1. If the card is foil AND `promo_types` on any returned printing includes `"planeswalker_deck"`: pick that printing. Typically in a promo set like `p<parent>`.
2. If foil and the parent set has no printing: search `!"<name>" set:p<parent>` and pick the foil printing.
3. Default: the primary-lookup result (earliest printing in parent set).

Between each Scryfall request, sleep 80 ms (Scryfall rate limit) — use `sleep 0.08` in bash or a small JS delay if scripting.

**Ambiguity protocol:** if multiple printings could plausibly match and the rules above don't pick one deterministically, STOP and ask the user to paste the Scryfall URL for the exact printing. Parse the URL to extract `scryfall_id`.

Build `cards: EvProductCard[]`:

    {
      scryfall_id: "<resolved>",
      name: "<Scryfall canonical name>",
      set_code: "<printing's set>",
      count: <parsed count>,
      is_foil: <parsed foil flag>,
      role: "foil_premium_pw" if this is the foil PW card, else undefined
    }

Heuristic for `role: "foil_premium_pw"`: the card is foil, its `promo_types` includes `"planeswalker_deck"`, AND its `type_line` contains "Planeswalker".

Present the full resolved list to the user in a tidy table (name | scryfall_id | set | foil | role) before proceeding. Any row the user flags as wrong → re-resolve that one card.

### 5. Included boosters

Ask: "Does this product include sealed boosters? (y/n)"

If yes:
- Ask how many boosters and of which sets. Accept multiple entries, e.g. `2 of akh`, `1 of hou`.
- For each booster set, verify it's in `dashboard_ev_sets` (reuse the mongosh check from step 2; if missing, offer to run `sync-ev-set.ts` for it).
- For each booster set, verify there is a recent snapshot with `play_ev_net`. Check via:

      mongosh "$MONGODB_URI" --quiet --eval 'db.dashboard_ev_snapshots.findOne({set_code:"<code>",play_ev_net:{$ne:null}},{date:1,play_ev_net:1},{sort:{date:-1}})'

  If null, tell the user the booster's set needs an EV config + snapshot before opened-EV can be computed. Offer to continue anyway (opened totals will be null until a set snapshot exists).
- Ask for known sealed price per booster in EUR (optional). Skip means `sealed_price_eur` is omitted.

Build `included_boosters: IncludedBooster[]`.

### 6. Preview and confirm

Compose the final `EvProduct` JSON object and pretty-print it in a fenced code block.

Then show a plain-English summary built from the pasted decklist and Scryfall-resolved printings:
- Card count: total + unique.
- Included boosters: count per set, whether `sealed_price_eur` is set, whether the set has a recent `play_ev_net` snapshot (opened valuation available or not).
- Missing `scryfall_id`s: should be `none` if step 4 succeeded; if not, halt — do not proceed.

**Do not POST yet.** A live EV number is nice-to-have but requires DB access; we skip it to keep preview fast and read-only. The user confirms based on the JSON + summary above.

Ask: "Save this product? (y/n, or `overwrite` if replacing an existing slug)"

### 7. Persist

On confirm, POST to `/api/ev/products`. The user must be logged in to the dashboard in their browser (PIN-authed) — the simplest path is to ask them to run the curl themselves with their session cookie, OR for you to write a throwaway script (`scripts/seed-product-<slug>.ts`) that uses the MongoDB driver directly to upsert.

Prefer the **direct-upsert script** approach — it avoids the auth dance:

    # scripts/_seed-product-tmp.ts (delete after run)
    try { process.loadEnvFile(".env"); } catch {}
    import { getClient } from "../lib/mongodb";
    import { upsertProduct } from "../lib/ev-products";

    const product = <pasted JSON>;
    await upsertProduct(product, { overwrite: <boolean> });
    await (await getClient()).close();

Run: `npx tsx scripts/_seed-product-tmp.ts`. On success, delete the file.

Then trigger an initial snapshot:

    curl -s -b <auth-cookie> -X POST http://localhost:3025/api/ev/products/<slug>/snapshot

…or, if avoiding curl, call `generateProductSnapshot(slug)` from a similar temp script.

Report the detail URL: `http://localhost:3025/ev/product/<slug>`.

### Failure handling

- Any unresolved card in step 4 → halt. Never write a partial product.
- Any Scryfall 4xx/5xx → retry once with 200 ms backoff; if still failing, halt.
- Existing slug + no `overwrite` flag → the upsert throws; ask the user to re-confirm with overwrite intent.

### Never

- Never skip Scryfall verification and guess at a `scryfall_id`.
- Never use `Co-Authored-By` in any git commit made during this workflow (memory: user rejects Claude attribution).
- Never upload decklist content to third-party pastebins / decklist sites — it's the user's data.
```

- [ ] **Step 2: Verify the skill is discoverable**

The skill file should appear under `.claude/skills/add-ev-product/SKILL.md`. Skills defined at the repo level load into the next Claude Code session automatically.

Run: `ls .claude/skills/add-ev-product/SKILL.md`
Expected: the file exists.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/add-ev-product/SKILL.md
git commit -m "feat: add-ev-product skill for interactive product seeding"
```

---

## Task 13: End-to-End Acceptance — Amonkhet PW Deck: Liliana

**Files:**
- None permanent (throwaway scripts deleted after run).

This task executes the skill end-to-end against a real product. It validates every integration point: Scryfall lookup, parent-set sync, card resolution, upsert, snapshot, UI.

- [ ] **Step 1: Ensure dev server is running**

Run: `npm run dev` in a separate terminal (or `run_in_background`). Wait for it to be ready at `http://localhost:3025`.

- [ ] **Step 2: Invoke the skill in a Claude Code session**

In a Claude Code prompt, ask: "add an EV product".

Walk through with these inputs:
- Name: `Amonkhet Planeswalker Deck — Liliana`
- Type: `planeswalker_deck`
- Release year: `2017`
- Parent set code: `akh`

The skill will check for `akh` in `dashboard_ev_sets`. It's pre-2020, so it likely isn't there → skill runs `npx tsx scripts/sync-ev-set.ts akh pakh`. Verify the output shows card counts > 0 for both.

- [ ] **Step 3: Provide the decklist**

Paste the Liliana deck contents (source: https://magic.wizards.com/en/news/announcements/amonkhet-planeswalker-deck-lists-2017-04-19). Example shape:

    1 *F* Liliana, Death's Majesty
    1 Oashra Cultivator
    1 Bitterblade Warrior
    ...
    24 Swamp

(The authoritative 60-card list is on the Wizards page. Copy it verbatim into the skill.)

- [ ] **Step 4: Let the skill resolve scryfall_ids**

Watch the resolution table. Expected:
- Regular cards in `akh`.
- `Liliana, Death's Majesty` (foil) in `pakh` with `role: foil_premium_pw`.

If the skill flags any ambiguity, resolve it by pasting the correct Scryfall URL.

- [ ] **Step 5: Add included boosters**

The product ships with 2 Amonkhet boosters. Answer `y` to the boosters question, then: `2 of akh`.

Sealed price: skip (unknown).

The skill will warn that `akh` has no `play_ev_net` snapshot yet (the parent set was just synced, has no EV config). That's expected — the opened total will be `null` until an EV config is saved for `akh` and a snapshot runs. Acceptable for v1 — confirm and proceed.

- [ ] **Step 6: Approve and persist**

The skill generates a temp script, upserts, deletes the script. Verify in DB:

    Run: mongosh "$MONGODB_URI" --quiet --eval 'db.dashboard_ev_products.findOne({slug:"akh-pw-deck-liliana"}, {slug:1,name:1,cards:{ $slice: 3}})'
    Expected: document exists with 3 sample cards.

- [ ] **Step 7: Generate the first product snapshot**

Trigger: `curl -s -X POST http://localhost:3025/api/ev/products/akh-pw-deck-liliana/snapshot -b <auth-cookie>`.

Or via throwaway script using `generateProductSnapshot("akh-pw-deck-liliana")`.

Verify:

    Run: mongosh "$MONGODB_URI" --quiet --eval 'db.dashboard_ev_snapshots.findOne({product_slug:"akh-pw-deck-liliana"})'
    Expected: document with ev_net_cards_only: <number>, ev_net_opened: null, ev_net_sealed: null.

- [ ] **Step 8: Verify the UI end-to-end**

Open `http://localhost:3025/ev`:
- Expect the new tab strip.
- Click `Products`.
- Expect one card: "Amonkhet Planeswalker Deck — Liliana", PW DECK · 2017, with a `Cards: €X.XX` value.
- Click into it. Expect the detail page with header, totals summary showing Cards only, decklist table sorted by line_total desc, and included-boosters section with `akh / 2 / — / —` (no sealed price, no opened EV).
- Expect `missing_scryfall_ids` to be empty (if non-empty, that's a resolution bug in Task 12 — investigate).

- [ ] **Step 9: Commit any collateral artifacts**

If steps produced any commit-worthy changes (none expected — the seed writes to MongoDB, not the filesystem, and temp scripts get deleted), commit them. Otherwise skip.

If no commit is needed, end with:
```bash
git status
```
Expected: clean working tree on the feature branch.

---

## Deferred to Follow-ups (not v1)

These are noted in the spec but deliberately excluded from the v1 plan to keep scope shippable:

- **EV history chart on product detail page** (§ 6 item 4). Requires extracting chart from `EvHistoryChart.tsx` into a slug-agnostic variant. One session of work; add after v1 ships and first real product has >1 snapshot.
- **Historical snapshot backfill** (§ 7 "Backfill"). `scripts/backfill-product-snapshots.ts` using `ev_card_prices`.
- **Inline sealed-price editing** on the booster row (consciously dropped during brainstorming to avoid PATCH-vs-POST contradiction).
- **Sorting/filtering** the Products grid (add when product count > 20).

---

## Self-Review Notes (for the plan author)

*(Delete this section before merging the plan if it feels meta — it exists only to make the TODO→DONE traceable.)*

**Spec coverage check:**
- § 1 Data model → Task 1 (types) + Task 3 (collection + indexes). ✓
- § 2 Pricing → Tasks 5 (parent-set sync), 8 (detail route reads ev_cards). ✓
- § 3 EV calc → Task 2 (pure, TDD) + Task 8 (wired to detail route). ✓
- § 4 Skill workflow → Task 12. ✓
- § 5 API routes → Tasks 7, 8, 9. ✓ (sync-set is a script per Decision B, Task 5.)
- § 6 UI → Tasks 10, 11. History chart deferred (noted above).
- § 7 Snapshots → Tasks 4 (index migration), 6 (generation), 9 (per-product endpoint). ✓

**Placeholder scan:** no "TBD" or "add appropriate error handling" — all steps have concrete code. ✓

**Type consistency:** `calculateProductEv` signature identical in Task 2 and Task 8. `EvCardPriceRef` consistent (exported from `ev-products.ts`). ✓
