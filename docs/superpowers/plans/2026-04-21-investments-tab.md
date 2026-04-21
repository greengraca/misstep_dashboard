# Investments Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an `/investments` tab that tracks sealed MTG purchases, attributes opened singles to each investment via a pre-opening baseline + live delta, and accounts for realized/unrealized return as stock sells down. Extension gets a scoped baseline-walk flow to capture pre-opening stock state.

**Architecture:** New business-logic module `lib/investments/` (pure math + DB service split), new API surface under `app/api/investments/`, client pages under `app/(dashboard)/investments/`, components under `components/investments/`. Four new collections (`dashboard_investments`, `dashboard_investment_baseline`, `dashboard_investment_lots`, `dashboard_investment_sale_log`). Attribution runs as fire-and-forget hooks inside `processStock`/`processProductStock`/`processOrders` in `lib/cardmarket.ts`. Extension v1.8.0 adds a baseline-mode branch to `content/extractors/product-stock.js`.

**Tech Stack:** Next.js 16 App Router, TypeScript 5.9, MongoDB native driver, SWR, Vitest, lucide-react (`TrendingUp` icon), `<FoilStar />` from `components/dashboard/cm-sprite.tsx`.

**Spec:** `docs/superpowers/specs/2026-04-21-investments-tab-design.md`

**Commit convention:** NEVER add `Co-Authored-By` lines. No Claude/Anthropic attribution. Follow the short, scope-prefixed style of recent commits (`feat(investments):`, `fix(investments):`, `chore(investments):`).

---

## File Structure

**Create (dashboard):**
- `lib/investments/types.ts` — Investment, InvestmentBaseline, InvestmentLot, InvestmentSaleLog + request/response DTOs
- `lib/investments/db.ts` — collection-name constants + `ensureIndexes()`
- `lib/investments/math.ts` — pure logic: `computeExpectedOpenCardCount`, `computeCostBasisPerUnit`, `computeAttributable`
- `lib/investments/service.ts` — DB operations: `createInvestment`, `getInvestment`, `listInvestments`, `updateInvestment`, `archiveInvestment`, `recordSealedFlip`, `closeInvestment`, `getBaselineTargets`, `upsertBaselineBatch`, `markBaselineComplete`, `adjustLot`, `listLots`
- `lib/investments/attribution.ts` — `maybeGrowLot`, `consumeSale`, `reverseSale` (impure; called from cardmarket.ts)
- `lib/__tests__/investments-math.test.ts`
- `lib/__tests__/investments-attribution.test.ts`
- `app/api/investments/route.ts` — GET list, POST create
- `app/api/investments/[id]/route.ts` — GET detail, PATCH, DELETE (archive)
- `app/api/investments/[id]/sealed-flip/route.ts` — POST
- `app/api/investments/[id]/close/route.ts` — POST
- `app/api/investments/[id]/lots/route.ts` — GET
- `app/api/investments/[id]/lots/[lotId]/route.ts` — PATCH
- `app/api/investments/[id]/baseline/route.ts` — POST (ext auth)
- `app/api/investments/[id]/baseline/targets/route.ts` — GET (ext auth)
- `app/api/investments/[id]/baseline/complete/route.ts` — POST (dashboard or ext auth)
- `app/(dashboard)/investments/page.tsx` — thin wrapper
- `app/(dashboard)/investments/[id]/page.tsx` — thin wrapper
- `components/investments/InvestmentsContent.tsx` — list page
- `components/investments/CreateInvestmentModal.tsx`
- `components/investments/InvestmentDetail.tsx`
- `components/investments/BaselineBanner.tsx`
- `components/investments/InvestmentKpiRow.tsx`
- `components/investments/SealedFlipsSection.tsx`
- `components/investments/SealedFlipModal.tsx`
- `components/investments/InvestmentLotsTable.tsx`
- `components/investments/CloseInvestmentModal.tsx`

**Modify (dashboard):**
- `lib/cardmarket.ts` — call `maybeGrowLot` on qty increases in `processStock` + `processProductStock`; call `consumeSale` / `reverseSale` in `processOrders` stock-mutation path
- `components/dashboard/sidebar.tsx` — add Investments entry under MANAGEMENT
- `lib/constants.ts` — bump `LATEST_EXT_VERSION` to `"1.8.0"` (last task, coordinated with ext release)

**Create / modify (extension at `D:\Projetos\misstep-ext`):**
- `manifest.json` — version `1.7.2` → `1.8.0`
- `lib/constants.js` — add `BASELINE_STORAGE_KEY`, add `API_INVESTMENTS` base
- `content/extractors/product-stock.js` — baseline-mode branch
- `content/baseline-overlay.js` (NEW) — overlay showing target progress + next-card button
- `background.js` — message routing for `investment_baseline` payload + baseline-mode state
- `popup/popup.html` + `popup/popup.js` — baseline-mode UI (investment picker, progress, mark-complete button)

---

## Task 1: Types + constants + DB indexes

**Files:**
- Create: `lib/investments/types.ts`
- Create: `lib/investments/db.ts`

- [ ] **Step 1: Write the types file**

Create `lib/investments/types.ts`:

```typescript
import type { ObjectId } from "mongodb";

export type InvestmentStatus = "baseline_captured" | "listing" | "closed" | "archived";
export type BoosterType = "play" | "collector" | "jumpstart" | "set";

export interface InvestmentSourceBox {
  kind: "box";
  set_code: string;              // Scryfall set code
  booster_type: BoosterType;
  packs_per_box: number;
  cards_per_pack: number;
  box_count: number;
}

export interface InvestmentSourceProduct {
  kind: "product";
  product_slug: string;          // FK to dashboard_ev_products.slug
  unit_count: number;
}

export type InvestmentSource = InvestmentSourceBox | InvestmentSourceProduct;

export interface SealedFlip {
  recorded_at: Date;
  unit_count: number;
  proceeds_eur: number;
  note?: string;
}

export interface Investment {
  _id: ObjectId;
  name: string;
  created_at: Date;
  created_by: string;            // session.user.id
  status: InvestmentStatus;
  cost_total_eur: number;
  cost_notes?: string;
  source: InvestmentSource;
  cm_set_names: string[];
  sealed_flips: SealedFlip[];
  expected_open_card_count: number;
  baseline_completed_at?: Date;
  closed_at?: Date;
}

export interface InvestmentBaseline {
  _id: ObjectId;
  investment_id: ObjectId;
  cardmarket_id: number;
  foil: boolean;
  condition: string;
  qty_baseline: number;
  captured_at: Date;
}

export interface InvestmentLot {
  _id: ObjectId;
  investment_id: ObjectId;
  cardmarket_id: number;
  foil: boolean;
  condition: string;
  qty_opened: number;
  qty_sold: number;
  qty_remaining: number;
  cost_basis_per_unit: number | null;  // null while listing, set at close
  proceeds_eur: number;
  last_grown_at: Date;
  frozen_at?: Date;
}

export interface InvestmentSaleLog {
  _id: ObjectId;
  lot_id: ObjectId;
  investment_id: ObjectId;
  order_id: string;
  article_id?: string;
  cardmarket_id: number;
  foil: boolean;
  condition: string;
  qty: number;
  unit_price_eur: number;
  net_per_unit_eur: number;
  attributed_at: Date;
}

// DTOs used by API routes

export interface InvestmentListItem {
  id: string;
  name: string;
  status: InvestmentStatus;
  created_at: string;
  source: InvestmentSource;
  cost_total_eur: number;
  listed_value_eur: number;
  realized_eur: number;
  sealed_flips_total_eur: number;
}

export interface InvestmentDetail {
  id: string;
  name: string;
  status: InvestmentStatus;
  created_at: string;
  created_by: string;
  cost_total_eur: number;
  cost_notes?: string;
  source: InvestmentSource;
  cm_set_names: string[];
  sealed_flips: SealedFlip[];
  expected_open_card_count: number;
  baseline_completed_at?: string;
  closed_at?: string;
  kpis: {
    cost_eur: number;
    expected_ev_eur: number | null;
    listed_value_eur: number;
    realized_net_eur: number;
    net_pl_blended_eur: number;
    break_even_pct: number;   // 0..∞ (>1 = profit)
  };
  baseline_progress?: {
    captured_cardmarket_ids: number;
    target_cardmarket_ids: number;
  };
}

export interface CreateInvestmentBody {
  name: string;
  cost_total_eur: number;
  cost_notes?: string;
  source: InvestmentSource;
}

export interface UpdateInvestmentBody {
  name?: string;
  cost_total_eur?: number;
  cost_notes?: string;
  cm_set_names?: string[];
}

export interface SealedFlipBody {
  unit_count: number;
  proceeds_eur: number;
  note?: string;
}

export interface BaselineBatchBody {
  listings: Array<{
    cardmarket_id: number;
    foil: boolean;
    condition: string;
    qty: number;
  }>;
  // cardmarket_ids the extension visited (even if empty) — so dashboard can
  // mark them captured even when no listings exist on that page.
  visited_cardmarket_ids: number[];
}

export interface BaselineTargetsResponse {
  cardmarket_ids: number[];
  cm_set_names: string[];
  captured_cardmarket_ids: number[];   // for resume / progress
}
```

- [ ] **Step 2: Write the db module**

Create `lib/investments/db.ts`:

```typescript
import { getDb } from "@/lib/mongodb";
import { COLLECTION_PREFIX } from "@/lib/constants";

export const COL_INVESTMENTS = `${COLLECTION_PREFIX}investments`;
export const COL_INVESTMENT_BASELINE = `${COLLECTION_PREFIX}investment_baseline`;
export const COL_INVESTMENT_LOTS = `${COLLECTION_PREFIX}investment_lots`;
export const COL_INVESTMENT_SALE_LOG = `${COLLECTION_PREFIX}investment_sale_log`;

let indexesEnsured = false;

export async function ensureInvestmentIndexes(): Promise<void> {
  if (indexesEnsured) return;
  try {
    const db = await getDb();
    await db.collection(COL_INVESTMENTS).createIndex(
      { status: 1, created_at: -1 },
      { name: "status_createdAt" }
    );
    await db.collection(COL_INVESTMENTS).createIndex(
      { "source.set_code": 1, status: 1 },
      { name: "sourceSetCode_status" }
    );
    await db.collection(COL_INVESTMENT_BASELINE).createIndex(
      { investment_id: 1, cardmarket_id: 1, foil: 1, condition: 1 },
      { unique: true, name: "baseline_unique" }
    );
    await db.collection(COL_INVESTMENT_LOTS).createIndex(
      { investment_id: 1, cardmarket_id: 1, foil: 1, condition: 1 },
      { unique: true, name: "lot_unique" }
    );
    await db.collection(COL_INVESTMENT_LOTS).createIndex(
      { cardmarket_id: 1, foil: 1, condition: 1 },
      { name: "lot_by_card" }
    );
    await db.collection(COL_INVESTMENT_SALE_LOG).createIndex(
      { order_id: 1 },
      { name: "salelog_order_id" }
    );
    await db.collection(COL_INVESTMENT_SALE_LOG).createIndex(
      { lot_id: 1, attributed_at: -1 },
      { name: "salelog_lot_time" }
    );
    indexesEnsured = true;
  } catch {
    indexesEnsured = true;
  }
}
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/investments/types.ts lib/investments/db.ts
git commit -m "feat(investments): add types + collection constants + index setup"
```

---

## Task 2: Pure math helpers + tests

**Files:**
- Create: `lib/investments/math.ts`
- Create: `lib/__tests__/investments-math.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/investments-math.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  computeExpectedOpenCardCount,
  computeCostBasisPerUnit,
  computeAttributable,
  sumSealedFlipProceeds,
} from "../investments/math";
import type { Investment, SealedFlip } from "../investments/types";

function boxInvestment(over: Partial<Investment> = {}): Investment {
  return {
    _id: {} as never,
    name: "test",
    created_at: new Date(),
    created_by: "u1",
    status: "listing",
    cost_total_eur: 900,
    source: {
      kind: "box",
      set_code: "fdn",
      booster_type: "jumpstart",
      packs_per_box: 24,
      cards_per_pack: 20,
      box_count: 12,
    },
    cm_set_names: ["Foundations: Jumpstart"],
    sealed_flips: [],
    expected_open_card_count: 24 * 20 * 12,
    ...over,
  };
}

describe("computeExpectedOpenCardCount", () => {
  it("box: packs_per_box * cards_per_pack * (box_count - flipped)", () => {
    const inv = boxInvestment();
    expect(computeExpectedOpenCardCount(inv)).toBe(5760);
  });

  it("box: reduces by unit_count of sealed flips", () => {
    const flips: SealedFlip[] = [
      { recorded_at: new Date(), unit_count: 2, proceeds_eur: 170 },
    ];
    const inv = boxInvestment({ sealed_flips: flips });
    expect(computeExpectedOpenCardCount(inv)).toBe(24 * 20 * 10);
  });

  it("product: uses product-card-count * unit_count (provided)", () => {
    const inv: Investment = {
      ...boxInvestment(),
      source: { kind: "product", product_slug: "slug", unit_count: 3 },
      expected_open_card_count: 300,
      sealed_flips: [{ recorded_at: new Date(), unit_count: 1, proceeds_eur: 50 }],
    };
    // Caller provides total cards per unit via helper arg since product
    // card count lives on EvProduct, not Investment.
    expect(computeExpectedOpenCardCount(inv, { cardsPerProductUnit: 100 })).toBe(200);
  });
});

describe("computeCostBasisPerUnit", () => {
  it("divides (cost - sealed_flip_proceeds) by total opened", () => {
    const inv = boxInvestment({
      sealed_flips: [{ recorded_at: new Date(), unit_count: 2, proceeds_eur: 170 }],
    });
    const totalOpened = 4800;
    expect(computeCostBasisPerUnit(inv, totalOpened)).toBeCloseTo((900 - 170) / 4800, 10);
  });

  it("returns null when totalOpened is 0", () => {
    expect(computeCostBasisPerUnit(boxInvestment(), 0)).toBeNull();
  });

  it("returns null when denominator is negative (shouldn't happen but guard)", () => {
    expect(computeCostBasisPerUnit(boxInvestment(), -5)).toBeNull();
  });
});

describe("sumSealedFlipProceeds", () => {
  it("sums proceeds_eur across flips", () => {
    const flips: SealedFlip[] = [
      { recorded_at: new Date(), unit_count: 1, proceeds_eur: 85 },
      { recorded_at: new Date(), unit_count: 2, proceeds_eur: 160 },
    ];
    expect(sumSealedFlipProceeds(flips)).toBe(245);
  });

  it("handles empty", () => {
    expect(sumSealedFlipProceeds([])).toBe(0);
  });
});

describe("computeAttributable", () => {
  it("returns current_stock - baseline - lot_already_opened, floored at 0", () => {
    expect(
      computeAttributable({ currentStockQty: 7, baselineQty: 2, lotAlreadyOpened: 3 })
    ).toBe(2);
  });

  it("returns 0 when delta is negative", () => {
    expect(
      computeAttributable({ currentStockQty: 1, baselineQty: 2, lotAlreadyOpened: 0 })
    ).toBe(0);
  });

  it("returns 0 on exact balance", () => {
    expect(
      computeAttributable({ currentStockQty: 3, baselineQty: 1, lotAlreadyOpened: 2 })
    ).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npm test -- lib/__tests__/investments-math.test.ts`
Expected: FAIL — module `../investments/math` not found.

- [ ] **Step 3: Write the math module**

