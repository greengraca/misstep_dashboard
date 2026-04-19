# Fixed-Pool Products in EV Calculator

**Date:** 2026-04-19
**Status:** Design approved, awaiting implementation plan
**Scope:** Add preconstructed / fixed-content products (Planeswalker Decks, Commander precons, Starter/Welcome Decks, Duel Decks, Challenger Decks) to the EV calculator as a separate product class alongside booster sets.

## Problem

The EV calculator today only models booster boxes: random slot outcomes, Monte Carlo simulation, deterministic expected value across a random card pool. Many MTG products have *fixed* card pools — every copy of Amonkhet Planeswalker Deck: Liliana contains the same 60 cards + 2 set boosters. The current `ev_sets`-centric schema, booster config, and `calculateEv` function don't represent this product class.

João wants to add these products one at a time, on demand, with a seeding workflow that is systematic and repeatable.

## Goals

- Model fixed-pool products as first-class entities with their own collection, API, and UI.
- Reuse existing `dashboard_ev_cards` pricing (Scryfall `price_eur` / `price_eur_foil`) — no new pricing source.
- Support products that ship with sealed boosters, showing both "flip sealed" and "open and sell singles" valuations side by side.
- Provide a skill-driven seeding workflow that handles pre-2020 parent sets and foil-promo printings correctly.
- Snapshot product EV on the same cadence as set EV so trends are visible over time.

## Non-Goals

- Bundles, Secret Lairs, From the Vault, gift boxes. Reconsider in phase 2.
- Automated decklist ingestion (MTGJSON / Scryfall product data). Manual seed only.
- Monte Carlo simulation (deterministic pool → single EV number).
- Per-product config modals or complex UI for editing decklists (re-seed with overwrite instead).
- Full version history of products (seed overwrite bumps `seeded_at`, no history).

## § 1 — Data Model

New collection: `dashboard_ev_products`. Separate from `ev_sets` because products lack `card_count`, booster config, `play_ev_net` / `collector_ev_net`, and Scryfall `set_type`; overloading `ev_sets` would force every query to carry null-branches.

```ts
interface EvProduct {
  slug: string;                      // "akh-pw-deck-liliana" — unique
  name: string;                      // "Amonkhet Planeswalker Deck — Liliana"
  product_type:
    | "planeswalker_deck"
    | "commander"
    | "starter"
    | "welcome"
    | "duel"
    | "challenger"
    | "other";
  release_year: number;              // 2017
  parent_set_code?: string;          // "akh" — optional, for UI grouping
  cards: EvProductCard[];            // full decklist
  included_boosters?: IncludedBooster[];
  image_uri?: string;                // product-image, optional
  notes?: string;
  seeded_at: Date;
}

interface EvProductCard {
  scryfall_id: string;               // exact printing, including foil-promo variants
  name: string;                      // denormalised for readability
  set_code: string;                  // may differ from parent_set_code (promos, reprints)
  count: number;                     // usually 1; basic lands can be up to ~24
  is_foil: boolean;
  role?: "foil_premium_pw" | "commander" | "key_card";
}

interface IncludedBooster {
  set_code: string;                  // must already exist in ev_sets
  count: number;
  sealed_price_eur?: number;         // user-entered, optional — omit if unknown
}
```

**Indexes:**
- `{ slug: 1 }` unique
- `{ parent_set_code: 1 }` for UI grouping

## § 2 — Pricing and Data Flow

Prices come from the existing `dashboard_ev_cards` collection; no new pricing source.

**Per-card lookup (at EV calc time):**
```
card.price = lookup(ev_cards, scryfall_id).price_eur_foil if is_foil else .price_eur
```

**Parent-set sync requirement:** every `scryfall_id` referenced by a product must resolve in `ev_cards`. For a 2017 product, Amonkhet's cards must be synced. The existing `MIN_RELEASE_YEAR = 2020` filter is *UI-level only* (affects the EV set list); the `syncCards(setCode)` function already works for any set. The seed skill will:

1. Check `parent_set_code`'s cards exist in `ev_cards`.
2. If missing, run `syncSet(code)` + `syncCards(code)` for the parent, plus any auxiliary set referenced by cards (e.g., `pakh` for the foil premium Liliana).
3. Verify every `scryfall_id` in the decklist resolves before persisting.

