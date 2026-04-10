# Stock Tab — Design Spec

**Date:** 2026-04-10
**Status:** Approved, ready for implementation planning

## Goal

Add a "Stock" tab to the MISSTEP dashboard that lets the user browse and search every listing in `dashboard_cm_stock`, see live aggregate metrics via stat cards, view stock/value progression over time in a chart, and preview card images on hover.

Out of scope for v1: row editing, CSV export, URL-synced filters, bulk actions, grouped/aggregated views, mobile card renderer.

## Data Sources

| Collection | Role |
|---|---|
| `dashboard_cm_stock` | Canonical listings. One doc per `dedupKey` = `name\|qty\|price\|condition\|foil\|set`. Schema: `CmStockListing` (`lib/types.ts:122`). Written by extension via `processStock` in `lib/cardmarket.ts:335`. |
| `dashboard_cm_stock_snapshots` | Time-series. Currently `{ totalListings, extractedAt, submittedBy }` — will be extended (see Section 6). |
| `dashboard_cards` | Local Scryfall cache. Contains `image_uri`, keyed by `scryfall_id`, indexable by `(name, set)`. Used by the hover preview. |

## Navigation

Add to `components/dashboard/sidebar.tsx` under the MANAGEMENT section:

```ts
{ href: "/stock", label: "Stock", icon: <Package /> }
```

(Lucide `Package` icon; adjust if a more specific one is preferred.)

## 1. Page Structure

```
/stock
 ├── Header: "Stock"
 ├── Stat cards row (3 cards)
 │    ├── Total Stock  (sum of qty)
 │    ├── Value        (sum of qty × price where price > 0.25)
 │    └── Listings     (distinct name+set pairs)
 ├── Chart card (Recharts LineChart + range selector)
 ├── Filter bar card (7 filters + Clear)
 ├── Table (sortable, click-to-sort on every column)
 └── Pagination footer (Prev / Next / page size / "Page X of Y")
```

**Files:**
- `app/(dashboard)/stock/page.tsx` — thin wrapper
- `components/stock/StockContent.tsx` — main client component
- `components/stock/StockFilters.tsx` — filter bar
- `components/stock/StockTable.tsx` — table + pagination
- `components/stock/StockChart.tsx` — history chart
- `components/stock/CardHoverPreview.tsx` — floating image panel

Stat cards use the existing `components/dashboard/stat-card.tsx`. Styling matches `CardmarketContent.tsx` (surface gradient, rounded cards, existing border tokens).

## 2. Search API — `GET /api/stock`

Wrapped by `withAuthRead` from `lib/api-helpers.ts`.

**Query params** (all optional):

| Param | Type | Notes |
|---|---|---|
| `name` | string | Substring match, case-insensitive. Regex-escaped server-side. |
| `set` | string | Exact match (expansion code). |
| `condition` | enum | One of `MT\|NM\|EX\|GD\|LP\|PL\|PO`. |
| `foil` | `true\|false` | Omit = any. |
| `language` | string | Exact match. |
| `minPrice` | number | EUR, `>=`. |
| `maxPrice` | number | EUR, `<=`. |
| `minQty` | number | `>=`. |
| `sort` | enum | `name\|qty\|price\|condition\|foil\|set\|language\|lastSeenAt`. Default: `lastSeenAt`. |
| `dir` | `asc\|desc` | Default: `desc`. |
| `page` | number | 1-based. Default: `1`. |
| `pageSize` | number | Default: `50`. Max: `200` (server clamps). |

**Validation:**
- Whitelist `sort`, `dir`, `condition`, `foil`. Anything outside the whitelist → `400 { error }`.
- Numeric params parsed with `Number`; `NaN` → `400`. Negative values → `400`.
- `pageSize` clamped to `[1, 200]`. `page` clamped to `>= 1`.
- Regex input for `name` is escaped (`\.+*?^$()[]{}|\\`) before being wrapped in a Mongo regex.

**Response:**
```json
{
  "rows": [CmStockListing, ...],
  "total": 12345,
  "page": 1,
  "pageSize": 50
}
```

**Implementation** (`lib/stock.ts`):

```ts
export async function searchStock(params: StockSearchParams): Promise<{
  rows: CmStockListing[];
  total: number;
}>
```

Filter object is constructed by merging only the provided fields. Execution:

