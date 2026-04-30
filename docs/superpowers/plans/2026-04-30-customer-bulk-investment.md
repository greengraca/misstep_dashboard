# Customer bulk investment — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third investment source kind — `customer_bulk` — that lets the user record a heterogeneous bag of singles bought as a lot, tracked by total cost and an estimated card count, with the same MS-tag attribution flow as `box`/`product`.

**Architecture:** Pure additive change to the investments domain. New variant on the `InvestmentSource` discriminated union, plus thin `kind === "customer_bulk"` branches in math/service/API/UI. No new collections, no new endpoints, no migration. Tag attribution (`maybeGrowLot` / `consumeSale` / `reverseSale`) is keyed on `investment.code` and picks up the new kind for free.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript 5.9, MongoDB native driver, SWR, Tailwind CSS 4, Lucide icons.

**Spec:** `docs/superpowers/specs/2026-04-30-customer-bulk-investment-design.md`

**Testing posture:** No automated tests for the investments domain (`vitest` is installed but no investment-tab tests exist). Each task gates on `npm run typecheck` before committing. Final task is a manual verification walkthrough mirroring spec section 5.

**File map:**

| File | Change |
|---|---|
| `lib/investments/types.ts` | Add `InvestmentSourceCustomerBulk` interface, extend union |
| `lib/investments/math.ts` | Branch in `computeExpectedOpenCardCount` |
| `lib/investments/service.ts` | Branches in `defaultCmSetNames`, `computeExpectedEv`, `recordSealedFlip` |
| `app/api/investments/route.ts` | Branch in `validateSource` |
| `components/investments/InvestmentsContent.tsx` | Branch in `sourceLabel` |
| `components/investments/InvestmentDetail.tsx` | Branch in `sourceLabel`; gate `canRecord` on source kind |
| `components/investments/CreateInvestmentModal.tsx` | Add KindCard, form branch, state, validation, reset |

---

### Task 1: Extend the `InvestmentSource` union

**Files:**
- Modify: `lib/investments/types.ts`

- [ ] **Step 1: Add the new interface and extend the union**

In `lib/investments/types.ts`, after the `InvestmentSourceCollection` interface (around line 30) but before the `InvestmentSource` type alias (around line 32), add:

```ts
/**
 * Bought a heterogeneous bag of singles in a single transaction (e.g. a
 * customer's whole binder). No per-card data — just total cost and an
 * estimate of how many cards are in the bag. Lots grow lazily from
 * MS-tag attribution as the user lists individual cards on Cardmarket
 * (same flow as `box`/`product`). Sealed flips are not allowed (no
 * sealed product to flip).
 */
export interface InvestmentSourceCustomerBulk {
  kind: "customer_bulk";
  /** User's estimate of the total card count in the bag. Used as
   *  `expected_open_card_count` while listing for display purposes only;
   *  at close, per-unit cost basis is computed from `sum(qty_opened)`
   *  across actual lots, not from this estimate. */
  estimated_card_count: number;
  /** Optional ISO date string — when the bag was acquired. */
  acquired_at?: string;
}
```

Then replace the `InvestmentSource` type alias (lines 32-35) with:

```ts
export type InvestmentSource =
  | InvestmentSourceBox
  | InvestmentSourceProduct
  | InvestmentSourceCollection
  | InvestmentSourceCustomerBulk;
```

- [ ] **Step 2: Run typecheck — expect failures**

```bash
npm run typecheck
```