**Ongoing price updates:** the existing 3-day Scryfall sync workflow (`.github/workflows/ev-sync.yml` → `refreshAllScryfall`) refreshes every set registered in `ev_sets`. Any set pulled in as a product prerequisite must also be registered there so it's included in the cron's refresh loop; otherwise product prices freeze at seed time.

**Foil Premium Planeswalker handling:** these cards have a distinct `scryfall_id` in a promo set (e.g., `pakh`). The seed skill resolves them by filtering on `promo_types: ["planeswalker_deck"]` and / or set code `p<parent>`. Stored in `cards[]` with `is_foil: true` and `role: "foil_premium_pw"`.

**Included-booster EV:** dual-valuation — the skill stores `sealed_price_eur` when known; "opened" EV is always computed at calc time from the latest `play_ev_net` snapshot for the booster's set. See § 3.

## § 3 — EV Calculation

New function in `lib/ev.ts`:

```ts
function calculateProductEv(
  product: EvProduct,
  cards: EvCard[],                         // subset of ev_cards, already filtered to product.cards scryfall_ids
  options: { feeRate: number; boosterEvBySet?: Record<string, number> }
): EvProductResult
```

**Algorithm:**
```
cardById = Map(cards by scryfall_id)

cardsTotal = 0
cardBreakdown = []
for each pc in product.cards:
  c = cardById.get(pc.scryfall_id)
  price = pc.is_foil ? c?.price_eur_foil : c?.price_eur
  line = (price ?? 0) * pc.count
  cardsTotal += line
  cardBreakdown.push({ ...pc, unit_price: price, line_total: line })

boostersSealedTotal = 0; sealedAvailable = true
boostersOpenedTotal = 0; openedAvailable = true
for each ib in product.included_boosters ?? []:
  if ib.sealed_price_eur !== undefined:
    boostersSealedTotal += ib.sealed_price_eur * ib.count
  else:
    sealedAvailable = false

  openedUnit = boosterEvBySet?.[ib.set_code]
  if openedUnit !== undefined:
    boostersOpenedTotal += openedUnit * ib.count
  else:
    openedAvailable = false

hasBoosters = (product.included_boosters?.length ?? 0) > 0

gross_sealed = cardsTotal + boostersSealedTotal
gross_opened = cardsTotal + boostersOpenedTotal
```

**Design notes:**
- **No `siftFloor`.** Products contain known cards; the "dust the commons" heuristic doesn't apply.
- **No Monte Carlo.** Deterministic pool → single EV number. No `simulate` route.
- **`fee_rate`** pulled from global `ev_config`, same as existing booster calc.

**Return shape:**
```ts
interface EvProductResult {
  slug: string;
  name: string;
  product_type: EvProduct["product_type"];
  card_count_total: number;               // sum of counts
  unique_card_count: number;
  cards_subtotal_gross: number;
  boosters: {
    count_total: number;
    sealed: { available: boolean; gross: number; net: number };
    opened: { available: boolean; gross: number; net: number };
  } | null;                               // null when the product has no included boosters
  totals: {
    sealed: { gross: number; net: number } | null;
    opened: { gross: number; net: number } | null;
    cards_only: { gross: number; net: number };  // always present
  };
  fee_rate: number;
  card_breakdown: Array<EvProductCard & { unit_price: number | null; line_total: number }>;
  booster_breakdown: Array<IncludedBooster & { opened_unit_ev: number | null }>;
  missing_scryfall_ids: string[];         // scryfall_ids in product.cards with no match in ev_cards — UI flags these
}
```

## § 4 — Seed Skill Workflow

New skill: `add-ev-product` (trigger phrases: "add an EV product", "seed a new precon").

**Interactive flow (one prompt at a time):**

1. **Product identity**
   - Name, type (enum), release year, parent set code (optional).
   - Auto-derive slug: `{parent_set_code}-{type_short}-{kebab(name_tail)}` → confirm with user.

2. **Parent-set prerequisite check**
   - If `parent_set_code` missing from `ev_sets`: run `scripts/sync-ev-set.ts <code>` (see § 5). Report count of cards added.

3. **Decklist collection**
   - User pastes decklist, format: `<count> [*F*] <name>` per line.
   - Example:
     ```
     1 *F* Liliana, Death's Majesty
     1 Oashra Cultivator
     24 Swamp
     ```

