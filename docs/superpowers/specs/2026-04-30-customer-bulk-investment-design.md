# Customer bulk investment — design

**Date:** 2026-04-30
**Topic:** New investment source kind for tracking heterogeneous bulk purchases (a "customer's collection") with no per-card data — only a total cost and an estimated card count.

## Problem

Today the **New Investment** modal exposes two source kinds:

- `box` — random-pool box (booster box, Jumpstart, set boosters)
- `product` — fixed-pool product (commander precon, planeswalker deck)

There's a third kind in the type union — `collection` — but it's only reachable by converting an Appraiser collection. It requires `appraiser_collection_id`, pre-populates lots from the appraiser's per-card data, and explicitly does **not** grow lots from MS-tag attribution.

Real workflow gap: João frequently buys a customer's whole bag of cards in one transaction (e.g. €500 for ~5,000 cards). He doesn't appraise card-by-card — he sifts the bag, lists the valuable ~1–5%, and the rest sits in a binder. Today there's no way to register that purchase as an investment short of building an appraiser collection for it (overkill — he doesn't have the per-card data and doesn't want to enter it).

## What changes for the user

The **New Investment** modal grows a third kind tile alongside "Random-pool box" and "Fixed-pool product":

```
[ Random-pool box ]   [ Fixed-pool product ]   [ Customer bulk purchase ]
```

The modal width bumps from `max-w-xl` → `max-w-2xl` so all three cards fit 3-up at ~210px each.

Selecting **Customer bulk purchase** swaps in a simpler form than the existing kinds — no set, no booster type, no product slug, no advanced section:

```
Estimated cards    [ 5000      ]   Rough is fine. Used to display per-card cost while still listing.
Total cost (€)     [ 500.00    ]
Acquired           [ 2026-04-30 ]   When you bought the bag.
Name               [ ...auto... ]   Default: "Customer bulk — ~5,000 cards — April 2026"
Notes              [           ]
```

Once created the investment behaves like a `box` for tag attribution: the user pastes the `MS-XXXX` code into the comment of any CM listing for cards from this bag, and the existing extension sync flow grows lots lazily as listings are scraped and decrements them as they sell.

In the investments table the source label reads `Customer bulk · ~5,000 cards`.

## Behavior matrix

How the new kind sits across existing logic, compared with the three existing kinds:

| Behavior | `box` / `product` | `collection` (today) | `customer_bulk` (new) |
|---|---|---|---|
| Lots created at conversion | No (lazy) | Yes (one per tuple) | **No** (lazy, like `box`) |
| `maybeGrowLot` from tags | Yes | No | **Yes** |
| `consumeSale` from tags | Yes | Yes | Yes |
| Sealed flips allowed | Yes | No | **No** (no sealed product to flip) |
| `expected_open_card_count` source | `boxes × packs × cards` | sum of appraiser qty | **`estimated_card_count`** (literal) |
| `closeInvestment` cost basis | `cost / sum(qty_opened)` | `cost / sum(qty_opened)` | **`cost / sum(qty_opened)`** (same) |
| `computeExpectedEv` | `latestPlayEvBySet × packs × boxes` | `null` | **`null`** (no published EV concept) |
| `defaultCmSetNames` | parent set name | union from cards | **`[]`** (heterogeneous; user edits later) |
| Tag audit | Lots count | Lots count | Lots count |

**Cost basis "use estimate while listing, real number at close" rule:** while `listing`, no per-unit cost basis is computed at all (`InvestmentLot.cost_basis_per_unit = null`, same as today). The `estimated_card_count` is purely informational. At `close`, the existing math (`cost / sum(qty_opened)`) takes over using the actual count of tagged lots — by then every card the user intended to list IS listed, so the actual sum is the truth. No change to `closeInvestment` itself.

**Why a new kind, not a relaxed `collection`:** the existing `collection`-kind is appraiser-backed and explicitly does NOT grow lots from tags. The new behavior wants tag-grows-lot. Reusing the same kind would force runtime branching on whether `appraiser_collection_id` is present in every consumer. A separate kind keeps each path's invariants clean and lets the source-kinds matrix in `domain_investments.md` stay readable.

## Architecture

Pure additive change. No new collections, no new endpoints, no new background jobs. Three existing files take the bulk of the work; a few others get a one-line `kind === "customer_bulk"` branch each as TypeScript surfaces them via the union exhaustiveness check.

### Schema (additive)

`dashboard_investments.source` gains a fourth shape:

```ts
// lib/investments/types.ts
export interface InvestmentSourceCustomerBulk {
  kind: "customer_bulk";
  estimated_card_count: number;   // user input, > 0
  acquired_at?: string;           // optional ISO date string
}

export type InvestmentSource =
  | InvestmentSourceBox
  | InvestmentSourceProduct
  | InvestmentSourceCollection
  | InvestmentSourceCustomerBulk;
```

No migration required. Existing docs remain valid.

### Math (`lib/investments/math.ts`)

`computeExpectedOpenCardCount` gains a branch:

```ts
if (investment.source.kind === "customer_bulk") {
  return investment.source.estimated_card_count;
}
```

Sealed-flip math doesn't apply (the kind rejects flips), so no flip subtraction. `computeCostBasisPerUnit` requires no change — its existing `totalOpened <= 0` guard already covers "closed with no tagged lots" for any kind.

### Service (`lib/investments/service.ts`)

