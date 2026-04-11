# Canonical Storage — Design Spec

**Date:** 2026-04-11
**Status:** Approved, ready for implementation planning
**Route:** `/storage`

## Goal

Add a "Storage" tab to the MISSTEP dashboard that mirrors, in software, the physical organization of ~63k MTG cards on a shelf of card boxes. The feature computes a deterministic canonical sort of every `(name, set)` variant in `dashboard_cm_stock`, flows that sort into a user-configurable shelf layout, and supports manual drag-overrides to reconcile discrepancies between computed placement and physical reality.

This is the software foundation for a later pick-to-light / LED / automation project. This spec covers **software only** — no hardware, no physical dimensions beyond the box-type constants, no printing or export.

**Out of scope for this spec:** physical LED integration, box/slot/row dimensional hardware modelling, printing or export of the sort, mobile touch drag, extension changes to capture `collector_number`.

## Non-Goals

- Free-form card reordering that ignores the sort rules. Overrides shift cut points only; they never let a card land out of sort order.
- Auto-rebuild on every edit. Rebuild is an explicit user action.
- Real-time sync with the physical shelf. Reconciliation is manual via drag.

## Data Sources

| Collection | Role | Written by |
|---|---|---|
| `dashboard_cm_stock` | Source of truth for card quantities. `CmStockListing` (`lib/types.ts:122`). Dedup key `name\|qty\|price\|condition\|foil\|set` means one physical variant can split across many rows; aggregation collapses them back to `(name, set)`. | Extension sync (`lib/cardmarket.ts`) |
| `dashboard_ev_sets` | **Extended.** Full Scryfall catalog of sets (not just booster ≥2020). `EvSet` (`lib/types.ts:182`). | `lib/ev.ts` Scryfall sync |
| `dashboard_ev_cards` | **Extended.** Full Scryfall catalog of card printings, with new fields `colors`, `color_identity`, `cmc`, `released_at`. | `lib/ev.ts` Scryfall sync |
| `dashboard_storage_slots` | **New.** Output of rebuild. One doc per slot (penny sleeve) with canonical `position` and flowed box/row placement. | `POST /api/storage/rebuild` |
| `dashboard_storage_layout` | **New.** Singleton doc (`_id: "current"`) holding the ordered shelf-row → box structure. | `PUT /api/storage/layout` |
| `dashboard_storage_overrides` | **New.** Drag cut overrides. One doc per user-created cut. | `POST/DELETE /api/storage/overrides` |

## Sort Hierarchy (Locked)

For every `(name, set)` variant, compute a sort key from these fields in lexicographic order:

1. **Set** — chronological by `released_at` (oldest first). Unparseable dates coerce to `9999-12-31` so they sort to the end.
2. **Color group** — `W`, `U`, `B`, `R`, `G`, `M`, `C`, `L`.
3. **Rarity** — `mythic` → `rare` → `uncommon` → `common`. `special` and `bonus` rarities are treated as `mythic`.
4. **Mana value (cmc)** — bucketed 0, 1, 2, 3, 4, 5, 6, 7+. Stored raw, bucketed at sort time.
5. **Name** — A–Z, case-insensitive.

Within the `L` bucket only, a secondary sub-order runs **before** rarity:

- `landTier = 0` → nonbasic lands
- `landTier = 1` → basic lands
- `landTier = 2` → tokens

So the full composite sort key is:

```
(setOrder, colorGroupOrder, landTier, rarityOrder, cmcBucket, nameLower)
```

where `colorGroupOrder = { W:0, U:1, B:2, R:3, G:4, M:5, C:6, L:7 }` and `landTier = 0` for all non-`L` cards (no-op).

### Color group derivation

Pure helper `deriveSortFields(card) → { colorGroup, landTier, ... }`:

```
if card is a token (layout === "token" OR type_line contains "Token") → L, landTier 2
else if type_line contains "Land":
    → L, landTier 1 if type_line contains "Basic"
    → L, landTier 0 otherwise
else if color_identity.length === 0 → C
else if color_identity.length === 1 → that one color (W|U|B|R|G)
else → M  // 2+ colors, including mono-hybrid (e.g., {W/U}{W/U} has color_identity [W, U])
```

### Token re-homing

Scryfall stores tokens in **separate sets** with their own codes (e.g., `tdom` for Dominaria tokens). By user rule, "tokens are the last ones in a set". At rebuild time, every card whose `set_type === "token"` has its effective `set` rewritten to `parent_set_code` (Scryfall provides this on token sets). Tokens then sort into the tail of the parent set's `L` bucket as `landTier = 2`.

## Slot Capacity & Splitting

Named constants in `lib/storage.ts`:

```ts
SLOT_CAPACITY       = 8        // cards per penny sleeve
ROW_CAPACITY_SLOTS  = 125      // 1000 cards ÷ 8; derived from "1k = 1 row"
BOX_ROWS            = { "1k": 1, "2k": 2, "4k": 4 }
```

After aggregating stock to `(name, set)` variants (summing qty across foil, condition, language, and dedupKey duplicates), each variant with `qty > 8` produces `ceil(qty / 8)` slots. First slots hold 8; the last holds the remainder. All slots from the same variant share metadata and differ only in `slotIndexInVariant` and `qtyInSlot`.

Foils are placed in the same slot as non-foils of the same `(name, set)` variant — per user rule "foils are in the same penny sleeve".

## Architecture: Three Pure Functions

All three live in `lib/storage.ts`, take plain data, return plain data, and do no I/O. This is the testability spine of the feature.

```
stock ────┐
          ├──► computeCanonicalSort ──► Slot[]
cards ────┘                                │
                                            ▼
layout ─────────────────────► flowIntoLayout ──► PlacedSlot[]
                                            │
overrides ───────────► applyOverrides ◄────┘
                               │
                               ▼
                      dashboard_storage_slots
```

### `computeCanonicalSort(stockRows, cardMetaByKey) → Slot[]`

**Stage 1 — aggregate stock.** Group `stockRows` by `(name, set)`. Sum `qty` across all rows in the group.

**Stage 2 — derive sort fields.** For each matched variant, call `deriveSortFields` and compute `setOrder` from a pre-sorted chronological set list.

**Stage 3 — sort.** Lexicographic sort on the composite sort key above.

**Stage 4 — split into slots.** Walk sorted variants; emit `ceil(qty/8)` slots per variant; assign 1-based `position` as we go.

**Unmatched variants** (stock with no matching metadata in `dashboard_ev_cards`) are returned in a separate `unmatchedVariants` array and excluded from the sorted output.

### `flowIntoLayout(slots, layout) → PlacedSlot[]`

**Stage 1 — partition into set blocks.** A set block is a maximal run of consecutive slots with the same `set`. Each set block is the atomic unit for shelf-row assignment.

**Stage 2 — place set blocks into shelf rows.** Walk shelf rows left-to-right, boxes within each shelf row left-to-right, box-rows within each box in snake order (box-row 0 far→near, box-row 1 near→far, …).

Placement rules:

1. If the current set block fits in the remaining shelf-row capacity → place continuously.
2. If it doesn't fit, and its length ≤ full shelf-row capacity → leave the tail of the current shelf row empty, jump to the next shelf row, place the block starting at slot 0.
3. If it doesn't fit, and its length > full shelf-row capacity → **forced exception**: span shelf rows, mark every slot of the block with `spansShelfRow: true` for the UI to highlight in red.
4. If no shelf rows remain → mark remaining slots with `unplaced: true`.

Sets can freely cross box boundaries inside a shelf row and can cross box-row boundaries inside a box. The "no-span" constraint applies only to shelf rows.

### `applyOverrides(placedSlots, overrides) → PlacedSlot[]`