Expected: FAIL. Errors should appear in `lib/investments/math.ts`, `lib/investments/service.ts` (the function `computeExpectedEv`'s implicit-return path now has an unhandled variant), `app/api/investments/route.ts` (the trailing message branch), `components/investments/InvestmentsContent.tsx`, and `components/investments/InvestmentDetail.tsx` if any of them use exhaustive switches. Errors will be fixed in tasks 2-7.

If typecheck fails with errors NOT related to source-kind exhaustiveness or the new interface, stop and report.

- [ ] **Step 3: Commit**

```bash
git add lib/investments/types.ts
git commit -m "feat(investments): add customer_bulk source kind to type union"
```

---

### Task 2: Handle new kind in math

**Files:**
- Modify: `lib/investments/math.ts`

- [ ] **Step 1: Add `customer_bulk` branch to `computeExpectedOpenCardCount`**

In `lib/investments/math.ts`, replace the `computeExpectedOpenCardCount` function body (lines 25-39) with:

```ts
export function computeExpectedOpenCardCount(
  investment: Investment,
  options: { cardsPerProductUnit?: number } = {}
): number {
  if (investment.source.kind === "collection") {
    return investment.source.card_count;
  }
  if (investment.source.kind === "customer_bulk") {
    return investment.source.estimated_card_count;
  }
  const flippedUnits = sumSealedFlipUnits(investment.sealed_flips);
  if (investment.source.kind === "box") {
    const { packs_per_box, cards_per_pack, box_count } = investment.source;
    return packs_per_box * cards_per_pack * Math.max(0, box_count - flippedUnits);
  }
  const perUnit = options.cardsPerProductUnit ?? 0;
  return perUnit * Math.max(0, investment.source.unit_count - flippedUnits);
}
```

The new branch must come BEFORE the `flippedUnits` line — `customer_bulk` rejects sealed flips at the API layer, so the array will always be empty, but skipping the calculation entirely is cleaner.

`computeCostBasisPerUnit` is already kind-agnostic and its `totalOpened <= 0` guard handles "closed with no tagged lots" — no change.

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: still FAIL on remaining files (service, route, components), but no new errors in `math.ts`. The function should now compile because the union is exhaustively narrowed.

- [ ] **Step 3: Commit**

```bash
git add lib/investments/math.ts
git commit -m "feat(investments): expected-card-count branch for customer_bulk"
```

---

### Task 3: Handle new kind in service layer

**Files:**
- Modify: `lib/investments/service.ts`

- [ ] **Step 1: Branch `defaultCmSetNames`**

In `lib/investments/service.ts`, find `defaultCmSetNames` (around lines 73-101). Replace with:

```ts
async function defaultCmSetNames(db: Db, source: InvestmentSource): Promise<string[]> {
  if (source.kind === "box") {
    const set = await db
      .collection("dashboard_ev_sets")
      .findOne({ code: source.set_code }, { projection: { name: 1 } });
    return set?.name ? [set.name as string] : [];
  }
  if (source.kind === "product") {
    const p = await db
      .collection<EvProduct>(COL_EV_PRODUCTS)
      .findOne({ slug: source.product_slug }, { projection: { parent_set_code: 1 } });
    if (!p?.parent_set_code) return [];
    const set = await db
      .collection("dashboard_ev_sets")
      .findOne({ code: p.parent_set_code }, { projection: { name: 1 } });
    return set?.name ? [set.name as string] : [];
  }
  if (source.kind === "customer_bulk") {
    // Heterogeneous bag, no canonical set scoping. User can edit
    // cm_set_names later via updateInvestment if they want to scope it.
    return [];
  }
  // collection-kind: union of distinct setNames across the cards.
  const cards = await db
    .collection<AppraiserCardDoc>(COL_APPRAISER_CARDS)
    .find(
      { collectionId: new ObjectId(source.appraiser_collection_id), excluded: { $ne: true } },
      { projection: { setName: 1 } }
    )
    .toArray();
  const names = new Set<string>();
  for (const c of cards) if (c.setName) names.add(c.setName);
  return Array.from(names);
}
```

- [ ] **Step 2: Branch `computeExpectedEv`**

In the same file, find `computeExpectedEv` (around lines 422-447). Replace with:

```ts
export async function computeExpectedEv(investment: Investment): Promise<number | null> {
  const db = await getDb();
  if (investment.source.kind === "box") {
    const map = await latestPlayEvBySet([investment.source.set_code]);
    const perPackEv = map[investment.source.set_code];
    if (perPackEv == null) return null;
    return perPackEv * investment.source.packs_per_box * investment.source.box_count;
  }
  if (investment.source.kind === "product") {
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
  // collection and customer_bulk: no published EV concept.
  return null;
}
```

- [ ] **Step 3: Branch `recordSealedFlip` to reject the new kind**

In the same file, find `recordSealedFlip` (around lines 491-564). The existing function has an early-return for `collection`-kind around line 502. Replace lines 501-505:

```ts
  if (inv.source.kind === "collection" || inv.source.kind === "customer_bulk") {
    // No sealed product to flip on these kinds.
    return inv;
  }
```

The two `if` blocks below (`if (inv.source.kind === "box")` and the `else` for product) now form an exhaustive narrowing — TypeScript will be happy.

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```

Expected: errors remain only in `app/api/investments/route.ts`, `components/investments/InvestmentsContent.tsx`, and `components/investments/InvestmentDetail.tsx`. No errors in `service.ts`.

- [ ] **Step 5: Commit**

```bash
git add lib/investments/service.ts
git commit -m "feat(investments): service-layer branches for customer_bulk"
```

---

### Task 4: Extend API validation

**Files:**
- Modify: `app/api/investments/route.ts`

- [ ] **Step 1: Add `customer_bulk` branch in `validateSource`**

In `app/api/investments/route.ts`, find `validateSource` (lines 13-46). Insert a new branch BEFORE the trailing fallthrough return (i.e. between the `collection` branch ending at line 44 and the final `return "source.kind must be..."` at line 45). The full updated function body becomes:

```ts
function validateSource(src: unknown): string | null {
  if (!src || typeof src !== "object") return "source is required";
  const kind = (src as { kind?: unknown }).kind;
  if (kind === "box") {
    const s = src as Record<string, unknown>;
    if (typeof s.set_code !== "string" || !s.set_code) return "source.set_code required";
    if (!["play", "collector", "jumpstart", "set"].includes(s.booster_type as string))
      return "source.booster_type invalid";
    if (typeof s.packs_per_box !== "number" || !Number.isFinite(s.packs_per_box) || s.packs_per_box <= 0)
      return "source.packs_per_box must be positive";
    if (typeof s.cards_per_pack !== "number" || !Number.isFinite(s.cards_per_pack) || s.cards_per_pack <= 0)
      return "source.cards_per_pack must be positive";
    if (typeof s.box_count !== "number" || !Number.isFinite(s.box_count) || s.box_count <= 0)
      return "source.box_count must be positive";
    return null;
  }
  if (kind === "product") {
    const s = src as Record<string, unknown>;
    if (typeof s.product_slug !== "string" || !s.product_slug)
      return "source.product_slug required";
    if (typeof s.unit_count !== "number" || !Number.isFinite(s.unit_count) || s.unit_count <= 0)
      return "source.unit_count must be positive";
    return null;
  }
  if (kind === "collection") {
    const s = src as Record<string, unknown>;
    if (typeof s.appraiser_collection_id !== "string" || !s.appraiser_collection_id)
      return "source.appraiser_collection_id required";
    if (typeof s.card_count !== "number" || !Number.isFinite(s.card_count) || s.card_count < 0)
      return "source.card_count must be a non-negative number";
    return null;
  }
  if (kind === "customer_bulk") {
    const s = src as Record<string, unknown>;
    if (typeof s.estimated_card_count !== "number"
      || !Number.isFinite(s.estimated_card_count)
      || s.estimated_card_count <= 0)
      return "source.estimated_card_count must be positive";
    if (s.acquired_at !== undefined && typeof s.acquired_at !== "string")
      return "source.acquired_at must be an ISO date string";
    return null;
  }
  return "source.kind must be 'box', 'product', 'collection', or 'customer_bulk'";
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: errors remain only in the two component files.

- [ ] **Step 3: Commit**

```bash
git add app/api/investments/route.ts
git commit -m "feat(investments): API validation for customer_bulk source"
```

---

### Task 5: Extend `sourceLabel` in list view

**Files:**
- Modify: `components/investments/InvestmentsContent.tsx`

- [ ] **Step 1: Replace `sourceLabel` with the new variant**

In `components/investments/InvestmentsContent.tsx`, find the `sourceLabel` function (lines 21-29). Replace with:

```ts
function sourceLabel(src: InvestmentListItem["source"]): string {
  if (src.kind === "box") {
    return `${src.box_count}× ${src.set_code.toUpperCase()} · ${src.booster_type}`;
  }
  if (src.kind === "product") {
    return `${src.unit_count}× ${src.product_slug}`;
  }
  if (src.kind === "customer_bulk") {
    return `Customer bulk · ~${src.estimated_card_count.toLocaleString()} cards`;
  }
  return `Collection · ${src.card_count} cards`;
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: only `InvestmentDetail.tsx` should still error.

- [ ] **Step 3: Commit**

```bash
git add components/investments/InvestmentsContent.tsx
git commit -m "feat(investments): list-view label for customer_bulk"
```

---

### Task 6: Extend `sourceLabel` and gate sealed-flip in detail view

**Files:**
- Modify: `components/investments/InvestmentDetail.tsx`

- [ ] **Step 1: Replace `sourceLabel` in the detail page**

In `components/investments/InvestmentDetail.tsx`, find the `sourceLabel` function (lines 33-41). Replace with:

```ts
function sourceLabel(source: Detail["source"]): string {
  if (source.kind === "box") {
    return `${source.box_count}× ${source.set_code.toUpperCase()} · ${source.booster_type} · ${source.packs_per_box} packs × ${source.cards_per_pack} cards`;
  }
  if (source.kind === "product") {
    return `${source.unit_count}× ${source.product_slug}`;
  }
  if (source.kind === "customer_bulk") {
    const acquired = source.acquired_at
      ? ` · acquired ${new Date(source.acquired_at).toLocaleDateString("pt-PT")}`
      : "";
    return `Customer bulk · ~${source.estimated_card_count.toLocaleString()} cards${acquired}`;
  }
  return `Collection · ${source.card_count} cards`;
}
```

- [ ] **Step 2: Gate the sealed-flip "Record flip" button on source kind**

The spec calls out that `customer_bulk` (and `collection`, today) should not show the Record-flip button — the API rejects flips for both kinds and the button currently shows-but-no-ops, which is a small UX gap. Tighten the gate by including the kind check.

In the same file, find the `<SealedFlipsSection>` render (around lines 257-262). Replace with:

```tsx
      <SealedFlipsSection
        investmentId={detail.id}
        flips={detail.sealed_flips}
        canRecord={
          detail.status !== "archived" &&
          detail.source.kind !== "collection" &&
          detail.source.kind !== "customer_bulk"
        }
        onChanged={() => mutate()}
      />
```

This is a deliberate small behavior change for `collection`-kind too — the button stops rendering for it, matching what the API has always done. Note in the commit message.

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS. All TypeScript errors resolved.

- [ ] **Step 4: Commit**

```bash
git add components/investments/InvestmentDetail.tsx
git commit -m "feat(investments): detail-view label + sealed-flip gating for customer_bulk

Also hides the Record-flip button on collection-kind, where the API
already rejects flips silently — closes a small UX gap surfaced while
adding customer_bulk."
```

---

### Task 7: Add Customer-bulk KindCard to the create modal

**Files:**
- Modify: `components/investments/CreateInvestmentModal.tsx`

- [ ] **Step 1: Bump modal width and grid columns**

In `components/investments/CreateInvestmentModal.tsx`, find the `<Modal>` opening tag (around line 231):

```tsx
    <Modal open={open} onClose={onClose} title="New Investment" maxWidth="max-w-xl">
```

Change to:

```tsx
    <Modal open={open} onClose={onClose} title="New Investment" maxWidth="max-w-2xl">
```

Find the KindCard grid (around line 234):

```tsx
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
```

Change to:

```tsx
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
```

- [ ] **Step 2: Add `Wallet` to the lucide imports**

Find the lucide import at the top of the file (line 4):

```ts
import { Boxes, Layers, ChevronDown, Sliders } from "lucide-react";
```

Replace with:

```ts
import { Boxes, Layers, ChevronDown, Sliders, Wallet } from "lucide-react";
```

- [ ] **Step 3: Widen the local `Kind` type**

Find the `Kind` type alias (line 20):

```ts
type Kind = "box" | "product" | null;
```

Replace with:

```ts
type Kind = "box" | "product" | "customer_bulk" | null;
```

- [ ] **Step 4: Add the third KindCard**

Find the existing KindCards block (lines 235-249) and append the third tile. The block becomes:

```tsx
        {/* Kind selector */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <KindCard
            active={kind === "box"}
            onClick={() => setKind("box")}
            icon={<Boxes size={22} style={{ color: "var(--accent)" }} />}
            title="Random-pool box"
            description="Booster box or Jumpstart box — opens into random packs from a set."
          />
          <KindCard
            active={kind === "product"}
            onClick={() => setKind("product")}
            icon={<Layers size={22} style={{ color: "var(--accent)" }} />}
            title="Fixed-pool product"
            description="Commander precon, Planeswalker deck, Starter deck — known card list."
          />
          <KindCard
            active={kind === "customer_bulk"}
            onClick={() => setKind("customer_bulk")}
            icon={<Wallet size={22} style={{ color: "var(--accent)" }} />}
            title="Customer bulk purchase"
            description="Heterogeneous bag of singles bought as a lot — tracked by total cost and an estimated card count."
          />
        </div>
```

- [ ] **Step 5: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS. (The new KindCard sets state but no form is rendered yet — that's added in Task 8.)

- [ ] **Step 6: Commit**

```bash
git add components/investments/CreateInvestmentModal.tsx
git commit -m "feat(investments): add Customer bulk KindCard to create modal"
```

---

### Task 8: Add Customer-bulk form, state, validation, reset

**Files:**
- Modify: `components/investments/CreateInvestmentModal.tsx`

- [ ] **Step 1: Add state for the new fields**

In `components/investments/CreateInvestmentModal.tsx`, find the state declarations (around lines 122-141). Insert two new state hooks among the kind-specific blocks. The full state block becomes:

```ts
  const [kind, setKind] = useState<Kind>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Box fields
  const [setCode, setSetCode] = useState("");
  const [boosterType, setBoosterType] = useState<BoosterType>("play");
  const [boxCount, setBoxCount] = useState(1);
  const [packsPerBox, setPacksPerBox] = useState(DEFAULT_PACKS.play.packs);
  const [cardsPerPack, setCardsPerPack] = useState(DEFAULT_PACKS.play.cards);

  // Product fields
  const [productSlug, setProductSlug] = useState("");
  const [unitCount, setUnitCount] = useState(1);

  // Customer-bulk fields
  const [estimatedCardCount, setEstimatedCardCount] = useState(0);
  const [acquiredAt, setAcquiredAt] = useState(() => isoToday());

  // Common fields
  const [cost, setCost] = useState(0);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
```

- [ ] **Step 2: Add the `isoToday` helper near the bottom of the file**

The file already has a `monthYear()` helper at the bottom (lines 477-479). Append a sibling helper after it:

```ts
function monthYear(): string {
  return new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function isoToday(): string {
  // YYYY-MM-DD in local time — matches the format <input type="date"> emits.
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
```

- [ ] **Step 3: Add the new fields to the modal-close reset**

Find the reset `useEffect` (around lines 151-166). Add the two new fields:

```ts
  // Reset on close
  useEffect(() => {
    if (!open) {
      setKind(null);
      setAdvancedOpen(false);
      setSetCode("");
      setBoosterType("play");
      setBoxCount(1);
      setProductSlug("");
      setUnitCount(1);
      setEstimatedCardCount(0);
      setAcquiredAt(isoToday());
      setCost(0);
      setName("");
      setNotes("");
      setErr(null);
      setSubmitting(false);
    }
  }, [open]);
```

- [ ] **Step 4: Extend `source`, `defaultName`, and `sourceValid`**

Find the trio of derived values (around lines 168-194). Replace with:

```ts
  const source: InvestmentSource | null =
    kind === "box"
      ? {
          kind: "box",
          set_code: setCode.trim().toLowerCase(),
          booster_type: boosterType,
          packs_per_box: packsPerBox,
          cards_per_pack: cardsPerPack,
          box_count: boxCount,
        }
      : kind === "product"
        ? { kind: "product", product_slug: productSlug.trim(), unit_count: unitCount }
        : kind === "customer_bulk"
          ? {
              kind: "customer_bulk",
              estimated_card_count: estimatedCardCount,
              acquired_at: acquiredAt || undefined,
            }
          : null;

  const defaultName =
    kind === "box"
      ? `${boxCount}× ${setCode ? setCode.toUpperCase() : "?"} ${boosterType} — ${monthYear()}`
      : kind === "product"
        ? `${unitCount}× ${productSlug || "?"}`
        : kind === "customer_bulk"
          ? `Customer bulk — ~${(estimatedCardCount || 0).toLocaleString()} cards — ${monthYear()}`
          : "";

  const sourceValid =
    kind === "box"
      ? !!setCode && boxCount > 0 && packsPerBox > 0 && cardsPerPack > 0
      : kind === "product"
        ? !!productSlug && unitCount > 0
        : kind === "customer_bulk"
          ? estimatedCardCount > 0
          : false;
```

- [ ] **Step 5: Add the customer-bulk form branch**

Find the product-form block (around lines 371-407 — the `{kind === "product" && (...)}` block). Insert a new sibling block immediately after it, BEFORE the common Name + Notes block. The new block:

```tsx
        {/* Customer-bulk form */}
        {kind === "customer_bulk" && (
          <div className="flex flex-col gap-3 animate-[fadeIn_0.2s_ease]">
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Estimated cards"
                hint="Rough is fine. Used for display while still listing."
              >
                <input
                  type="number"
                  min={1}
                  className="appraiser-field w-full px-3 py-2 rounded-lg text-sm"
                  style={{ ...fieldStyle, fontFamily: "var(--font-mono)" }}
                  placeholder="5000"
                  value={estimatedCardCount || ""}
                  onChange={(e) => setEstimatedCardCount(Number(e.target.value))}
                />
              </Field>
              <Field label="Total cost (€)">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="appraiser-field w-full px-3 py-2 rounded-lg text-sm"
                  style={{ ...fieldStyle, fontFamily: "var(--font-mono)" }}
                  placeholder="0.00"
                  value={cost || ""}
                  onChange={(e) => setCost(Number(e.target.value))}
                />
              </Field>
            </div>
            <Field label="Acquired" hint="When you bought the bag.">
              <input
                type="date"
                className="appraiser-field w-full px-3 py-2 rounded-lg text-sm"
                style={{ ...fieldStyle, fontFamily: "var(--font-mono)" }}
                value={acquiredAt}
                onChange={(e) => setAcquiredAt(e.target.value)}
              />
            </Field>
          </div>
        )}
```

- [ ] **Step 6: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Run a build sanity check**

```bash
npm run build
```

Expected: PASS. Catches anything `tsc --noEmit` misses (Next-specific compilation).

If this is too slow or runs into an unrelated env issue, skip and rely on the dev-server check in Task 9.

- [ ] **Step 8: Commit**

```bash
git add components/investments/CreateInvestmentModal.tsx
git commit -m "feat(investments): customer_bulk form in create modal"
```

---

### Task 9: Manual verification

**Files:** none (runtime walkthrough)

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

Expected: Next dev server starts on `http://localhost:3025`. Wait for `✓ Ready` line.

- [ ] **Step 2: Verify create flow**

In the browser:
1. Navigate to `http://localhost:3025/investments`.
2. Click `+ New Investment`. Modal opens.
3. Confirm three KindCards render side-by-side at modal width `max-w-2xl`. The third is "Customer bulk purchase" with a wallet icon and the description "Heterogeneous bag of singles bought as a lot — tracked by total cost and an estimated card count."
4. Click "Customer bulk purchase". Form swaps in: Estimated cards (left), Total cost (right), Acquired (full-width row), Name (auto-default placeholder), Notes.
5. Enter `1000` cards, `100` cost, leave Acquired at today, leave Name blank.
6. Confirm the placeholder Name reads `Customer bulk — ~1,000 cards — {Month YYYY}`.
7. Click `Create investment`. Modal closes; row appears in the listing tab.

PASS criteria: row's `Source` column reads `Customer bulk · ~1,000 cards`. KPIs row at top still shows correct totals.

- [ ] **Step 3: Verify detail view**

Click the new investment's name to open the detail page.

- Header subtitle reads `Customer bulk · ~1,000 cards · acquired {today}`.
- Provenance code (`MS-XXXX`) is shown and copyable.
- KPIs: Cost €100, Listed €0, Realized €0, Expected EV `—`, P/L blended −€100.
- The "Record flip" button does NOT render in the Sealed-flips section header (gating works).
- Lots table is empty.

- [ ] **Step 4: Verify tag attribution**

Pick an existing CM listing in your stock that you can re-tag (or create a small test listing). In the extension popup or directly via CM, set its comment to the new investment's `MS-XXXX` code. Trigger a stock sync (visit a Cardmarket Singles page that includes that card so the extension scrapes; or run whatever manual sync hook is wired up).

PASS criteria: refresh the investment detail page → a lot row appears for that card's `(cardmarket_id, foil, condition, language)` tuple with `qty_opened` matching the stock listing. `tagged X / expected Y` count in the CodeStrip increments.

If you don't have a convenient listing to test with, skip to Step 5 — the kind-specific code paths don't touch attribution and Tasks 1-3 cover the unit-level invariants.

- [ ] **Step 5: Verify close path with at least one lot**

If Step 4 produced a lot:
1. From the detail page Actions menu, click `Close investment`.
2. Confirm the modal warning reads correctly (mirrors what's shown for box/product investments).
3. Confirm. Status flips to `closed`.

PASS criteria: refresh → status badge is `closed`. Open the lot row → `cost_basis_per_unit = 100 / qty_opened`. No NaN, no infinity, no React warning in the console.

- [ ] **Step 6: Verify close path with zero lots (edge case)**

Create a second customer-bulk investment with cost €50, estimated 500 cards, and immediately close it without tagging anything.

Inspect via Mongo shell (or wherever you debug DB):

```js
db.dashboard_investments.findOne({ "source.kind": "customer_bulk", status: "closed" }, { closed_at: 1, status: 1 })
db.dashboard_investment_lots.countDocuments({ investment_id: <_id> })
```

PASS criteria: investment status is `closed`, lot count is 0, no errors logged. Detail page renders cleanly with `Listed €0 / Realized €0 / Cost €50`.

- [ ] **Step 7: Verify sealed-flip rejection at the API layer**

Even though the button is hidden, verify the API rejects directly:

```bash
curl -X POST http://localhost:3025/api/investments/<id>/sealed-flips \
  -H "content-type: application/json" \
  -H "Cookie: <session-cookie>" \
  -d '{"unit_count":1,"proceeds_eur":50}'
```

PASS criteria: response returns the investment unchanged (no 4xx), `sealed_flips` array still empty in the returned doc. (`recordSealedFlip` early-returns silently for `customer_bulk` and `collection` — the API doesn't 400 it; that's the existing pattern for `collection`.)

If you don't have a working session cookie handy, skip this — Task 3's typecheck already proves the early-return path covers the new kind.

- [ ] **Step 8: Verify validation errors**

In the modal, try to create a customer-bulk with `Estimated cards = 0`. Confirm the `Create investment` button stays disabled (greyed out).

Try via curl with an out-of-range estimate:

```bash
curl -X POST http://localhost:3025/api/investments \
  -H "content-type: application/json" \
  -H "Cookie: <session-cookie>" \
  -d '{"name":"x","cost_total_eur":1,"source":{"kind":"customer_bulk","estimated_card_count":0}}'
```

PASS criteria: 400 with body `{"error":"source.estimated_card_count must be positive"}`.

- [ ] **Step 9: Style consistency check**

While the modal is open, inspect:
- The Date input picks up `var(--bg-card)` background and `var(--text-primary)` text — i.e. it doesn't render with browser-default white. (Native `<input type="date">` in dark mode has known styling quirks. If the picker dropdown looks broken, note it but don't block — it's a known browser-level issue, not a regression introduced by this PR.)
- The third KindCard's border/active-state matches the first two.
- Modal doesn't overflow on a 1280×800 viewport.

- [ ] **Step 10: Stop the dev server**

Stop with Ctrl+C.

- [ ] **Step 11: Final summary commit (if needed)**

If verification surfaced any small UI fixes (label tweaks, a missing CSS token, etc.), apply them and commit:

```bash
git add <touched files>
git commit -m "polish(investments): post-verification tweaks for customer_bulk"
```

If everything passed, no extra commit needed — the feature is complete.

---

## Self-review

Run through the spec sections to confirm coverage:

- **Spec § Architecture / Schema:** ✓ Task 1.
- **Spec § Math:** ✓ Task 2.
- **Spec § Service:** ✓ Task 3 (defaultCmSetNames, computeExpectedEv, recordSealedFlip).
- **Spec § API:** ✓ Task 4.
- **Spec § UI — modal:** ✓ Tasks 7 + 8.
- **Spec § UI — list view label:** ✓ Task 5.
- **Spec § UI — detail label + sealed-flip gating:** ✓ Task 6.
- **Spec § Testing:** ✓ Task 9 covers all 8 spec verification steps.
- **Spec § Out of scope:** No tasks touch attribution / tag audit / KPIs / extension. ✓.
