# Finance + Cardmarket UI/UX redesign — Tier 3

**Date:** 2026-05-02
**Branch:** `ui/redesign-finance-cardmarket`
**Goal:** Bring the Finance and Cardmarket pages up to the visual quality of the existing reference surfaces (Storage Setup page, Create Investment modal, EV set cards). Same data, better presentation. Card-rhythm, icons, breathing room, no broken accents.

## Reference surfaces (the visual contract)

The dashboard already has three surfaces that define the language. Every change in this spec must read as a sibling of these three.

- **Storage Setup** (`components/system/StorageSetupContent.tsx`) — defines `Panel`, `H1`, `H2` (with leading accent icon), `H3`, `Note`, `CheckItem`. Every section is a glass `Panel`. Headings carry icons.
- **Create Investment Modal** (`components/investments/CreateInvestmentModal.tsx`) — defines `Field` (10px mono uppercase muted label + child + hint), `KindCard` (icon + title + 1-line description, accent-tinted when active), `appraiser-field` input class, accent CTA button.
- **EV Set Card** (`components/ev/EvSetCard.tsx`) — defines the canonical card surface: `var(--surface-gradient)` + `var(--surface-blur)` + `var(--surface-border)` + `var(--surface-shadow)` + `rounded-xl` + `hover:-translate-y-0.5` lift. Status pills as `rounded-full` tinted chips with mono numerals.

## Out of scope

- Other pages (home, ev, stock, storage, investments, appraiser, meetings, tasks, activity, settings). Those are a Tier-2 branch.
- Sales Economics panel — just shipped, do not touch.
- Mobile-first rework — current responsiveness is sufficient.
- Auth, permissions, data shapes, API routes.

## Bugs swept in the same pass

These ride along because the redesign touches their containers anyway.

- `var(--bg-primary)` referenced 2× in `CardmarketContent.tsx` (active direction toggle text, "Print All Envelopes" text). Token does not exist — text resolves to browser default. Replace with `var(--accent-text)`.
- Finance "Add" button has amber background (`rgba(251,191,36,…)`) and cyan text (`var(--accent)`). Looks broken. Replace with the same accent CTA the Create Investment modal uses.
- Finance form: native `confirm()` for delete. CLAUDE.md forbids — use `ConfirmModal` from `components/dashboard/confirm-modal.tsx`.
- Cardmarket order items: `FOIL` rendered as text. CLAUDE.md says use `<FoilStar />` from `components/dashboard/cm-sprite.tsx`.
- Cardmarket "printed" master checkbox uses hand-rolled `#eab308`. Replace with `var(--warning)`.
- Finance: redundant `var(--error, #ef4444)` fallbacks. Token always resolves; drop the fallback.
- Cardmarket: `text-warning` and unused color escapes (`var(--warning, #f59e0b)`). Same — drop fallback.

## New shared primitives

Lifted out of the existing reference files into `components/dashboard/`. No visual change for existing callers.

| Primitive | File | Source |
|---|---|---|
| `Panel`, `H1`, `H2`, `H3`, `Note` | `components/dashboard/page-shell.tsx` | StorageSetupContent inline definitions |
| `Field` | `components/dashboard/page-shell.tsx` | CreateInvestmentModal inline definition |
| `KindCard` | `components/dashboard/kind-card.tsx` | CreateInvestmentModal inline definition |
| `StatusPill` | `components/dashboard/status-pill.tsx` | New — `rounded-full` tinted chip with 6 tones (info / accent / success / warning / danger / muted) |
| `MetricRow` | `components/dashboard/metric-row.tsx` | New — small variant of `StatCard` for inline rows of 4–6 numeric stats (label above, mono value below, color-coded). Used by the Cardmarket Revenue panel. |
| `Pagination` | `components/dashboard/pagination.tsx` | New — Prev / page-of / Next, used by orders table and any future paginated table |

`H1` accepts an optional `subtitle` prop (renders muted under the title). `H2` accepts an optional `icon` prop (rendered in accent color, 16px). `Panel` accepts optional `accent` (3px left border) and `inset` (tighter padding for nested panels).

## Finance redesign