Wraps `flowIntoLayout` conceptually; in practice the walker is extended to check overrides before each slot. When an override matches `slot.slotKey`, the cursor jumps to `(targetBoxId, targetBoxRowIndex, posInBoxRow=0)` and emits empty-reserved placeholders for the skipped positions.

## Types

```ts
// Computed by computeCanonicalSort, stored in dashboard_storage_slots
type Slot = {
  slotKey: string              // `${name}|${set}|${slotIndexInVariant}` — stable identity
  variantKey: string           // `${name}|${set}` — groups slots of the same card
  position: number             // 1-based canonical rank
  name: string
  set: string                  // Scryfall set code (post token re-homing)
  setName: string
  setReleaseDate: string
  collectorNumber?: string     // best-effort from metadata, not used in sort
  colorGroup: "W"|"U"|"B"|"R"|"G"|"M"|"C"|"L"
  landTier: 0 | 1 | 2
  cmc: number                  // raw
  cmcBucket: number            // 0..7
  rarity: "mythic"|"rare"|"uncommon"|"common"
  qtyInSlot: number            // 1..8
  slotIndexInVariant: number   // 0..(ceil(totalQty/8)-1)
  imageUri: string | null
  computedAt: Date
}

type PlacedSlot = Slot & {
  shelfRowId: string           // ShelfRowConfig.id
  shelfRowIndex: number        // 0-based
  boxId: string                // BoxConfig.id
  boxIndexInRow: number        // 0-based position within the shelf row
  boxRowIndex: number          // 0..3 (4k), 0..1 (2k), 0 (1k)
  readingDirection: "far-to-near" | "near-to-far"
  positionInBoxRow: number     // 1-based, runs in readingDirection
  spansShelfRow?: true
  unplaced?: true
}

type ShelfLayout = {
  _id: "current"
  shelfRows: ShelfRowConfig[]
  updatedAt: Date
  updatedBy: string
}

type ShelfRowConfig = {
  id: string                   // stable UUID
  label: string                // e.g., "Top row"
  boxes: BoxConfig[]
}

type BoxConfig = {
  id: string                   // stable UUID
  type: "1k" | "2k" | "4k"
  label?: string
}

type CutOverride = {
  _id: ObjectId
  anchorSlotKey: string        // e.g., "Dominaria United|dmu|0"
  targetBoxId: string          // BoxConfig.id
  targetBoxRowIndex: number    // 0..(BOX_ROWS[type]-1)
  createdAt: Date
  createdBy: string
  note?: string
  lastStatus?: "applied" | "stale-missing-slot" | "stale-missing-target" | "stale-regression"
  lastCheckedAt?: Date
}
```

## Scryfall Sync Extension

All changes live in `lib/ev.ts`. The EV calculator UI is unaffected.

1. **Add fields** to the stored `EvCard` shape in `syncCards`:
   - `colors: string[]`
   - `color_identity: string[]`
   - `cmc: number`
   - `released_at: string` (already on `EvSet`, mirror to card for stability)

2. **Drop the filters inside the sync itself.** `BOOSTER_SET_TYPES` and `MIN_RELEASE_YEAR >= 2020` currently gate writes. Move them to the **read query** `getSets` in `lib/ev.ts`, which powers the EV calculator's set picker. Net effect: EV UI shows exactly what it shows today; canonical sort sees everything.

3. **New full-catalog entry point** using Scryfall's `/bulk-data` endpoint:
   - `GET https://api.scryfall.com/bulk-data` → pick the `default_cards` entry (one object per printing, English-first — correct granularity for `(name, set)` sort).
   - `GET <download_uri>` → gzipped JSON, single HTTP call, no rate-limit impact.
   - Stream-parse and upsert into `dashboard_ev_cards` via unordered `bulkWrite` in chunks of ~1000. Upsert key `scryfall_id`.

