# Page Audit Improvements

Working doc — improvements approved during the page-by-page UX/UI audit.
Implementation pass happens after every page is audited.

## Cross-cutting (apply to multiple pages)

- Last-updated stamp pattern for SWR-driven pages (small `updated 2m ago` near the H1 with a refresh icon).
- Form-control styling consistency: every input in the app should use `appraiser-field` + `Field` primitive labels (10px mono uppercase). Stock filters and any other form bar should be normalized.
- StatCard color tones (extension of the existing `titleTone` work): the icon bubble and/or value should also be tone-able (success/danger/muted) so finance + investments + stock cards can be color-coded by meaning, not all accent-cyan.
- StatCard trend slot: optional `delta` prop showing `↑ 12% vs last [period]` in success/danger color. Powers monthly comparison on Finance, week-over-week on Cardmarket, etc.

## Home (`/`) — UI 7 / UX 6.5

1. **Make StatCards clickable** — `Orders to Ship` → `/cardmarket?direction=sale&status=paid&printed=false`. `CM Balance` → `/cardmarket`. `Treasury` → `/finance`. `Active Sales Value` → `/cardmarket?status=paid`. Faint chevron-right on hover signals it.
2. **Age the Pending Reimbursements list** — sort oldest first; render `12 days outstanding` in `var(--warning)` if >7 days, `var(--error)` if >30 days.
3. **Confirm or undo on reimburse** — either ConfirmModal or inline 3-second undo strip after click. Money actions need a safety net; current single-click on a tiny icon is too fragile.
4. **Hoist NextGoal up** — either merge into the StatCard row as a 5th card OR collapse to a thin progress strip directly under the H1 (`Goal: €X / €Y · 64%`). Stop giving it a full-width hero block.
5. **Add a "today" mini-row** — small daily numbers above the all-time StatCards (`Today: 3 orders · €87 in · 1 to ship`). Daily pulse is what makes a dashboard feel alive.
6. **Last-updated stamp in the H1 row** — `updated 2m ago` with a refresh icon. SWR refreshes silently; user has no signal numbers aren't stale.
7. **Sharper subtitle** — `Your trading business at a glance` → `Outstanding actions, balance, and today's pulse`.
8. **Fold Sales Economics behind a disclosure** ("Show analytics ▾") so the top of the page stays action-focused.

## Stock (`/stock`) — UI 7 / UX 7.5

1. **Normalize StockFilters styling** — switch labels to the `Field` primitive (10px mono uppercase), inputs to `appraiser-field`, drop the `surface-gradient` input bg (inputs should be `bg-card`), drop the inline `marginBottom: 16` so the page rhythm is uniform.
2. **Make the `Filtered` pill clear-able** — render as `× Filtered (3)` clickable button next to the H1; one click clears all filters and resets to defaults.
3. **Add filter presets** — small chip row above the filter bar: `All foils`, `Overpriced > 20%`, `Out of stock`, `Recent listings (7d)`, `Missing trend price`. Each is a one-click filter combo.
4. **Collapsible filters** — when no filter is active, render as a single `Filters ▾` button. Expand on click. Default state on the page is just the table.
5. **Reorder sections** — H1 → StatCards → StockTable → (StockChart + StockGhostGap below the fold). Data first, analytics second.
6. **Title StockChart** — add an H2 with an icon and a one-line subtitle so you don't have to read the chart to know what it shows.
7. **Promote coverage to its own card** — `Total Stock`'s coverage subtitle (`72k of 100k tracked (72%)`) becomes a dedicated mini-card with a progress bar, or a thin progress strip under the StatCards row. Don't bury a health metric in muted subtitle text.
8. **Tooltip on `minOverpricedPct`** — a small `?` next to the label that explains what "overpriced" means (Cardmarket trend × N% threshold) and why you'd want to filter by it. The most-distinctive power feature deserves prominent signaling.

## Finance (`/finance`) — UI 8 / UX 7

