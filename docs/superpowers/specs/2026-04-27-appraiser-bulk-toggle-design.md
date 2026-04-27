# Appraiser bulk toggle — design

**Date:** 2026-04-27
**Topic:** Exclude / re-price ≤€1 trend cards in the Appraiser tab's totals and offer math

## Problem

The Appraiser tab today computes `totalFrom`, `totalTrend`, and offer tiers (-5/-10/-15/-20%) across **every** card in a collection. In real Cardmarket appraisals, ≤€1 trend cards aren't valued at trend — they're priced as flat-rate bulk (e.g. €0.05/card). Mixing them into the same average pulls the offer total away from what the user actually pays. There's no way to separate the two today.

## What changes for the user

A new control strip appears on the cards table next to the existing Offer % select:

```
[ ☐ Exclude bulk  Trend < [€1.00 ▢]   Bulk @ [€0.05 ▢]/ea ]   Offer [-5% ▼]   [Copy]
```

- **`Exclude bulk` checkbox** — master toggle. Off by default → behavior unchanged from today.
- **Threshold input** — defaults to €1.00. Cards with `trendPrice < threshold`, **or** `trendPrice === null`, are flagged as bulk. Null is grouped with bulk because pending/missing prices shouldn't inflate the main totals.
- **Bulk rate input** — €/card. `0` (or empty) = pure exclusion. Any positive value adds `bulkCount × bulkRate` to the offer total.

When the toggle is on:

- Bulk rows stay visible in the table but render at `opacity: 0.4` with a small `bulk` chip next to the qty so the user can see what got cut.
- Summary bar's "main" totals (`From`, `Trend`, `-5%`, `-10%`, `-15%`, `-20%`) are computed from non-bulk cards only.
- A second line appears under the summary:
  ```
  └─ excludes 30 bulk cards (Trend < €1) · Bulk add-on: 30 × €0,05 = €1,50 · Offer total: €115,88
  ```
  - `Offer total = mainTotalFrom × (1 − offerPct/100) + bulkCount × bulkRate`
  - When `bulkRate = 0`, the line collapses to `excludes N bulk cards · Offer total: €X` (offer total = main offer at selected %).
- `Copy` exports the table as two blocks (main rows, then bulk rows) with a summary footer that includes both totals and the final offer.

The three settings — toggle state, threshold, and rate — are saved per-collection. They survive across browser sessions and devices.

## Architecture

Pure UI feature with a small additive schema change. No new endpoints, no new Mongo collection.

### Schema (additive)

`dashboard_appraiser_collections` gains three optional fields on each doc. Optional so existing docs work unchanged; the API layer falls back to defaults `(false, 1, 0)` when fields are absent:

```ts
// AppraiserCollectionDoc
bulkExcludeEnabled?: boolean;  // default false
bulkThreshold?: number;        // default 1.0 (EUR)
bulkRate?: number;             // default 0   (EUR/card)
```

The frontend-facing `AppraiserCollection` interface mirrors the same three fields, but as **required** (not optional) — the GET mapper always supplies defaults, so consumers don't need to handle `undefined`.

### API surface

`PUT /api/appraiser/collections/[id]` already accepts `{ name?, notes? }`. The validator extends to also accept `{ bulkExcludeEnabled?, bulkThreshold?, bulkRate? }`. Each field is independently optional — the same body can update notes and bulk settings in one call. Type/range validation:

- `bulkExcludeEnabled` must be a boolean.
- `bulkThreshold` must be a finite number ≥ 0. Reasonable cap at €1000 to catch UI bugs.
- `bulkRate` must be a finite number ≥ 0. Capped at the threshold value (a bulk rate higher than the threshold is nonsensical — would price bulk cards above the cards that just barely make the cut).

Reject the whole request with 400 + a per-field error message if any value fails validation. The activity log line is updated to surface which fields changed (mirrors the existing `name="..." notes=N chars` format).

`GET /api/appraiser/collections/[id]` already maps `AppraiserCollectionDoc → AppraiserCollection` inline at `route.ts:70-79`. Add the three fields to that mapper, falling back to `(false, 1, 0)` when the doc field is absent.