4. **Two sync entry points:**
   - `refreshAllScryfall()` — new. Full bulk-data sync. Idempotent. Used by the new route below.
   - `refreshSetPrices(setCode)` — existing behavior. Per-set price refresh. EV calculator's set-refresh button keeps calling this. **Unchanged.**

5. **New route `POST /api/ev/sync-all`** with `withAuth`. Returns `{ setsUpserted, cardsUpserted, durationMs }`. Logs `ev.scryfall.sync_all` via `logActivity` using `after()`.

6. **Storage rebuild does NOT auto-trigger this sync.** They are decoupled. The sync runs on its own button (on `/storage` or `/settings`), expected cadence roughly once per set release.

### Sync gotchas

- Cards with missing/unparseable `cmc` → fall back to `0` at sort time, log via `logError` info-level.
- Cards with empty `colors` and `color_identity` → colorless bucket (`C`) unless they hit the `L` condition first.
- Digital-only / promo sets with weird `released_at` → coerce to `9999-12-31`.

## API Routes

All under `app/api/storage/`. All use `withAuth*` wrappers from `lib/api-helpers.ts`. All errors go through the existing `logApiError` path.

| Method | Route | Wrapper | Body / Query | Returns | Activity Log |
|---|---|---|---|---|---|
| POST | `/api/storage/rebuild` | `withAuth` | — | rebuild response (below) | `storage.rebuild` |
| GET | `/api/storage/slots` | `withAuthRead` | `?shelfRow=&boxId=&set=&color=&search=&page=&pageSize=200` | `{ slots, total, page, pageSize }` | — |
| GET | `/api/storage/stats` | `withAuthRead` | — | stats (below) | — |
| GET | `/api/storage/layout` | `withAuthRead` | — | `ShelfLayout` | — |
| PUT | `/api/storage/layout` | `withAuth` | full `ShelfLayout` body | updated layout | `storage.layout.update` |
| GET | `/api/storage/overrides` | `withAuthRead` | `?status=all\|applied\|stale` | `CutOverride[]` | — |
| POST | `/api/storage/overrides` | `withAuth` | `{ anchorSlotKey, targetBoxId, targetBoxRowIndex, note? }` | created override | `storage.override.create` |
| DELETE | `/api/storage/overrides/:id` | `withAuthParams` | — | `{ ok: true }` | `storage.override.delete` |
| POST | `/api/storage/overrides/clear-stale` | `withAuth` | — | `{ deleted }` | `storage.override.clear_stale` |
| POST | `/api/ev/sync-all` | `withAuth` | — | `{ setsUpserted, cardsUpserted, durationMs }` | `ev.scryfall.sync_all` |

### Rebuild response shape

```ts
{
  durationMs: number
  counts: {
    stockRows: number
    variantsMatched: number
    variantsUnmatched: number
    slots: number
    placedSlots: number
    unplacedSlots: number
    spansShelfRowCount: number
  }
  overrides: {
    applied: number
    staleMissingSlot: { id: string; anchorSlotKey: string; note?: string; createdAt: Date }[]
    staleMissingTarget: { id: string; anchorSlotKey: string; note?: string; createdAt: Date }[]
    staleRegression:   { id: string; anchorSlotKey: string; note?: string; createdAt: Date }[]
  }
  unmatchedVariants: { name: string; set: string; qty: number }[]  // first 50
}
```

### Stats response shape

```ts
{
  totalVariants: number
  totalCards: number
  totalSlots: number
  placedSlots: number
  unplacedSlots: number
  perSet: { set: string; setName: string; slots: number; variants: number }[]
  perColor: { colorGroup: string; slots: number }[]
  lastRebuildAt: Date | null
  lastRebuildDurationMs: number | null
}
```

## Transactional Rebuild

Rebuild writes the new placement to a scratch collection `dashboard_storage_slots_next`, then atomically swaps by dropping the live collection and renaming the scratch. The read endpoint is never half-rebuilt. On error the scratch is dropped and the live collection is untouched.