```
┌─ H1 "Finance" + subtitle "Income, expenses, reimbursements" ───────────┐
│                                            [MonthPicker] [+ Add]       │
├────────────────────────────────────────────────────────────────────────┤
│  StatCard × 6  (Income, Expenses, Withdrawals, Shipping Profit,        │
│                 Treasury, Net Balance)                                  │
├────────────────────────────────────────────────────────────────────────┤
│  Panel: H2 [icon] "Cardmarket Revenue"  · 23 orders                    │
│    MetricRow × 5  (Total Sales, Gross, Fees, Shipping, Net)            │
├────────────────────────────────────────────────────────────────────────┤
│  Panel: H2 [icon] "Transactions"                                        │
│    DataTable                                                            │
└────────────────────────────────────────────────────────────────────────┘
```

### Header

`H1` "Finance" with subtitle "Income, expenses, and reimbursements". Right side keeps `MonthPicker` and the `+ Add` button. Add button changes to the accent CTA style from the Create Investment modal — solid `var(--accent)` background, `var(--accent-text)` text, no warm-yellow.

### Cardmarket Revenue panel

Wrap the 5-stat row in a `Panel` with `<H2 icon={<ShoppingBag />}>Cardmarket Revenue</H2>`. The "23 orders" tag moves to a muted `StatusPill` next to the H2.

The 5 stats become a `MetricRow` — same visual rhythm as the main StatCard row above, but a smaller variant. Each tile: muted 11px label on top, mono-font value below in the appropriate color (Total Sales primary, Gross primary, Fees error, Shipping muted, Net success). No icon — five tiles in a row with icons feels noisy at this scale.

### Transactions panel

Wrap the existing `DataTable` in a `Panel` with `<H2 icon={<Receipt />}>Transactions</H2>`. No structural change to the table itself.

The `Reimb.` column header expands to `Reimbursed` (the column is already narrow for the icon). The action column gets a touch more `gap` on hover.

Delete confirmation moves from `confirm()` to `ConfirmModal`.

### Add Transaction modal — KindCard rework

The modal currently has a 3-button colored type toggle (Expense / Income / Withdrawal) sitting above all the other fields. This is the same UX pattern the Create Investment modal solves with `KindCard` — and it should solve it the same way here.

```
┌─ Modal "Add Transaction" ─────────────────────────────────────┐
│                                                                │
│   ┌─────────────┐ ┌─────────────┐ ┌─────────────┐             │
│   │ [💸 icon]   │ │ [📈 icon]   │ │ [🏦 icon]   │             │
│   │ Expense     │ │ Income      │ │ Withdrawal  │             │
│   │ Money out — │ │ Manual      │ │ Money       │             │
│   │ shipping,   │ │ income —    │ │ pulled from │             │
│   │ supplies…   │ │ direct      │ │ Cardmarket  │             │
│   │             │ │ sales…      │ │ balance     │             │
│   └─────────────┘ └─────────────┘ └─────────────┘             │
│                                                                │
│   ⌄ once a kind is picked, fields fade in below ⌄             │
│                                                                │
│   Date            [native date input — appraiser-field]        │
│   Category        [Select — hidden for Withdrawal]             │
│   Description     [appraiser-field text]                       │
│   Amount (€)      [appraiser-field number, mono]               │
│   Paid By         [Select — only for Expense]                  │
│                                                                │
│                          [Cancel]  [Add transaction]           │
└────────────────────────────────────────────────────────────────┘
```

- Three `KindCard`s replace the colored pill row.
- Date becomes one `<input type="date">` (matches Create Investment modal). The three-Select date picker goes away.
- All inputs use `appraiser-field` class.
- Field labels switch to the `Field` primitive (10px mono uppercase muted) for consistency with Create Investment modal.
- Submit button: accent CTA. Cancel button: muted ghost button. Both match Create Investment modal exactly.

Edit-mode keeps the same layout — the kind cards still show; the relevant one starts pre-selected from the existing transaction.

## Cardmarket redesign

