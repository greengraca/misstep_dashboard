# Investments Tab — Design

**Date:** 2026-04-21
**Status:** Approved for implementation planning
**Scope:** New dashboard tab to track investments in sealed MTG product (boxes or fixed-pool precons), attribute the resulting singles to the investment as they enter stock, and account for realized/unrealized return as the stock sells down. Extension gets a scoped baseline walk to capture pre-opening stock state.

---

## 1. Goals & Scope

Add an **Investments** tab that answers, for each purchase of sealed product:

1. How much did we pay?
2. Which singles (and sealed flips) have been generated from it?
3. What is currently sitting listed, and at what potential revenue?
4. How much has actually sold, net of fees?
5. Are we above or below break-even, and — once broken even — what is the profit?

**In scope (v1):** Random-pool boxes (Play/Collector/Jumpstart/Set boosters) and fixed-pool products (Commander precons, Planeswalker decks, etc.). Both can be partially flipped sealed.

**Out of scope (v1):**

- Retroactive investments for boxes already opened and sold before the extension's 2026-04-06 order-sync cutoff.
- Per-card cost-basis weighting by rarity or Scryfall price (flat allocation only).
- Boxes that span multiple Scryfall sets (rare; create separate investments).
- Sealed booster price scraping (separate open TODO in CLAUDE.md).
- Charts / time-series of investment value (no historical lot-state snapshots yet).
- CSV export.
- Multi-currency (EUR only).

## 2. Core Decisions

| Decision | Choice |
|---|---|
| Investment kinds | Both random-pool boxes and fixed-pool products, unified model |
| Sealed flips | Supported (tranches allowed, each flip reduces expected card budget) |
| Attribution mechanism | Pre-opening baseline snapshot via extension seed walk; live delta-vs-baseline during listing |
| Stock row tagging | No — lots are derived from tuple matching, stock rows stay untagged |
| Order item tagging | No — sale attribution runs through lot consumption, no tag on `order_items` |
| Lot key | `{investment_id, cardmarket_id, foil, condition}` |
| Lifecycle | `baseline_captured` → `listing` → `closed` (+ `archived` for soft delete); close is final, no reopen |
| Closing | Freezes lots (`frozen_at`) and writes `cost_basis_per_unit` on each; sales continue to deplete after close |
| Cross-investment disambiguation | FIFO by investment `created_at`, capped by `expected_open_card_count` |
| Cost basis allocation | Flat across attributed cards: `(cost_total - sealed_flip_proceeds) / sum(lot.qty_opened)` |
| Team scope | Shared — any team member can create/edit/close any investment |
| Order-cancellation correctness | Audit row per sale-to-lot attribution (`dashboard_investment_sale_log`) enables exact reversal |
| P/L display | Realized and blended (realized + unrealized) shown as separate KPIs |

## 3. Data Model

Four new MongoDB collections, all prefixed `dashboard_`.

### 3.1 `dashboard_investments`

One doc per investment.

```ts
interface Investment {
  _id: ObjectId;
  name: string;                             // "12× Foundations Jumpstart — April 2026"
  created_at: Date;
  created_by: string;                       // session.user.id
  status: "baseline_captured" | "listing" | "closed" | "archived";
  cost_total_eur: number;
  cost_notes?: string;

  source:
    | {
        kind: "box";
        set_code: string;                   // Scryfall set code, e.g. "fdn"
        booster_type: "play" | "collector" | "jumpstart" | "set";
        packs_per_box: number;              // 24 Jumpstart, 36 Play, 12 Collector, etc.
        cards_per_pack: number;             // 20 Jumpstart, 15 Play, etc.
        box_count: number;
      }
    | {
        kind: "product";
        product_slug: string;               // FK to dashboard_ev_products.slug
        unit_count: number;
      };

  cm_set_names: string[];                   // CM-side set name variants for fallback match
                                            // derived at baseline creation, editable

  sealed_flips: Array<{
    recorded_at: Date;
    unit_count: number;
    proceeds_eur: number;
    note?: string;
  }>;

  expected_open_card_count: number;         // derived; shrinks with sealed flips

  baseline_completed_at?: Date;             // set when status flips to "listing"
  closed_at?: Date;                         // set when status flips to "closed"
}
```

**Indexes:** `{status: 1, created_at: -1}`, `{"source.set_code": 1, status: 1}`.