4. **Scryfall resolution (per card)**
   - Primary: `cards/named?exact=<name>&set=<parent>`.
   - Fallback: `cards/search?q=!"<name>"`.
   - Disambiguation rules, in order:
     1. Foil premium PW: filter `promo_types includes "planeswalker_deck"` and set like `p<parent>`.
     2. `is_foil: true` with no match in parent: try `p<parent>` promo set.
     3. Default: earliest printing in parent set.
   - Present resolved list for human review; any ambiguity halts and asks for explicit Scryfall URL.

5. **Included boosters (if any)**
   - Ask y/n. If yes: collect `[{ set_code, count, sealed_price_eur? }]`.
   - Verify each booster's `set_code` is in `ev_sets` and has a recent snapshot with `play_ev_net`. Prompt to run a snapshot if missing.

6. **Preview**
   - Show assembled `EvProduct` JSON.
   - Run `calculateProductEv` with live data and display: Cards only / + Sealed / + Opened / missing-card count.
   - Ask to confirm.

7. **Persist**
   - `POST /api/ev/products` (PIN-authed). Confirm slug + detail URL.

**Idempotency:** seeding with an existing slug returns 409 unless `--overwrite` is passed; overwrite bumps `seeded_at`.

**Failure handling:** any unresolved card in step 4 halts the workflow before any DB write.

## § 5 — API Routes

New namespace `app/api/ev/products/`:

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `GET` | `/api/ev/products` | List products with latest EV (cards-only + sealed + opened) for the Products tab. | `withAuthRead` |
| `GET` | `/api/ev/products/[slug]` | Full product detail: decklist, per-card prices, included boosters, fresh EV calc. | `withAuthRead` |
| `POST` | `/api/ev/products` | Create or overwrite (body = `EvProduct` minus `seeded_at`). Called by seed skill. | `withAuthWrite` |
| `DELETE` | `/api/ev/products/[slug]` | Remove product (does not touch `ev_cards`). | `withAuthWrite` |
| `POST` | `/api/ev/products/[slug]/snapshot` | Manual single-product snapshot trigger. | `withAuthWrite` |

**Patterns:**
- All routes wrapped via `lib/api-helpers.ts`.
- Errors via `logApiError`; writes via `logActivity` (fire-and-forget with `after()`).

**Prerequisite sync is a script, not an API route:** the seed skill invokes `scripts/sync-ev-set.ts <code>` to pull in pre-2020 parent sets. This matches the existing pattern (`scripts/apply-ev-indexes.ts`, `scripts/classify-sync2.ts`) and keeps the API surface lean. Seeding is inherently local-admin work, so local-only is acceptable.

**Intentionally omitted (YAGNI):**
- `PUT` for partial edits — overwrite via `POST` is enough (skill is the only writer).
- `simulate` — deterministic only.
- Per-product config endpoint — `fee_rate` comes from global `ev_config`.

## § 6 — UI

**EV page (`app/(dashboard)/ev/page.tsx`):** adds a tab strip above the set grid.

```
┌─ EV Calculator ────────────────────────────────────────┐
│  [ Sets ]  [ Products ]                                │
│                                                        │
│  (existing set grid)  |  (new product grid)            │
└────────────────────────────────────────────────────────┘
```

Tab state via local `useState`, persisted to URL as `?view=products` for deep-linkability.

**Products tab card:**
```
┌──────────────────────────────┐
│  [product image]             │
│  Amonkhet PW Deck — Liliana  │
│  PW DECK · 2017              │
│  ─────────────────────────    │
│  Cards:       €24.50         │
│  + sealed:    €29.50         │  (hidden when sealed not available)
│  + opened:    €41.20         │  (hidden when opened not available)
└──────────────────────────────┘
```

Products without boosters show only the "Cards" line.

**Product detail route `/ev/product/[slug]`** — four stacked sections:

1. **Header:** name, type badge, release year, parent-set link, image, 3-column totals summary (Cards only / + Sealed / + Opened, gross + net).
2. **Decklist table:** card, count, set code, foil indicator, unit price, line total. Sorted by line total desc. `missing_scryfall_ids` highlighted red at top. Role-flagged cards pinned.
3. **Included boosters section:** set, count, sealed price (read-only — re-seed the product to change), opened EV (link to parent set detail).
4. **EV history chart:** line chart of `ev_net_sealed` / `ev_net_opened` / `ev_net_cards_only` over time, reusing the existing snapshot chart component with series toggles.