## Mongo Indexes

One-shot migration in `scripts/storage-indexes.ts`:

- `dashboard_storage_slots`:
  - `{ position: 1 }` unique
  - `{ shelfRowIndex: 1, boxIndexInRow: 1, boxRowIndex: 1, positionInBoxRow: 1 }`
  - `{ set: 1 }`
  - `{ colorGroup: 1 }`
  - text index on `name`
- `dashboard_storage_layout`: `{ _id: 1 }` (singleton)
- `dashboard_storage_overrides`:
  - `{ anchorSlotKey: 1 }`
  - `{ targetBoxId: 1 }`
  - `{ lastStatus: 1 }`
- `dashboard_ev_cards`: add `{ name: 1, set: 1 }` compound for the rebuild metadata join.

## Page Structure — `app/(dashboard)/storage/page.tsx`

Single route. Four stacked sections on one page, no sub-routes:

1. **Header bar.** Stats summary (total variants, total cards, total slots, placed/unplaced, last rebuild timestamp), `Rebuild` button, `Sync Scryfall` button, global debounced search box.
2. **Stale & unmatched drawer.** Collapsed by default. Shows counts of unmatched variants, stale overrides (three sub-types), and sets that span shelf rows. Each category expands to a list with per-item actions.
3. **Layout editor.** Renders the shelf rows and boxes. Edit mode lets you add/remove shelf rows, add/remove boxes, change a box's type, and reorder boxes within a row. The only place with drag-for-reorder is configuration — not card placement. Save → `PUT /api/storage/layout`.
4. **Storage viewer.** Virtualised list grouped by shelf row → box → box-row. Each group header is sticky and collapsible. Slot rows show position, thumbnail, name, set code, rarity pill, qty, and a drag handle.

### Components (all new, `components/storage/`)

- `StorageHeader.tsx` — stats, action buttons (with progress indicators during rebuild/sync), debounced search input.
- `StorageDrawer.tsx` — notifications drawer with sub-components `UnmatchedList`, `StaleOverridesList`, `SpannedSetsList`.
- `LayoutEditor.tsx` — layout configuration UI. Add/remove/reorder shelf rows and boxes. Reorder drag uses HTML5 DnD.
- `StorageViewer.tsx` — `react-virtuoso`-backed virtualised grouped list. (Verify `react-virtuoso` is in `package.json`; add if missing.)
- `SlotRow.tsx` — single card row with lazy thumbnail (`loading="lazy"`) and drag handle.
- `SlotDragHandle.tsx` — override creation flow. HTML5 DnD. Drop targets are box-row headers.
- `EmptyReservedRow.tsx` — muted placeholder rows for override-introduced gaps, with a "remove gap" affordance that deletes the underlying override.

### Drag UX for override creation

1. User grabs a slot's handle. Drop zones appear on every other box-row header in the viewer.
2. User drops on a box-row header.
3. Client computes the override: `anchorSlotKey = draggedSlot.slotKey`, `targetBoxId = dropTarget.boxId`, `targetBoxRowIndex = dropTarget.boxRowIndex`.
4. Small confirmation modal summarizes the effect.
5. `POST /api/storage/overrides` → invalidate SWR keys → viewer re-renders with the new override in the overrides list (but still showing old placement).
6. A "Rebuild required" badge appears on the Rebuild button. User presses Rebuild when ready.

### Search UX

Typing in the header search box debounces 300 ms and hits `GET /api/storage/slots?search=…&pageSize=20`. Results dropdown shows name + set + position. Clicking a result scrolls the viewer to that slot via `virtuoso.scrollToIndex(position - 1)` and flashes the row.

### SWR keys

- `["/api/storage/stats"]`
- `["/api/storage/slots", { shelfRow, boxId, set, color, search, page }]`
- `["/api/storage/layout"]`
- `["/api/storage/overrides", { status }]`

