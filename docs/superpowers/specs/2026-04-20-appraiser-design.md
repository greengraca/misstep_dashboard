# Appraiser — Design Spec

## Context

Misstep currently has a single tool surface (EV Calculator) in the sidebar. This feature adds a second tool — the **Appraiser** — for valuing arbitrary card lots (people's collections offered for sale). The user inputs cards by name or by a Delver Lens CSV, the system resolves them on Scryfall, and live Cardmarket prices flow in via the existing browser extension. Each appraisal is saved as a named collection with a running total and offer tiers for negotiation.

This is a port of the Appraiser in `D:/Projetos/huntinggrounds` minus its photo-upload + Claude Vision path and minus its bookmarklet — both of which are obsolete here because Misstep's own extension already scrapes every Cardmarket product page the user visits.

---

## 1. Sidebar — new `TOOLS` section

Modify `components/dashboard/sidebar.tsx`. Move `EV Calculator` out of `OVERVIEW` into a new `TOOLS` section, and add `Appraiser`.

```
OVERVIEW    Home, Stock
TOOLS       EV Calculator (Calculator), Appraiser (Scale)   ← new section
MANAGEMENT  Finance, Cardmarket, Storage
TEAM        Meetings, Tasks
SYSTEM      Activity, Storage Setup
```

- Appraiser icon: `Scale` from lucide-react.
- Route: `/appraiser`.

---

## 2. Routes

Page: `app/(dashboard)/appraiser/page.tsx` (client component — the whole page is stateful).

API (all wrapped with `withAuth` from `lib/api-helpers.ts`):

| Route | Method | Purpose |
|---|---|---|
| `/api/appraiser/collections` | GET | List collections with `{ _id, name, notes, cardCount, totalTrend, totalFrom, updatedAt }` |
| `/api/appraiser/collections` | POST | Create collection `{ name, notes? }` |
| `/api/appraiser/collections/[id]` | GET | Collection + its cards |
| `/api/appraiser/collections/[id]` | PUT | Update `{ name?, notes? }` |
| `/api/appraiser/collections/[id]` | DELETE | Delete collection + cascade-delete its cards |
| `/api/appraiser/collections/[id]/cards` | POST | Add cards `{ cards: [{ name, set?, collectorNumber?, qty?, foil?, language? }] }`. Resolves each via Scryfall, dedupes within the collection, inserts, returns the new card docs |
| `/api/appraiser/collections/[id]/cards/[cardId]` | PUT | Update a card (qty, set, CN, foil, language, manual prices) |
| `/api/appraiser/collections/[id]/cards/[cardId]` | DELETE | Remove a card |
| `/api/appraiser/collections/[id]/refresh` | POST | Reset all cards' `cm_prices.updatedAt` to force re-scrape on next CM visit + re-fetch Scryfall |
| `/api/appraiser/card-price` | GET | `?name=&set=&collector_number=&foil=` → Scryfall resolver; returns `{ name, set, setName, collectorNumber, scryfallId, cardmarket_id, cardmarketUrl, imageUrl, trendPrice, printings[] }` |

No CSV endpoint — CSV is parsed client-side and posted as the same `{ cards: [...] }` shape to the existing `/cards` endpoint.

---

## 3. Data model

### `dashboard_appraiser_collections`

```
{
  _id,
  name: string,
  notes: string (default: ''),       // free-text — "Bought from Pedro 15.04", "Asking 180€"
  createdAt: Date,
  updatedAt: Date,
}
```

Index: none needed beyond `_id`.

### `dashboard_appraiser_cards`

```
{
  _id,
  collectionId: ObjectId,           // ref → dashboard_appraiser_collections
  name: string,
  set: string,                      // Scryfall set code, lowercase
  setName: string,
  collectorNumber: string,
  language: string (default: 'English'),
  foil: boolean (default: false),
  qty: number (default: 1),

  scryfallId: string,
  cardmarket_id: number | null,     // ← Scryfall's card.cardmarket_id; the join key for extension scrapes
  cardmarketUrl: string,            // purchase_uris.cardmarket
  imageUrl: string,

  trendPrice: number | null,        // from Scryfall prices.eur / eur_foil
  fromPrice: number | null,         // from CM scrape (cm_prices.from)
  pricedAt: Date | null,            // last scrape timestamp

  // CM scrape snapshot (same shape as ev_cards.cm_prices.{nonfoil|foil} — stored flat here since a card doc is already variant-specific via foil:boolean)
  cm_prices: {
    from?, trend?, avg30d?, avg7d?, avg1d?, available?, chart?, updatedAt?
  } | null,

  status: 'pending' | 'priced' | 'error' | 'manual',
  createdAt: Date,
}
```

Indexes:
- `collectionId` (for table reads)
- `{ cardmarket_id: 1, foil: 1 }` (for the extension-sync fan-out in `processCardPrices`)
- compound `{ collectionId, name, set, collectorNumber, foil }` (within-collection dedup)

---

## 4. Pricing flow (no bookmarklet, no extension changes)

1. **Add card** — user types a name / pastes a line / drops a CSV row. Server calls Scryfall (port HG's `api/card-price.js` resolver). Card doc is written with `trendPrice: scryfall.prices.eur` (or `eur_foil`), `fromPrice: null`, `status: 'priced'`, plus all Scryfall metadata including `cardmarket_id`. Trend shows instantly.
2. **Card name is a link** to `cardmarketUrl` (target=_blank, rel=noopener). A small external-link icon indicates it opens CM.
3. **User clicks** → CM product page opens in a new tab. The extension's `card-prices.js` extractor runs automatically on product pages (already implemented in `misstep-ext/content/extractors/card-prices.js`) and POSTs to `/api/ext/sync` with `{ type: 'card_prices', data: { productId, isFoil, prices: {from, trend, avg30d, avg7d, avg1d}, available, chart, pageUrl } }`.
4. **`processCardPrices` fan-out** — in `lib/cardmarket.ts`, after the existing `dashboard_ev_cards` `updateOne`, add a second write:
   ```
   await db.collection('dashboard_appraiser_cards').updateMany(
     { cardmarket_id: productId, foil: isFoil },
     { $set: { cm_prices: snapshot, fromPrice: prices.from ?? null, trendPrice: prices.trend ?? trendPrice, pricedAt: now, status: 'priced' } }
   );
   ```
   This only writes when matching docs exist, so the EV-only path is unaffected.
5. **Appraiser page polling** — SWR on `/api/appraiser/collections/[id]` with `refreshInterval: 3000` while any card has `fromPrice === null && status !== 'error'`, else `0`. User sees From/Trend/Avg populate seconds after the click.

### Refresh button

`POST /api/appraiser/collections/[id]/refresh` re-runs the Scryfall resolver for every card (refreshing Scryfall Trend) and clears `cm_prices` + `fromPrice` + sets `status: 'pending'` on all cards. CM prices stay blank until the user revisits each product page — the button does not call out to Cardmarket itself. UX note: Refresh is mostly useful for Scryfall-side drift; day-to-day From/Trend are kept fresh by the per-card CM click-through.

---

## 5. Card input — text + CSV

Port HG's `AppraiserInput.tsx` into `components/appraiser/AppraiserInput.tsx`, stripping the photo upload path. Two input modes, shared drop zone:

### Text
- Textarea; one card per line.
- Parser (preserve HG's) supports:
  - `Lightning Bolt`
  - `4 Lightning Bolt`
  - `MH3 332`, `mh3/332`, `MH3-332` (set + collector number)
  - `PLST LRW-256` (PLST format)
  - `2 MH3 332` (qty + set + number)

### CSV (Delver Lens)
- Drop zone accepts `.csv` files (drag-and-drop or click-to-browse).
- Client-side parse with PapaParse (added as a dependency — ~45 kB gz; already common in Next.js stacks).
- **Column mapping is a stub until the user provides the sample CSV.** Placeholder error: `"Unknown CSV format — send a sample so we can wire the column mapping."` The mapping function is a single swap-in point (`lib/appraiser/delver-csv.ts` → `parseDelverCsv(text: string): CardInput[]`).
- Parsed rows are POSTed to `/cards` in batches (same endpoint as text).

### Drop zone
- CSV only (images are out of scope).
- UI states: idle ("Drop a Delver Lens CSV or click to browse"), dragging ("Drop CSV"), parsing ("Parsing N rows..."), error.

---

## 6. Table

`components/appraiser/AppraiserCardTable.tsx` — port HG's table nearly verbatim with these changes:

- **Name cell** is a link to `cardmarketUrl` (when present), opens new tab. Tiny "↗" icon.
- **Foil cell** uses `<FoilStar />` from `components/dashboard/cm-sprite.tsx` (not the `F` text pill). Click to toggle; toggling clears prices and sets `status: 'pending'` so the next CM visit re-fills.
- **Columns**: Name · Set / CN (click-to-edit) · Lang (CM flag sprite) · Foil (`<FoilStar />` toggle) · Qty (click-to-edit) · From · Trend · Offer -N% (dropdown: 5/10/15/20) · Remove.
- **Shimmer** on price cells while the card is `status: 'pending'` or while we're polling for an unscraped From.
- **Printings picker** appears when the Scryfall resolver returns multiple printings and the user hasn't pinned one.
- **Summary bar (sticky bottom)**: total cards, total From, total Trend, offer tiers (-5 / -10 / -15 / -20% of total From), Copy-to-clipboard button (produces a TSV the user can paste into a Cardmarket message or spreadsheet).

---

## 7. Collection selector

`components/appraiser/CollectionSelector.tsx` — port HG's selector, add a notes textarea below the action row:

```
┌──────────────────────────────────────────────────────────────┐
│ [Collection ▾]  [Refresh] [Rename] [Delete]                   │
│ Notes: [  textarea, auto-saved on blur                      ] │
│ [New collection name...] [Create]                             │
└──────────────────────────────────────────────────────────────┘
```

Notes field is a single textarea, auto-saves on blur via PUT. Empty state: "Jot down asking price, seller, deadline…"

---

## 8. Component & file layout (new)

```
app/
  (dashboard)/appraiser/page.tsx
  api/appraiser/
    collections/route.ts                              GET / POST
    collections/[id]/route.ts                         GET / PUT / DELETE
    collections/[id]/cards/route.ts                   POST
    collections/[id]/cards/[cardId]/route.ts          PUT / DELETE
    collections/[id]/refresh/route.ts                 POST
    card-price/route.ts                               GET (Scryfall resolver)

components/appraiser/
  Appraiser.tsx                 main container
  CollectionSelector.tsx        collection CRUD + notes
  AppraiserInput.tsx            text + CSV drop zone
  AppraiserCardTable.tsx        card list + summary

lib/appraiser/
  delver-csv.ts                 parseDelverCsv — stub until sample arrives
  scryfall-resolve.ts           server-side Scryfall lookup (ported from HG)
  types.ts                      AppraiserCollection, AppraiserCard, CardInput
```

Modified:
- `components/dashboard/sidebar.tsx` — new TOOLS section.
- `lib/cardmarket.ts` (`processCardPrices`) — add the `dashboard_appraiser_cards.updateMany` fan-out.
- `package.json` — add `papaparse` + `@types/papaparse`.

---

## 9. Auth

All appraiser routes use `withAuth` (dashboard session). The extension sync stays on `withExtAuth` — the fan-out inside `processCardPrices` is server-internal.

---

## 10. Verification plan

1. Sidebar — TOOLS section shows EV Calc + Appraiser, EV still works.
2. Landing on `/appraiser` with no collection shows empty-state prompting create.
3. Create / rename / delete collection — cascades card deletion.
4. Notes auto-save on blur, visible across refreshes.
5. Add a card by name — Trend populates from Scryfall instantly.
6. Click the card name — CM page opens; within ~5s the From price appears in the table without a refresh.
7. Toggle foil on a card that has foil prices on CM — re-click the CM link → foil From/Trend populates.
8. Drop a (sample) Delver Lens CSV — parsed rows hit the same add path (test once sample arrives).
9. Offer dropdown (-5/-10/-15/-20) changes the Offer column + summary in sync.
10. Copy button produces a pastable TSV block.
11. Deleting a collection removes all its cards from `dashboard_appraiser_cards`.
12. `processCardPrices` still updates `dashboard_ev_cards` correctly for EV-scope cards (regression check).
13. `npx tsc --noEmit` passes.

---

## 11. Out of scope (explicitly cut vs HG)

- No photo upload / Claude Vision / `/api/identify-cards` / `ANTHROPIC_API_KEY`.
- No bookmarklet — the extension supersedes it.
- No server-side CM page fetch (HG designed it but never shipped; we don't need it at all).

---

## 12. Open items

- **Delver Lens CSV column mapping** — blocked on user providing a sample CSV. The single swap-in point is `lib/appraiser/delver-csv.ts#parseDelverCsv`.
- **DFC / split-card name resolution** — Misstep already has this as an Open TODO in root CLAUDE.md. The Scryfall resolver should apply the same "retry with `^<name> // ` regex on miss" logic; we can reuse once that TODO lands, or implement it inline here and feed the pattern back.