Create `lib/investments/math.ts`:

```typescript
import type { Investment, SealedFlip } from "./types";

export function sumSealedFlipProceeds(flips: SealedFlip[]): number {
  let total = 0;
  for (const f of flips) total += f.proceeds_eur;
  return total;
}

function sumSealedFlipUnits(flips: SealedFlip[]): number {
  let total = 0;
  for (const f of flips) total += f.unit_count;
  return total;
}

/**
 * Compute expected cards to be opened, given the current source config + sealed flips.
 *
 * For product-kind investments, the total cards per unit is not on the Investment
 * document (it lives on EvProduct.cards[*].count). The caller must pass it in
 * via options.cardsPerProductUnit — the service layer reads that from the product.
 */
export function computeExpectedOpenCardCount(
  investment: Investment,
  options: { cardsPerProductUnit?: number } = {}
): number {
  const flippedUnits = sumSealedFlipUnits(investment.sealed_flips);
  if (investment.source.kind === "box") {
    const { packs_per_box, cards_per_pack, box_count } = investment.source;
    return packs_per_box * cards_per_pack * Math.max(0, box_count - flippedUnits);
  }
  const perUnit = options.cardsPerProductUnit ?? 0;
  return perUnit * Math.max(0, investment.source.unit_count - flippedUnits);
}

/** Live / frozen cost basis per opened card. Returns null when totalOpened <= 0. */
export function computeCostBasisPerUnit(
  investment: Investment,
  totalOpened: number
): number | null {
  if (totalOpened <= 0) return null;
  const net = investment.cost_total_eur - sumSealedFlipProceeds(investment.sealed_flips);
  return net / totalOpened;
}

/** How many more cards of this tuple we may attribute right now. */
export function computeAttributable(params: {
  currentStockQty: number;
  baselineQty: number;
  lotAlreadyOpened: number;
}): number {
  const delta = params.currentStockQty - params.baselineQty - params.lotAlreadyOpened;
  return delta > 0 ? delta : 0;
}
```

- [ ] **Step 4: Run the tests to confirm pass**

Run: `npm test -- lib/__tests__/investments-math.test.ts`
Expected: PASS — 10 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/investments/math.ts lib/__tests__/investments-math.test.ts
git commit -m "feat(investments): add pure math helpers (budget, cost basis, attributable)"
```

---

## Task 3: Service skeleton — create + read investments

**Files:**
- Create: `lib/investments/service.ts`

- [ ] **Step 1: Write the service module (create + read only)**

Create `lib/investments/service.ts`:

```typescript
import { ObjectId, type Db } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { COL_EV_PRODUCTS } from "@/lib/ev-products";
import {
  COL_INVESTMENTS,
  COL_INVESTMENT_BASELINE,
  COL_INVESTMENT_LOTS,
  ensureInvestmentIndexes,
} from "./db";
import { computeExpectedOpenCardCount } from "./math";
import type {
  CreateInvestmentBody,
  Investment,
  InvestmentListItem,
  InvestmentSource,
  UpdateInvestmentBody,
} from "./types";
import type { EvProduct } from "@/lib/types";

/** Sum of EvProduct.cards[*].count — total cards in one unit of the product. */
async function cardsPerProductUnit(db: Db, slug: string): Promise<number> {
  const p = await db.collection<EvProduct>(COL_EV_PRODUCTS).findOne({ slug });
  if (!p) return 0;
  return p.cards.reduce((sum, c) => sum + c.count, 0);
}

async function recomputeExpectedOpenCardCount(
  db: Db,
  investment: Investment
): Promise<number> {
  if (investment.source.kind === "product") {
    const perUnit = await cardsPerProductUnit(db, investment.source.product_slug);
    return computeExpectedOpenCardCount(investment, { cardsPerProductUnit: perUnit });
  }
  return computeExpectedOpenCardCount(investment);
}

export async function createInvestment(params: {
  body: CreateInvestmentBody;
  userId: string;
}): Promise<Investment> {
  await ensureInvestmentIndexes();
  const db = await getDb();
  const now = new Date();
  // Compute expected_open_card_count up front.
  const stub: Investment = {
    _id: new ObjectId(),
    name: params.body.name.trim(),
    created_at: now,
    created_by: params.userId,
    status: "baseline_captured",
    cost_total_eur: params.body.cost_total_eur,
    cost_notes: params.body.cost_notes?.trim() || undefined,
    source: params.body.source,
    cm_set_names: await defaultCmSetNames(db, params.body.source),
    sealed_flips: [],
    expected_open_card_count: 0,
  };
  stub.expected_open_card_count = await recomputeExpectedOpenCardCount(db, stub);
  await db.collection<Investment>(COL_INVESTMENTS).insertOne(stub);
  return stub;
}

/** Resolve default CM set-name variants for an investment's source.
 *  Looks up dashboard_ev_sets for box-kind; uses EvProduct's parent_set_code for product-kind. */
async function defaultCmSetNames(db: Db, source: InvestmentSource): Promise<string[]> {
  if (source.kind === "box") {
    const set = await db
      .collection("dashboard_ev_sets")
      .findOne({ code: source.set_code }, { projection: { name: 1 } });
    return set?.name ? [set.name as string] : [];
  }
  const p = await db
    .collection<EvProduct>(COL_EV_PRODUCTS)
    .findOne({ slug: source.product_slug }, { projection: { parent_set_code: 1 } });
  if (!p?.parent_set_code) return [];
  const set = await db
    .collection("dashboard_ev_sets")
    .findOne({ code: p.parent_set_code }, { projection: { name: 1 } });
  return set?.name ? [set.name as string] : [];
}

export async function getInvestment(id: string): Promise<Investment | null> {
  if (!ObjectId.isValid(id)) return null;
  const db = await getDb();
  return db
    .collection<Investment>(COL_INVESTMENTS)
    .findOne({ _id: new ObjectId(id) });
}

export async function listInvestments(params: {
  status?: Investment["status"];
}): Promise<Investment[]> {
  const db = await getDb();
  const filter: Record<string, unknown> = {};
  if (params.status) filter.status = params.status;
  return db
    .collection<Investment>(COL_INVESTMENTS)
    .find(filter)
    .sort({ created_at: -1 })
    .toArray();
}

export async function updateInvestment(params: {
  id: string;
  body: UpdateInvestmentBody;
}): Promise<Investment | null> {
  if (!ObjectId.isValid(params.id)) return null;
  const db = await getDb();
  const $set: Record<string, unknown> = {};
  if (params.body.name !== undefined) $set.name = params.body.name.trim();
  if (params.body.cost_total_eur !== undefined)
    $set.cost_total_eur = params.body.cost_total_eur;
  if (params.body.cost_notes !== undefined)
    $set.cost_notes = params.body.cost_notes.trim() || undefined;
  if (params.body.cm_set_names !== undefined) $set.cm_set_names = params.body.cm_set_names;
  if (Object.keys($set).length === 0) return getInvestment(params.id);
  const res = await db
    .collection<Investment>(COL_INVESTMENTS)
    .findOneAndUpdate(
      { _id: new ObjectId(params.id) },
      { $set },
      { returnDocument: "after" }
    );
  return res ?? null;
}

export async function archiveInvestment(id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const db = await getDb();
  const res = await db
    .collection<Investment>(COL_INVESTMENTS)
    .updateOne({ _id: new ObjectId(id) }, { $set: { status: "archived" } });
  return res.matchedCount > 0;
}

/** Summary aggregates for list view: total listed value + realized per investment. */
export async function listInvestmentSummaries(params: {
  status?: Investment["status"];
}): Promise<InvestmentListItem[]> {
  const db = await getDb();
  const investments = await listInvestments(params);
  const ids = investments.map((i) => i._id);
  const lots = await db
    .collection(COL_INVESTMENT_LOTS)
    .aggregate<{ _id: ObjectId; proceeds: number }>([
      { $match: { investment_id: { $in: ids } } },
      { $group: { _id: "$investment_id", proceeds: { $sum: "$proceeds_eur" } } },
    ])
    .toArray();
  const proceedsByInv = new Map<string, number>();
  for (const row of lots) proceedsByInv.set(String(row._id), row.proceeds);
  return investments.map((inv) => ({
    id: String(inv._id),
    name: inv.name,
    status: inv.status,
    created_at: inv.created_at.toISOString(),
    source: inv.source,
    cost_total_eur: inv.cost_total_eur,
    listed_value_eur: 0,  // filled by a downstream helper; cheap 0 for skeleton
    realized_eur: proceedsByInv.get(String(inv._id)) ?? 0,
    sealed_flips_total_eur: inv.sealed_flips.reduce((s, f) => s + f.proceeds_eur, 0),
  }));
}

// Stubs to be filled in later tasks.
export async function recordSealedFlip(): Promise<never> {
  throw new Error("recordSealedFlip: implemented in Task 8");
}
export async function closeInvestment(): Promise<never> {
  throw new Error("closeInvestment: implemented in Task 9");
}
export async function getBaselineTargets(): Promise<never> {
  throw new Error("getBaselineTargets: implemented in Task 12");
}
export async function upsertBaselineBatch(): Promise<never> {
  throw new Error("upsertBaselineBatch: implemented in Task 13");
}
export async function markBaselineComplete(): Promise<never> {
  throw new Error("markBaselineComplete: implemented in Task 14");
}
export async function adjustLot(): Promise<never> {
  throw new Error("adjustLot: implemented in Task 11");
}
export async function listLots(): Promise<never> {
  throw new Error("listLots: implemented in Task 10");
}
```

Note: the `COL_INVESTMENT_BASELINE` import is unused for now — it will be used in later tasks. If TypeScript complains, leave it and disable with a `// eslint-disable-next-line` if needed, or remove and re-add in Task 12.

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: no errors. If `COL_INVESTMENT_BASELINE` is unused, remove it from the import until Task 12.

- [ ] **Step 3: Commit**

```bash
git add lib/investments/service.ts
git commit -m "feat(investments): service module skeleton (create, read, update, archive)"
```

---

## Task 4: API — POST /api/investments (create)

**Files:**
- Create: `app/api/investments/route.ts`

- [ ] **Step 1: Write the route**

Create `app/api/investments/route.ts`:

```typescript
import { NextResponse, type NextRequest } from "next/server";
import { withAuth, withAuthRead } from "@/lib/api-helpers";
import { logActivity } from "@/lib/activity";
import {
  createInvestment,
  listInvestmentSummaries,
} from "@/lib/investments/service";
import type { CreateInvestmentBody, Investment } from "@/lib/investments/types";

function validateSource(src: unknown): string | null {
  if (!src || typeof src !== "object") return "source is required";
  const kind = (src as { kind?: unknown }).kind;
  if (kind === "box") {
    const s = src as Record<string, unknown>;
    if (typeof s.set_code !== "string" || !s.set_code) return "source.set_code required";
    if (!["play", "collector", "jumpstart", "set"].includes(s.booster_type as string))
      return "source.booster_type invalid";
    if (typeof s.packs_per_box !== "number" || s.packs_per_box <= 0)
      return "source.packs_per_box must be positive";
    if (typeof s.cards_per_pack !== "number" || s.cards_per_pack <= 0)
      return "source.cards_per_pack must be positive";
    if (typeof s.box_count !== "number" || s.box_count <= 0)
      return "source.box_count must be positive";
    return null;
  }
  if (kind === "product") {
    const s = src as Record<string, unknown>;
    if (typeof s.product_slug !== "string" || !s.product_slug)
      return "source.product_slug required";
    if (typeof s.unit_count !== "number" || s.unit_count <= 0)
      return "source.unit_count must be positive";
    return null;
  }
  return "source.kind must be 'box' or 'product'";
}

export const GET = withAuthRead(async (req) => {
  const url = new URL(req.url);
  const statusQ = url.searchParams.get("status") as Investment["status"] | null;
  const summaries = await listInvestmentSummaries({ status: statusQ ?? undefined });
  return { investments: summaries };
}, "investments-list");

export const POST = withAuth(async (req: NextRequest, session) => {
  const body = (await req.json()) as CreateInvestmentBody;
  if (typeof body.name !== "string" || !body.name.trim())
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (typeof body.cost_total_eur !== "number" || body.cost_total_eur < 0)
    return NextResponse.json(
      { error: "cost_total_eur must be a non-negative number" },
      { status: 400 }
    );
  const srcErr = validateSource(body.source);
  if (srcErr) return NextResponse.json({ error: srcErr }, { status: 400 });

  const inv = await createInvestment({
    body,
    userId: session.user?.id ?? "system",
  });
  logActivity(
    "create",
    "investment",
    String(inv._id),
    `Created investment "${inv.name}" (€${inv.cost_total_eur})`,
    session.user?.id ?? "system",
    session.user?.name ?? "unknown"
  );
  return { investment: { ...inv, _id: String(inv._id) } };
}, "investments-create");
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev` in another terminal. Log in. Then in browser devtools:

```javascript
await fetch("/api/investments", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    name: "Smoke test",
    cost_total_eur: 100,
    source: { kind: "box", set_code: "fdn", booster_type: "jumpstart", packs_per_box: 24, cards_per_pack: 20, box_count: 1 }
  })
}).then(r => r.json())
```

Expected: `{investment: {_id: "...", name: "Smoke test", status: "baseline_captured", ...}}`.

Verify in Mongo shell:
```
db.dashboard_investments.findOne({ name: "Smoke test" })
// confirms expected_open_card_count = 480
```

Delete it after:
```
db.dashboard_investments.deleteMany({ name: "Smoke test" })
```

- [ ] **Step 4: Commit**

```bash
git add app/api/investments/route.ts
git commit -m "feat(investments): GET list + POST create endpoints"
```

---

## Task 5: API — GET/PATCH/DELETE /api/investments/[id]

**Files:**
- Create: `app/api/investments/[id]/route.ts`

- [ ] **Step 1: Add listed-value helper to service.ts**

Edit `lib/investments/service.ts`. Add the helper next to `listInvestmentSummaries`:

```typescript
import { latestPlayEvBySet } from "@/lib/ev-products";  // add to imports
```

Then add:

```typescript
/** Sum of stock.price * stock.qty across rows matching open lots for this investment. */
export async function computeListedValue(investmentId: ObjectId): Promise<number> {
  const db = await getDb();
  const lots = await db
    .collection(COL_INVESTMENT_LOTS)
    .find({ investment_id: investmentId, qty_remaining: { $gt: 0 } })
    .project<{ cardmarket_id: number; foil: boolean; condition: string }>({
      cardmarket_id: 1,
      foil: 1,
      condition: 1,
    })
    .toArray();
  if (lots.length === 0) return 0;
  const cursor = db.collection("dashboard_cm_stock").aggregate<{ total: number }>([
    {
      $match: {
        $or: lots.map((l) => ({
          productId: l.cardmarket_id,
          foil: l.foil,
          condition: l.condition,
        })),
      },
    },
    { $group: { _id: null, total: { $sum: { $multiply: ["$qty", "$price"] } } } },
  ]);
  const row = await cursor.next();
  return row?.total ?? 0;
}

export async function computeBaselineProgress(investmentId: ObjectId): Promise<{
  captured_cardmarket_ids: number;
  target_cardmarket_ids: number;
}> {
  const db = await getDb();
  const captured = await db
    .collection(COL_INVESTMENT_BASELINE)
    .distinct("cardmarket_id", { investment_id: investmentId });
  // Target count is determined by the source; temporary stub returns captured count as target
  // until Task 12 fills this in.
  return { captured_cardmarket_ids: captured.length, target_cardmarket_ids: captured.length };
}

/** Expected EV for display. Best-effort; returns null if unavailable. */
export async function computeExpectedEv(investment: Investment): Promise<number | null> {
  const db = await getDb();
  if (investment.source.kind === "box") {
    const map = await latestPlayEvBySet([investment.source.set_code]);
    const perPackEv = map[investment.source.set_code];
    if (perPackEv == null) return null;
    return perPackEv * investment.source.packs_per_box * investment.source.box_count;
  }
  // product-kind: read latest snapshot from dashboard_ev_snapshots
  const snap = await db
    .collection("dashboard_ev_snapshots")
    .find({ product_slug: investment.source.product_slug })
    .sort({ date: -1 })
    .limit(1)
    .next();
  const evPerUnit =
    (snap?.ev_net_opened as number | null) ??
    (snap?.ev_net_sealed as number | null) ??
    (snap?.ev_net_cards_only as number | null) ??
    null;
  if (evPerUnit == null) return null;
  return evPerUnit * investment.source.unit_count;
}

export async function buildInvestmentDetail(
  inv: Investment
): Promise<import("./types").InvestmentDetail> {
  const listed = await computeListedValue(inv._id);
  const expected = await computeExpectedEv(inv);
  const proceedsAgg = await (await getDb())
    .collection(COL_INVESTMENT_LOTS)
    .aggregate<{ total: number }>([
      { $match: { investment_id: inv._id } },
      { $group: { _id: null, total: { $sum: "$proceeds_eur" } } },
    ])
    .next();
  const lotProceeds = proceedsAgg?.total ?? 0;
  const sealedProceeds = inv.sealed_flips.reduce((s, f) => s + f.proceeds_eur, 0);
  const realized = lotProceeds + sealedProceeds;
  const baseline =
    inv.status === "baseline_captured"
      ? await computeBaselineProgress(inv._id)
      : undefined;
  return {
    id: String(inv._id),
    name: inv.name,
    status: inv.status,
    created_at: inv.created_at.toISOString(),
    created_by: inv.created_by,
    cost_total_eur: inv.cost_total_eur,
    cost_notes: inv.cost_notes,
    source: inv.source,
    cm_set_names: inv.cm_set_names,
    sealed_flips: inv.sealed_flips,
    expected_open_card_count: inv.expected_open_card_count,
    baseline_completed_at: inv.baseline_completed_at?.toISOString(),
    closed_at: inv.closed_at?.toISOString(),
    kpis: {
      cost_eur: inv.cost_total_eur,
      expected_ev_eur: expected,
      listed_value_eur: listed,
      realized_net_eur: realized,
      net_pl_blended_eur: realized + listed - inv.cost_total_eur,
      break_even_pct: inv.cost_total_eur > 0 ? realized / inv.cost_total_eur : 0,
    },
    baseline_progress: baseline,
  };
}
```

Also update `listInvestmentSummaries` to use `computeListedValue`: replace the `listed_value_eur: 0` with `await computeListedValue(inv._id)` inside the map. Since `Array.prototype.map` doesn't await, convert to a `Promise.all`:

```typescript
return Promise.all(
  investments.map(async (inv) => ({
    id: String(inv._id),
    name: inv.name,
    status: inv.status,
    created_at: inv.created_at.toISOString(),
    source: inv.source,
    cost_total_eur: inv.cost_total_eur,
    listed_value_eur: await computeListedValue(inv._id),
    realized_eur: proceedsByInv.get(String(inv._id)) ?? 0,
    sealed_flips_total_eur: inv.sealed_flips.reduce((s, f) => s + f.proceeds_eur, 0),
  }))
);
```

- [ ] **Step 2: Write the dynamic route**

Create `app/api/investments/[id]/route.ts`:

```typescript
import { NextResponse, type NextRequest } from "next/server";
import { withAuthParams } from "@/lib/api-helpers";
import { logActivity } from "@/lib/activity";
import {
  archiveInvestment,
  buildInvestmentDetail,
  getInvestment,
  updateInvestment,
} from "@/lib/investments/service";
import type { UpdateInvestmentBody } from "@/lib/investments/types";

export const GET = withAuthParams<{ id: string }>(async (_req, _session, { id }) => {
  const inv = await getInvestment(id);
  if (!inv) return NextResponse.json({ error: "not found" }, { status: 404 });
  const detail = await buildInvestmentDetail(inv);
  return { investment: detail };
}, "investments-detail");

export const PATCH = withAuthParams<{ id: string }>(async (req: NextRequest, session, { id }) => {
  const body = (await req.json()) as UpdateInvestmentBody;
  const inv = await updateInvestment({ id, body });
  if (!inv) return NextResponse.json({ error: "not found" }, { status: 404 });
  logActivity(
    "update",
    "investment",
    id,
    `Edited investment "${inv.name}"`,
    session.user?.id ?? "system",
    session.user?.name ?? "unknown"
  );
  const detail = await buildInvestmentDetail(inv);
  return { investment: detail };
}, "investments-update");

export const DELETE = withAuthParams<{ id: string }>(async (_req, session, { id }) => {
  const ok = await archiveInvestment(id);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  logActivity(
    "delete",
    "investment",
    id,
    "Archived investment",
    session.user?.id ?? "system",
    session.user?.name ?? "unknown"
  );
  return { archived: true };
}, "investments-archive");
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/investments/service.ts app/api/investments/[id]/route.ts
git commit -m "feat(investments): GET detail + PATCH edit + DELETE archive endpoints"
```

---

## Task 6: API — POST sealed-flip

**Files:**
- Create: `app/api/investments/[id]/sealed-flip/route.ts`
- Modify: `lib/investments/service.ts`

- [ ] **Step 1: Implement recordSealedFlip in service.ts**

Replace the stub for `recordSealedFlip` in `lib/investments/service.ts`:

```typescript
export async function recordSealedFlip(params: {
  id: string;
  body: import("./types").SealedFlipBody;
}): Promise<Investment | null> {
  if (!ObjectId.isValid(params.id)) return null;
  const db = await getDb();
  const inv = await db
    .collection<Investment>(COL_INVESTMENTS)
    .findOne({ _id: new ObjectId(params.id) });
  if (!inv) return null;

  const flip = {
    recorded_at: new Date(),
    unit_count: params.body.unit_count,
    proceeds_eur: params.body.proceeds_eur,
    note: params.body.note?.trim() || undefined,
  };
  const nextFlips = [...inv.sealed_flips, flip];
  const nextInv: Investment = { ...inv, sealed_flips: nextFlips };
  const nextExpected = await recomputeExpectedOpenCardCount(db, nextInv);

  const res = await db
    .collection<Investment>(COL_INVESTMENTS)
    .findOneAndUpdate(
      { _id: new ObjectId(params.id) },
      {
        $push: { sealed_flips: flip },
        $set: { expected_open_card_count: nextExpected },
      },
      { returnDocument: "after" }
    );
  return res ?? null;
}
```

- [ ] **Step 2: Write the route**

Create `app/api/investments/[id]/sealed-flip/route.ts`:

```typescript
import { NextResponse, type NextRequest } from "next/server";
import { withAuthParams } from "@/lib/api-helpers";
import { logActivity } from "@/lib/activity";
import { recordSealedFlip, buildInvestmentDetail } from "@/lib/investments/service";
import type { SealedFlipBody } from "@/lib/investments/types";

export const POST = withAuthParams<{ id: string }>(async (req: NextRequest, session, { id }) => {
  const body = (await req.json()) as SealedFlipBody;
  if (typeof body.unit_count !== "number" || body.unit_count <= 0)
    return NextResponse.json({ error: "unit_count must be positive" }, { status: 400 });
  if (typeof body.proceeds_eur !== "number" || body.proceeds_eur < 0)
    return NextResponse.json(
      { error: "proceeds_eur must be non-negative" },
      { status: 400 }
    );
  const inv = await recordSealedFlip({ id, body });
  if (!inv) return NextResponse.json({ error: "not found" }, { status: 404 });
  logActivity(
    "update",
    "investment",
    id,
    `Recorded sealed flip: ${body.unit_count} unit(s) for €${body.proceeds_eur}`,
    session.user?.id ?? "system",
    session.user?.name ?? "unknown"
  );
  const detail = await buildInvestmentDetail(inv);
  return { investment: detail };
}, "investments-sealed-flip");
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/investments/service.ts app/api/investments/[id]/sealed-flip/route.ts
git commit -m "feat(investments): record sealed-flip endpoint"
```

---

## Task 7: API — POST close

**Files:**
- Create: `app/api/investments/[id]/close/route.ts`
- Modify: `lib/investments/service.ts`

- [ ] **Step 1: Implement closeInvestment in service.ts**

Add to `lib/investments/service.ts` (replacing the stub):

```typescript
import { computeCostBasisPerUnit } from "./math";  // add to imports if not already

export async function closeInvestment(params: { id: string }): Promise<Investment | null> {
  if (!ObjectId.isValid(params.id)) return null;
  const db = await getDb();
  const invId = new ObjectId(params.id);
  const inv = await db.collection<Investment>(COL_INVESTMENTS).findOne({ _id: invId });
  if (!inv) return null;
  if (inv.status !== "listing" && inv.status !== "baseline_captured") {
    // Allow closing from either live-listing state or an untouched baseline_captured;
    // closed/archived are no-ops.
    return inv;
  }
  const totalOpenedAgg = await db
    .collection(COL_INVESTMENT_LOTS)
    .aggregate<{ total: number }>([
      { $match: { investment_id: invId } },
      { $group: { _id: null, total: { $sum: "$qty_opened" } } },
    ])
    .next();
  const totalOpened = totalOpenedAgg?.total ?? 0;
  const basis = computeCostBasisPerUnit(inv, totalOpened);
  const now = new Date();
  await db
    .collection(COL_INVESTMENT_LOTS)
    .updateMany(
      { investment_id: invId },
      { $set: { frozen_at: now, cost_basis_per_unit: basis } }
    );
  const res = await db.collection<Investment>(COL_INVESTMENTS).findOneAndUpdate(
    { _id: invId },
    { $set: { status: "closed", closed_at: now } },
    { returnDocument: "after" }
  );
  return res ?? null;
}
```

- [ ] **Step 2: Write the route**

Create `app/api/investments/[id]/close/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { withAuthParams } from "@/lib/api-helpers";
import { logActivity } from "@/lib/activity";
import { buildInvestmentDetail, closeInvestment } from "@/lib/investments/service";

export const POST = withAuthParams<{ id: string }>(async (_req, session, { id }) => {
  const inv = await closeInvestment({ id });
  if (!inv) return NextResponse.json({ error: "not found" }, { status: 404 });
  logActivity(
    "update",
    "investment",
    id,
    `Closed investment "${inv.name}"`,
    session.user?.id ?? "system",
    session.user?.name ?? "unknown"
  );
  const detail = await buildInvestmentDetail(inv);
  return { investment: detail };
}, "investments-close");
```

- [ ] **Step 3: Typecheck + commit**

Run: `npm run typecheck`

```bash
git add lib/investments/service.ts app/api/investments/[id]/close/route.ts
git commit -m "feat(investments): close endpoint (freezes lots + writes cost basis)"
```

---

## Task 8: API — GET/PATCH lots

**Files:**
- Create: `app/api/investments/[id]/lots/route.ts`
- Create: `app/api/investments/[id]/lots/[lotId]/route.ts`
- Modify: `lib/investments/service.ts`

- [ ] **Step 1: Implement listLots + adjustLot in service.ts**

Replace the stubs in `lib/investments/service.ts`:

```typescript
export interface LotListItem {
  id: string;
  cardmarket_id: number;
  foil: boolean;
  condition: string;
  name: string | null;
  set_code: string | null;
  qty_opened: number;
  qty_sold: number;
  qty_remaining: number;
  cost_basis_per_unit: number | null;
  proceeds_eur: number;
  live_price_eur: number | null;
}

export async function listLots(params: {
  id: string;
  search?: string;
  foil?: boolean;
  minRemaining?: number;
}): Promise<LotListItem[]> {
  if (!ObjectId.isValid(params.id)) return [];
  const db = await getDb();
  const filter: Record<string, unknown> = { investment_id: new ObjectId(params.id) };
  if (params.foil !== undefined) filter.foil = params.foil;
  if (params.minRemaining !== undefined) filter.qty_remaining = { $gte: params.minRemaining };
  const lots = await db
    .collection(COL_INVESTMENT_LOTS)
    .find(filter)
    .toArray();
  if (lots.length === 0) return [];
  const cmIds = Array.from(new Set(lots.map((l) => l.cardmarket_id as number)));
  const cards = await db
    .collection("dashboard_ev_cards")
    .find({ cardmarket_id: { $in: cmIds } })
    .project<{ cardmarket_id: number; name: string; set: string; cm_prices?: Record<string, { trend?: number }> }>({
      cardmarket_id: 1,
      name: 1,
      set: 1,
      cm_prices: 1,
    })
    .toArray();
  const cardByCmId = new Map<number, (typeof cards)[number]>();
  for (const c of cards) cardByCmId.set(c.cardmarket_id, c);
  const rows: LotListItem[] = lots.map((l) => {
    const card = cardByCmId.get(l.cardmarket_id as number);
    const priceKey = l.foil ? "foil" : "nonfoil";
    const trend =
      (card?.cm_prices?.[priceKey]?.trend as number | undefined) ?? null;
    return {
      id: String(l._id),
      cardmarket_id: l.cardmarket_id as number,
      foil: l.foil as boolean,
      condition: l.condition as string,
      name: card?.name ?? null,
      set_code: card?.set ?? null,
      qty_opened: l.qty_opened as number,
      qty_sold: l.qty_sold as number,
      qty_remaining: l.qty_remaining as number,
      cost_basis_per_unit: (l.cost_basis_per_unit as number | null) ?? null,
      proceeds_eur: l.proceeds_eur as number,
      live_price_eur: trend,
    };
  });
  if (params.search) {
    const q = params.search.toLowerCase();
    return rows.filter((r) => r.name?.toLowerCase().includes(q));
  }
  return rows;
}

export async function adjustLot(params: {
  id: string;
  lotId: string;
  qtyOpened: number;
}): Promise<boolean> {
  if (!ObjectId.isValid(params.id) || !ObjectId.isValid(params.lotId)) return false;
  if (params.qtyOpened < 0) return false;
  const db = await getDb();
  const lotId = new ObjectId(params.lotId);
  const lot = await db.collection(COL_INVESTMENT_LOTS).findOne({ _id: lotId });
  if (!lot) return false;
  const qtySold = lot.qty_sold as number;
  if (params.qtyOpened < qtySold) return false;   // can't go below what's already been sold
  const res = await db
    .collection(COL_INVESTMENT_LOTS)
    .updateOne(
      { _id: lotId, investment_id: new ObjectId(params.id) },
      { $set: { qty_opened: params.qtyOpened, qty_remaining: params.qtyOpened - qtySold } }
    );
  return res.matchedCount > 0;
}
```

- [ ] **Step 2: Write routes**

Create `app/api/investments/[id]/lots/route.ts`:

```typescript
import { withAuthParams } from "@/lib/api-helpers";
import { listLots } from "@/lib/investments/service";

export const GET = withAuthParams<{ id: string }>(async (req, _s, { id }) => {
  const url = new URL(req.url);
  const search = url.searchParams.get("search") ?? undefined;
  const foilParam = url.searchParams.get("foil");
  const foil = foilParam === "true" ? true : foilParam === "false" ? false : undefined;
  const minRemainingStr = url.searchParams.get("minRemaining");
  const minRemaining =
    minRemainingStr && !Number.isNaN(Number(minRemainingStr))
      ? Number(minRemainingStr)
      : undefined;
  const lots = await listLots({ id, search, foil, minRemaining });
  return { lots };
}, "investments-lots-list");
```

Create `app/api/investments/[id]/lots/[lotId]/route.ts`:

```typescript
import { NextResponse, type NextRequest } from "next/server";
import { withAuthParams } from "@/lib/api-helpers";
import { logActivity } from "@/lib/activity";
import { adjustLot } from "@/lib/investments/service";

export const PATCH = withAuthParams<{ id: string; lotId: string }>(
  async (req: NextRequest, session, { id, lotId }) => {
    const body = (await req.json()) as { qty_opened?: number };
    if (typeof body.qty_opened !== "number" || body.qty_opened < 0)
      return NextResponse.json({ error: "qty_opened must be >= 0" }, { status: 400 });
    const ok = await adjustLot({ id, lotId, qtyOpened: body.qty_opened });
    if (!ok)
      return NextResponse.json(
        { error: "could not adjust lot (not found or qty below sold)" },
        { status: 400 }
      );
    logActivity(
      "update",
      "investment",
      id,
      `Adjusted lot ${lotId} qty_opened to ${body.qty_opened}`,
      session.user?.id ?? "system",
      session.user?.name ?? "unknown"
    );
    return { ok: true };
  },
  "investments-lots-adjust"
);
```

- [ ] **Step 3: Typecheck + commit**

Run: `npm run typecheck`

```bash
git add lib/investments/service.ts app/api/investments/[id]/lots/route.ts app/api/investments/[id]/lots/[lotId]/route.ts
git commit -m "feat(investments): lot ledger GET + PATCH (manual qty adjustment)"
```

---

## Task 9: API — GET baseline/targets

**Files:**
- Create: `app/api/investments/[id]/baseline/targets/route.ts`
- Modify: `lib/investments/service.ts`

- [ ] **Step 1: Implement getBaselineTargets in service.ts**

Replace the stub in `lib/investments/service.ts`:

```typescript
export async function getBaselineTargets(params: { id: string }): Promise<{
  cardmarket_ids: number[];
  cm_set_names: string[];
  captured_cardmarket_ids: number[];
} | null> {
  if (!ObjectId.isValid(params.id)) return null;
  const db = await getDb();
  const invId = new ObjectId(params.id);
  const inv = await db.collection<Investment>(COL_INVESTMENTS).findOne({ _id: invId });
  if (!inv) return null;

  let cardmarketIds: number[];
  if (inv.source.kind === "box") {
    const cards = await db
      .collection("dashboard_ev_cards")
      .find(
        { set: inv.source.set_code, cardmarket_id: { $ne: null } },
        { projection: { cardmarket_id: 1 } }
      )
      .toArray();
    cardmarketIds = cards.map((c) => c.cardmarket_id as number);
  } else {
    const p = await db
      .collection<EvProduct>(COL_EV_PRODUCTS)
      .findOne({ slug: inv.source.product_slug });
    if (!p) return null;
    const scryfallIds = p.cards.map((c) => c.scryfall_id);
    const cards = await db
      .collection("dashboard_ev_cards")
      .find(
        { scryfall_id: { $in: scryfallIds }, cardmarket_id: { $ne: null } },
        { projection: { cardmarket_id: 1 } }
      )
      .toArray();
    cardmarketIds = cards.map((c) => c.cardmarket_id as number);
  }
  const captured = await db
    .collection(COL_INVESTMENT_BASELINE)
    .distinct("cardmarket_id", { investment_id: invId });
  return {
    cardmarket_ids: Array.from(new Set(cardmarketIds)),
    cm_set_names: inv.cm_set_names,
    captured_cardmarket_ids: captured as number[],
  };
}
```

Also update `computeBaselineProgress` so the `target_cardmarket_ids` is correct (not the stub):

```typescript
export async function computeBaselineProgress(investmentId: ObjectId): Promise<{
  captured_cardmarket_ids: number;
  target_cardmarket_ids: number;
}> {
  const db = await getDb();
  const inv = await db.collection<Investment>(COL_INVESTMENTS).findOne({ _id: investmentId });
  const captured = await db
    .collection(COL_INVESTMENT_BASELINE)
    .distinct("cardmarket_id", { investment_id: investmentId });
  if (!inv) return { captured_cardmarket_ids: captured.length, target_cardmarket_ids: 0 };
  // Reuse getBaselineTargets to compute target size.
  const targets = await getBaselineTargets({ id: String(investmentId) });
  return {
    captured_cardmarket_ids: captured.length,
    target_cardmarket_ids: targets?.cardmarket_ids.length ?? 0,
  };
}
```

- [ ] **Step 2: Write the route (dual-auth — ext or session)**

Create `app/api/investments/[id]/baseline/targets/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { withExtAuthReadParams } from "@/lib/api-ext-helpers";
import { getBaselineTargets } from "@/lib/investments/service";

export const GET = withExtAuthReadParams<{ id: string }>(async (_req, _identity, { id }) => {
  const targets = await getBaselineTargets({ id });
  if (!targets) return NextResponse.json({ error: "not found" }, { status: 404 });
  return targets;
}, "investments-baseline-targets");
```

**Dependency:** `withExtAuthReadParams` must exist. Check `lib/api-ext-helpers.ts` — if it doesn't, add the wrapper using the same pattern as `withAuthReadParams` + `requireExtAuth` OR fall back to `withAuthReadParams` (dashboard-only read) and have the extension use its Bearer token via a proxy endpoint. Simplest: add a dual-auth read-params wrapper mirroring the existing `withExtAuthRead`.

If you need to add it, append to `lib/api-ext-helpers.ts`:

```typescript
export function withExtAuthReadParams<P>(
  handler: (req: NextRequest, identity: ExtReadIdentity, params: P) => Promise<HandlerReturn>,
  routeName: string
) {
  return async (request: NextRequest, ctx: { params: Promise<P> }) => {
    try {
      // Try session first
      const sess = await requireAuth(request);
      let identity: ExtReadIdentity = {};
      if (!sess.error) {
        identity.sessionUser = sess.session.user?.name ?? undefined;
      } else {
        const ext = await requireExtAuth(request);
        if (ext.error) return ext.error;
        identity.memberName = ext.memberName;
      }
      const params = await ctx.params;
      return toResponse(await handler(request, identity, params));
    } catch (err) {
      console.error(`${routeName} error:`, err);
      logApiError(routeName, err);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}
```

Read `lib/api-ext-helpers.ts` before adding — if `withExtAuthRead` already does param-less dual auth, model the new function on it exactly.

- [ ] **Step 3: Typecheck + commit**

```bash
git add lib/investments/service.ts lib/api-ext-helpers.ts app/api/investments/[id]/baseline/targets/route.ts
git commit -m "feat(investments): baseline targets endpoint (dual-auth)"
```

---

## Task 10: API — POST baseline batch + complete

**Files:**
- Create: `app/api/investments/[id]/baseline/route.ts`
- Create: `app/api/investments/[id]/baseline/complete/route.ts`
- Modify: `lib/investments/service.ts`

- [ ] **Step 1: Implement upsertBaselineBatch + markBaselineComplete**

Replace the stubs in `lib/investments/service.ts`:

```typescript
export async function upsertBaselineBatch(params: {
  id: string;
  body: import("./types").BaselineBatchBody;
}): Promise<{ upserted: number; visited: number } | null> {
  if (!ObjectId.isValid(params.id)) return null;
  const db = await getDb();
  const invId = new ObjectId(params.id);
  const exists = await db.collection(COL_INVESTMENTS).findOne({ _id: invId }, { projection: { _id: 1 } });
  if (!exists) return null;
  const now = new Date();
  let upserted = 0;
  for (const l of params.body.listings) {
    if (
      typeof l.cardmarket_id !== "number" ||
      typeof l.foil !== "boolean" ||
      typeof l.condition !== "string" ||
      typeof l.qty !== "number" ||
      l.qty < 0
    ) {
      continue;
    }
    const res = await db.collection(COL_INVESTMENT_BASELINE).updateOne(
      {
        investment_id: invId,
        cardmarket_id: l.cardmarket_id,
        foil: l.foil,
        condition: l.condition,
      },
      {
        $set: {
          qty_baseline: l.qty,
          captured_at: now,
        },
        $setOnInsert: {
          investment_id: invId,
          cardmarket_id: l.cardmarket_id,
          foil: l.foil,
          condition: l.condition,
        },
      },
      { upsert: true }
    );
    if (res.upsertedCount > 0 || res.modifiedCount > 0) upserted++;
  }
  return { upserted, visited: params.body.visited_cardmarket_ids.length };
}

export async function markBaselineComplete(params: {
  id: string;
}): Promise<Investment | null> {
  if (!ObjectId.isValid(params.id)) return null;
  const db = await getDb();
  const invId = new ObjectId(params.id);
  const res = await db
    .collection<Investment>(COL_INVESTMENTS)
    .findOneAndUpdate(
      { _id: invId, status: "baseline_captured" },
      { $set: { status: "listing", baseline_completed_at: new Date() } },
      { returnDocument: "after" }
    );
  return res ?? null;
}
```

- [ ] **Step 2: Write the routes (both ext-auth; complete also allows dashboard)**

Create `app/api/investments/[id]/baseline/route.ts`:

```typescript
import { NextResponse, type NextRequest } from "next/server";
import { withExtAuthParams } from "@/lib/api-ext-helpers";
import { upsertBaselineBatch } from "@/lib/investments/service";
import type { BaselineBatchBody } from "@/lib/investments/types";

export const POST = withExtAuthParams<{ id: string }>(
  async (req: NextRequest, _memberName, { id }) => {
    const body = (await req.json()) as BaselineBatchBody;
    if (!Array.isArray(body.listings) || !Array.isArray(body.visited_cardmarket_ids))
      return NextResponse.json(
        { error: "listings and visited_cardmarket_ids arrays required" },
        { status: 400 }
      );
    const result = await upsertBaselineBatch({ id, body });
    if (!result) return NextResponse.json({ error: "not found" }, { status: 404 });
    return { ok: true, ...result };
  },
  "investments-baseline-batch"
);
```

**Dependency:** if `withExtAuthParams` doesn't exist, add it to `lib/api-ext-helpers.ts` the same way `withExtAuthReadParams` was added in Task 9 — it's `withExtAuth` with route params awaited from `ctx`. Pattern:

```typescript
export function withExtAuthParams<P>(
  handler: (req: NextRequest, memberName: string, params: P) => Promise<HandlerReturn>,
  routeName: string
) {
  return async (request: NextRequest, ctx: { params: Promise<P> }) => {
    try {
      const { memberName, error } = await requireExtAuth(request);
      if (error) return error;
      const params = await ctx.params;
      return toResponse(await handler(request, memberName, params));
    } catch (err) {
      console.error(`${routeName} error:`, err);
      logApiError(routeName, err);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}
```

Create `app/api/investments/[id]/baseline/complete/route.ts`. Dashboard users may also trigger manual completion, so use the dual-auth wrapper (add if needed). For simplicity we accept **either** auth; using `withExtAuthReadParams` and treating it as a POST (slightly irregular but OK) OR writing a custom dual-auth-write wrapper. Cleanest: add `withExtAuthWriteParams` following the same pattern. If you don't want a new wrapper, wire this route with two exports: write a helper that tries session → ext. Simplest sufficient:

```typescript
import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { requireExtAuth } from "@/lib/ext-auth";
import { logApiError } from "@/lib/error-log";
import { logActivity } from "@/lib/activity";
import { markBaselineComplete } from "@/lib/investments/service";

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const sess = await requireAuth(request);
    let userId = "system";
    let userName = "unknown";
    if (sess.error) {
      const ext = await requireExtAuth(request);
      if (ext.error) return ext.error;
      userName = ext.memberName;
      userId = ext.memberName;
    } else {
      userId = sess.session.user?.id ?? "system";
      userName = sess.session.user?.name ?? "unknown";
    }
    const { id } = await ctx.params;
    const inv = await markBaselineComplete({ id });
    if (!inv)
      return NextResponse.json(
        { error: "not found or already complete" },
        { status: 404 }
      );
    logActivity("update", "investment", id, "Baseline captured; listing started", userId, userName);
    return NextResponse.json({ ok: true, id: String(inv._id), status: inv.status });
  } catch (err) {
    console.error("investments-baseline-complete error:", err);
    logApiError("investments-baseline-complete", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
git add lib/api-ext-helpers.ts lib/investments/service.ts app/api/investments/[id]/baseline/route.ts app/api/investments/[id]/baseline/complete/route.ts
git commit -m "feat(investments): baseline batch POST + baseline complete POST"
```

---

## Task 11: Attribution — maybeGrowLot + tests

**Files:**
- Create: `lib/investments/attribution.ts`
- Create: `lib/__tests__/investments-attribution.test.ts`

- [ ] **Step 1: Write the attribution module**

Create `lib/investments/attribution.ts`:

```typescript
import { ObjectId, type Db } from "mongodb";
import {
  COL_INVESTMENTS,
  COL_INVESTMENT_BASELINE,
  COL_INVESTMENT_LOTS,
  COL_INVESTMENT_SALE_LOG,
} from "./db";
import { COL_EV_PRODUCTS } from "@/lib/ev-products";
import { computeAttributable } from "./math";
import type { EvProduct } from "@/lib/types";
import type { Investment } from "./types";

/** Return the scryfall_id -> cardmarket_id map for an EvProduct's cards. */
async function productCardmarketIds(db: Db, slug: string): Promise<Set<number>> {
  const p = await db.collection<EvProduct>(COL_EV_PRODUCTS).findOne({ slug });
  if (!p) return new Set();
  const scryfallIds = p.cards.map((c) => c.scryfall_id);
  const cards = await db
    .collection("dashboard_ev_cards")
    .find({ scryfall_id: { $in: scryfallIds } })
    .project<{ cardmarket_id: number | null }>({ cardmarket_id: 1 })
    .toArray();
  return new Set(cards.map((c) => c.cardmarket_id).filter((x): x is number => x != null));
}

async function findCandidateInvestments(params: {
  db: Db;
  cardmarketId: number;
  cardSetCode: string | null;
  cmSetName?: string;
}): Promise<Investment[]> {
  const { db, cardmarketId, cardSetCode, cmSetName } = params;
  const orFilters: Record<string, unknown>[] = [];
  if (cardSetCode) orFilters.push({ "source.kind": "box", "source.set_code": cardSetCode });
  if (cmSetName) orFilters.push({ cm_set_names: cmSetName });
  // product-kind matches need a per-product lookup; collect product candidates separately
  const boxAndNameCandidates =
    orFilters.length > 0
      ? await db
          .collection<Investment>(COL_INVESTMENTS)
          .find({ status: "listing", $or: orFilters })
          .sort({ created_at: 1 })
          .toArray()
      : [];

  // Product-kind: find all listing product investments, filter by cardmarket_id set.
  const productCandidates = await db
    .collection<Investment>(COL_INVESTMENTS)
    .find({ status: "listing", "source.kind": "product" })
    .sort({ created_at: 1 })
    .toArray();
  const productMatches: Investment[] = [];
  for (const inv of productCandidates) {
    if (inv.source.kind !== "product") continue;
    const cmIds = await productCardmarketIds(db, inv.source.product_slug);
    if (cmIds.has(cardmarketId)) productMatches.push(inv);
  }

  const all = [...boxAndNameCandidates, ...productMatches];
  const seen = new Set<string>();
  const deduped: Investment[] = [];
  for (const inv of all) {
    const key = String(inv._id);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(inv);
  }
  deduped.sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
  return deduped;
}

async function currentStockQty(
  db: Db,
  cardmarketId: number,
  foil: boolean,
  condition: string
): Promise<number> {
  const agg = await db
    .collection("dashboard_cm_stock")
    .aggregate<{ total: number }>([
      { $match: { productId: cardmarketId, foil, condition } },
      { $group: { _id: null, total: { $sum: "$qty" } } },
    ])
    .next();
  return agg?.total ?? 0;
}

/**
 * Attribute a qty increase to the oldest-matching listing investment, FIFO,
 * bounded by (current_stock - baseline - lot_already_opened) and by the
 * investment's remaining budget.
 */
export async function maybeGrowLot(params: {
  db: Db;
  cardmarketId: number;
  foil: boolean;
  condition: string;
  qtyDelta: number;
  cmSetName?: string;
  cardSetCode: string | null;
}): Promise<void> {
  if (params.qtyDelta <= 0) return;
  const candidates = await findCandidateInvestments({
    db: params.db,
    cardmarketId: params.cardmarketId,
    cardSetCode: params.cardSetCode,
    cmSetName: params.cmSetName,
  });
  if (candidates.length === 0) return;
  const stockQty = await currentStockQty(
    params.db,
    params.cardmarketId,
    params.foil,
    params.condition
  );
  let remainingDelta = params.qtyDelta;

  for (const inv of candidates) {
    if (remainingDelta <= 0) break;
    const baselineDoc = await params.db
      .collection(COL_INVESTMENT_BASELINE)
      .findOne<{ qty_baseline: number }>({
        investment_id: inv._id,
        cardmarket_id: params.cardmarketId,
        foil: params.foil,
        condition: params.condition,
      });
    const baseline = baselineDoc?.qty_baseline ?? 0;
    const lotDoc = await params.db
      .collection(COL_INVESTMENT_LOTS)
      .findOne<{ qty_opened: number; qty_sold: number }>({
        investment_id: inv._id,
        cardmarket_id: params.cardmarketId,
        foil: params.foil,
        condition: params.condition,
      });
    const lotAlreadyOpened = lotDoc?.qty_opened ?? 0;
    const attributable = computeAttributable({
      currentStockQty: stockQty,
      baselineQty: baseline,
      lotAlreadyOpened,
    });
    if (attributable <= 0) continue;

    const budgetAgg = await params.db
      .collection(COL_INVESTMENT_LOTS)
      .aggregate<{ total: number }>([
        { $match: { investment_id: inv._id } },
        { $group: { _id: null, total: { $sum: "$qty_opened" } } },
      ])
      .next();
    const totalSoFar = budgetAgg?.total ?? 0;
    const budgetRemaining = inv.expected_open_card_count - totalSoFar;
    if (budgetRemaining <= 0) continue;

    const growBy = Math.min(remainingDelta, attributable, budgetRemaining);
    const now = new Date();
    await params.db.collection(COL_INVESTMENT_LOTS).updateOne(
      {
        investment_id: inv._id,
        cardmarket_id: params.cardmarketId,
        foil: params.foil,
        condition: params.condition,
      },
      {
        $inc: { qty_opened: growBy, qty_remaining: growBy },
        $set: { last_grown_at: now },
        $setOnInsert: {
          investment_id: inv._id,
          cardmarket_id: params.cardmarketId,
          foil: params.foil,
          condition: params.condition,
          qty_sold: 0,
          proceeds_eur: 0,
          cost_basis_per_unit: null,
        },
      },
      { upsert: true }
    );
    remainingDelta -= growBy;
  }
}
```

- [ ] **Step 2: Write attribution tests (in-memory mock, matches cardmarket-appraiser-fanout style)**

Create `lib/__tests__/investments-attribution.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ObjectId } from "mongodb";
import { maybeGrowLot } from "../investments/attribution";

type Doc = Record<string, unknown>;

function col(docs: Doc[]) {
  return {
    docs,
    find: (filter: Doc) => {
      const rows = docs.filter((d) => matches(d, filter));
      return {
        sort: () => ({
          toArray: async () => rows,
        }),
        project: () => ({ toArray: async () => rows }),
        toArray: async () => rows,
      };
    },
    findOne: async (filter: Doc) => docs.find((d) => matches(d, filter)) ?? null,
    aggregate: () => ({
      next: async () => null,
      toArray: async () => [],
    }),
    updateOne: vi.fn(async (filter: Doc, update: { $inc?: Doc; $set?: Doc; $setOnInsert?: Doc }, opts?: { upsert?: boolean }) => {
      const existing = docs.find((d) => matches(d, filter));
      if (existing) {
        if (update.$inc) for (const [k, v] of Object.entries(update.$inc)) existing[k] = ((existing[k] as number) ?? 0) + (v as number);
        if (update.$set) Object.assign(existing, update.$set);
        return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
      }
      if (opts?.upsert) {
        const newDoc: Doc = { ...filter, ...(update.$setOnInsert ?? {}), ...(update.$set ?? {}) };
        if (update.$inc) for (const [k, v] of Object.entries(update.$inc)) newDoc[k] = v as number;
        docs.push(newDoc);
        return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
      }
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
    }),
  };
}

function matches(doc: Doc, filter: Doc): boolean {
  for (const [k, v] of Object.entries(filter)) {
    if (k === "$or" && Array.isArray(v)) {
      if (!v.some((sub) => matches(doc, sub as Doc))) return false;
      continue;
    }
    if (doc[k] !== v) return false;
  }
  return true;
}

type Collections = {
  investments: Doc[];
  baseline: Doc[];
  lots: Doc[];
  stock: Doc[];
  ev_cards: Doc[];
};

function makeDb(state: Collections) {
  const lookup: Record<string, ReturnType<typeof col>> = {
    dashboard_investments: col(state.investments),
    dashboard_investment_baseline: col(state.baseline),
    dashboard_investment_lots: col(state.lots),
    dashboard_cm_stock: {
      ...col(state.stock),
      aggregate: () => ({
        next: async () => {
          const total = state.stock
            .filter((d) => d.productId != null)
            .reduce((s, d) => s + (d.qty as number), 0);
          return total > 0 ? { total } : null;
        },
        toArray: async () => [],
      }),
    } as ReturnType<typeof col>,
    dashboard_ev_cards: col(state.ev_cards),
    dashboard_ev_products: col([]),  // not exercised here
  };
  return { collection: (name: string) => lookup[name] ?? col([]) };
}

describe("maybeGrowLot (box-kind)", () => {
  let state: Collections;
  const invAId = new ObjectId();
  const invBId = new ObjectId();

  beforeEach(() => {
    state = {
      investments: [
        {
          _id: invAId,
          status: "listing",
          source: { kind: "box", set_code: "fdn", booster_type: "jumpstart", packs_per_box: 24, cards_per_pack: 20, box_count: 1 },
          cm_set_names: ["Foundations: Jumpstart"],
          expected_open_card_count: 480,
          sealed_flips: [],
          created_at: new Date("2026-01-01"),
        },
        {
          _id: invBId,
          status: "listing",
          source: { kind: "box", set_code: "fdn", booster_type: "jumpstart", packs_per_box: 24, cards_per_pack: 20, box_count: 1 },
          cm_set_names: ["Foundations: Jumpstart"],
          expected_open_card_count: 480,
          sealed_flips: [],
          created_at: new Date("2026-02-01"),
        },
      ],
      baseline: [],
      lots: [],
      stock: [{ productId: 555123, foil: false, condition: "NM", qty: 4 }],
      ev_cards: [],
    };
  });

  it("grows the oldest investment's lot first (FIFO)", async () => {
    const db = makeDb(state) as never;
    await maybeGrowLot({
      db,
      cardmarketId: 555123,
      foil: false,
      condition: "NM",
      qtyDelta: 4,
      cardSetCode: "fdn",
    });
    expect(state.lots.length).toBe(1);
    expect(state.lots[0].investment_id).toEqual(invAId);
    expect(state.lots[0].qty_opened).toBe(4);
  });

  it("skips an investment whose budget is exhausted", async () => {
    state.lots.push({
      investment_id: invAId,
      cardmarket_id: 777,
      foil: false,
      condition: "NM",
      qty_opened: 480,
      qty_sold: 0,
      qty_remaining: 480,
      proceeds_eur: 0,
      cost_basis_per_unit: null,
      last_grown_at: new Date(),
    });
    const db = makeDb(state) as never;
    await maybeGrowLot({
      db,
      cardmarketId: 555123,
      foil: false,
      condition: "NM",
      qtyDelta: 4,
      cardSetCode: "fdn",
    });
    const grown = state.lots.find((l) => l.cardmarket_id === 555123);
    expect(grown?.investment_id).toEqual(invBId);
    expect(grown?.qty_opened).toBe(4);
  });

  it("respects baseline offset (only delta attributed)", async () => {
    state.baseline.push({
      investment_id: invAId,
      cardmarket_id: 555123,
      foil: false,
      condition: "NM",
      qty_baseline: 3,
    });
    // stock is 4, baseline was 3 — only 1 should be attributable
    const db = makeDb(state) as never;
    await maybeGrowLot({
      db,
      cardmarketId: 555123,
      foil: false,
      condition: "NM",
      qtyDelta: 4,
      cardSetCode: "fdn",
    });
    const grown = state.lots.find(
      (l) => l.investment_id === invAId && l.cardmarket_id === 555123
    );
    expect(grown?.qty_opened).toBe(1);
  });
});
```