**Derivation of `expected_open_card_count`:**

- `box`: `packs_per_box × cards_per_pack × (box_count − sealed_flipped_units)`
- `product`: `sum(EvProductCard.count) × (unit_count − sealed_flipped_units)`

Recomputed whenever a sealed flip is recorded.

### 3.2 `dashboard_investment_baseline`

One doc per `{investment, cardmarket_id, foil, condition}` captured by the seed walk. Frozen forever.

```ts
interface InvestmentBaseline {
  investment_id: ObjectId;
  cardmarket_id: number;
  foil: boolean;
  condition: string;
  qty_baseline: number;
  captured_at: Date;
}
```

**Unique index:** `{investment_id: 1, cardmarket_id: 1, foil: 1, condition: 1}`.

Baseline only records what is physically present at baseline time. Conditions that appear later (e.g. user had no LP copies; an LP comes in during opening) are implicitly `qty_baseline = 0`.

### 3.3 `dashboard_investment_lots`

The attribution ledger. Grows during `listing`, frozen at close.

```ts
interface InvestmentLot {
  _id: ObjectId;
  investment_id: ObjectId;
  cardmarket_id: number;
  foil: boolean;
  condition: string;
  qty_opened: number;                       // attributable cards (delta-vs-baseline)
  qty_sold: number;                         // decremented by sale consumption
  qty_remaining: number;                    // denormalized: qty_opened - qty_sold
  cost_basis_per_unit: number | null;       // null while listing (computed live); set at close
  proceeds_eur: number;                     // running sum of net sale proceeds
  last_grown_at: Date;
  frozen_at?: Date;                         // set when investment closes
}
```

**Indexes:**

- `{investment_id: 1, cardmarket_id: 1, foil: 1, condition: 1}` unique
- `{cardmarket_id: 1, foil: 1, condition: 1}` — non-unique, for FIFO sale-consumption lookup (then sort by investment.created_at in the aggregation)

### 3.4 `dashboard_investment_sale_log`

Audit row per sale-to-lot attribution. Enables exact reversal on order cancellation.

```ts
interface InvestmentSaleLog {
  _id: ObjectId;
  lot_id: ObjectId;
  investment_id: ObjectId;
  order_id: string;                         // cm_orders.orderId
  article_id?: string;                      // cm_order_items.articleId (if present)
  cardmarket_id: number;
  foil: boolean;
  condition: string;
  qty: number;                              // cards attributed in this row
  unit_price_eur: number;                   // price charged to buyer
  net_per_unit_eur: number;                 // after 5% + optional 1% trustee
  attributed_at: Date;
}
```

**Indexes:** `{order_id: 1}`, `{lot_id: 1, attributed_at: -1}`.

## 4. API Surface

All under `/app/api/investments/`, using `withAuth` / `withAuthRead` / `withAuthParams` from `lib/api-helpers.ts`. Mutation routes call `logActivity` for state transitions only (not per-lot-growth events).

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/investments` | List investments + aggregate KPIs. Query: `?status=`. |
| `POST` | `/api/investments` | Create. Body: `{name, cost_total_eur, source, cost_notes?}`. Status starts as `baseline_captured`. |
| `GET` | `/api/investments/[id]` | Full detail: investment + sealed flips + aggregate KPIs. |
| `PATCH` | `/api/investments/[id]` | Update `{name?, cost_total_eur?, cm_set_names?, cost_notes?}`. Not status, not source. |
| `DELETE` | `/api/investments/[id]` | Soft-delete → `status = "archived"`. Lots retained. |
| `POST` | `/api/investments/[id]/sealed-flip` | Body: `{unit_count, proceeds_eur, note?}`. Appends to `sealed_flips`, recomputes `expected_open_card_count`. |
| `POST` | `/api/investments/[id]/close` | Freezes lots, writes `cost_basis_per_unit`, transitions to `closed`. Final. |
| `GET` | `/api/investments/[id]/lots` | Lot ledger, paginated + filtered. |
| `PATCH` | `/api/investments/[id]/lots/[lot_id]` | Manual lot adjustment (`qty_opened`). Rarely used; for mis-attribution fixes. |
| `GET` | `/api/investments/[id]/baseline/targets` | Extension fetches list of target `cardmarket_id`s + `cm_set_names`. Used to configure the seed walk. |
| `POST` | `/api/investments/[id]/baseline` | Extension posts captured baseline batches: `{listings: [{cardmarket_id, foil, condition, qty}, ...]}`. Idempotent upsert. Uses extension auth (`withExtAuth`). |
| `POST` | `/api/investments/[id]/baseline/complete` | Transitions status from `baseline_captured` → `listing` and sets `baseline_completed_at`. Lot-growth only runs for investments whose status is `listing`. User-triggered or auto-triggered when extension reports 100% coverage. |

### 4.1 Existing-code hooks (not new endpoints)

Two hooks into existing sync logic. Both fire-and-forget via `after()` — never block sync response.

- **`maybeGrowLot(params)`** — called from `lib/cardmarket.ts#processStock` and `processProductStock` after a qty increase on a stock row. Runs the attribution algorithm (Section 5.1).
- **`consumeSale(params)`** and **`reverseSale(params)`** — called from `lib/cardmarket.ts#processOrders` when an order reaches paid (items leave stock) or cancels after paid (items return to stock).