Rebuild invalidates everything. Override actions invalidate slots + overrides + stats.

## Navigation

Single edit to `components/dashboard/sidebar.tsx`, adding an entry between `/stock` and `/ev` in the MANAGEMENT section:

```tsx
{ href: "/storage", label: "Storage", icon: Library }
```

`Library` from `lucide-react` (row of books — evokes a shelf). `Package` is already taken by Stock.

## Logging

Per `CLAUDE.md` conventions:

**Activity log** (`logActivity`, fire-and-forget via `after()`):

- `storage.rebuild` — `{ durationMs, counts, appliedOverrides, staleOverrides }`
- `storage.layout.update` — `{ shelfRowCount, totalBoxes, diff }`
- `storage.override.create` — `{ anchorSlotKey, targetBoxId, targetBoxRowIndex }`
- `storage.override.delete` — `{ id }`
- `storage.override.clear_stale` — `{ deleted }`
- `ev.scryfall.sync_all` — `{ setsUpserted, cardsUpserted, durationMs }`

**Error log** (`logApiError`): handled automatically by `withAuth*` wrappers.

**Info log** (`logError` level `info`): one entry per rebuild for unmatched variants (truncated to 50 entries to respect the 30-day TTL).

## Testing

All pure-function tests in `lib/__tests__/storage.test.ts`. No component tests — virtualisation is covered by manual verification on the dev server.

### `deriveSortFields`

Fixture-based, one test per color-group edge case:

- mono-W creature → `W`
- mono-U instant → `U`
- colorless artifact → `C`
- colorless Eldrazi (non-artifact, non-land) → `C`
- 2-color card → `M`
- mono-hybrid `{W/U}{W/U}` with `color_identity = [W, U]` → `M`
- basic land → `L`, `landTier 1`
- nonbasic land → `L`, `landTier 0`
- token → `L`, `landTier 2`
- DFC with colored front / colorless back → uses front's `color_identity`
- unparseable `cmc` → falls back to 0
- `special` or `bonus` rarity → treated as `mythic`

### `computeCanonicalSort`

Integration-style with a ~30-variant fixture:

- Sort order: verify lexicographic output matches hand-computed expected sequence.
- Slot splitting: qty 17 → 3 slots (8, 8, 1); qty 8 → 1 slot; qty 9 → 2 slots (8, 1).
- Determinism: running twice produces identical output including `position` numbers.
- Token re-homing: a token with `set = "tdom"`, `parent_set_code = "dmu"` lands in the DMU `L` bucket tail, not in a separate token set.
- Unmatched variants returned in `unmatchedVariants`, excluded from the sorted output.

### `flowIntoLayout`

Pure, small layout fixtures:

- Set fits in remaining shelf row → continuous placement.
- Set doesn't fit → tail left empty, jump to next shelf row, set starts fresh at position 0.
- Set bigger than any single shelf row → `spansShelfRow: true` on every slot of the block.
- Total slots exceed layout capacity → remainder marked `unplaced: true`.
- Snake direction: box-row 0 is `far-to-near`, box-row 1 is `near-to-far`, etc.
- Set transitions across box-row boundaries within a single box.

### `applyOverrides`

Against `flowIntoLayout` output:

- Applied override: anchor slot jumps to target row, empty-reserved placeholders fill the gap.
- `stale-missing-slot`: anchor not in sequence → marked, not applied.
- `stale-missing-target`: target box not in layout → marked, not applied.
- `stale-regression`: override would move slot earlier than natural flow → marked, not applied.
- Multiple overrides compound cleanly in sort order.

### API route smoke tests

Under `app/api/storage/__tests__/`:

- `POST /api/storage/rebuild` with seeded DB → response shape matches.
- `POST /api/storage/overrides` → creates, returns, visible in `GET`.
- Auth: unauthenticated request → 401.