The list endpoint (`GET /api/appraiser/collections`) does **not** need to surface these — the collection dropdown only shows name + card count + totals.

### Component changes — `AppraiserCardTable.tsx`

This is the bulk of the change. The component currently has a single `offerPct` state. After this change:

**State:**
- `offerPct` (existing)
- `bulkExclude: boolean` — hydrated from the new `collection.bulkExcludeEnabled` prop
- `bulkThreshold: number` — hydrated from `collection.bulkThreshold`
- `bulkRate: number` — hydrated from `collection.bulkRate`

**Persistence:**
- A debounced `PUT /api/appraiser/collections/[id]` fires 300ms after the last change to any of the three bulk fields. Debounce is friendlier than `onBlur` here because users will likely tweak the threshold and rate fields in quick succession; we don't want a save mid-typing.
- **Hydration runs on `collection._id` change only** — not on every collection update. Otherwise SWR polling (or the post-save re-fetch) would overwrite mid-typing edits and create a fight between local state and server state. The save acts as the source of truth from the moment the user starts editing.
- On a successful save, no parent re-fetch is needed — the local state already matches what was persisted. Skip `onCardChanged()` here (the existing `onCardChanged` is called from card-level edits, where SWR re-hydration is desired).
- Failure handling: log to console, leave local state as-is. The user can keep editing — the next debounced save will retry with the latest values. No toast / no rollback. This matches the loose error UX already in `putCard` and `saveNotes`.

**Derived data (`useMemo`-ed on `cards`, `bulkExclude`, `bulkThreshold`):**
```ts
const isBulk = (c: AppraiserCard) =>
  bulkExclude && (c.trendPrice == null || c.trendPrice < bulkThreshold);
const mainCards = cards.filter((c) => !isBulk(c));
const bulkCards = cards.filter((c) =>  isBulk(c));
```

**Recomputed totals (`useMemo`-ed):**
```ts
const totalFrom  = mainCards.reduce((s, c) => s + (c.fromPrice  ?? 0) * c.qty, 0);
const totalTrend = mainCards.reduce((s, c) => s + (c.trendPrice ?? 0) * c.qty, 0);
const bulkCount  = bulkCards.reduce((s, c) => s + c.qty, 0);
const bulkAddOn  = bulkCount * bulkRate;
const offerTotal = totalFrom * (1 - offerPct / 100) + bulkAddOn;
```

When `bulkExclude` is false, `mainCards = cards`, `bulkCards = []`, and `bulkAddOn = 0` — i.e. behavior matches today.

**Rendering:**
- Bulk rows: `<tr style={{ opacity: 0.4 }}>` with a `<span class="bulk-chip">bulk</span>` next to the qty. Keep them in the same table — no separate section. Sort order unchanged (rendering order = array order).
- Summary bar: existing pills (`From`, `Trend`, `-5%`, …, `-10%`, …) read from the new `totalFrom` / `totalTrend`. Add a second flex row immediately below the existing one, shown only when `bulkExclude && bulkCards.length > 0`:
  ```
  excludes {bulkCount} bulk cards (Trend < €{threshold})
   · Bulk add-on: {bulkCount} × €{bulkRate} = €{bulkAddOn}    [shown only when bulkRate > 0]
   · Offer total: €{offerTotal}
  ```

**`copyAll()` export update:**
```
Name\tSet\tCN\tLang\tFoil\tQty\tFrom\tTrend\tOffer -5%
<main rows>

# Bulk (Trend < €1.00) — excluded from offer math
<bulk rows>

Total cards: 50 (20 main + 30 bulk)
Total From (main): €120.40
Total Trend (main): €115.20
Bulk add-on: 30 × €0.05 = €1.50
Offer -5%: €115.88   <- main × 0.95 + bulk add-on
```

The `Bulk` block and "Bulk add-on" line are emitted only when bulk is excluded. Otherwise the existing format is unchanged.

### Component changes — `Appraiser.tsx`