1. **Color-tone the StatCards by semantic meaning.** Income → success-tinted icon. Expenses → error-tinted. Withdrawals → muted. Shipping Profit → success/error based on sign. Treasury → muted. Net Balance → success/error based on sign (replaces the opaque `active` border). Drop the uniform cyan-everywhere look.
2. **Visual grouping of the 6 cards.** Either render as two rows with a thin section divider (`This month's flows` / `Running balances`) or split into two Panels with H3 sub-headings. The mixing of flow vs. balance types is the biggest cognitive cost on the page.
3. **Trend deltas on every card.** `€1,243 ↑ 12% vs March` in the subtitle slot, success/error color. Same pattern works for any monthly metric across the app.
4. **Reframe CM Revenue panel.** Either: (a) change the H2 to `Cardmarket Revenue · already in Income above`, or (b) accent-left-border the panel and slot it directly under the Income card visually. Right now the position implies it's additive; it isn't.
5. **Make Net Balance tooltip evaluate the formula.** `€1,243 − €432 + €87 = €898` instead of the abstract `Income - Expenses + Shipping Profit`.
6. **Subtotal/footer row on Transactions table.** `23 transactions · net €+342` at the bottom, reflecting current sort/filter.
7. **Duplicate action on transaction rows.** A small "duplicate" icon next to the pencil → opens the Add modal pre-filled with the row's fields and today's date. Eliminates repetitive monthly bookkeeping.
8. **Category breakdown panel.** Small donut or stacked bar showing where Expenses went this month (Shipping €120, Operational €80, Direct €40, Other €5). Lives between the StatCards and CM Revenue. Answers "what did I spend on?" without scrolling the table.
9. **Make MetricRow tiles hover-able / clickable** — small future improvement, but if Fees were a clickable tile drilling into the per-order fee breakdown, the panel becomes a navigation surface, not just a display.

## Cardmarket (`/cardmarket`) — UI 8 / UX 7.5

1. **Decode the Balance card subtitle.** Replace `U: €X · P: €Y · S: €Z · T: €T` with the same colored dots used in the Sales Pipeline legend (`● Unpaid €X  ● Paid €Y  ● Sent €Z`). Total can stay as the trailing primary-text figure.
2. **Replace the dynamic-title StatCard #3** with a stable metric. Options: "Net revenue this month" + tiny sparkline subtitle, or "Avg order value", or "Sell-through this week". Currently it changes meaning when you click a tab below — unsettling.
3. **Fix the Last Sync icon** — swap `TrendingDown` for `Clock` (or `Activity`). Also color-tone the card warning/danger when last-sync > 30 minutes / > 24h.
4. **Bigger Balance History sparkline** — match Sales Pipeline at `height: 140`. Current 100px is too short to read.
5. **Color-tone the StatCards** (cross-cutting) — Balance success-tinted, Last Sync warning-tinted when stale, etc.
6. **Hide or contextualize the Refresh button.** SWR auto-refreshes; the button mostly contradicts that. Either remove or only render when data is genuinely stale (`Stale · Refresh`).
7. **Shippable-address indicator on Orders rows.** Small dot per row signaling whether a printable address is on file. Prevents print-then-discover-it-failed.
8. **Print preview before dialog.** Open a small grid of all envelopes about to print, with per-envelope skip checkboxes; then "Print N" hits the dialog. Bonus: highlight envelopes missing an address.
9. **Page-size control on Orders pagination** — 20 / 50 / 100 selector next to the Prev/Next buttons.
10. **Within-tab filters on Orders** — at minimum: country, value range, buyer-name search. As an inline filter row above the table.
11. **Click-through on Sync Activity rows** — show the actual synced docs or a per-record diff. Currently the richest data on the page is read-only.

## Investments list (`/investments`) — UI 7.5 / UX 7

1. **Replace local `statusBadge` and tab count badges with shared `StatusPill`** — listing/closed/archived map cleanly to accent/success/muted tones (already done on InvestmentDetail).
2. **Whole-row clickable** — wrap the `<tr>` content in a Link or use a `<tr onClick>` that navigates to `/investments/[id]`. Currently only the name is clickable.
3. **Sortable columns** on Cost, Listed, Realized, Break-even %, Created. The portfolio table needs sort more than almost any other table on the dashboard.
4. **Source column visual upgrade**:
   - Box sources: set-symbol SVG (already cached on `EvSet`) + set code chip + booster type pill
   - Product sources: thumb image (already on EvProduct) + product name (resolve from slug)
   - Customer bulk: a `Wallet` icon + the estimated card count