```
┌─ H1 "Cardmarket" + subtitle "Passive sync via browser extension" ──────┐
│                                                            [Refresh]   │
├────────────────────────────────────────────────────────────────────────┤
│  StatCard × 4  (Balance, Stock Tracked, [active tab], Last Sync)       │
├────────────────────────────────────────────────────────────────────────┤
│  Panel: H2 [icon] "Balance History"        ← Recharts area sparkline   │
├────────────────────────────────────────────────────────────────────────┤
│  Panel: H2 [icon] "Sales Pipeline"         ← Recharts stacked bar      │
│    [legend chips: Bal · U · P · S]                                     │
├────────────────────────────────────────────────────────────────────────┤
│  Panel: H2 [icon] "Orders"     [Sales | Purchases]                     │
│    [Status tabs: Cart · Unpaid · Paid · Sent · Arrived]                │
│    [Print All bar — only on Paid + Sales]                              │
│    Table (rows + expandable detail Panel)                              │
│    [Pagination]                                                         │
├────────────────────────────────────────────────────────────────────────┤
│  Panel: H2 [icon] "Sync Activity"                                       │
│    Log row × 10 — explicit StatusPills instead of cryptic +/~/=        │
└────────────────────────────────────────────────────────────────────────┘
```

### Header

`H1` "Cardmarket" with the existing subtitle. Refresh button keeps its current ghost style — already fine.

### Stat cards

Same 4-up layout. Two fixes:

- The active-tab StatCard's title that mirrors the active orders tab — keep this clever behavior.
- Fix the Balance card subtitle: it currently jams `U: € · P: € · S: € · T: €` into one line — readable but ugly. Restructure as a 2-line subtitle with the breakdown above and the Total below in `text-secondary`.

### Balance History — Recharts area sparkline

Replace the hand-rolled flex bars with a Recharts `<AreaChart>`:

- Single `<Area>` with `stroke="var(--accent)"` and a low-opacity fill gradient.
- No axes, no labels, no grid — pure sparkline. Hover tooltip shows date (DD/MM) and EUR balance.
- Height 100px.
- Inside a `Panel` with `<H2 icon={<TrendingUp />}>Balance History</H2>` and a small subtitle "30 days".

### Sales Pipeline — Recharts stacked bar

Replace the hand-rolled stacked-flex bars with a Recharts `<BarChart>`:

- Stacked `<Bar>`s in the same bottom-to-top order: balance (info) → sent (success) → paid (accent) → unpaid (warning).
- Compact X axis showing only first/last/middle date ticks. Y axis hidden.
- Tooltip shows the full breakdown with EUR formatting and the snapshot/reconstructed source flag.
- Height 140px.
- Inside a `Panel` with `<H2 icon={<Activity />}>Sales Pipeline</H2>` and the existing legend chips moved to the right side of the H2 row (current pattern, just inside the new Panel).

### Orders panel

Wrap everything in a single `Panel`. Header row: `<H2 icon={<ShoppingCart />}>Orders</H2>` on the left, the Sales / Purchases toggle on the right.

Status tabs: keep the bottom-border tab strip pattern. The count badges already use accent-tinted pills — no change.