Currently `detailSwr.data.collection` is fetched but only `cards` is passed to `AppraiserCardTable`. Add a `collection` prop on `AppraiserCardTable` and thread the value down. This is a one-line plumbing change.

### Files touched (4)

1. `lib/appraiser/types.ts` — add 3 fields to `AppraiserCollectionDoc` and `AppraiserCollection`.
2. `app/api/appraiser/collections/[id]/route.ts` — extend PUT validator, extend GET mapper at line 70-79.
3. `components/appraiser/Appraiser.tsx` — pass `collection` as a new prop to `AppraiserCardTable`.
4. `components/appraiser/AppraiserCardTable.tsx` — add state, derived totals, persistence, rendering changes, copy export.

### Files NOT touched

- `lib/appraiser/scryfall-resolve.ts` / `delver-csv.ts` / `ev-join.ts` — unaffected.
- `app/api/appraiser/collections/route.ts` (list endpoint) — bulk settings not needed for the dropdown.
- `app/api/appraiser/collections/[id]/cards/*` — card-level routes unaffected.
- `app/api/appraiser/collections/[id]/refresh/route.ts` — refresh just rewrites prices, doesn't care about bulk settings.
- Existing tests — none of them assert on totals from this component.

## Edge cases

| Case | Behavior |
|---|---|
| Card has `trendPrice === null` (still pending or scrape failed) | Treated as bulk when `bulkExclude` is on. Reasoning: a card with no known price shouldn't inflate the main totals. The user can re-eval after refresh. When `bulkExclude` is off, current behavior continues (counts as 0 in totals). |
| `bulkExclude` is on but `bulkRate = 0` | Pure exclusion. Bulk cards contribute nothing. Summary bar shows only `excludes N bulk cards · Offer total: €X` — no "Bulk add-on" line. |
| `bulkExclude` is on but no card meets the bulk filter | Toggle has no visual effect on the table. Second summary line is hidden (since `bulkCards.length === 0`). Behavior matches the toggle-off state. |
| User sets `bulkRate > bulkThreshold` | Validator rejects with 400. UI also enforces this on the input via `max={bulkThreshold}`. |
| User edits a bulk card's qty while excluded | Existing `putCard` flow runs, SWR re-fetches. The card stays bulk if its new state still matches the filter. No special handling. |
| Existing collections (no bulk fields in doc) | API mapper falls back to `(false, 1, 0)`. UI shows toggle off, threshold €1, rate €0 — matches today's behavior. First time the user changes any bulk setting, all three fields are persisted in one PUT. |
| Concurrent edits from another tab/device | SWR re-fetch picks up the latest values on the next poll. Last-write-wins per field. Acceptable for a single-user app. |

## Out of scope

- **Per-card "force include / exclude" override.** The trend-threshold filter is the only way a card lands in the bulk bucket. If users later want manual overrides, that's a separate feature.
- **Multiple bulk tiers** (e.g. €0–0.10 at €0.02, €0.10–1.00 at €0.05). Single flat rate is enough for the typical appraisal flow.
- **Bulk add-on as a percentage of bulk-cards' From price.** Real Cardmarket bulk negotiation is per-card flat, not percent-of-from.
- **Surfacing bulk settings in the collection-list dropdown.** The dropdown is for selection, not for at-a-glance config.
- **History / audit trail of bulk settings changes.** Activity log already records the PUT; a dedicated history view isn't worth the scope.

## Testing approach

- **Manual UI walkthrough** — open an existing collection, toggle bulk on, set threshold and rate, verify the totals and offer total update live, verify the dim/chip styling on bulk rows, verify Copy emits two blocks. Reload the page and confirm settings persisted.
- **API smoke** — hit `PUT /api/appraiser/collections/[id]` with each of the three new fields independently and verify the `GET` payload reflects the change. Verify validator rejects negative rate, rate > threshold, non-finite numbers.
- **No new automated tests.** The existing `cardmarket-appraiser-fanout.test.ts` and `delver-csv.test.ts` are scoped to import/scrape behavior, not UI math. Adding a render-test harness for one summary line isn't justified.