All three live in a new `lib/investments.ts`.

### 4.2 Activity log entries

Logged via `logActivity(action, "investment", id, details, userId, userName)`:

- `create` — new investment created
- `update` — name / cost / notes edited
- `update` — baseline complete (same moment as status → `listing`)
- `update` — sealed flip recorded
- `update` — closed (status → `closed`)
- `delete` — archived

Not logged: individual lot growth events (high frequency, low value).

## 5. Lot Math

### 5.1 `maybeGrowLot({cardmarket_id, foil, condition, qty_delta, cm_set_name})`

Called after a stock row's qty increases.

```
1. Resolve the card via dashboard_ev_cards: look up by cardmarket_id.
     → get card.set_code (Scryfall).
   If cardmarket_id is missing on the stock row (pre-v1.7.1 data),
     attempt fallback lookup by {name, set (cm), foil}.
     If still missing, stop (unattributed).

2. Find candidate investments (status == "listing"):
     - For box-kind source: source.set_code == card.set_code
     - For product-kind source: card.cardmarket_id in EvProduct.cards[]
         (cross-referenced via dashboard_ev_products[slug].cards[*].scryfall_id
          mapped to cardmarket_id via dashboard_ev_cards)
     - Fallback: cm_set_name in investment.cm_set_names
   Sort candidates by created_at ASC (FIFO).

3. For each candidate:
     baseline_qty = dashboard_investment_baseline[{investment, card_id, foil, condition}].qty_baseline
                    (default 0)
     current_lot_opened = dashboard_investment_lots[same key].qty_opened (default 0)
     current_stock_qty = sum(dashboard_cm_stock.qty) for matching tuple
                        (same cardmarket_id, foil, condition; all members)
     attributable = current_stock_qty - baseline_qty - current_lot_opened
     if attributable <= 0: continue

     expected_budget_remaining = investment.expected_open_card_count
                                - sum(this investment's lots.qty_opened)
     if expected_budget_remaining <= 0: continue

     grow_by = min(qty_delta, attributable, expected_budget_remaining)
     upsert lot:
       qty_opened += grow_by
       qty_remaining = qty_opened - qty_sold
       last_grown_at = now
     qty_delta -= grow_by

     if qty_delta == 0: break

4. Any residual qty_delta is unattributed (normal).
```

### 5.2 `consumeSale({cardmarket_id, foil, condition, qty_sold, unit_price_eur, trustee, order_id, article_id?})`

Called when items leave stock on order paid/sent/arrived.

```
1. Fetch lots with matching (cardmarket_id, foil, condition) and qty_remaining > 0.
   Include lots where investment.status in ("listing", "closed").
   Sort by investment.created_at ASC (FIFO).

2. fee_rate = 0.05 + (trustee ? 0.01 : 0)
   net_per_unit = unit_price_eur * (1 - fee_rate)

3. remaining_to_attribute = qty_sold
   For each lot:
     take = min(lot.qty_remaining, remaining_to_attribute)
     lot.qty_sold += take
     lot.qty_remaining -= take
     lot.proceeds_eur += take * net_per_unit
     insert into dashboard_investment_sale_log:
       {lot_id, investment_id, order_id, article_id, cardmarket_id, foil, condition,
        qty: take, unit_price_eur, net_per_unit_eur: net_per_unit, attributed_at: now}
     remaining_to_attribute -= take
     if remaining_to_attribute == 0: break

4. Any leftover is silently unattributed.
```

