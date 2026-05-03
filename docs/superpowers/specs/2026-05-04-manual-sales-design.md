# Manual sales — design

**Date:** 2026-05-04
**Topic:** Record sales that happened outside Cardmarket (cash, in-person trades, LGS) against an investment, decrementing or growing lots correctly depending on whether the sold copy was previously on CM with the MS-XXXX tag.

## Problem

Today every entry in `dashboard_investment_sale_log` is born from a Cardmarket order: `processOrders` or `processOrderDetail` calls `consumeSale` after a paid-status transition. There is no way to record a sale that happened in person.

Real workflow gap: João sells cards from active investments outside Cardmarket — at LGS Saturdays, in trades, friends grabbing one off him. Two cards from the J25 jumpstart investment have already been sold this way and there's no way to reflect them in the lot ledger. Today's only option is to fake a CM sale, which is wrong-shape (creates orphan order rows, requires fake article IDs, breaks the cancellation invariants).

The math also splits on a subtle question: was the sold copy previously *listed on CM with the tag* (so the lot already counts it in `qty_opened`), or was it never listed at all (so the lot doesn't know it exists yet)? The two cases have different ledger deltas:

| Case | Before | Sale | After |
|---|---|---|---|
| Sold from CM stock (was listed) | Opened 3 · Sold 0 · Remaining 3 | qty 1, €5 | Opened 3 · Sold 1 · Remaining 2 |
| Sold off-the-books (never listed) | Opened 3 · Sold 0 · Remaining 3 | qty 1, €5 | Opened 4 · Sold 1 · Remaining 3 |

A single "Record manual sale" affordance that asks both questions — **which card** and **what disposition** — covers both flows.

## What changes for the user

The investment detail page grows a **"Record manual sale"** button in the actions area (next to the existing Actions menu). Clicking opens the modal described below.

A new **"Sales"** panel sits below the lot ledger, listing every sale (CM-attributed and manual) sorted by date desc, with a delete affordance on manual rows.

### Modal — *Record a sale outside Cardmarket*

**Step 1 — Card sold (typeahead)**

Single typeahead populated from the investment's set catalogue (`dashboard_ev_cards` filtered by `cm_set_names`, falling back to `dashboard_cm_stock` for cards with the same set string for ones Scryfall mismapped). Each result line:

- `<card name> · <rarity>` (e.g. `Mikaeus, the Lunarch · uncommon`)
- If a lot exists for that card name in this investment, append a small badge: `Tracked: 3 remaining` (sums across all tuples of that name).

For investments where the set picker doesn't apply (`collection`, `customer_bulk`), the typeahead falls back to existing lots only. For `box` and `product` it allows any card from the parent set even if no lot exists yet.

Picking a card does not lock condition/foil/language. Auto-fill behaviour:
- If exactly one lot exists for that card name, prefill cond/foil/lang from it (most common case).
- Otherwise default to NM / non-foil / English.

**Step 2 — The sale**

- *Quantity* — number, default 1, min 1.
- *Sale price per unit* — gross EUR (the actual cash received per card; no Cardmarket fee subtracted because none applies on a hand sale).
- *Sale date* — defaults to today, allows backdating so already-completed sales can be entered.
- *Note* — optional free text (buyer name, "FNM trade-in", etc.).

**Step 3 — Disposition (radio with explainer copy)**

> ◉ **I'm pulling this card out of my Cardmarket stock**
> *I had this card listed on CM and I'm taking it down because it sold in person. It already shows up in this investment's "Remaining" count. Recording this sale will subtract {qty} from Remaining and add {qty} to Sold.*

> ○ **I sold it without ever listing it on Cardmarket**
> *This copy was opened from the box and sold without ever being listed on CM. The lot ledger doesn't know about it yet, so recording this sale will add {qty} to Opened (so the cost basis sees it) and {qty} to Sold. Remaining stays the same.*

`{qty}` updates live with the quantity input. Default is "I'm pulling this card out of my Cardmarket stock" because for cards that *do* exist in the ledger, this is overwhelmingly the right answer.

**Live-preview footer**

A one-line summary updates as the user fills the form, showing the exact ledger delta:

> *After saving: lot will show **Opened 4 · Sold 1 · Remaining 3** (was Opened 3 · Sold 0 · Remaining 3)*

When no lot exists yet (off-the-books mode for a card never tracked), the footer reads:
> *After saving: a new lot will be created — **Opened {qty} · Sold {qty} · Remaining 0**.*

### "Sales" panel on investment detail

New section below the lot ledger. Columns: Card · Cond · Foil · Lang · Qty · Unit € · Net € · Date · Source.

- *Source* renders as a linked CM order ID (e.g. `#1273057131`) for CM sales, or a "Manual" pill with the note as a tooltip for manual sales.
- Manual rows include a small `×` button. Clicking it opens a confirmation, then runs the inverse operation server-side (see below).
- Default sort: date desc.
- Pagination: same shared `Pagination` component, default page size 25.

## Behavior matrix

How manual sales sit alongside the existing CM-driven attribution paths:

| Behavior | CM sale (`consumeSale`) | Manual sale "was listed" | Manual sale "off-the-books" |
|---|---|---|---|
| Lot lookup | by `(investment, cm_id, foil, cond, lang)` | same | same; **creates lot if absent** |
| Decrement `qty_remaining` | yes (`-qty`) | yes (`-qty`) | no |
| Increment `qty_sold` | yes (`+qty`) | yes (`+qty`) | yes (`+qty`) |
| Increment `qty_opened` | no | no | **yes (`+qty`)** |
| Refuses if `qty_remaining < qty` | yes (drops excess silently) | yes (returns 422) | n/a |
| Refuses on collection-kind | no (existing lots only) | no (decrements existing lot) | **yes** (`cannot-grow-collection-kind`) |
| Refuses on closed/archived investment | no (CM sale of frozen lot is a domain bug) | yes (`frozen`) | yes (`frozen`) |
| Net per unit | `unit × (1 − 0.05 − 0.01·trustee)` | `unit` (no fee) | `unit` (no fee) |
| `order_id` in sale_log | CM order ID (numeric string) | `manual:<short>` | `manual:<short>` |
| `note` field | absent | optional user input | optional user input |
| Reversible | via `reverseSale` on cancellation | via DELETE endpoint | via DELETE endpoint (also reverses Opened grow; Remaining untouched) |

## Architecture

Pure additive change. One new field on `InvestmentSaleLog`, two new API endpoints, one new service helper, one new modal, one new panel.

### Schema (additive)

`InvestmentSaleLog` (`lib/investments/types.ts`) gains optional fields:

```ts
export interface InvestmentSaleLog {
  // ...existing fields...
  /** Free-text note. Set by manual-sale flow only; absent on CM sales. */
  note?: string;
  /** Manual-sale flag. When true, the sale was recorded by the user via
   *  the manual-sale modal rather than from a CM order sync. Used by the
   *  Sales panel to render a "Manual" pill instead of an order link, and
   *  by the DELETE endpoint to gate which rows are user-deletable. */
  manual?: boolean;
  /** When true, the sale grew the lot AND consumed it (off-the-books).
   *  The DELETE handler reverses the grow on top of the standard reverse.
   *  Only meaningful when `manual: true`. */
  grew_lot?: boolean;
}
```

No migration. Existing docs remain valid (every new field is optional).

The `order_id` discriminator — `"manual:<id>"` prefix — is independently sufficient to identify manual rows (the `manual: true` flag is convenience). The 8-char hex id is generated client-side via `crypto.randomBytes(4)` to keep DELETE URLs URL-safe and short.

### Service (`lib/investments/manual-sales.ts`)

New module, two exported functions:

```ts
export async function recordManualSale(params: {
  investmentId: string;
  cardmarketId: number;
  foil: boolean;
  condition: string;
  language: string;
  qty: number;
  unitPriceEur: number;
  wasListed: boolean;        // false = off-the-books (grow + consume)
  date: Date;
  note?: string;
}): Promise<RecordManualSaleResult>;

export async function deleteManualSale(params: {
  investmentId: string;
  saleLogId: string;
}): Promise<DeleteManualSaleResult>;

export type RecordManualSaleResult =
  | { status: "ok"; sale_log_id: string; lot_id: string }
  | { status: "no-investment" }
  | { status: "frozen" }                          // closed/archived investment
  | { status: "cannot-grow-collection-kind" }     // off-the-books refused on collection-kind
  | { status: "insufficient-remaining"; have: number; want: number };

export type DeleteManualSaleResult =
  | { status: "ok" }
  | { status: "not-found" }
  | { status: "not-manual" }              // refuses to delete CM sales
  | { status: "frozen" };
```

`recordManualSale`. The two modes use distinct Mongo updates (cleaner than a unified one), but both follow the existing `consumeSale` pattern of writing the audit log row before the lot mutation so a crash leaves a "log without lot delta" state (detectable) rather than the worse "lot drained without log".

1. Resolve investment by id; bail if missing or `status !== "listing"` (refuse to mutate closed/archived investments — closed investments have `frozen_at` on every lot via `closeInvestment` and the cost-basis arithmetic would silently break).
2. If `wasListed=false` AND `investment.source.kind === "collection"`: refuse with `cannot-grow-collection-kind`. Collection-kind lots are pre-set at conversion and explicitly do not grow (mirrors `maybeGrowLot`'s rule).
3. Insert sale_log row: `{ ..., order_id: "manual:<id>", net_per_unit_eur: unitPriceEur, manual: true, grew_lot: !wasListed, note, attributed_at: date }`.

   For "was listed" (`wasListed=true`):
   - Look up the existing lot by tuple. If absent or `qty_remaining < qty`, delete the sale_log row and return `insufficient-remaining`.
   - Guarded `$inc` on the lot: `{ qty_sold: +qty, qty_remaining: -qty, proceeds_eur: +qty * unitPriceEur }` with filter `{ qty_remaining: { $gte: qty } }`. If the update returns null (race), delete the sale_log row.

   For "off-the-books" (`wasListed=false`):
   - Upsert the lot in one operation: `{ $inc: { qty_opened: qty, qty_sold: qty, proceeds_eur: qty * unitPriceEur }, $setOnInsert: { investment_id, cardmarket_id, foil, condition, language, qty_remaining: 0, cost_basis_per_unit: null, last_grown_at: now } }`. **Note: `qty_remaining` is NOT in the `$inc` — the card never sat in stock, so the remaining count must not change.** On a new insert, `$setOnInsert` initializes it to 0. On an existing lot, it stays at whatever it was. No guard needed (this can't fail under normal conditions; we're growing, not consuming).

The off-the-books path edge case: if the lot already exists with `qty_opened=3, qty_sold=0, qty_remaining=3` and the user records an off-the-books sale of 1, the result is `qty_opened=4, qty_sold=1, qty_remaining=3` — exactly the "you opened 4 but only listed 3, then sold the 4th in person" semantics from the design.

`deleteManualSale`:

1. Find sale_log row by id; bail if not found (`not-found`), not `manual:true` (`not-manual`), or investment status is not `listing` (`frozen`).
2. Reverse the lot mutation. The two modes have different reversals:

   For `grew_lot: false` (was-listed path): `$inc: { qty_sold: -qty, qty_remaining: +qty, proceeds_eur: -qty * net_per_unit_eur }`.

   For `grew_lot: true` (off-the-books path): `$inc: { qty_opened: -qty, qty_sold: -qty, proceeds_eur: -qty * net_per_unit_eur }`. **`qty_remaining` is NOT touched** — recording the sale didn't change it, so reversing the sale doesn't change it either.
3. Delete the sale_log row.

Empty-lot housekeeping: a delete that brings a lot to `qty_opened=0, qty_sold=0, qty_remaining=0` (only happens when an off-the-books sale created the lot and then the same sale is deleted) leaves the lot in place. Lots aren't garbage-collected anywhere else in the system; staying consistent. The next CM scrape with the same tuple will reuse it via `maybeGrowLot`.

### API

Two new routes, both session-only (mutation; no extension Bearer access — manual sales are a dashboard-only flow):

- `POST /api/investments/[id]/manual-sale` — body `{ cardmarketId, foil, condition, language, qty, unitPriceEur, wasListed, date, note? }`. Returns the new sale_log row + lot snapshot. 422 on `insufficient-remaining` or `cannot-grow-collection-kind`. 403 on `frozen`.
- `DELETE /api/investments/[id]/sale-log/[saleLogId]` — manual rows only. 404 on not-found, 403 on `not-manual` or `frozen`.
- `GET /api/investments/[id]/sellable-cards?q=` — typeahead source for the modal. Returns `{ rows: [{ cardmarket_id, name, set_name, rarity, lot_remaining: number | null }] }`. The card pool depends on the investment kind:
  - `box` / `product` / `customer_bulk`: every card from the parent set(s) (`cm_set_names` join into `dashboard_ev_cards`, fallback to `dashboard_cm_stock` for cards Scryfall mismapped). `lot_remaining` is the sum across all tuples of that card name within this investment, or null if no lot exists.
  - `collection`: existing lots only (collection-kind doesn't grow). Each lot becomes one row.

  `q` filters by `name` (case-insensitive substring). Capped at 50 results.

Listing existing sales reuses the existing `dashboard_investment_sale_log` collection. New endpoint:

- `GET /api/investments/[id]/sale-log?page=&pageSize=` — returns `{ rows, total, page, pageSize }`. Each row joins through `dashboard_ev_cards` (and `dashboard_cm_stock` fallback, same as the lot ledger) for card name / set name. The `manual` flag drives the UI distinction.

### UI

Three new components under `components/investments/`:

- `ManualSaleModal.tsx` — the form described above. Uses the shared `Modal` and `Select` primitives.
- `ManualSaleCardPicker.tsx` — typeahead. Fetches `/api/investments/[id]/sellable-cards` (new GET that returns the relevant card pool — set catalogue for box/product, existing-lot list for collection). Shows the "Tracked: N remaining" badge inline.
- `InvestmentSalesPanel.tsx` — the new "Sales" panel. Mirrors `InvestmentLotsTable`'s structure (Panel + table + mobile cards + shared `Pagination`).

`InvestmentDetail.tsx` wires the modal trigger and renders the new panel below `InvestmentLotsTable`.

After a successful save or delete, SWR mutators revalidate:
- `/api/investments/[id]` (KPI tiles)
- `/api/investments/[id]/lots?…` (lot ledger)
- `/api/investments/[id]/sale-log?…` (sales panel)
- `/api/investments/[id]/sales-history` (chart + timeline)

### Data flow

```
ManualSaleModal save
  → POST /api/investments/[id]/manual-sale
  → recordManualSale (lib/investments/manual-sales.ts)
    → grow lot (if !wasListed)         # $inc qty_opened, qty_sold (no qty_remaining)
    → insert sale_log                   # crash-window-safe ordering
    → guarded $inc lot                  # consume: qty_sold, qty_remaining, proceeds_eur
  → SWR revalidates (kpis, lots, sale_log, sales_history)
```

```
Sales panel × button
  → DELETE /api/investments/[id]/sale-log/[saleLogId]
  → deleteManualSale
    → reverse $inc lot                  # +qty_remaining, -qty_sold, -proceeds
    → if grew_lot: -qty_opened
    → delete sale_log row
  → SWR revalidates
```

## Testing

Unit (vitest, in `lib/__tests__/`):

- `manual-sales.test.ts` covers:
  - "was listed" decrements an existing lot correctly (Opened unchanged, Sold +qty, Remaining −qty, proceeds + qty·price)
  - "was listed" returns `insufficient-remaining` when `qty_remaining < qty` and DOES NOT write the sale_log row (rollback verified by counting log rows)
  - "was listed" against a missing lot returns `insufficient-remaining`
  - "off-the-books" against a missing lot creates the lot with `Opened=qty, Sold=qty, Remaining=0`
  - "off-the-books" against an existing lot grows Opened and Sold without touching Remaining
  - "off-the-books" returns `cannot-grow-collection-kind` for a `collection`-kind investment
  - "was listed" succeeds for a `collection`-kind investment with an existing lot (decrement only)
  - delete reverses a "was listed" sale exactly to the pre-sale lot state
  - delete reverses an "off-the-books" sale including the Opened grow; Remaining stays untouched
  - delete refuses to remove a CM sale (`not-manual`)
  - delete refuses on a closed/archived investment (`frozen`)
  - record refuses on a closed/archived investment (`frozen`)
  - sale_log row carries `manual:true`, `grew_lot` matching the mode, the user's note, and an `order_id` matching `/^manual:[0-9a-f]{8}$/`

API integration (manual smoke):

- POST and DELETE round-trip via curl, verifying the lot snapshot in the response matches the new state.
- 422 / 403 responses come back with the expected codes.

## Out of scope (deferred)

- **Edit a manual sale.** Today only delete + re-create. Edit would need to reverse-then-apply atomically; not needed for the immediate use case.
- **Bulk record.** No "I sold 5 different cards in one trade" multi-row flow. Each card is its own sale.
- **Buyer / counterparty as a structured field.** The free-text note covers this. A real counterparty model belongs to a future Customers feature, not Investments.
- **Affecting realized-net / break-even KPIs immediately on save.** Already handled — those KPIs read from `dashboard_investment_sale_log` and lot proceeds, both of which the manual sale mutates. No separate hook needed.
- **Per-row "sell from this lot" shortcut on the lot ledger.** Considered; deferred to keep the ledger row footprint clean. Easy to add later by reusing the same modal with the tuple pre-filled.