- `defaultCmSetNames`: `if (source.kind === "customer_bulk") return [];` — heterogeneous bag, no canonical set; `updateInvestment` already supports editing `cm_set_names` post-creation if the user wants to scope it later.
- `computeExpectedEv`: `if (investment.source.kind === "customer_bulk") return null;` — same as `collection`-kind; no published EV concept for a custom bag.
- `recordSealedFlip`: extend the existing early-return that handles `collection` to also handle `customer_bulk`.
- `createInvestment`, `closeInvestment`: **no change**. `createInvestment` passes the source through and lets `recomputeExpectedOpenCardCount` resolve the count. `closeInvestment` is generic over kind via `sum(qty_opened)`.

### API (`app/api/investments/route.ts`)

`validateSource` gets a fourth branch:

```ts
if (kind === "customer_bulk") {
  if (typeof s.estimated_card_count !== "number"
    || !Number.isFinite(s.estimated_card_count)
    || s.estimated_card_count <= 0)
    return "source.estimated_card_count must be positive";
  if (s.acquired_at !== undefined && typeof s.acquired_at !== "string")
    return "source.acquired_at must be an ISO date string";
  return null;
}
```

Update the trailing error message to list `customer_bulk` as a valid kind.

### UI (`components/investments/CreateInvestmentModal.tsx`)

- Modal `maxWidth` → `max-w-2xl`.
- KindCard grid: `grid-cols-1 sm:grid-cols-3` (was `sm:grid-cols-2`).
- Third `KindCard`:
  - icon: `<Wallet size={22} />` (lucide; reads as "purchase / cash")
  - title: `"Customer bulk purchase"`
  - description: `"Heterogeneous bag of singles bought as a lot — tracked by total cost and an estimated card count."`
- New form branch when `kind === "customer_bulk"`:
  - **Estimated cards** (number, required, ≥ 1)
  - **Total cost (€)** (number, required, ≥ 0)
  - **Acquired** (date input, optional, defaults to today)
  - **Name** (optional, default `Customer bulk — ~{count} cards — {Month YYYY}`)
  - **Notes** (optional)
- `sourceValid` for this kind: `estimated_card_count > 0 && cost >= 0`.
- Reset on close: clear the new fields in the existing `useEffect`.

Reuses existing primitives only — no new components, no native `<select>`, all `var(--bg-card)` / `appraiser-field` tokens (per the project's "match existing app visual style" rule).

### UI (`components/investments/InvestmentsContent.tsx`)

`sourceLabel(src)` gets a fourth branch:

```ts
if (src.kind === "customer_bulk") {
  return `Customer bulk · ~${src.estimated_card_count.toLocaleString()} cards`;
}
```

### TypeScript fan-out

After widening the `InvestmentSource` union, `tsc --noEmit` will surface every consumer that doesn't handle the new variant. Likely sites:

- `components/investments/InvestmentDetail.tsx` — header / source summary render.
- Any `switch (src.kind)` or chained `if` block in the codebase that pattern-matches on source.
- The dashboard extension popup, if it inspects `source.kind` (read-only — the dual-auth `GET /api/investments` returns the new shape as plain JSON, no extension release coordination needed).

Each fix is typically a one-line label render.

## Out of scope

- `maybeGrowLot` / `consumeSale` / `reverseSale` — tag attribution is keyed on `investment.code`, not `source.kind`. The new kind picks up the existing flow with no edit.
- `computeTagAudit` — kind-agnostic.
- `computeListedValue` / break-even / blended P/L KPIs — already kind-agnostic at the investment level.
- Extension release — read-only consumer of `source`, no new fields it needs to render.

## Testing & verification

No automated test infra for investments today. Manual verification flow:

1. **Type-check:** `npx tsc --noEmit` passes after the union widens. Fix every exhaustiveness error before running.
2. **Create:** open `New Investment` → "Customer bulk purchase" → cost €100, estimated 1000, name blank → submit. Confirm the investment lands in the `listing` tab with source label `Customer bulk · ~1,000 cards` and KPIs `(cost €100, listed €0, realized €0, P/L −€100)`.
3. **Tag a listing:** in the extension popup, paste the investment's `MS-XXXX` into a CM listing's comment → run a stock sync → confirm a new lot appears for the `(cardmarket_id, foil, condition, language)` tuple with `qty_opened` matching the listing qty.
4. **Sell + cancel:** mark the listing as sold via CM → run order sync → `consumeSale` writes a `sale_log` row, increments `proceeds_eur`, decrements `qty_remaining`. Cancel the order → `reverseSale` undoes both.
5. **Sealed flip rejection:** the detail page's sealed-flip control should be suppressed exactly as the `collection`-kind suppresses it today (mirror whatever conditional gate `InvestmentDetail` / `SealedFlipsSection` already uses for `kind === "collection"`). The API path is already covered by extending the existing early-return in `recordSealedFlip`.
6. **Close:** with one open lot, click Close → status flips to `closed`, lot becomes `frozen_at`, `cost_basis_per_unit = cost / sum(qty_opened)`. Verify by hand.
7. **Close with zero lots:** new investment, close immediately → `cost_basis_per_unit` stays `null` (existing guard handles it). No NaN in the UI.
8. **Listing visibility:** counter, source label, table row hover, all render correctly across `InvestmentsContent` and `InvestmentDetail`.

DB sanity:

```js
db.dashboard_investments.findOne({ "source.kind": "customer_bulk" })
```

Should show the new source shape with `estimated_card_count` and (if entered) `acquired_at`.