### 5.3 `reverseSale({order_id})`

Called when a paid order cancels.

```
1. Fetch sale-log rows where order_id == target.
2. For each row:
     lot = dashboard_investment_lots[lot_id]
     reverse_qty = min(row.qty, lot.qty_sold)
     lot.qty_sold -= reverse_qty
     lot.qty_remaining += reverse_qty
     lot.proceeds_eur -= reverse_qty * row.net_per_unit_eur
3. Delete sale-log rows for this order.
```

Exact reversal because we captured `qty` and `net_per_unit` at the time of sale.

### 5.4 Cost basis

**During `listing`** (displayed, not stored):

```
cost_basis_per_unit = (cost_total_eur - sum(sealed_flips.proceeds_eur))
                      / sum(all lots.qty_opened)
```

If denominator is 0, display "—".

**At `close`** (stored per lot):

```
total_opened = sum(all lots.qty_opened)
frozen_per_unit = (cost_total_eur - sum(sealed_flips.proceeds_eur)) / total_opened
For each lot:
  lot.cost_basis_per_unit = frozen_per_unit
  lot.frozen_at = now
investment.status = "closed"
investment.closed_at = now
```

The "closing snapshot" is the set of lots as of `closed_at` — there is no separate snapshot document; the lot rows themselves *are* the snapshot, with `frozen_at` as the mark.

Late sealed flips (recorded after close) do **not** re-weight closed lots. They still reduce outstanding cost and are visible on the detail page, but closed lots keep their frozen `cost_basis_per_unit`.

## 6. Extension Changes

Ext version bump: `1.7.2` → `1.8.0` (minor, new feature). Mirror `LATEST_EXT_VERSION` in `lib/constants.ts`. Coordinated release with dashboard deploy (dashboard endpoints must exist before ext ships).

### 6.1 New popup mode: "Capture investment baseline"

The popup lists investments with `status = "baseline_captured"` (fetched via `GET /api/investments?status=baseline_captured`). User selects one and enters baseline mode. Popup displays:

- Investment name, set code, CM set names
- Expected card count (informational)
- Coverage target (from `GET /api/investments/[id]/baseline/targets`)
- Progress: "Captured X / Y target cards"
- "Mark complete" button (manual override if walk is <100%)

### 6.2 Scoped walk on Cardmarket

Reuses the existing `content/extractors/product-stock.js` on `/Products/Singles/{SET}/{CARD}` pages:

- If baseline mode is active AND page's `productId` is in target list:
  - Emit payload type `"investment_baseline"`: `{investment_id, productId, listings: [{cardmarket_id: productId, foil, condition, qty}, ...]}`.
  - **Critical:** emit even if `listings` is empty — a 0-stock visit is meaningful (records baseline = 0 for all conditions on that page the user currently has no listings in, by implication; see 6.3).
- Background worker batches and POSTs to `/api/investments/[id]/baseline` using existing `withExtAuth` token.
- Bloom filter (already in use for seed mode) marks `productId` as captured on success.

### 6.3 Zero-stock is baseline = 0 by implication

The scraper only emits rows for listings physically present. For a visited product page where the user has *no* LP foil listings, no baseline row is written for `{productId, foil:true, condition:"LP"}`. The dashboard treats missing baselines as `qty_baseline = 0` in `maybeGrowLot`. The baseline collection therefore records zero-stock conditions *implicitly* rather than explicitly.

### 6.4 Seed-mode auto-advance

The walk is user-driven with auto-advance (from the existing seed-mode overlay). Extension does not headlessly crawl CM. Progress persists in `chrome.storage.local` across sessions.

### 6.5 Completion signal