Print All bar: keep position but the button uses the accent CTA style — solid `var(--accent)` background and `var(--accent-text)` text (the current code uses the non-existent `var(--bg-primary)` token; that's the bug being fixed).

The `<table>` keeps its current shape (your call). Three changes:

- Row hover: brighter `var(--bg-card-hover)` instead of the current near-invisible `rgba(255,255,255,0.02)`.
- Expanded order detail: the inner panel becomes a real `<Panel inset>`, indented from the parent edges with proper glass treatment. Items table inside gets a touch more vertical rhythm.
- Items table: `FOIL` text replaced with `<FoilStar />`.
- Master "printed" checkbox: warning-token color instead of `#eab308`.

Pagination becomes the new `<Pagination>` primitive — same Prev / Page X of Y / Next, but unified styling.

### Sync Activity panel

`<H2 icon={<Zap />}>Sync Activity</H2>`. Each log row stays one line, but the cryptic `+12 ~3 =5 -1` becomes explicit StatusPills:

```
[orders] +12 added  ~3 updated  =5 skipped  -1 removed   user · 2m ago
```

Pills only render when the count is > 0. The `dataType` chip on the left keeps its accent treatment.

## Build sequence

Each commit is independently reviewable and revertable.

1. **`feat(dashboard): extract Panel/H1/H2/H3/Field/Note primitives`**
   New file `components/dashboard/page-shell.tsx`. Lift inline definitions out of `StorageSetupContent.tsx` and `CreateInvestmentModal.tsx`. Update both to import. Verify no visual regression on Storage Setup or the Investment modal.

2. **`feat(dashboard): extract KindCard primitive`**
   New file `components/dashboard/kind-card.tsx`. Lift out of `CreateInvestmentModal.tsx`. Update modal to import. Verify no regression.

3. **`feat(dashboard): add StatusPill and Pagination primitives`**
   Two new files. No existing callers yet.

4. **`refactor(finance): adopt page-shell primitives + bug sweep`**
   Finance page header → new H1 with subtitle. Wrap CM Revenue + Transactions in `Panel`. Replace amber Add button with accent CTA. Replace `confirm()` with `ConfirmModal`. Drop `var(--error, #ef4444)` fallbacks.

5. **`feat(finance): redesign Add Transaction modal with KindCard flow`**
   Replace 3-button type toggle with KindCard row. Replace 3-Select date picker with `<input type="date">`. Switch all inputs to `appraiser-field`. Switch labels to the new `Field` primitive. Submit button → accent CTA matching Create Investment modal.

6. **`feat(finance): card-rhythm Cardmarket Revenue MetricRow`**
   Add `MetricRow` primitive (commit 3 placement was for `StatusPill` + `Pagination` only; `MetricRow` lands here in its first-use commit). Replace the inline 5-stat grid with `MetricRow`. H2 with `<ShoppingBag />` icon and orders-count `StatusPill`.

7. **`refactor(cardmarket): adopt page-shell primitives + bug sweep`**
   Header → new H1. Wrap each section (Balance History, Sales Pipeline, Orders, Sync Activity) in `Panel` with H2-with-icon. Fix `var(--bg-primary)` → `var(--accent-text)` (2 places). `FOIL` text → `<FoilStar />`. Yellow checkbox → `var(--warning)`. Drop `var(--warning, #f59e0b)` fallbacks.

8. **`feat(cardmarket): replace hand-rolled charts with Recharts`**
   Balance History → `<AreaChart>` sparkline. Sales Pipeline → `<BarChart>` stacked. Both keep the same data shape, same tooltip information, same height budget.

9. **`feat(cardmarket): polish Orders rhythm + Sync Activity pills`**
   Orders table: brighter row hover, expanded detail uses `<Panel inset>`, pagination uses new primitive. Sync Activity: `+N ~M =K -L` cryptic stats become explicit StatusPills.

## Manual verification (per commit)

Each commit runs `npm run dev` and gets a manual click-through:

- Commit 1 — open Storage Setup, Investment modal: identical visuals.
- Commit 2 — open Investment modal: identical visuals.
- Commit 3 — no manual check (no callers).
- Commit 4 — open Finance: header looks like Storage Setup; Add button is cyan accent; CM Revenue + Transactions panels are glass; delete a transaction → ConfirmModal appears.
- Commit 5 — open Add Transaction: KindCard row appears; click each kind → fields fade in; date picker is single field; edit existing transaction → kind pre-selected.
- Commit 6 — CM Revenue section: 5 metric tiles in row, no icon, mono values, color coding correct.
- Commit 7 — open Cardmarket: header matches Finance/Storage; all 4 sections are glass Panels with icon H2s; Print All button text is dark-on-cyan; FOIL items show the foil-star sprite; printed checkbox is the warning amber.
- Commit 8 — Balance History sparkline + Sales Pipeline bar chart render with hover tooltips; legend chips next to Sales Pipeline H2 still show latest values.
- Commit 9 — Orders: row hover is visible; click row → expanded panel has inset glass styling; pagination Prev/Next works; Sync Activity rows show explicit pills, zero-count pills hidden.

After commit 9 the user reviews the whole branch in browser. If approved → PR. If scrapped → `git branch -D ui/redesign-finance-cardmarket` and main is untouched.