```ts
const [rows, total] = await Promise.all([
  col.find(filter).sort({ [sort]: dir === "asc" ? 1 : -1 })
     .skip((page - 1) * pageSize)
     .limit(pageSize)
     .toArray(),
  col.countDocuments(filter),
]);
```

## 3. Stat Cards API — `GET /api/stock/summary`

Returns the three headline numbers, independent of any search filters.

**Response:**
```json
{
  "totalQty": 0,
  "totalValue": 0,
  "distinctListings": 0
}
```

**Implementation** (`lib/stock.ts`):

One aggregation pipeline run against `dashboard_cm_stock` with `$facet`:

- `qtyAndValue`: `$group` with `_id: null`, `totalQty: { $sum: "$qty" }`, `totalValue: { $sum: { $cond: [{ $gt: ["$price", 0.25] }, { $multiply: ["$qty", "$price"] }, 0] } }`
- `distinct`: `$group` on `{ name: "$name", set: "$set" }` then `$count`

Total cost: a single collection scan. Acceptable at expected volume (5k–50k listings). Indexed scan on `(name, set)` would help if this gets slow — defer until measured.

Client calls this once on mount, SWR-cached with a 60s dedupe window.

## 4. History API — `GET /api/stock/history`

**Query params:**
- `range` — `7d | 30d | 90d | all` (default `30d`)

**Response:**
```json
{
  "points": [
    { "extractedAt": "2026-04-01T10:00:00.000Z", "totalListings": 2341, "totalQty": 8421, "totalValue": 1842.55, "distinctNameSet": 1876 },
    ...
  ]
}
```

Reads from `dashboard_cm_stock_snapshots`, filtered by `extractedAt >= rangeStart`, sorted ascending. Old docs without the new fields return them as `null` — the client's Recharts setup renders gaps cleanly for those segments.

## 5. Chart — `StockChart.tsx`

Recharts `LineChart`. Three lines:

| Line | Y axis | Series |
|---|---|---|
| Total Stock (qty) | left | `totalQty` |
| Listings (distinct) | left | `distinctNameSet` |
| Value (€) | right | `totalValue` |

- Range selector above the chart: `7d · 30d · 90d · All` as a segmented control.
- Tooltip shows all three values for the hovered date.
- Empty/loading states: skeleton block sized to match the chart footprint.

All three lines mirror the stat cards above. The legacy `totalListings` field (present on pre-change snapshots) is kept in storage but is **not charted** — it doesn't match any of the three headline metrics, and mixing it in would confuse the display. The new three series become usable immediately thanks to the one-time backfill row (Section 6), and grow naturally from each subsequent sync.

## 6. Snapshot Schema Change + Backfill (Option B)

**Type change — `lib/types.ts`:**

```ts
export interface CmStockSnapshot {
  _id?: string;
  totalListings: number;
  totalQty?: number;        // NEW
  totalValue?: number;      // NEW
  distinctNameSet?: number; // NEW
  extractedAt: string;
  submittedBy: string;
}
```

New fields are optional in the type so pre-change docs continue to satisfy it.

**Write-side change — `lib/cardmarket.ts:processStockOverview`:**

After receiving the extension's `totalListings` payload, compute the three new aggregates from the current state of `dashboard_cm_stock` (reusing the `/api/stock/summary` aggregation pipeline) and include them in the inserted snapshot.

**Compression rule update:**

The existing "delete middle of three identical snapshots" rule compares on `totalListings` only. Update the equality check to compare the full tuple `(totalListings, totalQty, totalValue, distinctNameSet)`. Minor rounding: compare `totalValue` to 2 decimal places to avoid thrash from floating-point drift.

**One-time backfill:**

A one-shot script at `scripts/backfill-stock-snapshot.ts` (or a one-off server action) that runs the summary aggregation once and inserts a single snapshot row with `submittedBy = "backfill"`. Run manually after deploy. Chart becomes useful on day one.

**Indexes (ensure-indexes pass in `lib/cardmarket.ts`):**

Add to the existing `createIndex` block:
- `dashboard_cm_stock`: `{ lastSeenAt: -1 }`, `{ name: 1 }`, `{ set: 1, condition: 1 }`, `{ price: 1 }`

## 7. Card Image Hover Preview

**Column:** leftmost column in the stock table holds a small Lucide `Image`-icon button per row.