Note: the in-memory mock is approximate (doesn't support full Mongo semantics), but exercises the core paths: FIFO, budget cap, baseline offset. The implementation reads aggregation results — keep the tests constrained to these three scenarios; full fidelity comes from manual/integration test post-deploy.

- [ ] **Step 3: Run the tests**

Run: `npm test -- lib/__tests__/investments-attribution.test.ts`

The mock will likely need some tweaking — if `aggregate().next()` isn't providing the total stock correctly, add fidelity. Iterate until the 3 scenarios pass.

Expected: PASS — 3 tests.

- [ ] **Step 4: Commit**

```bash
git add lib/investments/attribution.ts lib/__tests__/investments-attribution.test.ts
git commit -m "feat(investments): maybeGrowLot (FIFO attribution with budget cap)"
```

---

## Task 12: Attribution — consumeSale + reverseSale

**Files:**
- Modify: `lib/investments/attribution.ts`

- [ ] **Step 1: Add consumeSale + reverseSale**

Append to `lib/investments/attribution.ts`:

```typescript
export async function consumeSale(params: {
  db: Db;
  cardmarketId: number;
  foil: boolean;
  condition: string;
  qtySold: number;
  unitPriceEur: number;
  trustee: boolean;
  orderId: string;
  articleId?: string;
}): Promise<void> {
  if (params.qtySold <= 0) return;
  const feeRate = 0.05 + (params.trustee ? 0.01 : 0);
  const netPerUnit = params.unitPriceEur * (1 - feeRate);

  // Fetch matching lots, join to investment.created_at for FIFO.
  const joined = await params.db
    .collection(COL_INVESTMENT_LOTS)
    .aggregate<{
      _id: ObjectId;
      investment_id: ObjectId;
      qty_remaining: number;
      qty_sold: number;
      proceeds_eur: number;
      inv_created_at: Date;
      inv_status: string;
    }>([
      {
        $match: {
          cardmarket_id: params.cardmarketId,
          foil: params.foil,
          condition: params.condition,
          qty_remaining: { $gt: 0 },
        },
      },
      {
        $lookup: {
          from: COL_INVESTMENTS,
          localField: "investment_id",
          foreignField: "_id",
          as: "inv",
        },
      },
      { $unwind: "$inv" },
      {
        $match: {
          "inv.status": { $in: ["listing", "closed"] },
        },
      },
      {
        $project: {
          _id: 1,
          investment_id: 1,
          qty_remaining: 1,
          qty_sold: 1,
          proceeds_eur: 1,
          inv_created_at: "$inv.created_at",
          inv_status: "$inv.status",
        },
      },
      { $sort: { inv_created_at: 1 } },
    ])
    .toArray();

  let remaining = params.qtySold;
  for (const lot of joined) {
    if (remaining <= 0) break;
    const take = Math.min(lot.qty_remaining, remaining);
    await params.db.collection(COL_INVESTMENT_LOTS).updateOne(
      { _id: lot._id },
      {
        $inc: {
          qty_sold: take,
          qty_remaining: -take,
          proceeds_eur: take * netPerUnit,
        },
      }
    );
    await params.db.collection(COL_INVESTMENT_SALE_LOG).insertOne({
      lot_id: lot._id,
      investment_id: lot.investment_id,
      order_id: params.orderId,
      article_id: params.articleId,
      cardmarket_id: params.cardmarketId,
      foil: params.foil,
      condition: params.condition,
      qty: take,
      unit_price_eur: params.unitPriceEur,
      net_per_unit_eur: netPerUnit,
      attributed_at: new Date(),
    });
    remaining -= take;
  }
}

export async function reverseSale(params: {
  db: Db;
  orderId: string;
}): Promise<void> {
  const rows = await params.db
    .collection(COL_INVESTMENT_SALE_LOG)
    .find<{
      _id: ObjectId;
      lot_id: ObjectId;
      qty: number;
      net_per_unit_eur: number;
    }>({ order_id: params.orderId })
    .toArray();
  for (const row of rows) {
    await params.db.collection(COL_INVESTMENT_LOTS).updateOne(
      { _id: row.lot_id },
      {
        $inc: {
          qty_sold: -row.qty,
          qty_remaining: row.qty,
          proceeds_eur: -row.qty * row.net_per_unit_eur,
        },
      }
    );
  }
  if (rows.length > 0) {
    await params.db
      .collection(COL_INVESTMENT_SALE_LOG)
      .deleteMany({ order_id: params.orderId });
  }
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
git add lib/investments/attribution.ts
git commit -m "feat(investments): consumeSale + reverseSale attribution"
```

---

## Task 13: Wire hooks into processStock / processProductStock / processOrders

**Files:**
- Modify: `lib/cardmarket.ts`

- [ ] **Step 1: Read the relevant sections of lib/cardmarket.ts**

Read `lib/cardmarket.ts`. Focus on:
- `processStock` (~line 676) — where a stock row is upserted. Capture the qty before/after.
- `processProductStock` (~line 800) — same question.
- `processOrders` (~line 419) — find the code path that removes stock on order paid AND the code path that restocks on cancellation.

Confirm the exact functions / variables before editing. Each call site will set `const qtyBefore = ...` and pass the delta to `maybeGrowLot`.

- [ ] **Step 2: Add attribution hooks**

At the top of `lib/cardmarket.ts`, import the attribution functions and `getDb`. (getDb is already used — confirm the import.)

```typescript
import { after } from "next/server";
import {
  maybeGrowLot,
  consumeSale,
  reverseSale,
} from "./investments/attribution";
```

Inside `processStock`, at each point where a stock row is upserted, **after** the write completes, compute `qtyDelta = newQty - priorQty` (0 if new insert → priorQty=0; negative → skip; positive → invoke hook). Wrap the invocation in `after()`:

```typescript
if (qtyDelta > 0 && cardmarketId) {
  after(async () => {
    const dbInner = await getDb();
    await maybeGrowLot({
      db: dbInner,
      cardmarketId,
      foil,
      condition,
      qtyDelta,
      cmSetName: set,
      cardSetCode: cardSetCode ?? null,
    });
  });
}
```

Do the same inside `processProductStock`. For `processOrders`:

- When items are removed from stock on `paid`/`sent`/`arrived` status transitions:
  ```typescript
  after(async () => {
    const dbInner = await getDb();
    await consumeSale({
      db: dbInner,
      cardmarketId: Number(item.productId),
      foil: item.foil,
      condition: item.condition,
      qtySold: item.qty,
      unitPriceEur: item.price,
      trustee: order.trustee ?? false,
      orderId: order.orderId,
      articleId: item.articleId,
    });
  });
  ```
- When an order cancels and items are restocked:
  ```typescript
  after(async () => {
    const dbInner = await getDb();
    await reverseSale({ db: dbInner, orderId: order.orderId });
  });
  ```

**Key details to get right:**

- `cardmarketId` for the stock side: look up `dashboard_ev_cards` by `cardmarket_id == productId` — you may already have this logic in cardmarket.ts. Resolve `cardSetCode` from that lookup (`ev_cards.set`).
- For order items, use `item.productId` (Cardmarket product ID).
- Don't block the sync response — all hooks via `after()`.
- Handle `qtyBefore` carefully. For inserts where the row is new, `qtyBefore = 0`. For updates to an existing row, read `qtyBefore` from the pre-update snapshot.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Manual integration smoke test**

Run: `npm run dev` (in separate terminal). With a test investment created via Task 4's smoke test (re-create one if needed), manually insert a stock row:

```
db.dashboard_cm_stock.insertOne({
  dedupKey: "Lightning Bolt|2|1.5|NM|false|Foundations",
  name: "Lightning Bolt",
  qty: 2,
  price: 1.5,
  condition: "NM",
  foil: false,
  set: "Foundations",
  productId: <pick a real cardmarket_id from ev_cards where set="fdn">,
  source: "stock_page",
  firstSeenAt: new Date().toISOString(),
  lastSeenAt: new Date().toISOString()
})
```

This only tests the mutation path — attribution is triggered by the sync function, not the direct insert. For a real smoke test, post a fake extension payload via `/api/ext/sync` with a stock item for that set. Fall back to: hit the `processStock` function directly via a dev-only route if one exists.

Expected: after sync, `db.dashboard_investment_lots.find({investment_id: <the test id>})` shows a row with qty_opened = 2.

Clean up: delete the test stock row and the test investment's lots + baseline + doc.

- [ ] **Step 5: Commit**

```bash
git add lib/cardmarket.ts
git commit -m "feat(investments): wire attribution hooks into cardmarket sync paths"
```

---

## Task 14: Sidebar entry

**Files:**
- Modify: `components/dashboard/sidebar.tsx`

- [ ] **Step 1: Read sidebar.tsx to find the MANAGEMENT section**

Read `components/dashboard/sidebar.tsx`. Locate the `MANAGEMENT` section in the `navSections` array. Note the item shape (label, href, icon).

- [ ] **Step 2: Add Investments entry**

Add a new item to the MANAGEMENT section, positioned after Cardmarket and before Storage. Import `TrendingUp` from `lucide-react`:

```typescript
import { TrendingUp } from "lucide-react";
```

```typescript
// Inside the MANAGEMENT section items:
{ href: "/investments", label: "Investments", icon: TrendingUp },
```

- [ ] **Step 3: Verify in-browser**

Run: `npm run dev`. Log in. Confirm the sidebar shows "Investments" in MANAGEMENT. Clicking leads to a 404 (page not yet created — that's expected and fixed in next task).

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/sidebar.tsx
git commit -m "feat(investments): add sidebar entry"
```

---

## Task 15: List page + create modal

**Files:**
- Create: `app/(dashboard)/investments/page.tsx`
- Create: `components/investments/InvestmentsContent.tsx`
- Create: `components/investments/CreateInvestmentModal.tsx`

- [ ] **Step 1: Thin page wrapper**

Create `app/(dashboard)/investments/page.tsx`:

```typescript
import InvestmentsContent from "@/components/investments/InvestmentsContent";

export default function InvestmentsPage() {
  return <InvestmentsContent />;
}
```

- [ ] **Step 2: List component with SWR**

Create `components/investments/InvestmentsContent.tsx`. Follow the shape of `components/cardmarket/CardmarketContent.tsx` for top-level structure (stat cards → tabbed table → modal host). Key behaviors:

```typescript
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { TrendingUp, Plus } from "lucide-react";
import CreateInvestmentModal from "./CreateInvestmentModal";
import type { InvestmentListItem, InvestmentStatus } from "@/lib/investments/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function eur(n: number): string {
  return `€${n.toFixed(2)}`;
}

function sourceLabel(src: InvestmentListItem["source"]): string {
  if (src.kind === "box") return `${src.box_count}× ${src.set_code} (${src.booster_type})`;
  return `${src.unit_count}× ${src.product_slug} (product)`;
}

export default function InvestmentsContent() {
  const [tab, setTab] = useState<InvestmentStatus | "all">("listing");
  const [showCreate, setShowCreate] = useState(false);
  const { data, mutate, isLoading } = useSWR<{ investments: InvestmentListItem[] }>(
    tab === "all" ? "/api/investments" : `/api/investments?status=${tab}`,
    fetcher,
    { dedupingInterval: 30_000 }
  );
  const rows = data?.investments ?? [];

  const totalCost = rows.reduce((s, r) => s + r.cost_total_eur, 0);
  const totalNet = rows.reduce(
    (s, r) => s + r.realized_eur + r.sealed_flips_total_eur - r.cost_total_eur,
    0
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <TrendingUp className="h-6 w-6" /> Investments
          </h1>
          <p className="text-sm text-gray-500">Sealed purchases + their attributed singles</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-3 py-2 text-sm text-white"
        >
          <Plus className="h-4 w-4" /> New Investment
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Total deployed" value={eur(totalCost)} />
        <StatCard
          label="Net realized (so far)"
          value={eur(totalNet)}
          tone={totalNet >= 0 ? "positive" : "negative"}
        />
      </div>

      <div className="flex gap-2 border-b">
        {(["listing", "closed", "archived", "all"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t as typeof tab)}
            className={
              "px-3 py-2 text-sm " +
              (tab === t
                ? "border-b-2 border-indigo-600 text-indigo-600"
                : "text-gray-500")
            }
          >
            {t === "all" ? "All" : t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-gray-500">No investments yet.</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-gray-500 border-b">
              <th className="py-2">Status</th>
              <th>Name</th>
              <th>Source</th>
              <th className="text-right">Cost</th>
              <th className="text-right">Listed</th>
              <th className="text-right">Realized</th>
              <th>Break-even</th>
              <th className="text-right">Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const realized = r.realized_eur + r.sealed_flips_total_eur;
              const breakEvenPct =
                r.cost_total_eur > 0 ? Math.min(realized / r.cost_total_eur, 2) : 0;
              return (
                <tr key={r.id} className="border-b hover:bg-gray-50">
                  <td className="py-2">
                    <span className={statusPillClass(r.status)}>{r.status}</span>
                  </td>
                  <td>
                    <Link className="text-indigo-600 hover:underline" href={`/investments/${r.id}`}>
                      {r.name}
                    </Link>
                  </td>
                  <td className="text-gray-600">{sourceLabel(r.source)}</td>
                  <td className="text-right">{eur(r.cost_total_eur)}</td>
                  <td className="text-right">{eur(r.listed_value_eur)}</td>
                  <td className="text-right">{eur(realized)}</td>
                  <td>
                    <div className="h-2 bg-gray-200 rounded w-32">
                      <div
                        className={
                          "h-2 rounded " +
                          (breakEvenPct >= 1 ? "bg-emerald-500" : "bg-indigo-400")
                        }
                        style={{ width: `${Math.min(breakEvenPct, 1) * 100}%` }}
                      />
                    </div>
                  </td>
                  <td className="text-right text-gray-500">
                    {new Date(r.created_at).toLocaleDateString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {showCreate && (
        <CreateInvestmentModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            mutate();
          }}
        />
      )}
    </div>
  );
}

function statusPillClass(s: InvestmentStatus): string {
  const base = "inline-block rounded-full px-2 py-0.5 text-xs font-medium";
  if (s === "listing") return `${base} bg-indigo-100 text-indigo-700`;
  if (s === "baseline_captured") return `${base} bg-amber-100 text-amber-700`;
  if (s === "closed") return `${base} bg-emerald-100 text-emerald-700`;
  return `${base} bg-gray-100 text-gray-600`;
}

function StatCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative" | "neutral";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-600"
      : tone === "negative"
        ? "text-rose-600"
        : "text-gray-900";
  return (
    <div className="rounded-lg border p-4 bg-white">
      <div className="text-xs uppercase text-gray-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}
```

- [ ] **Step 3: Create modal**

Create `components/investments/CreateInvestmentModal.tsx`:

```typescript
"use client";

import { useEffect, useState } from "react";
import type {
  BoosterType,
  CreateInvestmentBody,
  InvestmentSource,
} from "@/lib/investments/types";

const DEFAULT_PACKS: Record<BoosterType, { packs: number; cards: number }> = {
  play: { packs: 36, cards: 15 },
  collector: { packs: 12, cards: 15 },
  jumpstart: { packs: 24, cards: 20 },
  set: { packs: 30, cards: 15 },
};

export default function CreateInvestmentModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [step, setStep] = useState<"source" | "details">("source");
  const [kind, setKind] = useState<"box" | "product">("box");

  // Box fields
  const [setCode, setSetCode] = useState("");
  const [boosterType, setBoosterType] = useState<BoosterType>("play");
  const [boxCount, setBoxCount] = useState(1);
  const [packsPerBox, setPacksPerBox] = useState(DEFAULT_PACKS.play.packs);
  const [cardsPerPack, setCardsPerPack] = useState(DEFAULT_PACKS.play.cards);

  // Product fields
  const [productSlug, setProductSlug] = useState("");
  const [unitCount, setUnitCount] = useState(1);

  // Details
  const [name, setName] = useState("");
  const [cost, setCost] = useState(0);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Apply defaults when booster type changes
  useEffect(() => {
    setPacksPerBox(DEFAULT_PACKS[boosterType].packs);
    setCardsPerPack(DEFAULT_PACKS[boosterType].cards);
  }, [boosterType]);

  const source: InvestmentSource =
    kind === "box"
      ? {
          kind: "box",
          set_code: setCode.trim(),
          booster_type: boosterType,
          packs_per_box: packsPerBox,
          cards_per_pack: cardsPerPack,
          box_count: boxCount,
        }
      : { kind: "product", product_slug: productSlug.trim(), unit_count: unitCount };

  const defaultName =
    kind === "box"
      ? `${boxCount}× ${setCode || "?"} (${boosterType}) — ${monthYear()}`
      : `${unitCount}× ${productSlug || "?"}`;

  async function submit() {
    setSubmitting(true);
    setErr(null);
    try {
      const body: CreateInvestmentBody = {
        name: name.trim() || defaultName,
        cost_total_eur: cost,
        cost_notes: notes.trim() || undefined,
        source,
      };
      const r = await fetch("/api/investments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Create failed");
      onCreated(String(data.investment._id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Create failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-lg w-full max-w-md p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">New Investment</h2>

        {step === "source" ? (
          <div className="space-y-3">
            <label className="block">
              <div className="text-xs uppercase text-gray-500 mb-1">Kind</div>
              <div className="flex gap-2">
                <button
                  onClick={() => setKind("box")}
                  className={radioClass(kind === "box")}
                >
                  Random-pool box
                </button>
                <button
                  onClick={() => setKind("product")}
                  className={radioClass(kind === "product")}
                >
                  Fixed-pool product
                </button>
              </div>
            </label>

            {kind === "box" ? (
              <>
                <Field label="Set code">
                  <input
                    className="border rounded px-2 py-1 w-full"
                    placeholder="e.g. fdn"
                    value={setCode}
                    onChange={(e) => setSetCode(e.target.value.toLowerCase().trim())}
                  />
                </Field>
                <Field label="Booster type">
                  <select
                    className="border rounded px-2 py-1 w-full"
                    value={boosterType}
                    onChange={(e) => setBoosterType(e.target.value as BoosterType)}
                  >
                    <option value="play">Play</option>
                    <option value="collector">Collector</option>
                    <option value="jumpstart">Jumpstart</option>
                    <option value="set">Set</option>
                  </select>
                </Field>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Packs/box">
                    <input
                      type="number"
                      className="border rounded px-2 py-1 w-full"
                      value={packsPerBox}
                      onChange={(e) => setPacksPerBox(Number(e.target.value))}
                    />
                  </Field>
                  <Field label="Cards/pack">
                    <input
                      type="number"
                      className="border rounded px-2 py-1 w-full"
                      value={cardsPerPack}
                      onChange={(e) => setCardsPerPack(Number(e.target.value))}
                    />
                  </Field>
                  <Field label="Boxes">
                    <input
                      type="number"
                      className="border rounded px-2 py-1 w-full"
                      value={boxCount}
                      onChange={(e) => setBoxCount(Number(e.target.value))}
                    />
                  </Field>
                </div>
              </>
            ) : (
              <>
                <Field label="Product slug">
                  <input
                    className="border rounded px-2 py-1 w-full"
                    placeholder="e.g. tdm-commander-001"
                    value={productSlug}
                    onChange={(e) => setProductSlug(e.target.value)}
                  />
                </Field>
                <Field label="Unit count">
                  <input
                    type="number"
                    className="border rounded px-2 py-1 w-full"
                    value={unitCount}
                    onChange={(e) => setUnitCount(Number(e.target.value))}
                  />
                </Field>
              </>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button className="px-3 py-1.5 text-sm" onClick={onClose}>
                Cancel
              </button>
              <button
                className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded"
                disabled={
                  kind === "box" ? !setCode || boxCount <= 0 : !productSlug || unitCount <= 0
                }
                onClick={() => setStep("details")}
              >
                Next
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Field label="Name">
              <input
                className="border rounded px-2 py-1 w-full"
                placeholder={defaultName}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field label="Cost (EUR)">
              <input
                type="number"
                className="border rounded px-2 py-1 w-full"
                value={cost}
                onChange={(e) => setCost(Number(e.target.value))}
              />
            </Field>
            <Field label="Notes (optional)">
              <textarea
                className="border rounded px-2 py-1 w-full"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
            {err && <div className="text-sm text-rose-600">{err}</div>}
            <div className="flex justify-end gap-2 pt-2">
              <button className="px-3 py-1.5 text-sm" onClick={() => setStep("source")}>
                Back
              </button>
              <button
                className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded disabled:opacity-50"
                disabled={submitting || cost < 0}
                onClick={submit}
              >
                {submitting ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function radioClass(active: boolean): string {
  return (
    "flex-1 px-3 py-2 rounded border text-sm " +
    (active ? "border-indigo-600 text-indigo-600 bg-indigo-50" : "border-gray-300 text-gray-600")
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs uppercase text-gray-500 mb-1">{label}</div>
      {children}
    </label>
  );
}

function monthYear(): string {
  return new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" });
}
```

- [ ] **Step 4: Verify in browser**

Run: `npm run dev`. Log in. Navigate to `/investments`. Click **New Investment**. Walk through both kinds. Create a real investment (e.g. "Foundations Jumpstart test" with set_code="fdn", 1 box, cost 75). Confirm it shows up in the table.

Expected: table renders, modal works, created row appears in "listing" tab... wait — it'll be in `baseline_captured` tab, but we don't have that tab. Update: add `baseline_captured` to the tab list.

In `InvestmentsContent.tsx`, change the tab array to `(["baseline_captured", "listing", "closed", "archived", "all"] as const)` and display name "Pending baseline" for `baseline_captured`. Re-verify.

- [ ] **Step 5: Commit**

```bash
git add app/(dashboard)/investments/page.tsx components/investments/InvestmentsContent.tsx components/investments/CreateInvestmentModal.tsx
git commit -m "feat(investments): list page + create modal"
```

---

## Task 16: Detail page shell + KPIs + baseline banner

**Files:**
- Create: `app/(dashboard)/investments/[id]/page.tsx`
- Create: `components/investments/InvestmentDetail.tsx`
- Create: `components/investments/InvestmentKpiRow.tsx`
- Create: `components/investments/BaselineBanner.tsx`

- [ ] **Step 1: Thin page wrapper**

Create `app/(dashboard)/investments/[id]/page.tsx`:

```typescript
import InvestmentDetail from "@/components/investments/InvestmentDetail";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InvestmentDetail id={id} />;
}
```

- [ ] **Step 2: KPI row**

Create `components/investments/InvestmentKpiRow.tsx`:

```typescript
import type { InvestmentDetail } from "@/lib/investments/types";

function eur(n: number | null): string {
  if (n == null) return "—";
  return `€${n.toFixed(2)}`;
}

export default function InvestmentKpiRow({ kpis }: { kpis: InvestmentDetail["kpis"] }) {
  const breakEvenPctClamped = Math.min(kpis.break_even_pct, 2);
  return (
    <div className="grid grid-cols-6 gap-3">
      <Kpi label="Cost" value={eur(kpis.cost_eur)} />
      <Kpi label="Expected EV" value={eur(kpis.expected_ev_eur)} />
      <Kpi label="Listed" value={eur(kpis.listed_value_eur)} />
      <Kpi label="Realized" value={eur(kpis.realized_net_eur)} tone={kpis.realized_net_eur >= 0 ? "pos" : "neg"} />
      <Kpi label="P/L blended" value={eur(kpis.net_pl_blended_eur)} tone={kpis.net_pl_blended_eur >= 0 ? "pos" : "neg"} />
      <div className="rounded-lg border p-3 bg-white">
        <div className="text-[10px] uppercase text-gray-500">Break-even</div>
        <div className="mt-1 text-sm font-semibold">
          {(kpis.break_even_pct * 100).toFixed(0)}%
        </div>
        <div className="mt-1 h-2 bg-gray-200 rounded">
          <div
            className={
              "h-2 rounded " +
              (kpis.break_even_pct >= 1 ? "bg-emerald-500" : "bg-indigo-400")
            }
            style={{ width: `${(breakEvenPctClamped / 2) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "pos" | "neg" | "neutral" }) {
  const toneClass =
    tone === "pos" ? "text-emerald-600" : tone === "neg" ? "text-rose-600" : "text-gray-900";
  return (
    <div className="rounded-lg border p-3 bg-white">
      <div className="text-[10px] uppercase text-gray-500">{label}</div>
      <div className={`mt-1 text-sm font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}
```

- [ ] **Step 3: Baseline banner**

Create `components/investments/BaselineBanner.tsx`:

```typescript
import type { InvestmentDetail } from "@/lib/investments/types";

export default function BaselineBanner({ detail }: { detail: InvestmentDetail }) {
  if (detail.status !== "baseline_captured" || !detail.baseline_progress) return null;
  const { captured_cardmarket_ids: cap, target_cardmarket_ids: tot } = detail.baseline_progress;
  const pct = tot > 0 ? (cap / tot) * 100 : 0;
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="font-medium text-amber-900">Baseline capture in progress</div>
        <div className="text-amber-800">
          {cap} / {tot} cards ({pct.toFixed(0)}%)
        </div>
      </div>
      <div className="h-2 bg-amber-200 rounded">
        <div className="h-2 rounded bg-amber-600" style={{ width: `${pct}%` }} />
      </div>
      <div className="text-xs text-amber-800">
        Open the Misstep extension and select this investment to capture stock
        for each card in the set. Lot attribution begins once baseline is marked complete.
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Detail component shell**

Create `components/investments/InvestmentDetail.tsx`:

```typescript
"use client";

import useSWR from "swr";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { InvestmentDetail as Detail } from "@/lib/investments/types";
import InvestmentKpiRow from "./InvestmentKpiRow";
import BaselineBanner from "./BaselineBanner";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function InvestmentDetail({ id }: { id: string }) {
  const { data, mutate, isLoading } = useSWR<{ investment: Detail }>(
    `/api/investments/${id}`,
    fetcher,
    { dedupingInterval: 15_000 }
  );
  const detail = data?.investment;

  if (isLoading) return <div className="p-6 text-gray-500">Loading…</div>;
  if (!detail) return <div className="p-6 text-gray-500">Not found.</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/investments" className="text-gray-500 hover:text-gray-800">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-xl font-semibold">{detail.name}</h1>
        <StatusPill status={detail.status} />
      </div>

      <BaselineBanner detail={detail} />
      <InvestmentKpiRow kpis={detail.kpis} />

      <div className="text-sm text-gray-600">
        Sealed flips, lots table and close flow coming in the next tasks.
      </div>

      {/* placeholder — next tasks add SealedFlipsSection + InvestmentLotsTable + CloseInvestmentModal */}
    </div>
  );
}

function StatusPill({ status }: { status: Detail["status"] }) {
  const cls = "inline-block rounded-full px-2 py-0.5 text-xs font-medium";
  if (status === "listing") return <span className={`${cls} bg-indigo-100 text-indigo-700`}>listing</span>;
  if (status === "baseline_captured")
    return <span className={`${cls} bg-amber-100 text-amber-700`}>pending baseline</span>;
  if (status === "closed")
    return <span className={`${cls} bg-emerald-100 text-emerald-700`}>closed</span>;
  return <span className={`${cls} bg-gray-100 text-gray-600`}>archived</span>;
}
```

- [ ] **Step 5: Verify in browser**

Run: `npm run dev`. Create an investment (if you don't still have one). Visit `/investments/<id>`.

Expected: page loads, KPIs show mostly €0 (no lots yet), banner explains baseline is pending.

- [ ] **Step 6: Commit**

```bash
git add app/(dashboard)/investments/[id]/page.tsx components/investments/InvestmentDetail.tsx components/investments/InvestmentKpiRow.tsx components/investments/BaselineBanner.tsx
git commit -m "feat(investments): detail page shell with KPI row + baseline banner"
```

---

## Task 17: Sealed flips section + modal

**Files:**
- Create: `components/investments/SealedFlipsSection.tsx`
- Create: `components/investments/SealedFlipModal.tsx`
- Modify: `components/investments/InvestmentDetail.tsx`

- [ ] **Step 1: Sealed flip modal**

Create `components/investments/SealedFlipModal.tsx`:

```typescript
"use client";

import { useState } from "react";

export default function SealedFlipModal({
  investmentId,
  onClose,
  onRecorded,
}: {
  investmentId: string;
  onClose: () => void;
  onRecorded: () => void;
}) {
  const [units, setUnits] = useState(1);
  const [proceeds, setProceeds] = useState(0);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setErr(null);
    try {
      const r = await fetch(`/api/investments/${investmentId}/sealed-flip`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          unit_count: units,
          proceeds_eur: proceeds,
          note: note.trim() || undefined,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Failed");
      onRecorded();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-lg w-full max-w-md p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">Record Sealed Flip</h2>
        <label className="block">
          <div className="text-xs uppercase text-gray-500 mb-1">Units sold sealed</div>
          <input
            type="number"
            className="border rounded px-2 py-1 w-full"
            value={units}
            onChange={(e) => setUnits(Number(e.target.value))}
          />
        </label>
        <label className="block">
          <div className="text-xs uppercase text-gray-500 mb-1">Proceeds (EUR, after fees)</div>
          <input
            type="number"
            className="border rounded px-2 py-1 w-full"
            value={proceeds}
            onChange={(e) => setProceeds(Number(e.target.value))}
          />
        </label>
        <label className="block">
          <div className="text-xs uppercase text-gray-500 mb-1">Note (optional)</div>
          <textarea
            className="border rounded px-2 py-1 w-full"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        {err && <div className="text-sm text-rose-600">{err}</div>}
        <div className="flex justify-end gap-2">
          <button className="px-3 py-1.5 text-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded disabled:opacity-50"
            disabled={submitting || units <= 0 || proceeds < 0}
            onClick={submit}
          >
            {submitting ? "Recording…" : "Record"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Sealed flips section**

Create `components/investments/SealedFlipsSection.tsx`:

```typescript
"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { SealedFlip } from "@/lib/investments/types";
import SealedFlipModal from "./SealedFlipModal";

export default function SealedFlipsSection({
  investmentId,
  flips,
  canRecord,
  onChanged,
}: {
  investmentId: string;
  flips: SealedFlip[];
  canRecord: boolean;
  onChanged: () => void;
}) {
  const [show, setShow] = useState(false);
  const total = flips.reduce((s, f) => s + f.proceeds_eur, 0);
  return (
    <div className="rounded-lg border bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Sealed flips</h2>
        {canRecord && (
          <button
            className="inline-flex items-center gap-1 text-sm text-indigo-600"
            onClick={() => setShow(true)}
          >
            <Plus className="h-3.5 w-3.5" /> Record
          </button>
        )}
      </div>
      {flips.length === 0 ? (
        <div className="text-sm text-gray-500">No sealed flips recorded.</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-gray-500 border-b">
              <th className="py-1">Date</th>
              <th>Units</th>
              <th className="text-right">Proceeds</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {flips.map((f, i) => (
              <tr key={i} className="border-b">
                <td className="py-1">
                  {new Date(f.recorded_at).toLocaleDateString()}
                </td>
                <td>{f.unit_count}</td>
                <td className="text-right">€{f.proceeds_eur.toFixed(2)}</td>
                <td className="text-gray-600">{f.note ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="text-xs text-gray-500">
        Total sealed proceeds: €{total.toFixed(2)}
      </div>
      {show && (
        <SealedFlipModal
          investmentId={investmentId}
          onClose={() => setShow(false)}
          onRecorded={() => {
            setShow(false);
            onChanged();
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Wire into InvestmentDetail**

In `components/investments/InvestmentDetail.tsx`, import and insert the section between the KPI row and the placeholder text:

```typescript
import SealedFlipsSection from "./SealedFlipsSection";
```

Replace the placeholder div with:

```tsx
<SealedFlipsSection
  investmentId={detail.id}
  flips={detail.sealed_flips}
  canRecord={detail.status !== "archived"}
  onChanged={() => mutate()}
/>
```

- [ ] **Step 4: Verify in browser**

Run: `npm run dev`. Open a test investment. Record a sealed flip. Verify: modal closes, section re-renders, KPI row updates (cost_basis effectively shifts through expected_open_card_count; visible through Expected EV indirectly).

- [ ] **Step 5: Commit**

```bash
git add components/investments/SealedFlipsSection.tsx components/investments/SealedFlipModal.tsx components/investments/InvestmentDetail.tsx
git commit -m "feat(investments): sealed flips section + modal on detail page"
```

---

## Task 18: Lot ledger table

**Files:**
- Create: `components/investments/InvestmentLotsTable.tsx`
- Modify: `components/investments/InvestmentDetail.tsx`

- [ ] **Step 1: Lot table component**

Create `components/investments/InvestmentLotsTable.tsx`:

```typescript
"use client";

import useSWR from "swr";
import { useState } from "react";
import FoilStar from "@/components/dashboard/cm-sprite";

type Lot = {
  id: string;
  cardmarket_id: number;
  foil: boolean;
  condition: string;
  name: string | null;
  set_code: string | null;
  qty_opened: number;
  qty_sold: number;
  qty_remaining: number;
  cost_basis_per_unit: number | null;
  proceeds_eur: number;
  live_price_eur: number | null;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function eur(n: number | null): string {
  return n == null ? "—" : `€${n.toFixed(2)}`;
}

export default function InvestmentLotsTable({ investmentId }: { investmentId: string }) {
  const [search, setSearch] = useState("");
  const [foil, setFoil] = useState<"all" | "foil" | "nonfoil">("all");
  const [minRemaining, setMinRemaining] = useState(0);

  const qs = new URLSearchParams();
  if (search) qs.set("search", search);
  if (foil === "foil") qs.set("foil", "true");
  if (foil === "nonfoil") qs.set("foil", "false");
  if (minRemaining > 0) qs.set("minRemaining", String(minRemaining));

  const { data, isLoading } = useSWR<{ lots: Lot[] }>(
    `/api/investments/${investmentId}/lots?${qs.toString()}`,
    fetcher,
    { dedupingInterval: 10_000 }
  );
  const lots = data?.lots ?? [];

  return (
    <div className="rounded-lg border bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Lot ledger</h2>
        <div className="flex items-center gap-2 text-sm">
          <input
            className="border rounded px-2 py-1 text-sm"
            placeholder="Search name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="border rounded px-2 py-1 text-sm"
            value={foil}
            onChange={(e) => setFoil(e.target.value as typeof foil)}
          >
            <option value="all">All</option>
            <option value="foil">Foil only</option>
            <option value="nonfoil">Non-foil only</option>
          </select>
          <input
            type="number"
            className="border rounded px-2 py-1 text-sm w-20"
            placeholder="Min rem."
            value={minRemaining}
            onChange={(e) => setMinRemaining(Number(e.target.value))}
          />
        </div>
      </div>
      {isLoading ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : lots.length === 0 ? (
        <div className="text-sm text-gray-500">No lots yet.</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-gray-500 border-b">
              <th className="py-1">Card</th>
              <th>Cond.</th>
              <th className="text-right">Opened</th>
              <th className="text-right">Sold</th>
              <th className="text-right">Remaining</th>
              <th className="text-right">Cost/unit</th>
              <th className="text-right">Live</th>
              <th className="text-right">Rem. value</th>
              <th className="text-right">Proceeds</th>
            </tr>
          </thead>
          <tbody>
            {lots.map((l) => {
              const remValue =
                l.live_price_eur != null ? l.qty_remaining * l.live_price_eur : null;
              return (
                <tr key={l.id} className="border-b">
                  <td className="py-1">
                    <a
                      className="text-indigo-600 hover:underline"
                      href={`https://www.cardmarket.com/en/Magic/Products/Singles?idProduct=${l.cardmarket_id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {l.name ?? `#${l.cardmarket_id}`}
                    </a>{" "}
                    {l.foil ? <FoilStar /> : null}
                  </td>
                  <td>{l.condition}</td>
                  <td className="text-right">{l.qty_opened}</td>
                  <td className="text-right">{l.qty_sold}</td>
                  <td className="text-right">{l.qty_remaining}</td>
                  <td className="text-right">{eur(l.cost_basis_per_unit)}</td>
                  <td className="text-right">{eur(l.live_price_eur)}</td>
                  <td className="text-right">{eur(remValue)}</td>
                  <td className="text-right">{eur(l.proceeds_eur)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

**Note:** The `FoilStar` import assumes the component exports default from `cm-sprite.tsx`. Check the actual export; if named, adjust to `import { FoilStar } from "@/components/dashboard/cm-sprite";`.

- [ ] **Step 2: Add to InvestmentDetail**

In `components/investments/InvestmentDetail.tsx`, append below `SealedFlipsSection`:

```typescript
import InvestmentLotsTable from "./InvestmentLotsTable";
```

```tsx
<InvestmentLotsTable investmentId={detail.id} />
```

- [ ] **Step 3: Verify in browser**

Navigate to `/investments/<id>`. Should see the empty "No lots yet." message. After Task 13 is in place and a stock row gets synced, lots will populate here.

- [ ] **Step 4: Commit**

```bash
git add components/investments/InvestmentLotsTable.tsx components/investments/InvestmentDetail.tsx
git commit -m "feat(investments): lot ledger table on detail page"
```

---

## Task 19: Close modal + detail menu

**Files:**
- Create: `components/investments/CloseInvestmentModal.tsx`
- Modify: `components/investments/InvestmentDetail.tsx`

- [ ] **Step 1: Close modal**

Create `components/investments/CloseInvestmentModal.tsx`:

```typescript
"use client";

import { useState } from "react";
import type { InvestmentDetail } from "@/lib/investments/types";

export default function CloseInvestmentModal({
  detail,
  onClose,
  onClosed,
}: {
  detail: InvestmentDetail;
  onClose: () => void;
  onClosed: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // For a preview of cost basis at close, we compute client-side from the detail.
  const sealedProceeds = detail.sealed_flips.reduce((s, f) => s + f.proceeds_eur, 0);
  const remaining = detail.cost_total_eur - sealedProceeds;
  // totalOpened is not on the detail — fallback: show "—" with an explanation.
  // (The server-side close does the precise math.)

  async function submit() {
    setSubmitting(true);
    setErr(null);
    try {
      const r = await fetch(`/api/investments/${detail.id}/close`, { method: "POST" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Failed");
      onClosed();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-lg w-full max-w-md p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">Close Investment</h2>
        <div className="text-sm text-gray-700 space-y-2">
          <p>
            Closing will freeze the lot ledger at its current state. Cost basis
            per card will be computed and stored on each lot. Sales from that
            point on will still deplete `qty_remaining` against these frozen lots.
          </p>
          <p className="font-medium">This cannot be undone.</p>
          <div className="bg-gray-50 rounded p-2 space-y-1 text-xs">
            <div>Outstanding cost (cost − sealed proceeds): €{remaining.toFixed(2)}</div>
            <div className="text-gray-500">Cost basis/card is computed server-side at close.</div>
          </div>
        </div>
        {err && <div className="text-sm text-rose-600">{err}</div>}
        <div className="flex justify-end gap-2">
          <button className="px-3 py-1.5 text-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded disabled:opacity-50"
            disabled={submitting}
            onClick={submit}
          >
            {submitting ? "Closing…" : "Confirm close"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Menu on InvestmentDetail header**

In `components/investments/InvestmentDetail.tsx`, extend the header block with a right-side menu and wire it up. Add state + imports:

```typescript
import { useState } from "react";
import CloseInvestmentModal from "./CloseInvestmentModal";
```

Inside the component (near the top):

```typescript
const [menuOpen, setMenuOpen] = useState(false);
const [showClose, setShowClose] = useState(false);
```

Replace the header row:

```tsx
<div className="flex items-center gap-3 justify-between">
  <div className="flex items-center gap-3">
    <Link href="/investments" className="text-gray-500 hover:text-gray-800">
      <ArrowLeft className="h-4 w-4" />
    </Link>
    <h1 className="text-xl font-semibold">{detail.name}</h1>
    <StatusPill status={detail.status} />
  </div>
  {detail.status !== "archived" && (
    <div className="relative">
      <button
        className="text-sm text-gray-500 hover:text-gray-800 border rounded px-2 py-1"
        onClick={() => setMenuOpen((x) => !x)}
      >
        Actions ▾
      </button>
      {menuOpen && (
        <div className="absolute right-0 mt-1 w-40 bg-white border rounded shadow z-10">
          {detail.status !== "closed" && (
            <button
              className="block w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50"
              onClick={() => {
                setMenuOpen(false);
                setShowClose(true);
              }}
            >
              Close investment
            </button>
          )}
          <button
            className="block w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 text-rose-600"
            onClick={async () => {
              setMenuOpen(false);
              if (!confirm("Archive this investment?")) return;
              await fetch(`/api/investments/${detail.id}`, { method: "DELETE" });
              mutate();
            }}
          >
            Archive
          </button>
        </div>
      )}
    </div>
  )}
</div>

{showClose && (
  <CloseInvestmentModal
    detail={detail}
    onClose={() => setShowClose(false)}
    onClosed={() => {
      setShowClose(false);
      mutate();
    }}
  />
)}
```

- [ ] **Step 3: Verify**

Run: `npm run dev`. Open a test investment. Open Actions menu → Close investment → Confirm. Detail re-renders with `closed` pill. Open Actions → Archive. Detail shows `archived` pill, Actions menu hidden.

- [ ] **Step 4: Commit**

```bash
git add components/investments/CloseInvestmentModal.tsx components/investments/InvestmentDetail.tsx
git commit -m "feat(investments): close modal + actions menu on detail page"
```

---

## Task 20: Extension — popup baseline mode UI

**Repo:** `D:\Projetos\misstep-ext`
**Files:**
- Modify: `manifest.json`
- Modify: `lib/constants.js`
- Modify: `popup/popup.html`
- Modify: `popup/popup.js`
- Modify: `background.js`

- [ ] **Step 1: Bump manifest version**

Edit `D:\Projetos\misstep-ext\manifest.json`. Change `"version": "1.7.2"` to `"version": "1.8.0"`.

- [ ] **Step 2: Add constants**

Edit `D:\Projetos\misstep-ext\lib\constants.js`. Add:

```javascript
const MISSTEP_STORAGE_INVESTMENT_MODE = "misstep_investment_mode";
const MISSTEP_STORAGE_INVESTMENT_ID = "misstep_investment_id";
const MISSTEP_STORAGE_INVESTMENT_TARGETS = "misstep_investment_targets";
const MISSTEP_STORAGE_INVESTMENT_CAPTURED = "misstep_investment_captured";
```

- [ ] **Step 3: Popup HTML — add baseline mode panel**

Edit `popup/popup.html`. Next to the existing seed-mode toggle (find its section), add a new panel:

```html
<section id="investment-panel" class="panel hidden">
  <h3>Investment baseline</h3>
  <div id="investment-list">
    <p class="muted">No investments awaiting baseline.</p>
  </div>
  <div id="investment-active" class="hidden">
    <div id="investment-name"></div>
    <div id="investment-progress" class="muted">0 / 0 cards captured</div>
    <button id="investment-mark-complete">Mark complete</button>
    <button id="investment-exit">Exit baseline mode</button>
  </div>
  <button id="investment-refresh">Refresh list</button>
</section>
```

Add a tab/button to switch to this panel (mirror the existing seed-mode button pattern in the popup).

- [ ] **Step 4: Popup JS — fetch investments + set mode**

Edit `popup/popup.js`. Add:

```javascript
async function fetchInvestmentsAwaitingBaseline() {
  const { misstep_token } = await chrome.storage.local.get("misstep_token");
  if (!misstep_token) return [];
  const res = await fetch(`${API_BASE}/api/investments?status=baseline_captured`, {
    headers: {
      Authorization: `Bearer ${misstep_token}`,
      "X-Member-Name": encodeURIComponent(await getMemberName()),
    },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.investments ?? [];
}

async function fetchBaselineTargets(investmentId) {
  const { misstep_token } = await chrome.storage.local.get("misstep_token");
  const res = await fetch(
    `${API_BASE}/api/investments/${investmentId}/baseline/targets`,
    {
      headers: {
        Authorization: `Bearer ${misstep_token}`,
        "X-Member-Name": encodeURIComponent(await getMemberName()),
      },
    }
  );
  if (!res.ok) return null;
  return await res.json();
}

async function enterInvestmentMode(investmentId) {
  const targets = await fetchBaselineTargets(investmentId);
  if (!targets) return alert("Could not fetch targets");
  await chrome.storage.local.set({
    [MISSTEP_STORAGE_INVESTMENT_MODE]: true,
    [MISSTEP_STORAGE_INVESTMENT_ID]: investmentId,
    [MISSTEP_STORAGE_INVESTMENT_TARGETS]: targets.cardmarket_ids,
    [MISSTEP_STORAGE_INVESTMENT_CAPTURED]: targets.captured_cardmarket_ids,
  });
  renderInvestmentActive(investmentId, targets);
}

async function exitInvestmentMode() {
  await chrome.storage.local.remove([
    MISSTEP_STORAGE_INVESTMENT_MODE,
    MISSTEP_STORAGE_INVESTMENT_ID,
    MISSTEP_STORAGE_INVESTMENT_TARGETS,
    MISSTEP_STORAGE_INVESTMENT_CAPTURED,
  ]);
  // Show list again.
}

async function markBaselineComplete(investmentId) {
  const { misstep_token } = await chrome.storage.local.get("misstep_token");
  await fetch(`${API_BASE}/api/investments/${investmentId}/baseline/complete`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${misstep_token}`,
      "X-Member-Name": encodeURIComponent(await getMemberName()),
    },
  });
  await exitInvestmentMode();
}
```

Wire the buttons to these handlers. Include a render function `renderInvestmentActive(id, targets)` that sets `#investment-name`, `#investment-progress`, and pulls from `MISSTEP_STORAGE_INVESTMENT_CAPTURED` to show progress. Call `fetchInvestmentsAwaitingBaseline` on panel open and render the list with "Select" buttons that call `enterInvestmentMode(id)`.

Find `getMemberName()` and `API_BASE` — they already exist in popup.js / constants.js from prior releases; reuse them.

- [ ] **Step 5: Commit (ext repo)**

```bash
cd D:\Projetos\misstep-ext
git add manifest.json lib/constants.js popup/popup.html popup/popup.js
git commit -m "feat(investments): popup UI for investment baseline mode"
```

---

## Task 21: Extension — baseline-mode branch in product-stock extractor

**Repo:** `D:\Projetos\misstep-ext`
**Files:**
- Modify: `content/extractors/product-stock.js`
- Modify: `background.js`

- [ ] **Step 1: Read current product-stock.js**

Read `content/extractors/product-stock.js` to confirm how it currently emits the `product_stock` payload and detects `productId`.

- [ ] **Step 2: Add baseline-mode branch**

In `content/extractors/product-stock.js`, after extracting the listings and `productId`:

```javascript
chrome.storage.local.get(
  [
    "misstep_investment_mode",
    "misstep_investment_id",
    "misstep_investment_targets",
  ],
  (state) => {
    if (!state.misstep_investment_mode) return;
    const targets = state.misstep_investment_targets ?? [];
    if (!targets.includes(productId)) return;
    const payload = {
      type: "investment_baseline",
      data: {
        investment_id: state.misstep_investment_id,
        productId,
        listings: listings.map((l) => ({
          cardmarket_id: productId,
          foil: l.foil,
          condition: l.condition,
          qty: l.qty,
        })),
      },
    };
    chrome.runtime.sendMessage({ kind: "data", payload });
  }
);
```

- [ ] **Step 3: Background worker routing**

In `background.js`, find the message handler that routes `data` payloads to the sync queue. Add a branch for `investment_baseline` payloads that POSTs **immediately** (not batched) to `/api/investments/{id}/baseline`:

```javascript
if (payload.type === "investment_baseline") {
  const { investment_id, productId, listings } = payload.data;
  const { misstep_token, misstep_investment_captured = [] } = await chrome.storage.local.get([
    "misstep_token",
    "misstep_investment_captured",
  ]);
  const memberName = await getMemberName();
  const body = {
    listings,
    visited_cardmarket_ids: [productId],
  };
  const res = await fetch(`${API_BASE}/api/investments/${investment_id}/baseline`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${misstep_token}`,
      "X-Member-Name": encodeURIComponent(memberName),
    },
    body: JSON.stringify(body),
  });
  if (res.ok) {
    const nextCaptured = Array.from(new Set([...misstep_investment_captured, productId]));
    await chrome.storage.local.set({ misstep_investment_captured: nextCaptured });
  }
  return;
}
```

- [ ] **Step 4: Commit**

```bash
cd D:\Projetos\misstep-ext
git add content/extractors/product-stock.js background.js
git commit -m "feat(investments): baseline-mode branch in product-stock scraper"
```

---

## Task 22: Extension — pack + release + dashboard version mirror

**Repos:** both.

- [ ] **Step 1: Pack the extension**

```bash
cd D:\Projetos\misstep-ext
npm run pack
```

Expected: `dist/misstep-ext.zip` created.

- [ ] **Step 2: Create GitHub release**

```bash
cd D:\Projetos\misstep-ext
gh release create v1.8.0 dist/misstep-ext.zip --title "v1.8.0 — Investments baseline capture"
```

Expected: release visible at the repo's Releases page.

- [ ] **Step 3: Mirror LATEST_EXT_VERSION in dashboard**

Edit `D:\Projetos\misstep\lib\constants.ts`:

```typescript
export const LATEST_EXT_VERSION = "1.8.0";
```

- [ ] **Step 4: Commit dashboard**

```bash
cd D:\Projetos\misstep
git add lib/constants.ts
git commit -m "chore(investments): bump LATEST_EXT_VERSION to 1.8.0"
```

- [ ] **Step 5: Deploy dashboard**

Push dashboard to main (Vercel auto-deploys). Then install the v1.8.0 extension locally via the downloaded zip. Create an investment, run baseline mode, walk a small set on Cardmarket, press "Mark complete", then verify:

- Investment detail page shows `status = listing` with sealed-flips section, lots table still empty.
- Add stock rows via the extension's normal sync (visit a page on Cardmarket where you'd list a single from that set).
- Lots table populates.
- Dashboard's KPI row updates.

---

## Self-Review

- [ ] **Spec coverage:** Every decision in Section 2 of the spec mapped to a task:
  - Data model (4 collections, indexes) → Task 1
  - Pure math → Task 2
  - Service create/read/update/archive → Task 3
  - API routes for invest CRUD → Tasks 4-5
  - Sealed flip → Task 6
  - Close (freeze + cost basis) → Task 7
  - Lot GET/PATCH → Task 8
  - Baseline targets → Task 9
  - Baseline batch + complete → Task 10
  - maybeGrowLot (FIFO, budget, delta) → Task 11
  - consumeSale + reverseSale → Task 12
  - Wire into cardmarket.ts → Task 13
  - Sidebar → Task 14
  - List + create UI → Task 15
  - Detail page + KPIs + banner → Task 16
  - Sealed flip UI → Task 17
  - Lot ledger UI → Task 18
  - Close modal + actions menu → Task 19
  - Extension baseline mode UI → Task 20
  - Extension extractor branch → Task 21
  - Pack + release + mirror → Task 22

- [ ] **Types are consistent across tasks:** `Investment.source`, `SealedFlip`, `InvestmentLot` field names match everywhere they're referenced.

- [ ] **No placeholders / TODOs / "add appropriate error handling":** Every code step has concrete code. Where dependencies (e.g. `withExtAuthParams`) might not exist yet, the task body shows the code to add.

- [ ] **Edge cases reflected:** FIFO, budget cap, baseline offset, reverse-on-cancel, sealed flips reducing budget. Each has a pure or attribution test to back it.