**Component reuse:** card images, treatment badges, tab primitive, totals summary card — all from existing `components/ev/*` and `components/dashboard/*`. No new dependencies.

**Empty state (zero products):** "No products yet. Ask Claude to 'add an EV product' to seed one."

**Out of scope for v1:** inline decklist editing, inline sealed-price editing, sorting/filtering the product grid, bulk snapshot button.

## § 7 — Snapshots and Scheduled Jobs

**Collection:** reusing `dashboard_ev_snapshots` with a discriminator field.

**Schema additions:**
```ts
interface EvSnapshot {
  date: string;                 // "2026-04-19"
  set_code?: string;            // set path (existing docs)
  product_slug?: string;        // product path (new)
  ev_net_sealed?: number;       // products only
  ev_net_opened?: number;       // products only
  ev_net_cards_only?: number;   // products only
  play_ev_net?: number;         // sets only (existing)
  collector_ev_net?: number;    // sets only (existing)
  fee_rate: number;
  created_at: Date;
}
```

Exactly one of `set_code` / `product_slug` is set per document.

**Indexes:**
- Drop existing `{ set_code: 1, date: 1 }`.
- Add compound `{ set_code: 1, product_slug: 1, date: 1 }` unique. MongoDB indexes absent fields as `null`; since exactly one of `set_code` / `product_slug` is populated per document, the tuple `(code, null, date)` or `(null, slug, date)` is unique per entity per day.
- Add `{ product_slug: 1, date: -1 }` for the history chart.

**Read paths:**
- `getSets()`: unchanged — callers already filter set-only docs implicitly via `set_code` lookups.
- New `getProducts()`: filters on `product_slug != null`.
- History chart scopes by whichever field is present.

**Snapshot generation:** extend `generateAllSnapshots` in `lib/ev.ts`:
```
existing loop over configured sets → unchanged (runs first)
new loop over dashboard_ev_products:
  for each product:
    cards = ev_cards matching product.cards scryfall_ids
    boosterEvBySet = latestSnapshot play_ev_net keyed by set_code for each included booster
    result = calculateProductEv(product, cards, { feeRate, boosterEvBySet })
    upsert snapshot { product_slug, date, ev_net_sealed, ev_net_opened, ev_net_cards_only, fee_rate }
```

Sets run before products because product "opened" EV reads the set's `play_ev_net` snapshot. Serial execution, no parallelism.

**Scheduled execution:** the existing `.github/workflows/ev-sync.yml` workflow already calls `/api/ev/snapshots/generate` after the Scryfall sync. With the loop extension above, products snapshot automatically on the same 3-day cadence. No new cron needed.

**Manual triggers:**
- Existing `POST /api/ev/snapshots/generate` (and the EV UI button) cover both sets and products.
- `POST /api/ev/products/[slug]/snapshot` for per-product snapshots (useful right after seeding).

**TTL / retention:** none. At ~150 products × 365 days = ~55k docs/year, ~1–2 KB each → ~100 MB/year. Fine without TTL.

**Backfill:** post-v1 candidate — `scripts/backfill-product-snapshots.ts` using `ev_card_prices` (existing 3-day price history) to reconstruct historical product EVs.

## Build Sequence

1. Data model: type definitions (`lib/types.ts` or new `lib/ev-product-types.ts`), collection name constant, indexes function.
2. EV calc: `calculateProductEv` in `lib/ev.ts` with unit tests.
3. Script: `scripts/sync-ev-set.ts` for pre-2020 parent sets.
4. API routes: GET list, GET detail, POST create/overwrite, DELETE, POST snapshot.
5. Snapshot generation: extend `generateAllSnapshots` + index migration.
6. UI: EV page tabs, Products tab grid, product detail page, history chart integration.
7. Skill: `add-ev-product` with interactive prompts and Scryfall resolution helpers.
8. Seed first real product (Amonkhet PW Deck: Liliana) end-to-end as the acceptance test.

## Open Questions for Implementation Plan

- Exact location of skill files (repo-local `.claude/skills/` vs user-global).
- Whether to add a `components/ev/ProductCard.tsx` now or fold into existing `EvSetCard` with a variant prop. Lean toward separate component for clarity.
- Snapshot index migration: run via new `scripts/apply-ev-indexes.ts` entry or a fresh migration script.