When the bloom filter reports 100% coverage, extension POSTs `/api/investments/[id]/baseline/complete`. User can also press "Mark complete" at any time (for investments where some target cards can't be found on CM).

### 6.6 Release flow

Per `misstep-ext/CLAUDE.md`:

1. Bump `manifest.json` to `1.8.0`.
2. Mirror `LATEST_EXT_VERSION = "1.8.0"` in dashboard `lib/constants.ts`.
3. `npm run pack` in ext repo → `dist/misstep-ext.zip`.
4. `gh release create v1.8.0 dist/misstep-ext.zip --title "v1.8.0"`.
5. Deploy dashboard + ext together (the new endpoints must exist before the ext's baseline-mode ships).

### 6.7 Not changing

- Existing stock / order / card-price sync — untouched. Lot growth + sale consumption run on the dashboard side in `lib/investments.ts`, triggered by existing sync hooks in `lib/cardmarket.ts`.
- Auth — same SHA-256 Bearer token + `X-Member-Name` header via `withExtAuth`.

## 7. UI

Follows existing conventions: thin `page.tsx` wrapper → client component with SWR + URL-state filters. Matches stock / cardmarket page shape.

### 7.1 Sidebar

`components/dashboard/sidebar.tsx`: new entry in **MANAGEMENT** section, positioned under Cardmarket.

```
MANAGEMENT
  Finance
  Cardmarket
  Investments      ← new, icon: TrendingUp (lucide)
  Storage
```

### 7.2 List page — `/investments`

**Top stat cards:**

| Card | Formula |
|---|---|
| Total deployed | `sum(cost_total_eur)` across non-archived |
| Net realized | `sum(lots.proceeds_eur) + sum(sealed_flips.proceeds_eur) - sum(cost_total_eur)` across non-archived |

**Tabbed table** (Active / Closed / Archived):

| Column | Source |
|---|---|
| Status pill | color-coded by status |
| Name | `investment.name` |
| Source | human summary — "12× Foundations Jumpstart (box)" / "3× Commander Precon XYZ (product)" |
| Cost | `cost_total_eur` |
| Listed value | `sum(stock.price × stock.qty)` across stock rows matching open lots |
| Realized | `sum(lot.proceeds_eur) + sum(sealed_flips.proceeds_eur)` |
| Break-even | progress bar — `realized / cost`; overflow shows profit |
| Created | relative date |

Row click → detail page. Top-right: **"+ New Investment"** button.

### 7.3 Create modal

Two-step:

1. **Source** — radio: Random-pool box vs Fixed-pool product.
   - Box: set-code combobox (from `dashboard_ev_sets`), booster-type select (defaults `packs_per_box` and `cards_per_pack`), `box_count`.
   - Product: product-slug combobox (from `dashboard_ev_products`), `unit_count`.
2. **Details** — name (prefilled with a sensible default), `cost_total_eur`, optional `cost_notes`.

On submit → `POST /api/investments`. Route to detail page with a banner: "Baseline not yet captured. Open the extension to start the baseline walk."

### 7.4 Detail page — `/investments/[id]`

**Header strip:** status pill · name · "Edit" / "Close" / "Archive" menu · back link.

**Baseline banner** (only while `status == "baseline_captured"`):
- Progress bar (captured / target), hint to open extension.

**KPI row** (six cards):

| KPI | Formula |
|---|---|
| Cost | `cost_total_eur` |
| Expected EV | box-kind: `packs_per_box × box_count × latestPlayEvBySet(set_code)`; product-kind: `calculateProductEv(product, cards) × unit_count`. Net of fees. |
| Currently listed | `sum(stock.price × stock.qty)` for tuples matching open lots with `qty_remaining > 0` |
| Realized net | `sum(lot.proceeds_eur) + sum(sealed_flips.proceeds_eur)` |
| Net P/L (blended) | `realized + currently_listed - cost_total_eur` (includes unrealized) |
| Break-even | progress bar: `realized / cost`; shows profit overflow once ≥100% |

**Sealed flips section** — small table of flips (date / units / proceeds / note) + "+ Record sealed flip" button → modal.

**Lot ledger** — main data table:

| Column | Source |
|---|---|
| Card | name (links to `ev_cards.purchase_uris.cardmarket`) · set icon · `<FoilStar />` if foil · condition badge |
| Opened | `qty_opened` |
| Sold | `qty_sold` |
| Remaining | `qty_remaining` |
| Cost basis / unit | live during listing, frozen at close |
| Live price | `cm_prices[foil?].trend` from `ev_cards` |
| Remaining value | `qty_remaining × live_price` |
| Net proceeds | `lot.proceeds_eur` |

URL-state filters: search by name, foil toggle, min-remaining. Matches stock page conventions.

### 7.5 Close confirmation

"Close" menu item → modal summarizing: cost basis per card, total cards opened, note that sales continue to deplete after close and the action cannot be undone. Confirm → `POST /api/investments/[id]/close`.

## 8. Edge Cases & Constraints

### 8.1 CM set-name normalization (existing open TODO)

Stock rows carry CM set names (e.g. `"Foundations: Jumpstart"`); `ev_cards` carry Scryfall `set_code`. v1 matches on `cardmarket_id` (= `stock.productId` on v1.7.1+ rows), looked up in `ev_cards`. `cm_set_names[]` on the investment is a fallback for pre-1.7.1 rows missing `productId`. Investments inherit the existing stock-trend coverage pattern; doesn't block the normalization TODO.

### 8.2 Stock without `productId` / `cardmarket_id`

`maybeGrowLot` falls back to `{name, cm_set_name, foil, condition}` against `cm_set_names[]` and `ev_cards.name`. If still unresolved, delta is unattributed. Matches the ~72% coverage of existing stock-trend join for old rows.

### 8.3 Stock grew for non-opening reasons

If a user buys singles (or another member sources stock) that matches an active investment's pool, those deltas will be incorrectly attributed. Guards:

- `expected_open_card_count` cap bounds misattribution per investment.
- Manual lot adjustment (`PATCH /api/investments/[id]/lots/[lot_id]`) from the detail page.
- Closing the investment stops auto-growth.

Documented as "lots are a soft attribution, not a hard tag."

### 8.4 Foil ≠ nonfoil

Separate baselines and lots. Already keyed by `foil` field.

### 8.5 Overlapping same-set investments

Handled by FIFO-by-`created_at` with `expected_open_card_count` cap. Once investment A fills its budget, overflow rolls to investment B.

### 8.6 Baseline walk interruption

Bloom filter persists in `chrome.storage.local`. Backend upsert is idempotent. No timeout on `baseline_captured` status.

### 8.7 Product-kind shared cards

Two product investments both including Sol Ring: FIFO still works. Budget for product-kind is `sum(EvProductCard.count) × unit_count`, so once investment A's Sol Ring budget is met, investment B gets the next Sol Ring delta.

### 8.8 Activity log volume

`maybeGrowLot` does not write to `dashboard_activity_log`. Only investment-level state transitions do (create, update, baseline complete, sealed flip, close, archive). Per-sale attribution goes to `dashboard_investment_sale_log` instead.

### 8.9 Indexes (startup)

| Collection | Index |
|---|---|
| `dashboard_investments` | `{status: 1, created_at: -1}`, `{"source.set_code": 1, status: 1}` |
| `dashboard_investment_baseline` | `{investment_id: 1, cardmarket_id: 1, foil: 1, condition: 1}` unique |
| `dashboard_investment_lots` | `{investment_id: 1, cardmarket_id: 1, foil: 1, condition: 1}` unique; `{cardmarket_id: 1, foil: 1, condition: 1}` |
| `dashboard_investment_sale_log` | `{order_id: 1}`, `{lot_id: 1, attributed_at: -1}` |

### 8.10 Not covered (deferred)

- Retroactive investments (pre-2026-04-06 orders).
- Weighted cost-basis allocation by rarity / Scryfall price.
- Boxes spanning multiple Scryfall sets.
- Live sealed-product price scraping.
- Historical lot-state snapshots for charting.
- Reopen after close.
- Multi-currency.

## 9. Implementation Order (suggested)

1. **Types + collections + indexes** — add schema to `lib/types.ts`, create collection constants, index setup in `lib/investments.ts`.
2. **Lot math module** — `lib/investments.ts` with `maybeGrowLot`, `consumeSale`, `reverseSale`, cost-basis helpers, tested in isolation.
3. **Dashboard API routes** — CRUD, sealed-flip, close, lot-ledger. List + detail GETs.
4. **Sync hooks** — wire `maybeGrowLot` into `processStock` / `processProductStock`; wire `consumeSale` / `reverseSale` into `processOrders` stock-mutation path. Fire-and-forget via `after()`.
5. **Baseline endpoints** — `/baseline/targets`, `/baseline`, `/baseline/complete`.
6. **UI** — list page, create modal, detail page with KPIs, sealed-flip modal, close modal, lot ledger table.
7. **Sidebar entry.**
8. **Extension v1.8.0** — baseline mode in popup, baseline branch in product-stock extractor, release coordination.
9. **Activity log integration** at state transitions.