**Endpoint:** `GET /api/stock/card-image?name=<name>&set=<set>` — `withAuthRead`.

**Lookup logic** (`lib/card-images.ts`, new file):

1. Query `dashboard_cards` for `{ name, set }` → if found with `image_uri`, return `{ image: image_uri, source: "cache" }`.
2. Miss → `fetch("https://api.scryfall.com/cards/named?exact=<name>&set=<set>")`. On success, extract `image_uris.small` (or `card_faces[0].image_uris.small` for DFCs), upsert a minimal doc into `dashboard_cards` (just enough fields to satisfy downstream readers: `scryfall_id`, `name`, `set`, `collector_number`, `image_uri`, `synced_at`).
3. On Scryfall error or 404 → return `{ image: null, source: "notfound" }`. Log via `logApiError`.

**Client behavior — `CardHoverPreview.tsx`:**

- `onMouseEnter` on the icon starts a 150ms timer. If the mouse leaves before the timer fires, cancel.
- On timer fire, fetch the image (if not already in the component-level `Map<string, string | null>` cache keyed by `${name}|${set}`).
- Render a floating panel anchored to the row (absolute-positioned; basic viewport-edge flipping). Panel shows a spinner during fetch, then the image, or a "no image found" placeholder.
- `onMouseLeave` closes the panel immediately. Already-fetched images remain cached for the lifetime of the component.

## 8. Filter / Sort / Pagination UI

**Filters** (all in `StockFilters.tsx`):

- Name (text, debounced 300ms)
- Set (text)
- Condition (select: All + 7 codes)
- Foil (select: Any / Foil / Non-foil)
- Language (text)
- Min price / Max price (numeric)
- Min qty (numeric)
- "Clear filters" button

**Sort:** click any column header. Active column shows up/down chevron. Click again to toggle direction. Sort state lives in `StockContent` and flows into the SWR key.

**Pagination footer:** Prev / Next buttons, page size selector (`25 | 50 | 100 | 200`), "Page X of Y · N results" label.

**State & fetching:**
- All filter + sort + pagination state is local React state in `StockContent`.
- SWR key = `["/api/stock", query]`. Changing any filter resets `page` to 1.
- Loading state: skeleton rows. Empty state: "No stock matches these filters." Error state: inline card showing the server `error` field.

**Not in v1:** URL-synced filters (easy to add later via `useSearchParams`).

## 9. File Manifest

**New:**
- `app/(dashboard)/stock/page.tsx`
- `components/stock/StockContent.tsx`
- `components/stock/StockFilters.tsx`
- `components/stock/StockTable.tsx`
- `components/stock/StockChart.tsx`
- `components/stock/CardHoverPreview.tsx`
- `app/api/stock/route.ts`
- `app/api/stock/summary/route.ts`
- `app/api/stock/history/route.ts`
- `app/api/stock/card-image/route.ts`
- `lib/stock.ts`
- `lib/card-images.ts`
- `scripts/backfill-stock-snapshot.ts` (one-shot)

**Modified:**
- `lib/types.ts` — extend `CmStockSnapshot`
- `lib/cardmarket.ts` — enrich `processStockOverview`, extend compression equality, add stock indexes
- `components/dashboard/sidebar.tsx` — add Stock nav entry

## 10. Testing Notes

- `searchStock` unit: filter construction (empty filter, each field individually, combined), sort whitelist rejection, regex escape.
- Summary aggregation: verify `totalValue` excludes `price <= 0.25`, verify distinct count ignores condition/foil/qty.
- History endpoint: range boundaries (7d/30d/90d/all), empty collection.
- Hover preview: cache hit, cache miss with Scryfall success, Scryfall 404, aborted hover (mouse leaves before timer fires).
- Snapshot compression: equal tuple deletes middle, differing `totalValue` (rounded) does not.

## 11. Risks & Open Questions

- **Scryfall rate limit:** 10 req/s per IP. Hover fetches are one-at-a-time per user action — well within limits. No bulk prefetch.
- **Index cost:** adding four indexes on `dashboard_cm_stock` is cheap at current scale. Monitor index size after deploy.
- **Backfill correctness:** first backfill row uses `extractedAt = now`, so the chart's new lines start "today." The old `totalListings` line is continuous.
- **No retroactive qty/value history:** accepted trade-off — would require storing full listing snapshots, which isn't worth it.
