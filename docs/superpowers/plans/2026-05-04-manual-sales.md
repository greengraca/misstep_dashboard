# Manual Sales Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record sales that happened outside Cardmarket against an investment, decrementing or growing the relevant lot correctly depending on whether the sold copy was previously listed on CM with the MS-XXXX tag.

**Architecture:** New service module `lib/investments/manual-sales.ts` exposing `recordManualSale` (two write modes) and `deleteManualSale` (reverses each mode). Three new API routes on the investment scope (POST /manual-sale, DELETE /sale-log/[id], GET /sale-log) plus a typeahead query route (GET /sellable-cards). Three new React components: `ManualSaleCardPicker` (typeahead), `ManualSaleModal` (the form), `InvestmentSalesPanel` (the new sales section below the lot ledger). One additive schema change (three optional fields on `InvestmentSaleLog`). Mirrors `consumeSale`'s write-log-first crash-window invariant for the mutation paths.

**Tech Stack:** Next.js 16 App Router, MongoDB native driver, SWR, vitest, shared dashboard primitives (`Modal`, `Select`, `Pagination`, `StatCard`).

**Spec:** `docs/superpowers/specs/2026-05-04-manual-sales-design.md` (read first if you haven't)

---

## File Structure

**New files:**
- `lib/investments/manual-sales.ts` — service module: `recordManualSale`, `deleteManualSale`, `listSaleLog`, `listSellableCards`, `generateManualSaleId` helper, exported result types.
- `lib/__tests__/manual-sales.test.ts` — pure-helper tests for `generateManualSaleId` (id format).
- `scripts/_smoke-manual-sales.ts` — committed smoke script that exercises every service path against the dev DB. Underscore-prefixed by repo convention for one-off verification scripts.
- `app/api/investments/[id]/manual-sale/route.ts` — POST.
- `app/api/investments/[id]/sale-log/route.ts` — GET (list).
- `app/api/investments/[id]/sale-log/[saleLogId]/route.ts` — DELETE.
- `app/api/investments/[id]/sellable-cards/route.ts` — GET (typeahead source).
- `components/investments/ManualSaleCardPicker.tsx` — typeahead input + dropdown.
- `components/investments/ManualSaleModal.tsx` — full modal form.
- `components/investments/InvestmentSalesPanel.tsx` — sales panel below the lot ledger.

**Modified files:**
- `lib/investments/types.ts` — three optional fields on `InvestmentSaleLog` (`note`, `manual`, `grew_lot`).
- `components/investments/InvestmentDetail.tsx` — wire trigger button + render new panel.

**Testing posture:** This repo's existing pattern (see `lib/__tests__/`) is pure-function unit tests only — no DB integration tests, no `mongodb-memory-server`. The DB-touching service layer (`consumeSale`, `maybeGrowLot`, etc.) has never been unit-tested. We follow the same posture: pure helpers get vitest coverage; the service-layer Mongo writes get covered by `scripts/_smoke-manual-sales.ts` which the engineer runs by hand against the dev DB. Browser-level verification of the full UI flow happens at the end (Task 11).

---

## Task 1: Schema additions to InvestmentSaleLog

**Files:**
- Modify: `lib/investments/types.ts:99-113`

- [ ] **Step 1: Read the existing type**

Open `lib/investments/types.ts` and confirm the current `InvestmentSaleLog` interface ends at line 113 with the closing `}`.

- [ ] **Step 2: Add three optional fields**

Replace the `InvestmentSaleLog` interface with:

```ts
export interface InvestmentSaleLog {
  _id: ObjectId;
  lot_id: ObjectId;
  investment_id: ObjectId;
  order_id: string;
  article_id?: string;
  cardmarket_id: number;
  foil: boolean;
  condition: string;
  language: string;
  qty: number;
  unit_price_eur: number;
  net_per_unit_eur: number;
  attributed_at: Date;
  /** Free-text note. Set by the manual-sale flow only; absent on CM sales. */
  note?: string;
  /** Manual-sale flag. When true, the sale was recorded via the manual-sale
   *  modal rather than from a CM order sync. Drives the "Manual" pill in the
   *  Sales panel and gates which rows are user-deletable. */
  manual?: boolean;
  /** When true, the sale grew the lot AND consumed it (off-the-books mode).
   *  The DELETE handler reverses the qty_opened grow on top of the standard
   *  reverse. Only meaningful when `manual: true`. */
  grew_lot?: boolean;
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean (no output).

- [ ] **Step 4: Commit**

```bash
git add lib/investments/types.ts
git commit -m "feat(investments): add note/manual/grew_lot to InvestmentSaleLog"
```

---

## Task 2: Service — manual-sales.ts (record + delete + smoke script)

**Files:**
- Create: `lib/investments/manual-sales.ts`
- Create: `lib/__tests__/manual-sales.test.ts`
- Create: `scripts/_smoke-manual-sales.ts`

- [ ] **Step 1: Write failing test for `generateManualSaleId`**

Create `lib/__tests__/manual-sales.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test (expect failure)**

Run: `npx vitest run lib/__tests__/manual-sales.test.ts`
Expected: FAIL — `Cannot find module '../investments/manual-sales'`.

- [ ] **Step 3: Create the service module**

Create `lib/investments/manual-sales.ts`:

```ts
// Manual sales — record a sale that happened outside Cardmarket against an
// investment, decrementing or growing the matching lot.
//
// Two distinct ledger deltas, picked via the `wasListed` flag:
//   - wasListed=true  → "I'm pulling this card out of my CM stock". The
//     existing lot already counts the card in qty_opened. Decrement
//     qty_remaining and bump qty_sold. Same shape as consumeSale, just
//     fee-free and reading from a manual id.
//   - wasListed=false → "I sold it without ever listing it on CM". The lot
//     doesn't know about this copy yet. Grow qty_opened AND bump qty_sold;
//     qty_remaining is untouched (the card never sat in stock).
//
// Mirrors consumeSale's write-log-first crash-window invariant: the
// sale_log row goes in BEFORE the lot mutation, so a crash leaves a
// detectable "log without lot delta" rather than the worse "lot drained
// without log" state. If the lot mutation fails (race or guard), the
// sale_log row is rolled back.

import { randomBytes } from "node:crypto";
import { ObjectId, type Db } from "mongodb";
import {
  COL_INVESTMENTS,
  COL_INVESTMENT_LOTS,
  COL_INVESTMENT_SALE_LOG,
} from "./db";
import type { Investment, InvestmentSaleLog } from "./types";

/**
 * Generate the `order_id` for a manual sale. Format: `manual:` followed by
 * 8 hex chars. Doesn't need to be globally unique — the sale_log primary
 * key is `_id` — but uniqueness within an investment is convenient for the
 * UI to disambiguate and for any future "find by manual id" lookup.
 */
export function generateManualSaleId(): string {
  return `manual:${randomBytes(4).toString("hex")}`;
}

export type RecordManualSaleResult =
  | { status: "ok"; sale_log_id: string; lot_id: string }
  | { status: "no-investment" }
  | { status: "frozen" }
  | { status: "cannot-grow-collection-kind" }
  | { status: "insufficient-remaining"; have: number; want: number };

export type DeleteManualSaleResult =
  | { status: "ok" }
  | { status: "not-found" }
  | { status: "not-manual" }
  | { status: "frozen" };

export interface RecordManualSaleParams {
  db: Db;
  investmentId: string;
  cardmarketId: number;
  foil: boolean;
  condition: string;
  language: string;
  qty: number;
  unitPriceEur: number;
  /** false = off-the-books (grow + consume); true = pull from existing CM
   *  listings (consume only). */
  wasListed: boolean;
  date: Date;
  note?: string;
}

export async function recordManualSale(
  params: RecordManualSaleParams
): Promise<RecordManualSaleResult> {
  if (!ObjectId.isValid(params.investmentId)) return { status: "no-investment" };
  if (!Number.isFinite(params.qty) || params.qty <= 0) return { status: "no-investment" };
  if (!Number.isFinite(params.unitPriceEur) || params.unitPriceEur < 0) return { status: "no-investment" };

  const invObjId = new ObjectId(params.investmentId);
  const inv = await params.db
    .collection<Investment>(COL_INVESTMENTS)
    .findOne({ _id: invObjId });
  if (!inv) return { status: "no-investment" };
  if (inv.status !== "listing") return { status: "frozen" };
  if (!params.wasListed && inv.source.kind === "collection") {
    return { status: "cannot-grow-collection-kind" };
  }

  const tuple = {
    investment_id: invObjId,
    cardmarket_id: params.cardmarketId,
    foil: params.foil,
    condition: params.condition,
    language: params.language,
  };
  const orderId = generateManualSaleId();
  const netPerUnit = params.unitPriceEur; // no CM fee on hand sales
  const proceedsDelta = params.qty * netPerUnit;

  // Pre-flight for "was listed": refuse before touching anything if the
  // existing lot can't cover qty.
  if (params.wasListed) {
    const existing = await params.db
      .collection(COL_INVESTMENT_LOTS)
      .findOne<{ qty_remaining: number }>(tuple, { projection: { qty_remaining: 1 } });
    if (!existing || existing.qty_remaining < params.qty) {
      return {
        status: "insufficient-remaining",
        have: existing?.qty_remaining ?? 0,
        want: params.qty,
      };
    }
  }

  // Insert sale_log FIRST (mirrors consumeSale: detectable crash state).
  const logInsert = await params.db
    .collection<Omit<InvestmentSaleLog, "_id">>(COL_INVESTMENT_SALE_LOG)
    .insertOne({
      lot_id: new ObjectId(), // placeholder, patched below after upsert
      investment_id: invObjId,
      order_id: orderId,
      cardmarket_id: params.cardmarketId,
      foil: params.foil,
      condition: params.condition,
      language: params.language,
      qty: params.qty,
      unit_price_eur: params.unitPriceEur,
      net_per_unit_eur: netPerUnit,
      attributed_at: params.date,
      manual: true,
      grew_lot: !params.wasListed,
      ...(params.note ? { note: params.note } : {}),
    });

  let lotId: ObjectId;

  if (params.wasListed) {
    // Decrement an existing lot. Guarded — refuses to go below qty_remaining=0.
    const updated = await params.db
      .collection(COL_INVESTMENT_LOTS)
      .findOneAndUpdate(
        { ...tuple, qty_remaining: { $gte: params.qty } },
        {
          $inc: {
            qty_sold: params.qty,
            qty_remaining: -params.qty,
            proceeds_eur: proceedsDelta,
          },
        },
        { returnDocument: "after", projection: { _id: 1 } }
      );
    if (!updated) {
      // Race: the lot was drained by another sync between our pre-flight
      // and the guarded $inc. Roll back the log row.
      await params.db
        .collection(COL_INVESTMENT_SALE_LOG)
        .deleteOne({ _id: logInsert.insertedId });
      return { status: "insufficient-remaining", have: 0, want: params.qty };
    }
    lotId = updated._id as ObjectId;
  } else {
    // Off-the-books: grow Opened + Sold + proceeds in one upsert. NO
    // qty_remaining increment — the card was never in stock.
    const result = await params.db
      .collection(COL_INVESTMENT_LOTS)
      .findOneAndUpdate(
        tuple,
        {
          $inc: {
            qty_opened: params.qty,
            qty_sold: params.qty,
            proceeds_eur: proceedsDelta,
          },
          $set: { last_grown_at: new Date() },
          $setOnInsert: {
            qty_remaining: 0,
            cost_basis_per_unit: null,
          },
        },
        { upsert: true, returnDocument: "after", projection: { _id: 1 } }
      );
    if (!result) {
      // Should not happen with upsert: true. Roll back defensively.
      await params.db
        .collection(COL_INVESTMENT_SALE_LOG)
        .deleteOne({ _id: logInsert.insertedId });
      return { status: "no-investment" };
    }
    lotId = result._id as ObjectId;
  }

  // Patch the placeholder lot_id on the sale_log row now that we have it.
  await params.db
    .collection(COL_INVESTMENT_SALE_LOG)
    .updateOne({ _id: logInsert.insertedId }, { $set: { lot_id: lotId } });

  return {
    status: "ok",
    sale_log_id: String(logInsert.insertedId),
    lot_id: String(lotId),
  };
}

export interface DeleteManualSaleParams {
  db: Db;
  investmentId: string;
  saleLogId: string;
}

export async function deleteManualSale(
  params: DeleteManualSaleParams
): Promise<DeleteManualSaleResult> {
  if (!ObjectId.isValid(params.investmentId)) return { status: "not-found" };
  if (!ObjectId.isValid(params.saleLogId)) return { status: "not-found" };
  const invObjId = new ObjectId(params.investmentId);
  const saleObjId = new ObjectId(params.saleLogId);

  const inv = await params.db
    .collection<Investment>(COL_INVESTMENTS)
    .findOne({ _id: invObjId }, { projection: { status: 1 } });
  if (!inv) return { status: "not-found" };
  if (inv.status !== "listing") return { status: "frozen" };

  const sale = await params.db
    .collection<InvestmentSaleLog>(COL_INVESTMENT_SALE_LOG)
    .findOne({ _id: saleObjId, investment_id: invObjId });
  if (!sale) return { status: "not-found" };
  if (!sale.manual) return { status: "not-manual" };

  const proceedsDelta = sale.qty * sale.net_per_unit_eur;

  // Reverse the lot mutation. Two modes:
  //   grew_lot=false  →  reverse a "was listed" sale: +qty_remaining, -qty_sold, -proceeds.
  //   grew_lot=true   →  reverse an "off-the-books" sale: -qty_opened, -qty_sold, -proceeds.
  //                       qty_remaining is NOT touched — recording the sale didn't
  //                       change it (the grow and consume cancelled), so the reversal
  //                       must not change it either.
  const incOps: Record<string, number> = {
    qty_sold: -sale.qty,
    proceeds_eur: -proceedsDelta,
  };
  if (sale.grew_lot) {
    incOps.qty_opened = -sale.qty;
  } else {
    incOps.qty_remaining = sale.qty;
  }

  await params.db
    .collection(COL_INVESTMENT_LOTS)
    .updateOne({ _id: sale.lot_id }, { $inc: incOps });
  await params.db
    .collection(COL_INVESTMENT_SALE_LOG)
    .deleteOne({ _id: saleObjId });

  return { status: "ok" };
}
```

- [ ] **Step 4: Run the test (expect pass)**

Run: `npx vitest run lib/__tests__/manual-sales.test.ts`
Expected: 2 tests passing.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Write the smoke script**

Create `scripts/_smoke-manual-sales.ts`:

```ts
// Smoke-test the manual-sales service against the dev DB. Creates a
// throwaway investment, exercises every code path, then cleans up.
//
// Run: npx tsx scripts/_smoke-manual-sales.ts
//
// On success, prints "ALL CHECKS PASSED". On any failure throws — the
// script is the test.

try { process.loadEnvFile(".env"); } catch {}

import { ObjectId } from "mongodb";
import { getDb, getClient } from "../lib/mongodb";
import {
  recordManualSale,
  deleteManualSale,
  generateManualSaleId,
} from "../lib/investments/manual-sales";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
}
function assertEq<T>(actual: T, expected: T, msg: string): void {
  if (actual !== expected) throw new Error(`ASSERT FAIL ${msg}: got ${actual}, want ${expected}`);
}

async function main() {
  const db = await getDb();

  // Create a throwaway investment + lot
  const invId = new ObjectId();
  const lotIdSeed = new ObjectId();
  await db.collection("dashboard_investments").insertOne({
    _id: invId,
    name: "_smoke manual-sales",
    code: `MS-SMK${Math.floor(Math.random() * 0xff).toString(16).padStart(2, "0").toUpperCase()}`,
    created_at: new Date(),
    created_by: "smoke",
    status: "listing",
    cost_total_eur: 100,
    source: {
      kind: "box",
      set_code: "j25",
      booster_type: "jumpstart",
      packs_per_box: 24,
      cards_per_pack: 20,
      box_count: 1,
    },
    cm_set_names: ["Foundations Jumpstart"],
    sealed_flips: [],
    expected_open_card_count: 480,
  });
  await db.collection("dashboard_investment_lots").insertOne({
    _id: lotIdSeed,
    investment_id: invId,
    cardmarket_id: 999001,
    foil: false,
    condition: "NM",
    language: "English",
    qty_opened: 3,
    qty_sold: 0,
    qty_remaining: 3,
    proceeds_eur: 0,
    cost_basis_per_unit: null,
    last_grown_at: new Date(),
  });

  console.log("---- was-listed mode ----");
  const r1 = await recordManualSale({
    db,
    investmentId: String(invId),
    cardmarketId: 999001,
    foil: false,
    condition: "NM",
    language: "English",
    qty: 1,
    unitPriceEur: 5,
    wasListed: true,
    date: new Date(),
    note: "smoke A",
  });
  assertEq(r1.status, "ok", "was-listed record");
  let lot = await db.collection("dashboard_investment_lots").findOne({ _id: lotIdSeed });
  assertEq(lot?.qty_opened, 3, "wasListed leaves qty_opened");
  assertEq(lot?.qty_sold, 1, "wasListed bumps qty_sold");
  assertEq(lot?.qty_remaining, 2, "wasListed decrements qty_remaining");
  assertEq(lot?.proceeds_eur, 5, "wasListed adds proceeds");

  console.log("---- insufficient-remaining ----");
  const r2 = await recordManualSale({
    db, investmentId: String(invId), cardmarketId: 999001, foil: false,
    condition: "NM", language: "English", qty: 99, unitPriceEur: 5,
    wasListed: true, date: new Date(),
  });
  assertEq(r2.status, "insufficient-remaining", "rejects qty>remaining");
  // Verify rollback: only the previous sale_log row should exist.
  const logsAfterReject = await db.collection("dashboard_investment_sale_log")
    .countDocuments({ investment_id: invId });
  assertEq(logsAfterReject, 1, "no sale_log row written on insufficient-remaining");

  console.log("---- off-the-books, existing lot ----");
  const r3 = await recordManualSale({
    db, investmentId: String(invId), cardmarketId: 999001, foil: false,
    condition: "NM", language: "English", qty: 1, unitPriceEur: 7,
    wasListed: false, date: new Date(), note: "smoke B",
  });
  assertEq(r3.status, "ok", "off-the-books on existing lot");
  lot = await db.collection("dashboard_investment_lots").findOne({ _id: lotIdSeed });
  assertEq(lot?.qty_opened, 4, "off-the-books grows opened");
  assertEq(lot?.qty_sold, 2, "off-the-books bumps sold");
  assertEq(lot?.qty_remaining, 2, "off-the-books leaves remaining alone");
  assertEq(lot?.proceeds_eur, 12, "off-the-books adds proceeds");

  console.log("---- off-the-books, new card (lot doesn't exist) ----");
  const r4 = await recordManualSale({
    db, investmentId: String(invId), cardmarketId: 999002, foil: false,
    condition: "NM", language: "English", qty: 2, unitPriceEur: 3,
    wasListed: false, date: new Date(),
  });
  assertEq(r4.status, "ok", "off-the-books creates lot");
  const newLot = await db.collection("dashboard_investment_lots").findOne({
    investment_id: invId, cardmarket_id: 999002,
  });
  assert(newLot, "new lot exists");
  assertEq(newLot?.qty_opened, 2, "new lot opened=2");
  assertEq(newLot?.qty_sold, 2, "new lot sold=2");
  assertEq(newLot?.qty_remaining, 0, "new lot remaining=0");

  console.log("---- delete: was-listed reversal ----");
  const ok1 = r1.status === "ok" ? r1 : null;
  assert(ok1, "r1 ok");
  const d1 = await deleteManualSale({
    db, investmentId: String(invId), saleLogId: ok1.sale_log_id,
  });
  assertEq(d1.status, "ok", "delete was-listed");
  lot = await db.collection("dashboard_investment_lots").findOne({ _id: lotIdSeed });
  assertEq(lot?.qty_opened, 4, "delete was-listed: opened still 4 (off-the-books B left it at 4)");
  assertEq(lot?.qty_sold, 1, "delete was-listed: sold returns to 1");
  assertEq(lot?.qty_remaining, 3, "delete was-listed: remaining returns to 3");
  assertEq(lot?.proceeds_eur, 7, "delete was-listed: proceeds returns to 7");

  console.log("---- delete: off-the-books reversal ----");
  const ok3 = r3.status === "ok" ? r3 : null;
  assert(ok3, "r3 ok");
  const d2 = await deleteManualSale({
    db, investmentId: String(invId), saleLogId: ok3.sale_log_id,
  });
  assertEq(d2.status, "ok", "delete off-the-books");
  lot = await db.collection("dashboard_investment_lots").findOne({ _id: lotIdSeed });
  assertEq(lot?.qty_opened, 3, "delete off-the-books: opened back to 3");
  assertEq(lot?.qty_sold, 0, "delete off-the-books: sold back to 0");
  assertEq(lot?.qty_remaining, 3, "delete off-the-books: remaining unchanged at 3");
  assertEq(lot?.proceeds_eur, 0, "delete off-the-books: proceeds back to 0");

  console.log("---- delete: refuses non-manual ----");
  const cmSale = await db.collection("dashboard_investment_sale_log").insertOne({
    lot_id: lotIdSeed,
    investment_id: invId,
    order_id: "12345",
    cardmarket_id: 999001,
    foil: false,
    condition: "NM",
    language: "English",
    qty: 1,
    unit_price_eur: 5,
    net_per_unit_eur: 4.75,
    attributed_at: new Date(),
  });
  const d3 = await deleteManualSale({
    db, investmentId: String(invId), saleLogId: String(cmSale.insertedId),
  });
  assertEq(d3.status, "not-manual", "refuses to delete CM sale");

  console.log("---- frozen investment: refuses record + delete ----");
  await db.collection("dashboard_investments").updateOne(
    { _id: invId }, { $set: { status: "closed" } }
  );
  const r5 = await recordManualSale({
    db, investmentId: String(invId), cardmarketId: 999001, foil: false,
    condition: "NM", language: "English", qty: 1, unitPriceEur: 5,
    wasListed: true, date: new Date(),
  });
  assertEq(r5.status, "frozen", "record refuses on closed");
  const ok4 = r4.status === "ok" ? r4 : null;
  assert(ok4, "r4 ok");
  const d4 = await deleteManualSale({
    db, investmentId: String(invId), saleLogId: ok4.sale_log_id,
  });
  assertEq(d4.status, "frozen", "delete refuses on closed");

  console.log("---- collection-kind: refuses off-the-books ----");
  await db.collection("dashboard_investments").updateOne(
    { _id: invId },
    { $set: { status: "listing", source: { kind: "collection", appraiser_collection_id: "fake", card_count: 0 } } }
  );
  const r6 = await recordManualSale({
    db, investmentId: String(invId), cardmarketId: 999001, foil: false,
    condition: "NM", language: "English", qty: 1, unitPriceEur: 5,
    wasListed: false, date: new Date(),
  });
  assertEq(r6.status, "cannot-grow-collection-kind", "collection-kind refuses off-the-books");

  console.log("---- id format ----");
  for (let i = 0; i < 5; i++) {
    const id = generateManualSaleId();
    assert(/^manual:[0-9a-f]{8}$/.test(id), `id format ${id}`);
  }

  // Cleanup
  await db.collection("dashboard_investment_sale_log").deleteMany({ investment_id: invId });
  await db.collection("dashboard_investment_lots").deleteMany({ investment_id: invId });
  await db.collection("dashboard_investments").deleteOne({ _id: invId });

  console.log("\nALL CHECKS PASSED");
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { const c = await getClient(); await c.close(); });
```

- [ ] **Step 7: Run the smoke script**

Run: `npx tsx scripts/_smoke-manual-sales.ts`
Expected: every block prints, ends with `ALL CHECKS PASSED`.

- [ ] **Step 8: Commit**

```bash
git add lib/investments/manual-sales.ts lib/__tests__/manual-sales.test.ts scripts/_smoke-manual-sales.ts
git commit -m "feat(investments): manual-sales service + smoke tests"
```

---

## Task 3: Service — listSaleLog (paginated read)

**Files:**
- Modify: `lib/investments/manual-sales.ts`

- [ ] **Step 1: Add the listing function**

Append to `lib/investments/manual-sales.ts` (below `deleteManualSale`):

```ts
export interface SaleLogListItem {
  id: string;
  cardmarket_id: number;
  foil: boolean;
  condition: string;
  language: string;
  name: string | null;
  qty: number;
  unit_price_eur: number;
  net_per_unit_eur: number;
  attributed_at: string;          // ISO date for JSON safety
  source: "cardmarket" | "manual";
  order_id: string;               // CM numeric or "manual:..."
  note: string | null;
}

export interface SaleLogListResult {
  rows: SaleLogListItem[];
  total: number;
  page: number;
  pageSize: number;
}

const SALE_LOG_PAGE_SIZE_DEFAULT = 25;
const SALE_LOG_PAGE_SIZE_MAX = 200;

export async function listSaleLog(params: {
  db: Db;
  investmentId: string;
  page?: number;
  pageSize?: number;
}): Promise<SaleLogListResult> {
  if (!ObjectId.isValid(params.investmentId)) {
    return { rows: [], total: 0, page: 1, pageSize: SALE_LOG_PAGE_SIZE_DEFAULT };
  }
  const requestedPageSize = params.pageSize && Number.isFinite(params.pageSize)
    ? params.pageSize : SALE_LOG_PAGE_SIZE_DEFAULT;
  const pageSize = Math.max(1, Math.min(SALE_LOG_PAGE_SIZE_MAX, Math.floor(requestedPageSize)));
  const requestedPage = params.page && Number.isFinite(params.page) ? params.page : 1;
  const page = Math.max(1, Math.floor(requestedPage));

  const invObjId = new ObjectId(params.investmentId);
  const filter = { investment_id: invObjId };
  const total = await params.db
    .collection(COL_INVESTMENT_SALE_LOG)
    .countDocuments(filter);
  if (total === 0) return { rows: [], total, page, pageSize };

  const docs = await params.db
    .collection<InvestmentSaleLog>(COL_INVESTMENT_SALE_LOG)
    .find(filter)
    .sort({ attributed_at: -1, _id: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .toArray();

  // Hydrate name from ev_cards, fallback to cm_stock for Scryfall-mismapped
  // cards (same pattern as listLots).
  const cmIds = Array.from(new Set(docs.map((d) => d.cardmarket_id)));
  const [evCards, stockRows] = await Promise.all([
    params.db.collection("dashboard_ev_cards")
      .find({ cardmarket_id: { $in: cmIds } })
      .project<{ cardmarket_id: number; name: string }>({ cardmarket_id: 1, name: 1 })
      .toArray(),
    params.db.collection("dashboard_cm_stock")
      .find({ productId: { $in: cmIds } })
      .project<{ productId: number; name: string }>({ productId: 1, name: 1 })
      .toArray(),
  ]);
  const nameByCmId = new Map<number, string>();
  for (const c of evCards) nameByCmId.set(c.cardmarket_id, c.name);
  for (const r of stockRows) {
    if (!nameByCmId.has(r.productId)) nameByCmId.set(r.productId, r.name);
  }

  const rows: SaleLogListItem[] = docs.map((d) => ({
    id: String(d._id),
    cardmarket_id: d.cardmarket_id,
    foil: d.foil,
    condition: d.condition,
    language: d.language,
    name: nameByCmId.get(d.cardmarket_id) ?? null,
    qty: d.qty,
    unit_price_eur: d.unit_price_eur,
    net_per_unit_eur: d.net_per_unit_eur,
    attributed_at: d.attributed_at instanceof Date
      ? d.attributed_at.toISOString()
      : new Date(d.attributed_at as unknown as string).toISOString(),
    source: d.manual ? "manual" : "cardmarket",
    order_id: d.order_id,
    note: d.note ?? null,
  }));

  return { rows, total, page, pageSize };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Smoke-verify against the J25 investment**

Run a quick one-liner against the existing J25 investment (which has 1 attributed sale from earlier):

```bash
cat > scripts/_check-sale-log.ts << 'EOF'
try { process.loadEnvFile(".env"); } catch {}
import { listSaleLog } from "../lib/investments/manual-sales";
import { getDb, getClient } from "../lib/mongodb";
async function main() {
  const r = await listSaleLog({ db: await getDb(), investmentId: "69e80180715adc74ddf18dc4" });
  console.log(JSON.stringify(r, null, 2));
}
main().finally(async () => { const c = await getClient(); await c.close(); });
EOF
npx tsx scripts/_check-sale-log.ts
rm scripts/_check-sale-log.ts
```
Expected: returns `{ rows: [{ name: "Augur of Bolas", qty: 1, source: "cardmarket", ... }], total: 1, ... }`.

- [ ] **Step 4: Commit**

```bash
git add lib/investments/manual-sales.ts
git commit -m "feat(investments): listSaleLog paginated read"
```

---

## Task 4: Service — listSellableCards (typeahead query)

**Files:**
- Modify: `lib/investments/manual-sales.ts`

- [ ] **Step 1: Add the typeahead query**

Append to `lib/investments/manual-sales.ts`:

```ts
export interface SellableCardItem {
  cardmarket_id: number;
  name: string;
  set_name: string | null;
  rarity: string | null;
  foil_default: boolean;          // helps the picker pick the right default
  /** Sum of qty_remaining across all tuples of this card name in the
   *  investment, or null if no lot exists. Drives the "Tracked: N" badge. */
  lot_remaining: number | null;
}

export interface SellableCardsResult {
  rows: SellableCardItem[];
}

export async function listSellableCards(params: {
  db: Db;
  investmentId: string;
  q?: string;
}): Promise<SellableCardsResult> {
  if (!ObjectId.isValid(params.investmentId)) return { rows: [] };
  const invObjId = new ObjectId(params.investmentId);

  const inv = await params.db
    .collection<Investment>(COL_INVESTMENTS)
    .findOne({ _id: invObjId });
  if (!inv) return { rows: [] };

  const q = (params.q ?? "").trim();
  // Empty query: return existing-lot cards only (concise dropdown on first
  // open). Any q≥1 char: search the full set catalogue plus existing lots.
  const queryNameRegex = q ? new RegExp(escapeRegex(q), "i") : null;

  // Step 1: existing lots for this investment, joined to ev_cards/stock for
  // the displayable name. Always included regardless of q (so collection-kind
  // picker still works, and so the 5 mismapped J25 cards show up).
  const lots = await params.db
    .collection(COL_INVESTMENT_LOTS)
    .aggregate<{
      _id: { cardmarket_id: number; foil: boolean };
      qty_remaining: number;
    }>([
      { $match: { investment_id: invObjId } },
      {
        $group: {
          _id: { cardmarket_id: "$cardmarket_id", foil: "$foil" },
          qty_remaining: { $sum: "$qty_remaining" },
        },
      },
    ])
    .toArray();
  const lotsByCmId = new Map<number, { qty_remaining: number; foil_default: boolean }>();
  for (const l of lots) {
    const prev = lotsByCmId.get(l._id.cardmarket_id);
    const summed = (prev?.qty_remaining ?? 0) + l.qty_remaining;
    lotsByCmId.set(l._id.cardmarket_id, {
      qty_remaining: summed,
      foil_default: prev?.foil_default ?? l._id.foil,
    });
  }

  // Step 2: candidate ev_cards for the investment's set(s).
  const setCodes = await resolveSetCodesForInvestment(params.db, inv);
  const evMatch: Record<string, unknown> = { set: { $in: setCodes } };
  if (queryNameRegex) evMatch.name = queryNameRegex;
  const evCards = setCodes.length === 0 || inv.source.kind === "collection"
    ? []
    : await params.db
        .collection("dashboard_ev_cards")
        .find(evMatch)
        .project<{ cardmarket_id: number; name: string; rarity: string; set: string; finishes: string[] }>({
          cardmarket_id: 1,
          name: 1,
          rarity: 1,
          set: 1,
          finishes: 1,
        })
        .limit(200)
        .toArray();

  // Step 3: stock fallback for cards that exist in lots but not ev_cards
  // (Scryfall mismaps). Scoped to the investment's set names so we don't
  // pull unrelated stock.
  const lotCmIds = Array.from(lotsByCmId.keys());
  const evCmIds = new Set(evCards.map((c) => c.cardmarket_id));
  const orphanLotCmIds = lotCmIds.filter((id) => !evCmIds.has(id));
  const stockFallback = orphanLotCmIds.length > 0
    ? await params.db
        .collection("dashboard_cm_stock")
        .find({
          productId: { $in: orphanLotCmIds },
          ...(inv.cm_set_names?.length ? { set: { $in: inv.cm_set_names } } : {}),
          ...(queryNameRegex ? { name: queryNameRegex } : {}),
        })
        .project<{ productId: number; name: string; set: string; foil: boolean }>({
          productId: 1, name: 1, set: 1, foil: 1,
        })
        .toArray()
    : [];

  // Resolve set codes → set names for display.
  const setNameByCode = new Map<string, string>();
  if (setCodes.length > 0) {
    const sets = await params.db
      .collection("dashboard_ev_sets")
      .find({ code: { $in: setCodes } })
      .project<{ code: string; name: string }>({ code: 1, name: 1 })
      .toArray();
    for (const s of sets) setNameByCode.set(s.code, s.name);
  }

  // Merge into one result list keyed by cardmarket_id. ev_cards win on
  // metadata; stock provides the orphan rows.
  const merged = new Map<number, SellableCardItem>();
  for (const c of evCards) {
    merged.set(c.cardmarket_id, {
      cardmarket_id: c.cardmarket_id,
      name: c.name,
      set_name: setNameByCode.get(c.set) ?? null,
      rarity: c.rarity ?? null,
      foil_default: !(c.finishes ?? []).includes("nonfoil"),
      lot_remaining: lotsByCmId.get(c.cardmarket_id)?.qty_remaining ?? null,
    });
  }
  for (const r of stockFallback) {
    if (merged.has(r.productId)) continue;
    merged.set(r.productId, {
      cardmarket_id: r.productId,
      name: r.name,
      set_name: r.set,
      rarity: null,
      foil_default: lotsByCmId.get(r.productId)?.foil_default ?? false,
      lot_remaining: lotsByCmId.get(r.productId)?.qty_remaining ?? null,
    });
  }

  // For collection-kind (no set catalogue), seed merged from existing lots
  // by joining to ev_cards / stock.
  if (inv.source.kind === "collection" && merged.size === 0 && lotCmIds.length > 0) {
    const [evHits, stockHits] = await Promise.all([
      params.db.collection("dashboard_ev_cards")
        .find({ cardmarket_id: { $in: lotCmIds } })
        .project<{ cardmarket_id: number; name: string; rarity: string; set: string; finishes: string[] }>({
          cardmarket_id: 1, name: 1, rarity: 1, set: 1, finishes: 1,
        })
        .toArray(),
      params.db.collection("dashboard_cm_stock")
        .find({ productId: { $in: lotCmIds } })
        .project<{ productId: number; name: string; set: string }>({
          productId: 1, name: 1, set: 1,
        })
        .toArray(),
    ]);
    const stockByCmId = new Map(stockHits.map((s) => [s.productId, s]));
    for (const cmId of lotCmIds) {
      const ev = evHits.find((e) => e.cardmarket_id === cmId);
      const stock = stockByCmId.get(cmId);
      const name = ev?.name ?? stock?.name ?? `#${cmId}`;
      if (queryNameRegex && !queryNameRegex.test(name)) continue;
      merged.set(cmId, {
        cardmarket_id: cmId,
        name,
        set_name: ev ? (setNameByCode.get(ev.set) ?? null) : (stock?.set ?? null),
        rarity: ev?.rarity ?? null,
        foil_default: lotsByCmId.get(cmId)?.foil_default ?? false,
        lot_remaining: lotsByCmId.get(cmId)?.qty_remaining ?? null,
      });
    }
  }

  // Sort: cards with existing lots first (most likely target), then alpha.
  const rows = Array.from(merged.values())
    .sort((a, b) => {
      const aHas = a.lot_remaining != null ? 1 : 0;
      const bHas = b.lot_remaining != null ? 1 : 0;
      if (aHas !== bHas) return bHas - aHas;
      return a.name.localeCompare(b.name);
    })
    .slice(0, 50);

  return { rows };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function resolveSetCodesForInvestment(
  db: Db,
  inv: Investment
): Promise<string[]> {
  // box: source.set_code is authoritative.
  if (inv.source.kind === "box") return [inv.source.set_code];
  // product / customer_bulk / collection: resolve via ev_sets by cm_set_names.
  if (inv.cm_set_names?.length) {
    const sets = await db
      .collection("dashboard_ev_sets")
      .find({ name: { $in: inv.cm_set_names } })
      .project<{ code: string }>({ code: 1 })
      .toArray();
    return sets.map((s) => s.code);
  }
  return [];
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Smoke-verify**

```bash
cat > scripts/_check-sellable.ts << 'EOF'
try { process.loadEnvFile(".env"); } catch {}
import { listSellableCards } from "../lib/investments/manual-sales";
import { getDb, getClient } from "../lib/mongodb";
async function main() {
  const id = "69e80180715adc74ddf18dc4";
  for (const q of ["", "augur", "desperate", "mikaeus"]) {
    const r = await listSellableCards({ db: await getDb(), investmentId: id, q });
    console.log(`q="${q}": ${r.rows.length} rows; sample:`,
      r.rows.slice(0, 3).map(x => `${x.name} (cm=${x.cardmarket_id} lot_rem=${x.lot_remaining})`));
  }
}
main().finally(async () => { const c = await getClient(); await c.close(); });
EOF
npx tsx scripts/_check-sellable.ts
rm scripts/_check-sellable.ts
```
Expected: `q=""` returns existing lots; `q="augur"` matches Augur of Bolas; `q="desperate"` matches the mismapped Desperate Lunge.

- [ ] **Step 4: Commit**

```bash
git add lib/investments/manual-sales.ts
git commit -m "feat(investments): listSellableCards typeahead query"
```

---

## Task 5: API — POST /manual-sale + DELETE /sale-log/[id]

**Files:**
- Create: `app/api/investments/[id]/manual-sale/route.ts`
- Create: `app/api/investments/[id]/sale-log/[saleLogId]/route.ts`

- [ ] **Step 1: Create the POST route**

Create `app/api/investments/[id]/manual-sale/route.ts`:

```ts
import { NextResponse } from "next/server";
import { withAuthParams } from "@/lib/api-helpers";
import { getDb } from "@/lib/mongodb";
import { recordManualSale } from "@/lib/investments/manual-sales";

interface Body {
  cardmarketId?: unknown;
  foil?: unknown;
  condition?: unknown;
  language?: unknown;
  qty?: unknown;
  unitPriceEur?: unknown;
  wasListed?: unknown;
  date?: unknown;
  note?: unknown;
}

export const POST = withAuthParams<{ id: string }>(async (req, _s, { id }) => {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const cardmarketId = Number(body.cardmarketId);
  const qty = Number(body.qty);
  const unitPriceEur = Number(body.unitPriceEur);
  const condition = typeof body.condition === "string" ? body.condition : "";
  const language = typeof body.language === "string" ? body.language : "English";
  const foil = body.foil === true;
  const wasListed = body.wasListed === true;
  const dateStr = typeof body.date === "string" ? body.date : null;
  const date = dateStr ? new Date(dateStr) : new Date();
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : undefined;

  if (!Number.isFinite(cardmarketId) || cardmarketId <= 0) {
    return NextResponse.json({ error: "cardmarketId required" }, { status: 400 });
  }
  if (!Number.isFinite(qty) || qty <= 0) {
    return NextResponse.json({ error: "qty must be > 0" }, { status: 400 });
  }
  if (!Number.isFinite(unitPriceEur) || unitPriceEur < 0) {
    return NextResponse.json({ error: "unitPriceEur must be ≥ 0" }, { status: 400 });
  }
  if (!condition) {
    return NextResponse.json({ error: "condition required" }, { status: 400 });
  }
  if (Number.isNaN(date.getTime())) {
    return NextResponse.json({ error: "invalid date" }, { status: 400 });
  }

  const db = await getDb();
  const result = await recordManualSale({
    db,
    investmentId: id,
    cardmarketId,
    foil,
    condition,
    language,
    qty,
    unitPriceEur,
    wasListed,
    date,
    note,
  });

  switch (result.status) {
    case "ok":
      return NextResponse.json(result, { status: 201 });
    case "no-investment":
      return NextResponse.json({ error: "investment not found" }, { status: 404 });
    case "frozen":
      return NextResponse.json({ error: "investment is closed or archived" }, { status: 403 });
    case "cannot-grow-collection-kind":
      return NextResponse.json(
        { error: "off-the-books sales not allowed for collection-kind investments" },
        { status: 422 }
      );
    case "insufficient-remaining":
      return NextResponse.json(
        { error: `not enough remaining (have ${result.have}, want ${result.want})`, ...result },
        { status: 422 }
      );
  }
}, "investments-manual-sale");
```

- [ ] **Step 2: Create the DELETE route**

Create `app/api/investments/[id]/sale-log/[saleLogId]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { withAuthParams } from "@/lib/api-helpers";
import { getDb } from "@/lib/mongodb";
import { deleteManualSale } from "@/lib/investments/manual-sales";

export const DELETE = withAuthParams<{ id: string; saleLogId: string }>(
  async (_req, _s, { id, saleLogId }) => {
    const db = await getDb();
    const result = await deleteManualSale({ db, investmentId: id, saleLogId });
    switch (result.status) {
      case "ok":
        return NextResponse.json({ ok: true });
      case "not-found":
        return NextResponse.json({ error: "sale log row not found" }, { status: 404 });
      case "not-manual":
        return NextResponse.json(
          { error: "only manual sales can be deleted" },
          { status: 403 }
        );
      case "frozen":
        return NextResponse.json(
          { error: "investment is closed or archived" },
          { status: 403 }
        );
    }
  },
  "investments-sale-log-delete"
);
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add app/api/investments/[id]/manual-sale app/api/investments/[id]/sale-log
git commit -m "feat(investments): POST /manual-sale + DELETE /sale-log/[id]"
```

---

## Task 6: API — GET /sale-log

**Files:**
- Create: `app/api/investments/[id]/sale-log/route.ts`

- [ ] **Step 1: Create the route**

Create `app/api/investments/[id]/sale-log/route.ts`:

```ts
import { NextResponse } from "next/server";
import { withAuthParams } from "@/lib/api-helpers";
import { getDb } from "@/lib/mongodb";
import { getInvestment } from "@/lib/investments/service";
import { listSaleLog } from "@/lib/investments/manual-sales";

export const GET = withAuthParams<{ id: string }>(async (req, _s, { id }) => {
  const inv = await getInvestment(id);
  if (!inv) return NextResponse.json({ error: "investment not found" }, { status: 404 });
  const url = new URL(req.url);
  const pageStr = url.searchParams.get("page");
  const pageSizeStr = url.searchParams.get("pageSize");
  const page = pageStr && !Number.isNaN(Number(pageStr)) ? Number(pageStr) : undefined;
  const pageSize = pageSizeStr && !Number.isNaN(Number(pageSizeStr)) ? Number(pageSizeStr) : undefined;
  const db = await getDb();
  const result = await listSaleLog({ db, investmentId: id, page, pageSize });
  return result;
}, "investments-sale-log-list");
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/api/investments/[id]/sale-log/route.ts
git commit -m "feat(investments): GET /sale-log paginated read"
```

---

## Task 7: API — GET /sellable-cards

**Files:**
- Create: `app/api/investments/[id]/sellable-cards/route.ts`

- [ ] **Step 1: Create the route**

Create `app/api/investments/[id]/sellable-cards/route.ts`:

```ts
import { NextResponse } from "next/server";
import { withAuthParams } from "@/lib/api-helpers";
import { getDb } from "@/lib/mongodb";
import { getInvestment } from "@/lib/investments/service";
import { listSellableCards } from "@/lib/investments/manual-sales";

export const GET = withAuthParams<{ id: string }>(async (req, _s, { id }) => {
  const inv = await getInvestment(id);
  if (!inv) return NextResponse.json({ error: "investment not found" }, { status: 404 });
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? undefined;
  const db = await getDb();
  const result = await listSellableCards({ db, investmentId: id, q });
  return result;
}, "investments-sellable-cards");
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: clean.

```bash
git add app/api/investments/[id]/sellable-cards/route.ts
git commit -m "feat(investments): GET /sellable-cards typeahead source"
```

---

## Task 8: UI — ManualSaleCardPicker (typeahead)

**Files:**
- Create: `components/investments/ManualSaleCardPicker.tsx`

- [ ] **Step 1: Create the typeahead component**

Create `components/investments/ManualSaleCardPicker.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { Search } from "lucide-react";
import { fetcher } from "@/lib/fetcher";
import { FoilStar } from "@/components/dashboard/cm-sprite";

export interface SellableCardOption {
  cardmarket_id: number;
  name: string;
  set_name: string | null;
  rarity: string | null;
  foil_default: boolean;
  lot_remaining: number | null;
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

interface Props {
  investmentId: string;
  selected: SellableCardOption | null;
  onSelect: (card: SellableCardOption) => void;
  /** Visual override when the parent wants the picker to look "locked" after
   *  a selection. We still allow re-selection by clicking the input. */
  disabled?: boolean;
}

export default function ManualSaleCardPicker({ investmentId, selected, onSelect, disabled }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const debounced = useDebounced(query, 200);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useSWR<{ rows: SellableCardOption[] }>(
    open ? `/api/investments/${investmentId}/sellable-cards?q=${encodeURIComponent(debounced)}` : null,
    fetcher,
    { dedupingInterval: 5_000, keepPreviousData: true }
  );
  const rows = data?.rows ?? [];

  // Click-outside to close.
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const displayValue = selected ? selected.name : query;

  return (
    <div ref={containerRef} className="relative">
      <div
        className="relative flex items-center"
        style={{ border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-card)" }}
      >
        <Search size={12} style={{ color: "var(--text-muted)", position: "absolute", left: 10 }} />
        <input
          type="text"
          value={displayValue}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          disabled={disabled}
          placeholder="Search by card name…"
          className="w-full bg-transparent text-sm py-2 pl-8 pr-3 outline-none"
          style={{ color: "var(--text-primary)" }}
        />
      </div>

      {open && (
        <div
          className="absolute left-0 right-0 mt-1 max-h-72 overflow-y-auto rounded-lg shadow-lg z-50"
          style={{
            background: "rgba(15, 20, 25, 0.98)",
            border: "1px solid rgba(255,255,255,0.10)",
            boxShadow: "0 12px 40px rgba(0, 0, 0, 0.5)",
          }}
        >
          {isLoading && rows.length === 0 ? (
            <div className="px-3 py-4 text-xs text-center" style={{ color: "var(--text-muted)" }}>
              Searching…
            </div>
          ) : rows.length === 0 ? (
            <div className="px-3 py-4 text-xs text-center" style={{ color: "var(--text-muted)" }}>
              {debounced ? "No matches." : "Start typing to search the set, or pick from existing lots below."}
            </div>
          ) : (
            <ul>
              {rows.map((row) => (
                <li key={row.cardmarket_id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(row);
                      setOpen(false);
                      setQuery("");
                    }}
                    className="w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between gap-2"
                    style={{ color: "var(--text-secondary)" }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--bg-hover)";
                      e.currentTarget.style.color = "var(--text-primary)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.color = "var(--text-secondary)";
                    }}
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="truncate">{row.name}</span>
                      {row.foil_default && <FoilStar />}
                      {row.rarity && (
                        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                          · {row.rarity}
                        </span>
                      )}
                    </span>
                    {row.lot_remaining != null && (
                      <span
                        className="text-[10px] shrink-0 px-1.5 py-0.5 rounded"
                        style={{ background: "rgba(74, 222, 128, 0.10)", color: "#4ade80" }}
                      >
                        Tracked: {row.lot_remaining} remaining
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/investments/ManualSaleCardPicker.tsx
git commit -m "feat(investments): ManualSaleCardPicker typeahead"
```

---

## Task 9: UI — ManualSaleModal

**Files:**
- Create: `components/investments/ManualSaleModal.tsx`

- [ ] **Step 1: Create the modal**

Create `components/investments/ManualSaleModal.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/dashboard/modal";
import Select from "@/components/dashboard/select";
import { Field } from "@/components/dashboard/page-shell";
import ManualSaleCardPicker, { type SellableCardOption } from "./ManualSaleCardPicker";

interface Props {
  open: boolean;
  onClose: () => void;
  investmentId: string;
  onSaved: () => void;
}

const CONDITION_OPTIONS = ["MT", "NM", "EX", "GD", "LP", "PL", "PO"].map((v) => ({ value: v, label: v }));
const LANGUAGE_OPTIONS = ["English", "German", "French", "Italian", "Spanish", "Portuguese", "Japanese", "Chinese", "Korean", "Russian"]
  .map((v) => ({ value: v, label: v }));

const fieldStyle: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  color: "var(--text-primary)",
  borderRadius: 8,
};

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ManualSaleModal({ open, onClose, investmentId, onSaved }: Props) {
  const [card, setCard] = useState<SellableCardOption | null>(null);
  const [condition, setCondition] = useState("NM");
  const [foil, setFoil] = useState(false);
  const [language, setLanguage] = useState("English");
  const [qty, setQty] = useState(1);
  const [unitPriceEur, setUnitPriceEur] = useState<number | "">("");
  const [wasListed, setWasListed] = useState(true);
  const [date, setDate] = useState(isoToday);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset on close.
  useEffect(() => {
    if (!open) {
      setCard(null);
      setCondition("NM");
      setFoil(false);
      setLanguage("English");
      setQty(1);
      setUnitPriceEur("");
      setWasListed(true);
      setDate(isoToday());
      setNote("");
      setError(null);
    }
  }, [open]);

  // Auto-defaults when picking a card.
  useEffect(() => {
    if (!card) return;
    setFoil(card.foil_default);
    // Don't override condition/language — user may want a different copy.
    // Default disposition: "was listed" if a tracked lot exists for this card,
    // else "off-the-books" (more likely if there's no tracking yet).
    setWasListed(card.lot_remaining != null && card.lot_remaining > 0);
  }, [card]);

  const previewLine = useMemo(() => {
    if (!card || !Number.isFinite(qty) || qty <= 0) return null;
    if (wasListed) {
      const have = card.lot_remaining ?? 0;
      if (have < qty) {
        return `Lot only has ${have} remaining — increase the lot or switch to "never listed".`;
      }
      return `Lot will go from Remaining ${have} to ${have - qty}, Sold +${qty}.`;
    }
    if (card.lot_remaining == null) {
      return `Will create a new lot: Opened ${qty}, Sold ${qty}, Remaining 0.`;
    }
    return `Lot's Opened will grow by ${qty} and Sold by ${qty}. Remaining stays at ${card.lot_remaining}.`;
  }, [card, qty, wasListed]);

  const canSubmit =
    card != null &&
    Number.isFinite(qty) && qty > 0 &&
    typeof unitPriceEur === "number" && Number.isFinite(unitPriceEur) && unitPriceEur >= 0 &&
    !!condition && !!language && !!date && !submitting;

  async function submit() {
    if (!card) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/investments/${investmentId}/manual-sale`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cardmarketId: card.cardmarket_id,
          foil,
          condition,
          language,
          qty,
          unitPriceEur: typeof unitPriceEur === "number" ? unitPriceEur : 0,
          wasListed,
          date: new Date(`${date}T12:00:00Z`).toISOString(),
          note: note.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || `HTTP ${res.status}`);
        return;
      }
      onSaved();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Record a sale outside Cardmarket" maxWidth="max-w-xl">
      <div className="flex flex-col gap-4">
        <Field label="Card sold">
          <ManualSaleCardPicker
            investmentId={investmentId}
            selected={card}
            onSelect={setCard}
          />
          {card && (
            <div className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
              Picked: <span style={{ color: "var(--text-secondary)" }}>{card.name}</span>
              {card.set_name && <> · {card.set_name}</>}
              {card.lot_remaining != null && <> · {card.lot_remaining} remaining in this investment</>}
            </div>
          )}
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Condition">
            <Select size="sm" value={condition} onChange={setCondition} options={CONDITION_OPTIONS} />
          </Field>
          <Field label="Language">
            <Select size="sm" value={language} onChange={setLanguage} options={LANGUAGE_OPTIONS} />
          </Field>
          <Field label="Foil">
            <label className="flex items-center gap-2 text-xs h-8" style={{ color: "var(--text-secondary)" }}>
              <input type="checkbox" checked={foil} onChange={(e) => setFoil(e.target.checked)} />
              Foil printing
            </label>
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Quantity">
            <input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
              className="appraiser-field text-xs py-2 px-3"
              style={{ ...fieldStyle, fontFamily: "var(--font-mono)" }}
            />
          </Field>
          <Field label="Sale price per unit (€, gross)">
            <input
              type="number"
              min={0}
              step="0.01"
              value={unitPriceEur}
              onChange={(e) => {
                const v = e.target.value;
                setUnitPriceEur(v === "" ? "" : Number(v));
              }}
              className="appraiser-field text-xs py-2 px-3"
              style={{ ...fieldStyle, fontFamily: "var(--font-mono)" }}
              placeholder="e.g. 5.00"
            />
          </Field>
          <Field label="Sale date">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="appraiser-field text-xs py-2 px-3"
              style={{ ...fieldStyle, fontFamily: "var(--font-mono)" }}
            />
          </Field>
        </div>

        <Field label="Note (optional)">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Buyer name, FNM trade-in, etc."
            className="appraiser-field text-xs py-2 px-3 w-full"
            style={fieldStyle}
          />
        </Field>

        <div className="flex flex-col gap-2 mt-2">
          <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
            Was this card already listed on Cardmarket?
          </span>
          <label
            className="flex items-start gap-2 p-3 rounded-lg cursor-pointer"
            style={{
              border: `1px solid ${wasListed ? "var(--accent)" : "var(--border)"}`,
              background: wasListed ? "rgba(96, 165, 250, 0.08)" : "var(--bg-card)",
            }}
          >
            <input
              type="radio"
              checked={wasListed}
              onChange={() => setWasListed(true)}
              className="mt-0.5"
            />
            <span className="text-xs" style={{ color: "var(--text-primary)" }}>
              <strong>I&apos;m pulling this card out of my Cardmarket stock</strong>
              <div className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                I had this card listed on CM and I&apos;m taking it down because it sold in person. It already shows up in this investment&apos;s &quot;Remaining&quot; count. Recording this sale will subtract <strong>{qty}</strong> from Remaining and add <strong>{qty}</strong> to Sold.
              </div>
            </span>
          </label>
          <label
            className="flex items-start gap-2 p-3 rounded-lg cursor-pointer"
            style={{
              border: `1px solid ${!wasListed ? "var(--accent)" : "var(--border)"}`,
              background: !wasListed ? "rgba(96, 165, 250, 0.08)" : "var(--bg-card)",
            }}
          >
            <input
              type="radio"
              checked={!wasListed}
              onChange={() => setWasListed(false)}
              className="mt-0.5"
            />
            <span className="text-xs" style={{ color: "var(--text-primary)" }}>
              <strong>I sold it without ever listing it on Cardmarket</strong>
              <div className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                This copy was opened from the box and sold without ever being listed on CM. The lot ledger doesn&apos;t know about it yet, so recording this sale will add <strong>{qty}</strong> to Opened (so the cost basis sees it) and <strong>{qty}</strong> to Sold. Remaining stays the same.
              </div>
            </span>
          </label>
        </div>

        {previewLine && (
          <div
            className="text-[11px] px-3 py-2 rounded-lg"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {previewLine}
          </div>
        )}

        {error && (
          <div className="text-xs px-3 py-2 rounded-lg" style={{ background: "var(--error-light)", color: "var(--error)" }}>
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-2">
          <button
            onClick={onClose}
            className="px-3 py-2 text-xs rounded-lg"
            style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="px-4 py-2 text-xs rounded-lg font-medium"
            style={{
              background: canSubmit ? "var(--accent)" : "var(--bg-card)",
              color: canSubmit ? "var(--accent-text)" : "var(--text-muted)",
              border: "1px solid var(--border)",
              cursor: canSubmit ? "pointer" : "not-allowed",
            }}
          >
            {submitting ? "Saving…" : "Record sale"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/investments/ManualSaleModal.tsx
git commit -m "feat(investments): ManualSaleModal form"
```

---

## Task 10: UI — InvestmentSalesPanel

**Files:**
- Create: `components/investments/InvestmentSalesPanel.tsx`

- [ ] **Step 1: Create the panel**

Create `components/investments/InvestmentSalesPanel.tsx`:

```tsx
"use client";

import useSWR from "swr";
import { useState } from "react";
import { Receipt, X, ExternalLink } from "lucide-react";
import { fetcher } from "@/lib/fetcher";
import { FoilStar } from "@/components/dashboard/cm-sprite";
import { Panel, H2 } from "@/components/dashboard/page-shell";
import { StatusPill } from "@/components/dashboard/status-pill";
import { Pagination } from "@/components/dashboard/pagination";

interface SaleRow {
  id: string;
  cardmarket_id: number;
  foil: boolean;
  condition: string;
  language: string;
  name: string | null;
  qty: number;
  unit_price_eur: number;
  net_per_unit_eur: number;
  attributed_at: string;
  source: "cardmarket" | "manual";
  order_id: string;
  note: string | null;
}

interface SaleResponse {
  rows: SaleRow[];
  total: number;
  page: number;
  pageSize: number;
}

const formatEur = (n: number | null | undefined) =>
  n != null ? `${n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : "—";

const formatDate = (iso: string) => new Date(iso).toISOString().slice(0, 10);

export default function InvestmentSalesPanel({ investmentId }: { investmentId: string }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  const swrKey = `/api/investments/${investmentId}/sale-log?${qs.toString()}`;
  const { data, isLoading, mutate } = useSWR<SaleResponse>(swrKey, fetcher, {
    dedupingInterval: 5_000, keepPreviousData: true,
  });
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const [busy, setBusy] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!confirm("Delete this manual sale? The lot will be reversed.")) return;
    setBusy(id);
    try {
      const res = await fetch(`/api/investments/${investmentId}/sale-log/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(body.error || `HTTP ${res.status}`);
        return;
      }
      mutate();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Panel>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <H2 icon={<Receipt size={16} />}>Sales</H2>
          {total > 0 && <StatusPill tone="accent">{total.toLocaleString()}</StatusPill>}
        </div>
      </div>

      {isLoading && rows.length === 0 ? (
        <p className="text-xs py-6 text-center" style={{ color: "var(--text-muted)" }}>Loading sales…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs py-6 text-center" style={{ color: "var(--text-muted)" }}>
          No sales yet. Cardmarket sales appear here automatically when an order moves to paid; record an in-person sale via &quot;Record manual sale&quot; above.
        </p>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="sm:hidden flex flex-col gap-2">
            {rows.map((r) => (
              <div
                key={r.id}
                className="rounded-lg p-3"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="text-sm flex items-center gap-1 min-w-0">
                    <span className="truncate">{r.name ?? `#${r.cardmarket_id}`}</span>
                    {r.foil && <FoilStar />}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <SourcePill row={r} />
                    {r.source === "manual" && (
                      <button
                        onClick={() => handleDelete(r.id)}
                        disabled={busy === r.id}
                        aria-label="Delete manual sale"
                        className="text-[var(--text-muted)] hover:text-[var(--error)] p-1"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                  <span>{r.qty}× {formatEur(r.unit_price_eur)}</span>
                  <span>net {formatEur(r.net_per_unit_eur)}/u</span>
                  <span className="text-right">{formatDate(r.attributed_at)}</span>
                </div>
                {r.note && (
                  <div className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {r.note}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-xs" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
              <thead>
                <tr style={{ color: "var(--text-muted)" }}>
                  <th className="text-left py-2 font-medium">Card</th>
                  <th className="text-center py-2 font-medium">Cond</th>
                  <th className="text-center py-2 font-medium">Lang</th>
                  <th className="text-right py-2 font-medium">Qty</th>
                  <th className="text-right py-2 font-medium">Unit €</th>
                  <th className="text-right py-2 font-medium">Net €/u</th>
                  <th className="text-center py-2 font-medium">Date</th>
                  <th className="text-left py-2 font-medium">Source</th>
                  <th className="py-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    style={{ borderTop: "1px solid var(--border)" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-card-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <td className="py-2">
                      <span className="inline-flex items-center gap-1">
                        <span>{r.name ?? `#${r.cardmarket_id}`}</span>
                        {r.foil && <FoilStar />}
                      </span>
                    </td>
                    <td className="py-2 text-center" style={{ color: "var(--text-muted)" }}>{r.condition}</td>
                    <td className="py-2 text-center text-[10px]" style={{ color: "var(--text-muted)" }}>{r.language}</td>
                    <td className="py-2 text-right" style={{ fontFamily: "var(--font-mono)" }}>{r.qty}</td>
                    <td className="py-2 text-right" style={{ fontFamily: "var(--font-mono)" }}>{formatEur(r.unit_price_eur)}</td>
                    <td className="py-2 text-right" style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{formatEur(r.net_per_unit_eur)}</td>
                    <td className="py-2 text-center text-[11px]" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{formatDate(r.attributed_at)}</td>
                    <td className="py-2"><SourcePill row={r} /></td>
                    <td className="py-2 text-right">
                      {r.source === "manual" && (
                        <button
                          onClick={() => handleDelete(r.id)}
                          disabled={busy === r.id}
                          aria-label="Delete manual sale"
                          className="text-[var(--text-muted)] hover:text-[var(--error)] p-1"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            page={page}
            total={total}
            pageSize={pageSize}
            onChange={setPage}
            onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
            pageSizeOptions={[10, 25, 50, 100]}
          />
        </>
      )}
    </Panel>
  );
}

function SourcePill({ row }: { row: SaleRow }) {
  if (row.source === "manual") {
    return (
      <span
        title={row.note ?? undefined}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]"
        style={{ background: "rgba(168, 162, 158, 0.10)", color: "var(--text-muted)" }}
      >
        Manual
        {row.note && <span className="text-[9px]">·</span>}
      </span>
    );
  }
  return (
    <a
      href={`https://www.cardmarket.com/en/Magic/Orders/${row.order_id}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-[11px]"
      style={{ color: "var(--accent)", textDecoration: "none" }}
    >
      #{row.order_id}
      <ExternalLink size={10} />
    </a>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/investments/InvestmentSalesPanel.tsx
git commit -m "feat(investments): InvestmentSalesPanel — list + delete manual sales"
```

---

## Task 11: Wire trigger + panel into InvestmentDetail; browser verification

**Files:**
- Modify: `components/investments/InvestmentDetail.tsx`

- [ ] **Step 1: Read the file's import block + render block**

Read `components/investments/InvestmentDetail.tsx` and locate:
- The imports at the top
- The button container for the Actions menu (`<div ref={menuRef} className="relative">…</div>`, around line 199)
- The render block where `<InvestmentLotsTable />` lives (~line 280)

- [ ] **Step 2: Add imports**

Add these imports near the existing ones (after `import InvestmentLotsTable`):

```tsx
import ManualSaleModal from "./ManualSaleModal";
import InvestmentSalesPanel from "./InvestmentSalesPanel";
```

And add `Plus` to the existing `lucide-react` import line (so the trigger button has an icon).

- [ ] **Step 3: Add modal-open state**

In the component body, with the other `useState` declarations, add:

```tsx
const [showManualSale, setShowManualSale] = useState(false);
```

- [ ] **Step 4: Add the trigger button next to the Actions menu**

Replace the Actions-menu container `<div ref={menuRef} className="relative">…</div>` with a wrapping `<div className="flex items-center gap-2">`:

```tsx
<div className="flex items-center gap-2">
  {detail.status === "listing" && (
    <button
      onClick={() => setShowManualSale(true)}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        color: "var(--text-secondary)",
      }}
    >
      <Plus size={12} />
      Record manual sale
    </button>
  )}
  <div ref={menuRef} className="relative">
    {/* existing Actions button + menu */}
  </div>
</div>
```

(Keep the existing Actions button + dropdown contents inside the inner div — only the wrapping `flex items-center gap-2` is new, and the new "Record manual sale" button sits before it.)

- [ ] **Step 5: Render the sales panel + the modal**

Below `<InvestmentLotsTable investmentId={detail.id} />` add the new panel:

```tsx
<InvestmentLotsTable investmentId={detail.id} />

<InvestmentSalesPanel investmentId={detail.id} />
```

At the bottom of the component, alongside the other modals (e.g. SealedFlipModal, etc.), add the manual-sale modal:

```tsx
<ManualSaleModal
  open={showManualSale}
  onClose={() => setShowManualSale(false)}
  investmentId={detail.id}
  onSaved={() => {
    mutate();          // existing SWR mutator for /api/investments/[id]
  }}
/>
```

If `mutate` isn't already in scope (the detail fetch's mutator), make sure the `useSWR` for `/api/investments/[id]` returns it and that you've destructured it. The existing code likely already calls `mutate()` from other handlers — reuse the same.

- [ ] **Step 6: Typecheck + dev-server build**

Run:
```bash
npx tsc --noEmit
npm run dev
```

Expected: typecheck clean. Dev server boots on port 3025.

- [ ] **Step 7: Browser verification (manual, against dev server)**

Open `http://localhost:3025/investments/69e80180715adc74ddf18dc4` (the J25 investment).

Verify each:

1. The "Record manual sale" button appears next to the Actions menu. The "Sales" panel appears below the Lot ledger and shows the existing CM sale (Augur of Bolas, qty 1, €0.10).
2. Click "Record manual sale" — modal opens, title reads "Record a sale outside Cardmarket".
3. Type a few characters into the card picker (e.g. "augur") — the dropdown shows "Augur of Bolas · uncommon · Tracked: 2 remaining".
4. Pick Augur of Bolas. Picker collapses, "Picked: Augur of Bolas · Foundations Jumpstart · 2 remaining" line appears. Foil/condition/language defaults look right. The "I'm pulling this card out" radio is preselected (because lot exists).
5. Enter qty=1, unit price=€5, today's date. Preview line reads: *"Lot will go from Remaining 2 to 1, Sold +1."*
6. Click "Record sale". Modal closes. Sales panel updates to show the new manual sale row with a "Manual" pill. Lot ledger row for Augur drops to Remaining 1.
7. Open the modal again. Pick Augur of Bolas. Switch to "I sold it without ever listing it on Cardmarket". Preview: *"Lot's Opened will grow by 1 and Sold by 1. Remaining stays at 1."* Save. Verify the lot now reads `Opened 4 · Sold 3 · Remaining 1` and Sales panel shows the off-the-books row.
8. Click the × on the off-the-books row. Confirm. Lot returns to `Opened 3 · Sold 2 · Remaining 1`; sale row is gone.
9. Click the × on the was-listed manual sale. Lot returns to `Opened 3 · Sold 1 · Remaining 2`.
10. (For the user's actual two cards): open the modal twice more, pick the relevant cards from "Other cards in Foundations Jumpstart", select "I sold it without ever listing it on Cardmarket", enter the actual qty/price/date/note, save. Verify both appear in the Sales panel and that the corresponding lots exist with correct numbers.

If any verification step fails, debug, fix, return to step 6.

- [ ] **Step 8: Commit**

```bash
git add components/investments/InvestmentDetail.tsx
git commit -m "feat(investments): wire manual-sale modal + sales panel into detail page"
```

- [ ] **Step 9: Push**

```bash
git push
```

---

## Self-review

After writing this plan, here's my pass against the spec:

**Spec coverage:**
- Trigger button on detail page → Task 11.
- Modal with typeahead, cond/foil/lang, qty/price/date/note, disposition radio with explainer copy, live preview → Tasks 8 + 9.
- Sales panel with delete on manual rows → Task 10.
- `recordManualSale`, `deleteManualSale` (both modes, all refusal cases) → Task 2 (covered by smoke script).
- `listSaleLog` paginated → Task 3.
- `listSellableCards` typeahead → Task 4.
- POST /manual-sale → Task 5.
- DELETE /sale-log/[id] → Task 5.
- GET /sale-log → Task 6.
- GET /sellable-cards → Task 7.
- Schema additions (note/manual/grew_lot) → Task 1.
- "Out of scope" items (edit, bulk, structured counterparty, per-row sell shortcut) — correctly absent.

**Type consistency:**
- `RecordManualSaleResult` / `DeleteManualSaleResult` defined in Task 2, used in Task 5. ✓
- `SellableCardOption` defined in Task 8 mirrors `SellableCardItem` from Task 4 (just renamed for the component). ✓
- `SaleRow` in Task 10's panel mirrors `SaleLogListItem` from Task 3. ✓
- `generateManualSaleId` defined in Task 2, used in `recordManualSale` (same task). ✓

**Placeholder scan:**
- All code blocks contain real implementation, no TBD/TODO.
- Verification steps in Task 11 enumerate concrete checks against the J25 investment, not vague "test the feature".