## Manual Verification Checklist

After first deploy:

1. Run `POST /api/ev/sync-all` once. Confirm card count jumps to ~100k.
2. Configure a layout matching current physical shelf (shelf rows + boxes).
3. Run `POST /api/storage/rebuild`. Confirm `variantsUnmatched` below some acceptable threshold; investigate egregious set-code mismatches and build an alias table if needed.
4. Open `/storage`, verify the top of the sort matches the oldest physical box (far-left, top shelf row).
5. Walk the shelf, create drag overrides for the first 5–10 discrepancies, re-rebuild, verify they apply.
6. Confirm the stale-overrides drawer is empty after a clean rebuild.

## Rollout — Four Sub-Plans

Because the feature is large, the implementation plan decomposes into four sub-plans with review checkpoints:

1. **Scryfall full-catalog sync.** Extend `lib/ev.ts`, add the new fields to `EvCard`, wire `POST /api/ev/sync-all`, filter EV read queries. Ship, verify EV calculator still works, verify card count. No user-visible changes.
2. **Pure sort + flow + override core.** `lib/storage.ts` with the three pure functions + types, unit tests for all of them. No API, no UI. Mergeable in isolation.
3. **API routes + rebuild pipeline + collection schema.** Wire the pure functions through `POST /api/storage/rebuild`, implement transactional replace, add all `GET/PUT/POST` routes, Mongo indexes, activity logging. Testable via curl with no UI.
4. **`/storage` page UI.** Layout editor, viewer, drawer, drag handles, nav link. The most iterative piece.

Each sub-plan is a review checkpoint. If sub-plan 2 reveals the sort rules are wrong, we fix them before building UI on top.

## Risks

1. **Set-code matching between Cardmarket stock and Scryfall.** The big unknown — never tested. First rebuild will tell us the scope. May require a `dashboard_storage_set_aliases` mapping collection if mismatch rate is material.
2. **`ROW_CAPACITY_SLOTS = 125`** — unvalidated. Will tune after first physical walkthrough.
3. **Drag UX on touch devices** — design assumes pointer devices. Phone support would need `dnd-kit` or similar, deferred.
4. **Rebuild speed at 63k cards** — expected sub-second for the pure pipeline, seconds for Mongo round-trip. Will profile if observed slow and cache metadata in-process.
5. **Stock data quality** — pre-existing issue. Duplicates/stale entries in `dashboard_cm_stock` will surface as noisy variants; not something this feature fixes.

## Open Deviations from Original Brief

For reference, the original brief contained several elements that have been deliberately changed during brainstorming:

- **Route name.** Brief said `/sort-order`; final decision `/storage`, per user's last instruction.
- **Sort hierarchy order.** Brief had `(set, color, cmc, rarity, name)`; final order is `(set, color, rarity, cmc, name)` with `landTier` sub-order inside `L`.
- **Color groups.** Brief had 8 groups with `A` as "Artifacts (colorless non-land)"; final has 8 groups with `C` as "Colorless in general" (Eldrazi, etc. included).
- **Slot granularity.** Brief said "one doc per unique variant"; final says **one doc per slot**, with variants of qty > 8 producing multiple slot docs. Also, the slot unit is `(name, set)` rather than the `CmStockListing.dedupKey` pattern (which includes qty/price and is unstable across restocks).
- **Drag-and-drop.** Brief said "No drag-and-drop" because the hierarchy is fixed. Final includes a constrained drag for override creation that shifts cut points without reordering cards.
- **Scope.** Brief said "no physical position assignment". Final includes layout configuration + flow algorithm + override persistence, because the user wants to mirror the current physical shelf state.
- **Shelf hardware.** Brief ended with a shelf-framing question referencing a "confirmed 20-box layout" that had never been confirmed. That topic is explicitly out of scope for this spec; physical dimensions, 220 cm shelf, LED integration are all future work.