5. **Color-tone the StatCards** (cross-cutting): Deployed muted, Listed info, Realized success, P/L success/error by sign.
6. **Past-breakeven progress bar treatment** — past 100%, change the bar's color saturation or add a `>100%` cap-overflow indicator. Don't visually equate 142% with 71%.
7. **Scope the KPI row to the active tab** (or add a small "All-time" / "Active" toggle on the StatCard row) so the cards and table agree on what they're describing.
8. **Friendlier empty state** — illustration or large icon, clear primary CTA ("Create your first investment"), one-line copy explaining what investments are.
9. **Future**: bulk archive, search across name/source, sort default = worst P/L first on All tab.

## Investment detail (`/investments/[id]`) — UI 7 / UX 7.5

1. **Migrate hand-rolled KPI cards to StatCard.** Once StatCard supports value tone (cross-cutting #3) and a progress-bar slot, the three hand-rolled cards (Realized net, P/L blended, Break-even) can use it. Whole row gets consistent hover-lift, tooltip slot, semantic.
2. **Click-through on the tag audit.** `12 / 15 tagged` becomes a button → modal listing the 3 untagged listings with one-click CM links. The audit currently identifies the gap but doesn't help close it.
3. **Replace bespoke Actions dropdown with a shared `Menu` primitive** — keyboard nav (arrows, Enter, Escape), focus trap, consistent surface. The current one-off pattern would be reusable elsewhere.
4. **Action button label** — `MoreHorizontal` icon → `Actions ▾` (icon + word + chevron) for a clearer affordance.
5. **Visually separate Archive (warning) from Delete (danger)** in the dropdown — a divider is there but they crowd each other. More vertical space and/or a subhead like "Destructive" above the delete option.
6. **Reorder sections by source kind.** For `box` and `product` sources, `SealedFlipsSection` should appear above `LotsTable` (sealed flips are the main action there). For `collection` and `customer_bulk`, lots are primary — current order is correct.
7. **Hero / supporting hierarchy in the KPI row.** P/L blended + Break-even are the verdict; Cost / Expected EV / Listed are supporting context. Either render P/L as a larger hero card spanning 2 cols + the others as a tight 4-up below, or visually scale supporting cards down.
8. **Add a Timeline strip** — small horizontal timeline showing key dates: Created → First sale → Last sale → Closed. Velocity-at-a-glance.
9. **Sales-over-time sparkline** — one tiny chart showing cumulative Realized accreting toward Cost (with the cost line marked). One picture, the whole P/L story.
10. **Move the Provenance Code explainer into a tooltip** so the code + copy button is the primary action and the wall of explanatory text reveals on hover.

## EV Sets list (`/ev`) — UI 6.5 / UX 7.5

1. **Unify toolbar buttons under a shared button system.** Search uses `appraiser-field` like the rest of the app, the three buttons (Configured / View toggle / Sync) all use a single ghost-button shape from a shared primitive.
2. **Drop the toolbar's hardcoded `mb-4`** so vertical rhythm matches the parent `gap-6`.
3. **Active-state affordance on the Configured filter** — render with `border + ring + accent text` when active, not just bg color change.
4. **Sticky toolbar (or tabs) on `/ev`** so the controls don't scroll out of view on long lists.
5. **Pin/compare two sets** — power-user feature, ranks high on value. Click a pin icon on cards; pinned sets get a side-by-side compare panel.
6. **Filter for "EV ratio above breakeven"** and other quantitative slices.

## EV Products list (`/ev?view=products`) — UI 7 / UX 6.5

1. **Replace meta empty-state copy.** `Ask Claude to "add an EV product" to seed one` → describe the actual mechanism: "Products are seeded via `npm run seed:ev-product <slug>`. See the EV setup docs."
2. **Add the same toolbar as EV Sets** — search by name/slug, filter by product type, sort by EV/year. Inconsistency between the two tabs is jarring.

## EV Set detail (within `/ev`) — UI 6.5 / UX 8

1. **Add H2s inside the inner panels.** `EvSummaryCards`, `EvSlotBreakdown`, both `EvCardTable`s, `EvSimulationPanel`, `EvHistoryChart` should each get a labeled section heading using the page-shell H2 with an icon. Right now they stack untitled.
2. **Sub-page navigation.** Inner tabs (`Summary / Cards / Simulation / History`) or a sticky right-side TOC for long pages.
3. **Unify the header buttons.** Snapshot, Sync Cards, Configure all use the same ghost-button shape; one of them (most-likely-clicked, e.g. Configure) gets accent treatment as the primary action, the others stay neutral.
4. **Tooltip on the Sift floor input** — explain what it is (per-card price minimum below which the card contributes 0 to EV) and what changing it does.
5. **Tooltip on the Masterpieces toggle** — explain what they are (Zendikar Expeditions / Kaladesh Inventions / etc.) and why you'd toggle.
6. **Confirm before Sync Cards** — destructive recompute warrants a "this will refresh card data and may change EV" warning before firing.

## EV Product detail (`/ev/product/[slug]`) — UI 7.5 / UX 7

1. **Migrate `TotalCard` to shared StatCard** with the new value-tone slot and a "gross subtitle" prop. Same gain as the InvestmentKpiRow migration.
2. **Use page `gap-6` instead of the custom `12px` grid gap** so the page matches the rest of the dashboard's vertical rhythm.
3. **Clearer total labels.** `+ Sealed boosters (net)` → `Cards + Sealed (net)`. The `+` prefix reads as arithmetic without an anchor.
4. **Snapshot history for products.** Mirror the `EvHistoryChart` pattern from set detail. EV-over-time matters as much for products as for sets.
5. **"Fetch current sealed price" button** next to `SealedPriceInput` — one-click Cardmarket scrape closes the loop instead of requiring a manual paste.
6. **Tooltip on `BasicLandToggle`** explaining what it does.
7. **Decklist filtering & grouping** — by name search, by rarity, by color, by type. A 60-card flat list is hard to scan.
8. **Make `DiscountToggle` more prominent.** It's a global value control affecting every number on the page; tucking it next to a back-arrow underplays it.

## Storage (`/storage`) — UI 7 / UX 7.5

1. **Fix `bg-[var(--card-bg)]` bug** on Shelf3D wrapper — that token doesn't exist; should be `--bg-card`. Same family as the Cardmarket `--bg-primary` bug.
2. **Add a tablet breakpoint to Shelf3D height** — currently jumps 420 → 600. A `md:h-[500px]` step would keep tablets from feeling cramped.
3. **Color-tone `Unplaced` StatCard** — warning when > 0 (it represents a problem to fix).
4. **First-run hint over the 3D scene** — subtle one-time overlay: `Click a box for contents · drag to rotate · scroll to zoom`.
5. **Search-to-3D linkage** — when the search field has text, dim non-matching boxes in the 3D scene; pulse-highlight matches.
6. **ConfirmModal on Rebuild** — destructive recompute warrants confirmation.
7. **Persistent stale-overrides chip** in the StorageHeader showing count, click-through to StorageDrawer. Currently only appears post-Rebuild.
8. **LayoutEditor styling normalization** — likely needs `Field` + `appraiser-field` like Stock filters.

## Appraiser (`/appraiser`) — UI 7 / UX 8

1. **Tooltip system on power features**:
   - Velocity tiers (`fast = 1+ sale per active day…` etc.)
   - Bulk threshold (`cards under €X are excluded from offer-net calc`)
   - Undercut % (`subtracts X% from CM-trend offer for fast-mover targeting`)
   - Sift floor (per-card price minimum)
2. **Use `Field` primitive labels above unlabeled controls** (bulk threshold, offer %, undercut %).
3. **Parse-preview on text-input add** — show "you're about to add: 4× Lightning Bolt, 1× Counterspell…" before posting.
4. **Inline CSV format documentation** — sample row, link to the parser docs, clickable example.
5. **Compact / comfortable density toggle** for the card table.
6. **Visually punchier error status row** when the scrape fails — currently same chip-style as success; should pop more (Note primitive in danger tone).
7. **Multi-collection comparison** — long-term, but power users will eventually want it.

## Activity (`/activity`) — UI 6.5 / UX 6

1. **Per-action-type icons + colored chips** — `create` (success +), `update` (info pencil), `delete` (error trash). Visual scanning becomes instant.
2. **Format details cleanly when not a string** — render objects as compact `key: value` pairs instead of raw `JSON.stringify`.
3. **Click row → drill into the affected entity** — link to `/finance/[id]` for transaction events, `/investments/[id]` for investment events, etc. The activity log should be a launchpad, not a dead end.
4. **Sticky day-group headers** — `Today`, `Yesterday`, `May 1` group breaks on the timestamp column.
5. **Quick filter chips** — `Last 24h` / `Last week` / `All time` above the table.
6. **Free-text search inside details payload.**
7. **Drop the redundant `Recent activity` H2** — H1 already says it's activity.

## Settings (`/settings`) — UI 7.5 / UX 7

1. **Extract a shared `LinkCard` primitive** from the two icon-bubble Panels (Seed Stock Progress, Download Extension). Same shape; should be one component.
2. **Group sections under H3 sub-headings** — `Tools` (link cards), `Team` (team members), `Environment` (env vars). Currently four undifferentiated Panels.
3. **Use shared `StatusPill` for the team-member role badge** (currently bespoke `rounded-full` with custom border).
4. **Add a description column to env vars** — what each var does (e.g. `MONGODB_URI` = primary DB connection). Hardcode is fine; users need it.
5. **Test-extension button on the Download Extension card** — `Send a test ping` that confirms the extension talks to the dashboard.
6. **Footer with dashboard version + commit SHA** — vital when debugging "did the bug get deployed?".

## Seed Stock Progress (`/settings/seed-progress`) — UI 7 / UX 7

1. **Replace Coverage hand-rolled stat tiles with `MetricRow`** — same pattern, should reuse the primitive.
2. **Tooltip on each Coverage metric** — Captured / CM reported / Gap / Coverage. They're undocumented today.
3. **Lease-expiry framing fix** — `expires Xm ago` reads wrong (lease is still active). Should be `expires in Xm`.
4. **`Release lease` admin action per row** — for crashed-tab cleanup.
5. **Sortable per-member progress table** — by last-active, by progress, by member name.
6. **Filter for inactive members** — show only members who haven't progressed in N days, etc.

## Storage Setup (`/system/storage-setup`) — UI 9 / UX 9

1. **Table of contents at the top** with per-section completion state (e.g. `Step 3 — Wiring · 7/9 done`).
2. **Reading-progress indicator** — floating bar at the top showing scroll %.
3. **Per-section completion badge** — based on CheckItem fill, render `3 of 5 done` next to each H2; turn green at 100%.
4. **`Reset all checks` button** somewhere admin-y — for starting a fresh build.
5. **URL-hash copy affordance** — hover any H2 → a small 🔗 icon reveals; click copies the section URL.
6. **Print stylesheet** — this is a build guide that wants to live next to a soldering iron.

---

## Audit summary

| Page | UI | UX |
|---|---:|---:|
| Home | 7 | 6.5 |
| Stock | 7 | 7.5 |
| Finance | 8 | 7 |
| Cardmarket | 8 | 7.5 |
| Investments list | 7.5 | 7 |
| Investment detail | 7 | 7.5 |
| EV Sets list | 6.5 | 7.5 |
| EV Products list | 7 | 6.5 |
| EV Set detail | 6.5 | 8 |
| EV Product detail | 7.5 | 7 |
| Storage | 7 | 7.5 |
| Appraiser | 7 | 8 |
| Activity | 6.5 | 6 |
| Settings | 7.5 | 7 |
| Seed Progress | 7 | 7 |
| Storage Setup | 9 | 9 |
