# Appraiser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a collection-based card appraiser at `/appraiser` that resolves cards via Scryfall, pulls live Cardmarket prices via click-through to the existing extension scrape, and supports text + Delver Lens CSV input.

**Architecture:** Client page under `app/(dashboard)/appraiser/`, REST API under `app/api/appraiser/`, two Mongo collections (`dashboard_appraiser_collections` + `dashboard_appraiser_cards`). The extension's existing `card-prices.js` scraper requires no changes — `processCardPrices` in `lib/cardmarket.ts` gains a second `updateMany` that fans out scrape results to appraiser cards keyed by `{ cardmarket_id, foil }`.

**Tech Stack:** Next.js 16 App Router, TypeScript, MongoDB native driver, SWR, Vitest, lucide-react (icons), papaparse (CSV), `<FoilStar />` from `components/dashboard/cm-sprite.tsx`.

**Spec:** `docs/superpowers/specs/2026-04-20-appraiser-design.md`

**Commit convention:** NEVER add `Co-Authored-By` lines. No Claude/Anthropic attribution. Follow the short, scope-prefixed style of recent commits (`feat:`, `fix:`, `chore:`).

---

## File Structure

**Create:**
- `app/(dashboard)/appraiser/page.tsx` — client page shell
- `app/api/appraiser/collections/route.ts` — GET list, POST create
- `app/api/appraiser/collections/[id]/route.ts` — GET one, PUT update, DELETE cascade
- `app/api/appraiser/collections/[id]/cards/route.ts` — POST batch add
- `app/api/appraiser/collections/[id]/cards/[cardId]/route.ts` — PUT update, DELETE remove
- `app/api/appraiser/collections/[id]/refresh/route.ts` — POST re-resolve + clear CM prices
- `app/api/appraiser/card-price/route.ts` — GET Scryfall resolver
- `components/appraiser/Appraiser.tsx` — main container
- `components/appraiser/CollectionSelector.tsx` — selector + CRUD + notes
- `components/appraiser/AppraiserInput.tsx` — textarea + CSV drop zone
- `components/appraiser/AppraiserCardTable.tsx` — card list + summary bar
- `lib/appraiser/types.ts` — AppraiserCollection, AppraiserCard, CardInput
- `lib/appraiser/scryfall-resolve.ts` — server-side Scryfall lookup (pure)
- `lib/appraiser/delver-csv.ts` — Delver Lens CSV parser stub (pure)
- `lib/__tests__/scryfall-resolve.test.ts`
- `lib/__tests__/delver-csv.test.ts`
- `lib/__tests__/cardmarket-appraiser-fanout.test.ts`

**Modify:**
- `components/dashboard/sidebar.tsx` — add TOOLS section, move EV, add Appraiser
- `lib/cardmarket.ts` — extend `processCardPrices` with appraiser fan-out
- `package.json` — add `papaparse` + `@types/papaparse`

---

## Task 1: Install dependencies + create skeleton

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install papaparse**

Run:
```bash
npm install papaparse
npm install -D @types/papaparse
```

Expected: `package.json` gets `papaparse` in dependencies, `@types/papaparse` in devDependencies.

- [ ] **Step 2: Verify typecheck still passes**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(appraiser): add papaparse for CSV import"
```

---

## Task 2: Types + constants

**Files:**
- Create: `lib/appraiser/types.ts`

- [ ] **Step 1: Write the types file**

```typescript
// lib/appraiser/types.ts
import type { ObjectId } from "mongodb";

export const COL_APPRAISER_COLLECTIONS = "dashboard_appraiser_collections";
export const COL_APPRAISER_CARDS = "dashboard_appraiser_cards";

export interface AppraiserCollectionDoc {
  _id: ObjectId;
  name: string;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AppraiserCollection {
  _id: string;
  name: string;
  notes: string;
  cardCount: number;
  totalTrend: number;
  totalFrom: number;
  createdAt: string;
  updatedAt: string;
}

export interface CmPricesSnapshot {
  from?: number;
  trend?: number;
  avg30d?: number;
  avg7d?: number;
  avg1d?: number;
  available?: number;
  chart?: Array<{ date: string; avg_sell: number }>;
  updatedAt?: string;
}

export interface AppraiserCardDoc {
  _id: ObjectId;
  collectionId: ObjectId;
  name: string;
  set: string;
  setName: string;
  collectorNumber: string;
  language: string;
  foil: boolean;
  qty: number;
  scryfallId: string;
  cardmarket_id: number | null;
  cardmarketUrl: string;
  imageUrl: string;
  trendPrice: number | null;
  fromPrice: number | null;
  pricedAt: Date | null;
  cm_prices: CmPricesSnapshot | null;
  status: "pending" | "priced" | "error" | "manual";
  createdAt: Date;
}

export interface AppraiserCard {
  _id: string;
  collectionId: string;
  name: string;
  set: string;
  setName: string;
  collectorNumber: string;
  language: string;
  foil: boolean;
  qty: number;
  scryfallId: string;
  cardmarket_id: number | null;
  cardmarketUrl: string;
  imageUrl: string;
  trendPrice: number | null;
  fromPrice: number | null;
  pricedAt: string | null;
  cm_prices: CmPricesSnapshot | null;
  status: "pending" | "priced" | "error" | "manual";
}

export interface CardInput {
  name: string;
  set?: string;
  collectorNumber?: string;
  qty?: number;
  foil?: boolean;
  language?: string;
}

export interface ScryfallPrinting {
  set: string;
  setName: string;
  scryfallId: string;
  collectorNumber: string;
  cardmarketId: number | null;
  cardmarketUrl: string;
  imageUrl: string;
  trendPrice: number | null;
}

export interface ScryfallResolveResult {
  name: string;
  set: string;
  setName: string;
  collectorNumber: string;
  scryfallId: string;
  cardmarketId: number | null;
  cardmarketUrl: string;
  imageUrl: string;
  trendPrice: number | null;
  foilOnly: boolean;
  printings: ScryfallPrinting[];
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add lib/appraiser/types.ts
git commit -m "feat(appraiser): shared types + collection name constants"
```

---

## Task 3: Scryfall resolver — pure lib with tests

**Files:**
- Create: `lib/appraiser/scryfall-resolve.ts`
- Create: `lib/__tests__/scryfall-resolve.test.ts`

The resolver is a thin wrapper around Scryfall's `/cards/named?fuzzy=` and `/cards/search?q=!"name"&unique=prints` endpoints. Ported from `D:/Projetos/huntinggrounds/api/card-price.js`.

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/__tests__/scryfall-resolve.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolveScryfall } from "../appraiser/scryfall-resolve";

const mockCard = {
  id: "abc-123",
  name: "Lightning Bolt",
  set: "mh2",
  set_name: "Modern Horizons 2",
  collector_number: "134",
  cardmarket_id: 555123,
  purchase_uris: { cardmarket: "https://www.cardmarket.com/en/Magic/Products/Singles/Modern-Horizons-2/Lightning-Bolt?idProduct=555123" },
  image_uris: { normal: "https://scry.example/bolt.jpg" },
  prices: { eur: "0.85", eur_foil: "2.50" },
};

const mockPrintings = {
  data: [
    { ...mockCard, id: "abc-123" },
    {
      id: "def-456", name: "Lightning Bolt", set: "fdn", set_name: "Foundations",
      collector_number: "280", cardmarket_id: 900001,
      purchase_uris: { cardmarket: "https://cm.example/fdn-bolt" },
      image_uris: { normal: "https://scry.example/fdn.jpg" },
      prices: { eur: "0.65", eur_foil: null },
    },
  ],
};

function mockFetch(sequence: Array<{ ok: boolean; status?: number; body?: unknown }>) {
  let i = 0;
  return vi.fn(async () => {
    const r = sequence[i++];
    return {
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 404),
      json: async () => r.body,
    } as Response;
  });
}

describe("resolveScryfall", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it("resolves a single printing by fuzzy name", async () => {
    const fetchMock = mockFetch([
      { ok: true, body: mockCard },
      { ok: true, body: mockPrintings },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const promise = resolveScryfall({ name: "Lightning Bolt" });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.name).toBe("Lightning Bolt");
    expect(result.set).toBe("mh2");
    expect(result.cardmarketId).toBe(555123);
    expect(result.trendPrice).toBe(0.85);
    expect(result.cardmarketUrl).toContain("idProduct=555123");
    expect(result.printings).toHaveLength(2);
  });

  it("picks the requested set when multiple printings exist", async () => {
    const fetchMock = mockFetch([
      { ok: true, body: mockCard },
      { ok: true, body: mockPrintings },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const promise = resolveScryfall({ name: "Lightning Bolt", set: "fdn" });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.set).toBe("fdn");
    expect(result.cardmarketId).toBe(900001);
    expect(result.trendPrice).toBe(0.65);
  });

  it("returns eur_foil when foil=true", async () => {
    const fetchMock = mockFetch([
      { ok: true, body: mockCard },
      { ok: true, body: mockPrintings },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const promise = resolveScryfall({ name: "Lightning Bolt", foil: true });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.trendPrice).toBe(2.50);
    expect(result.foilOnly).toBe(false);
  });

  it("flags foilOnly when non-foil price is missing but foil exists", async () => {
    const foilOnlyCard = { ...mockCard, prices: { eur: null, eur_foil: "3.00" } };
    const foilOnlyPrintings = { data: [foilOnlyCard] };
    const fetchMock = mockFetch([
      { ok: true, body: foilOnlyCard },
      { ok: true, body: foilOnlyPrintings },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const promise = resolveScryfall({ name: "Lightning Bolt" });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.trendPrice).toBe(3.00);
    expect(result.foilOnly).toBe(true);
  });

  it("throws when Scryfall returns 404", async () => {
    const fetchMock = mockFetch([{ ok: false, status: 404 }]);
    vi.stubGlobal("fetch", fetchMock);

    const promise = resolveScryfall({ name: "Jace Nonexistent" });
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toThrow(/not found/i);
  });

  it("fast-path: direct set + CN lookup when both provided", async () => {
    const fetchMock = mockFetch([
      { ok: true, body: mockCard },            // direct /cards/mh2/134
      { ok: true, body: mockPrintings },       // prints search
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const promise = resolveScryfall({ name: "Lightning Bolt", set: "mh2", collectorNumber: "134" });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(fetchMock.mock.calls[0][0]).toContain("/cards/mh2/134");
    expect(result.set).toBe("mh2");
  });
});
```

- [ ] **Step 2: Run — should fail (file missing)**

Run: `npm test -- lib/__tests__/scryfall-resolve.test.ts`
Expected: FAIL (resolver file doesn't exist).

- [ ] **Step 3: Implement the resolver**

```typescript
// lib/appraiser/scryfall-resolve.ts
import type { ScryfallPrinting, ScryfallResolveResult } from "./types";

const SCRYFALL_DELAY_MS = 150;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface ScryfallCard {
  id: string;
  name: string;
  set: string;
  set_name: string;
  collector_number?: string;
  cardmarket_id?: number | null;
  purchase_uris?: { cardmarket?: string };
  image_uris?: { normal?: string };
  card_faces?: Array<{ image_uris?: { normal?: string } }>;
  prices?: { eur?: string | null; eur_foil?: string | null };
}

async function scryfallFetch<T>(url: string, retries = 2): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    await sleep(SCRYFALL_DELAY_MS);
    const res = await fetch(url);
    if (res.ok) return (await res.json()) as T;
    if (res.status === 404) throw new Error(`Card not found on Scryfall (${res.status})`);
    if (res.status === 429 && i < retries) { await sleep(1000); continue; }
    if (i >= retries) throw new Error(`Scryfall error ${res.status}`);
  }
  throw new Error("Scryfall retries exhausted");
}

function getImage(card: ScryfallCard): string {
  return card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal || "";
}

function parsePrice(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const n = parseFloat(raw);
  return isNaN(n) ? null : n;
}

export async function resolveScryfall(args: {
  name: string;
  set?: string;
  collectorNumber?: string;
  foil?: boolean;
}): Promise<ScryfallResolveResult> {
  const { name, set, collectorNumber, foil } = args;
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Card name is required");

  let card: ScryfallCard | null = null;

  // Fast path: direct lookup by set + collector number — verify name matches
  if (set && collectorNumber) {
    try {
      const direct = await scryfallFetch<ScryfallCard>(
        `https://api.scryfall.com/cards/${encodeURIComponent(set.toLowerCase())}/${encodeURIComponent(collectorNumber)}`
      );
      if (direct.name.toLowerCase() === trimmed.toLowerCase()) card = direct;
    } catch {
      // fall through to fuzzy
    }
  }

  if (!card) {
    card = await scryfallFetch<ScryfallCard>(
      `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(trimmed)}`
    );
  }

  const q = encodeURIComponent(`!"${card.name}"`);
  const printingsRes = await scryfallFetch<{ data: ScryfallCard[] }>(
    `https://api.scryfall.com/cards/search?q=${q}&unique=prints&order=released&dir=desc`
  ).catch(() => ({ data: [card as ScryfallCard] }));

  const priceKey: "eur" | "eur_foil" = foil ? "eur_foil" : "eur";
  const fallbackKey: "eur" | "eur_foil" = foil ? "eur" : "eur_foil";

  const printings: ScryfallPrinting[] = printingsRes.data.map((p) => ({
    set: p.set,
    setName: p.set_name,
    scryfallId: p.id,
    collectorNumber: p.collector_number ?? "",
    cardmarketId: p.cardmarket_id ?? null,
    cardmarketUrl: p.purchase_uris?.cardmarket ?? "",
    imageUrl: getImage(p),
    trendPrice: parsePrice(p.prices?.[priceKey]) ?? parsePrice(p.prices?.[fallbackKey]),
  }));

  let selected: ScryfallCard = card;
  if (set && card.set.toLowerCase() !== set.toLowerCase()) {
    const match = printingsRes.data.find((p) => p.set.toLowerCase() === set.toLowerCase());
    if (match) selected = match;
  } else if (!set && collectorNumber) {
    const match = printingsRes.data.find((p) => p.collector_number === collectorNumber);
    if (match) selected = match;
  }

  const primary = parsePrice(selected.prices?.[priceKey]);
  const fallback = parsePrice(selected.prices?.[fallbackKey]);
  const trendPrice = primary ?? fallback;
  const foilOnly = primary === null && fallback !== null && priceKey === "eur";

  return {
    name: selected.name,
    set: selected.set,
    setName: selected.set_name,
    collectorNumber: selected.collector_number ?? "",
    scryfallId: selected.id,
    cardmarketId: selected.cardmarket_id ?? null,
    cardmarketUrl: selected.purchase_uris?.cardmarket ?? "",
    imageUrl: getImage(selected),
    trendPrice,
    foilOnly,
    printings,
  };
}
```

- [ ] **Step 4: Run tests — should pass**

Run: `npm test -- lib/__tests__/scryfall-resolve.test.ts`
Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/appraiser/scryfall-resolve.ts lib/__tests__/scryfall-resolve.test.ts
git commit -m "feat(appraiser): Scryfall resolver with printings + foil handling"
```

---

## Task 4: Delver Lens CSV parser stub with tests

**Files:**
- Create: `lib/appraiser/delver-csv.ts`
- Create: `lib/__tests__/delver-csv.test.ts`

Until a sample Delver Lens CSV arrives, the parser returns a helpful error. This task locks in the interface so the UI integration works immediately and swapping in real column mapping is a one-file change.

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/__tests__/delver-csv.test.ts
import { describe, it, expect } from "vitest";
import { parseDelverCsv, DelverCsvError } from "../appraiser/delver-csv";

describe("parseDelverCsv", () => {
  it("throws DelverCsvError on empty input", () => {
    expect(() => parseDelverCsv("")).toThrow(DelverCsvError);
    expect(() => parseDelverCsv("   \n  ")).toThrow(DelverCsvError);
  });

  it("throws DelverCsvError with 'sample' hint when format is unknown", () => {
    const fakeCsv = "unknown,columns,here\n1,2,3";
    expect(() => parseDelverCsv(fakeCsv)).toThrow(/sample/i);
  });

  it("throws DelverCsvError when headers look like a different app (Moxfield)", () => {
    const moxfield = "Count,Tradelist Count,Name,Edition,Condition\n4,0,Lightning Bolt,mh2,Near Mint";
    expect(() => parseDelverCsv(moxfield)).toThrow(DelverCsvError);
  });
});
```

- [ ] **Step 2: Run — should fail (file missing)**

Run: `npm test -- lib/__tests__/delver-csv.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the stub**

```typescript
// lib/appraiser/delver-csv.ts
import Papa from "papaparse";
import type { CardInput } from "./types";

export class DelverCsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DelverCsvError";
  }
}

// Placeholder — swap in real column mapping once a Delver Lens sample CSV arrives.
// Keep the signature stable: `(csvText) => CardInput[]` on success, throws DelverCsvError on failure.
export function parseDelverCsv(csvText: string): CardInput[] {
  if (!csvText || !csvText.trim()) {
    throw new DelverCsvError("Empty CSV");
  }

  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length && parsed.data.length === 0) {
    throw new DelverCsvError(`CSV parse failed: ${parsed.errors[0].message}`);
  }

  // TODO swap this in once a Delver Lens sample is provided.
  throw new DelverCsvError(
    "Unknown CSV format — send a sample Delver Lens CSV so we can wire the column mapping."
  );
}
```

- [ ] **Step 4: Run tests — should pass**

Run: `npm test -- lib/__tests__/delver-csv.test.ts`
Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/appraiser/delver-csv.ts lib/__tests__/delver-csv.test.ts
git commit -m "feat(appraiser): CSV parser stub pending Delver Lens sample"
```

---

## Task 5: Card-price GET endpoint

**Files:**
- Create: `app/api/appraiser/card-price/route.ts`

Thin wrapper that exposes `resolveScryfall` to the client for the printings dropdown.

- [ ] **Step 1: Implement the route**

```typescript
// app/api/appraiser/card-price/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withAuthRead } from "@/lib/api-helpers";
import { resolveScryfall } from "@/lib/appraiser/scryfall-resolve";

export const GET = withAuthRead(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get("name")?.trim() ?? "";
  if (!name) {
    return NextResponse.json({ error: "Card name is required" }, { status: 400 });
  }

  const set = searchParams.get("set") ?? undefined;
  const collectorNumber = searchParams.get("collector_number") ?? undefined;
  const foil = searchParams.get("foil") === "true";

  try {
    const result = await resolveScryfall({ name, set, collectorNumber, foil });
    return { ...result };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scryfall error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}, "appraiser-card-price");
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Smoke-test manually**

Start dev server: `npm run dev`
Log in at `http://localhost:3025/login`, then in a terminal:
```bash
curl -b cookies.txt "http://localhost:3025/api/appraiser/card-price?name=Lightning+Bolt"
```
Expected: JSON with `name`, `set`, `trendPrice`, `printings[]`.

- [ ] **Step 4: Commit**

```bash
git add app/api/appraiser/card-price/route.ts
git commit -m "feat(appraiser): GET /api/appraiser/card-price Scryfall resolver endpoint"
```

---

## Task 6: Collections — list + create

**Files:**
- Create: `app/api/appraiser/collections/route.ts`

- [ ] **Step 1: Implement the route**

```typescript
// app/api/appraiser/collections/route.ts
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { withAuth, withAuthRead } from "@/lib/api-helpers";
import { getDb } from "@/lib/mongodb";
import { logActivity } from "@/lib/activity";
import {
  COL_APPRAISER_COLLECTIONS,
  COL_APPRAISER_CARDS,
  type AppraiserCollection,
  type AppraiserCollectionDoc,
} from "@/lib/appraiser/types";

export const GET = withAuthRead(async (_req: NextRequest) => {
  const db = await getDb();
  const collections = await db
    .collection<AppraiserCollectionDoc>(COL_APPRAISER_COLLECTIONS)
    .find({})
    .sort({ updatedAt: -1 })
    .toArray();

  if (collections.length === 0) return { collections: [] };

  const ids = collections.map((c) => c._id);
  const agg = await db
    .collection(COL_APPRAISER_CARDS)
    .aggregate([
      { $match: { collectionId: { $in: ids } } },
      {
        $group: {
          _id: "$collectionId",
          cardCount: { $sum: "$qty" },
          totalTrend: { $sum: { $multiply: [{ $ifNull: ["$trendPrice", 0] }, "$qty"] } },
          totalFrom: { $sum: { $multiply: [{ $ifNull: ["$fromPrice", 0] }, "$qty"] } },
        },
      },
    ])
    .toArray();

  const statsById = new Map<string, { cardCount: number; totalTrend: number; totalFrom: number }>();
  for (const a of agg) {
    statsById.set(String(a._id), {
      cardCount: a.cardCount ?? 0,
      totalTrend: a.totalTrend ?? 0,
      totalFrom: a.totalFrom ?? 0,
    });
  }

  const payload: AppraiserCollection[] = collections.map((c) => {
    const stats = statsById.get(String(c._id)) ?? { cardCount: 0, totalTrend: 0, totalFrom: 0 };
    return {
      _id: String(c._id),
      name: c.name,
      notes: c.notes ?? "",
      cardCount: stats.cardCount,
      totalTrend: stats.totalTrend,
      totalFrom: stats.totalFrom,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    };
  });

  return { collections: payload };
}, "appraiser-collections-list");

export const POST = withAuth(async (req: NextRequest, session) => {
  const body = (await req.json()) as { name?: unknown; notes?: unknown };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const notes = typeof body.notes === "string" ? body.notes : "";
  const now = new Date();

  const db = await getDb();
  const result = await db.collection(COL_APPRAISER_COLLECTIONS).insertOne({
    name,
    notes,
    createdAt: now,
    updatedAt: now,
  });

  after(() => logActivity({
    type: "appraiser.collection.create",
    member: session.user?.name ?? "unknown",
    details: { name, id: String(result.insertedId) },
  }));

  return {
    collection: {
      _id: String(result.insertedId),
      name,
      notes,
      cardCount: 0,
      totalTrend: 0,
      totalFrom: 0,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    } satisfies AppraiserCollection,
  };
}, "appraiser-collections-create");
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes. If `logActivity` has a different signature in this repo, adapt the call; see `lib/activity.ts`.

- [ ] **Step 3: Commit**

```bash
git add app/api/appraiser/collections/route.ts
git commit -m "feat(appraiser): collections list + create endpoint"
```

---

## Task 7: Collection [id] — get + update + delete (cascade)

**Files:**
- Create: `app/api/appraiser/collections/[id]/route.ts`

- [ ] **Step 1: Implement the route**

```typescript
// app/api/appraiser/collections/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { ObjectId } from "mongodb";
import { withAuthParams, withAuthReadParams } from "@/lib/api-helpers";
import { getDb } from "@/lib/mongodb";
import { logActivity } from "@/lib/activity";
import {
  COL_APPRAISER_COLLECTIONS,
  COL_APPRAISER_CARDS,
  type AppraiserCard,
  type AppraiserCardDoc,
  type AppraiserCollection,
  type AppraiserCollectionDoc,
} from "@/lib/appraiser/types";

function parseId(id: string): ObjectId | null {
  try { return new ObjectId(id); } catch { return null; }
}

function cardDocToPayload(d: AppraiserCardDoc): AppraiserCard {
  return {
    _id: String(d._id),
    collectionId: String(d.collectionId),
    name: d.name,
    set: d.set,
    setName: d.setName,
    collectorNumber: d.collectorNumber,
    language: d.language,
    foil: d.foil,
    qty: d.qty,
    scryfallId: d.scryfallId,
    cardmarket_id: d.cardmarket_id,
    cardmarketUrl: d.cardmarketUrl,
    imageUrl: d.imageUrl,
    trendPrice: d.trendPrice,
    fromPrice: d.fromPrice,
    pricedAt: d.pricedAt ? d.pricedAt.toISOString() : null,
    cm_prices: d.cm_prices,
    status: d.status,
  };
}

export const GET = withAuthReadParams<{ id: string }>(async (_req, { id }) => {
  const oid = parseId(id);
  if (!oid) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const db = await getDb();
  const c = await db
    .collection<AppraiserCollectionDoc>(COL_APPRAISER_COLLECTIONS)
    .findOne({ _id: oid });
  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const cards = await db
    .collection<AppraiserCardDoc>(COL_APPRAISER_CARDS)
    .find({ collectionId: oid })
    .sort({ createdAt: 1 })
    .toArray();

  const totals = cards.reduce(
    (acc, card) => {
      acc.totalTrend += (card.trendPrice ?? 0) * card.qty;
      acc.totalFrom += (card.fromPrice ?? 0) * card.qty;
      acc.cardCount += card.qty;
      return acc;
    },
    { cardCount: 0, totalTrend: 0, totalFrom: 0 }
  );

  const payload: AppraiserCollection = {
    _id: String(c._id),
    name: c.name,
    notes: c.notes ?? "",
    cardCount: totals.cardCount,
    totalTrend: totals.totalTrend,
    totalFrom: totals.totalFrom,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };

  return { collection: payload, cards: cards.map(cardDocToPayload) };
}, "appraiser-collection-get");

export const PUT = withAuthParams<{ id: string }>(async (req, session, { id }) => {
  const oid = parseId(id);
  if (!oid) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = (await req.json()) as { name?: unknown; notes?: unknown };
  const update: { name?: string; notes?: string; updatedAt: Date } = { updatedAt: new Date() };
  if (typeof body.name === "string") {
    const n = body.name.trim();
    if (!n) return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    update.name = n;
  }
  if (typeof body.notes === "string") update.notes = body.notes;

  const db = await getDb();
  const result = await db
    .collection(COL_APPRAISER_COLLECTIONS)
    .updateOne({ _id: oid }, { $set: update });
  if (result.matchedCount === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  after(() => logActivity({
    type: "appraiser.collection.update",
    member: session.user?.name ?? "unknown",
    details: { id, update },
  }));

  return { ok: true };
}, "appraiser-collection-update");

export const DELETE = withAuthParams<{ id: string }>(async (_req, session, { id }) => {
  const oid = parseId(id);
  if (!oid) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const db = await getDb();
  const collection = await db
    .collection<AppraiserCollectionDoc>(COL_APPRAISER_COLLECTIONS)
    .findOne({ _id: oid });
  if (!collection) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const cardsResult = await db
    .collection(COL_APPRAISER_CARDS)
    .deleteMany({ collectionId: oid });
  await db.collection(COL_APPRAISER_COLLECTIONS).deleteOne({ _id: oid });

  after(() => logActivity({
    type: "appraiser.collection.delete",
    member: session.user?.name ?? "unknown",
    details: { id, name: collection.name, cardsRemoved: cardsResult.deletedCount ?? 0 },
  }));

  return { ok: true, cardsRemoved: cardsResult.deletedCount ?? 0 };
}, "appraiser-collection-delete");
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes. If the `logActivity` signature differs, adapt (look at recent usages in `lib/activity.ts` + any `logActivity(` call site in the repo).

- [ ] **Step 3: Commit**

```bash
git add "app/api/appraiser/collections/[id]/route.ts"
git commit -m "feat(appraiser): collection GET/PUT/DELETE with cascade card deletion"
```

---

## Task 8: Cards — POST batch add

**Files:**
- Create: `app/api/appraiser/collections/[id]/cards/route.ts`

Resolves each card via Scryfall, dedupes within the collection on `{ name, set, collectorNumber, foil }` (merges qty on hit), and inserts the rest.

- [ ] **Step 1: Implement the route**

```typescript
// app/api/appraiser/collections/[id]/cards/route.ts
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { ObjectId } from "mongodb";
import { withAuthParams } from "@/lib/api-helpers";
import { getDb } from "@/lib/mongodb";
import { logActivity } from "@/lib/activity";
import { resolveScryfall } from "@/lib/appraiser/scryfall-resolve";
import {
  COL_APPRAISER_COLLECTIONS,
  COL_APPRAISER_CARDS,
  type AppraiserCard,
  type AppraiserCardDoc,
  type CardInput,
} from "@/lib/appraiser/types";

function parseId(id: string): ObjectId | null {
  try { return new ObjectId(id); } catch { return null; }
}

function cardDocToPayload(d: AppraiserCardDoc): AppraiserCard {
  return {
    _id: String(d._id),
    collectionId: String(d.collectionId),
    name: d.name, set: d.set, setName: d.setName,
    collectorNumber: d.collectorNumber, language: d.language,
    foil: d.foil, qty: d.qty,
    scryfallId: d.scryfallId, cardmarket_id: d.cardmarket_id,
    cardmarketUrl: d.cardmarketUrl, imageUrl: d.imageUrl,
    trendPrice: d.trendPrice, fromPrice: d.fromPrice,
    pricedAt: d.pricedAt ? d.pricedAt.toISOString() : null,
    cm_prices: d.cm_prices, status: d.status,
  };
}

export const POST = withAuthParams<{ id: string }>(async (req, session, { id }) => {
  const oid = parseId(id);
  if (!oid) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = (await req.json()) as { cards?: unknown };
  if (!Array.isArray(body.cards) || body.cards.length === 0) {
    return NextResponse.json({ error: "cards array is required" }, { status: 400 });
  }
  const inputs = body.cards as CardInput[];

  const db = await getDb();
  const collectionExists = await db
    .collection(COL_APPRAISER_COLLECTIONS)
    .findOne({ _id: oid }, { projection: { _id: 1 } });
  if (!collectionExists) return NextResponse.json({ error: "Collection not found" }, { status: 404 });

  const now = new Date();
  const insertedCards: AppraiserCardDoc[] = [];
  const mergedCardIds: string[] = [];
  const errors: Array<{ input: CardInput; error: string }> = [];

  for (const input of inputs) {
    const name = (input.name ?? "").trim();
    if (!name) {
      errors.push({ input, error: "empty name" });
      continue;
    }
    const qty = Math.max(1, Number(input.qty) || 1);
    const foil = !!input.foil;
    const language = (input.language ?? "English").trim() || "English";

    let resolved;
    try {
      resolved = await resolveScryfall({
        name,
        set: input.set,
        collectorNumber: input.collectorNumber,
        foil,
      });
    } catch (err) {
      errors.push({ input, error: err instanceof Error ? err.message : "resolve failed" });
      continue;
    }

    const dedupFilter = {
      collectionId: oid,
      name: resolved.name,
      set: resolved.set,
      collectorNumber: resolved.collectorNumber,
      foil,
    };
    const existing = await db
      .collection<AppraiserCardDoc>(COL_APPRAISER_CARDS)
      .findOne(dedupFilter);

    if (existing) {
      await db.collection(COL_APPRAISER_CARDS).updateOne(
        { _id: existing._id },
        { $inc: { qty } }
      );
      mergedCardIds.push(String(existing._id));
      continue;
    }

    const doc: Omit<AppraiserCardDoc, "_id"> = {
      collectionId: oid,
      name: resolved.name,
      set: resolved.set,
      setName: resolved.setName,
      collectorNumber: resolved.collectorNumber,
      language,
      foil: resolved.foilOnly ? true : foil,
      qty,
      scryfallId: resolved.scryfallId,
      cardmarket_id: resolved.cardmarketId,
      cardmarketUrl: resolved.cardmarketUrl,
      imageUrl: resolved.imageUrl,
      trendPrice: resolved.trendPrice,
      fromPrice: null,
      pricedAt: null,
      cm_prices: null,
      status: "priced",
      createdAt: now,
    };

    const res = await db.collection(COL_APPRAISER_CARDS).insertOne(doc);
    insertedCards.push({ _id: res.insertedId, ...doc } as AppraiserCardDoc);
  }

  // Bump collection updatedAt if anything landed
  if (insertedCards.length || mergedCardIds.length) {
    await db.collection(COL_APPRAISER_COLLECTIONS).updateOne(
      { _id: oid },
      { $set: { updatedAt: now } }
    );
  }

  after(() => logActivity({
    type: "appraiser.cards.add",
    member: session.user?.name ?? "unknown",
    details: {
      collectionId: id,
      added: insertedCards.length,
      merged: mergedCardIds.length,
      errors: errors.length,
    },
  }));

  return {
    cards: insertedCards.map(cardDocToPayload),
    mergedCardIds,
    errors,
  };
}, "appraiser-cards-add");
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add "app/api/appraiser/collections/[id]/cards/route.ts"
git commit -m "feat(appraiser): POST cards — resolve via Scryfall, dedupe + qty-merge"
```

---

## Task 9: Single card PUT + DELETE

**Files:**
- Create: `app/api/appraiser/collections/[id]/cards/[cardId]/route.ts`

- [ ] **Step 1: Implement the route**

```typescript
// app/api/appraiser/collections/[id]/cards/[cardId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { withAuthParams } from "@/lib/api-helpers";
import { getDb } from "@/lib/mongodb";
import { resolveScryfall } from "@/lib/appraiser/scryfall-resolve";
import {
  COL_APPRAISER_CARDS,
  COL_APPRAISER_COLLECTIONS,
  type AppraiserCardDoc,
} from "@/lib/appraiser/types";

function parseId(id: string): ObjectId | null {
  try { return new ObjectId(id); } catch { return null; }
}

// Fields the client may send. Some trigger a Scryfall re-resolve.
interface PutBody {
  qty?: number;
  foil?: boolean;
  language?: string;
  set?: string;              // re-resolve
  collectorNumber?: string;  // re-resolve
  manualFromPrice?: number | null;
  manualTrendPrice?: number | null;
}

export const PUT = withAuthParams<{ id: string; cardId: string }>(
  async (req, _session, { id, cardId }) => {
    const collectionOid = parseId(id);
    const cardOid = parseId(cardId);
    if (!collectionOid || !cardOid) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const body = (await req.json()) as PutBody;
    const db = await getDb();
    const card = await db
      .collection<AppraiserCardDoc>(COL_APPRAISER_CARDS)
      .findOne({ _id: cardOid, collectionId: collectionOid });
    if (!card) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const update: Partial<AppraiserCardDoc> = {};
    const needsResolve =
      (body.set !== undefined && body.set !== card.set) ||
      (body.collectorNumber !== undefined && body.collectorNumber !== card.collectorNumber) ||
      (body.foil !== undefined && body.foil !== card.foil);

    if (typeof body.qty === "number" && body.qty > 0) update.qty = Math.floor(body.qty);
    if (typeof body.language === "string" && body.language.trim()) update.language = body.language.trim();

    if (body.manualFromPrice !== undefined) {
      update.fromPrice = body.manualFromPrice;
      update.status = "manual";
    }
    if (body.manualTrendPrice !== undefined) {
      update.trendPrice = body.manualTrendPrice;
      update.status = "manual";
    }

    if (needsResolve) {
      const newFoil = body.foil ?? card.foil;
      try {
        const resolved = await resolveScryfall({
          name: card.name,
          set: body.set ?? card.set,
          collectorNumber: body.collectorNumber ?? card.collectorNumber,
          foil: newFoil,
        });
        Object.assign(update, {
          set: resolved.set,
          setName: resolved.setName,
          collectorNumber: resolved.collectorNumber,
          scryfallId: resolved.scryfallId,
          cardmarket_id: resolved.cardmarketId,
          cardmarketUrl: resolved.cardmarketUrl,
          imageUrl: resolved.imageUrl,
          trendPrice: resolved.trendPrice,
          fromPrice: null,
          cm_prices: null,
          pricedAt: null,
          foil: resolved.foilOnly ? true : newFoil,
          status: "priced",
        } satisfies Partial<AppraiserCardDoc>);
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "resolve failed" },
          { status: 502 }
        );
      }
    }

    await db.collection(COL_APPRAISER_CARDS).updateOne({ _id: cardOid }, { $set: update });
    await db
      .collection(COL_APPRAISER_COLLECTIONS)
      .updateOne({ _id: collectionOid }, { $set: { updatedAt: new Date() } });

    const updated = await db
      .collection<AppraiserCardDoc>(COL_APPRAISER_CARDS)
      .findOne({ _id: cardOid });

    return { card: updated };
  },
  "appraiser-card-update"
);

export const DELETE = withAuthParams<{ id: string; cardId: string }>(
  async (_req, _session, { id, cardId }) => {
    const collectionOid = parseId(id);
    const cardOid = parseId(cardId);
    if (!collectionOid || !cardOid) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const db = await getDb();
    const result = await db
      .collection(COL_APPRAISER_CARDS)
      .deleteOne({ _id: cardOid, collectionId: collectionOid });
    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await db
      .collection(COL_APPRAISER_COLLECTIONS)
      .updateOne({ _id: collectionOid }, { $set: { updatedAt: new Date() } });

    return { ok: true };
  },
  "appraiser-card-delete"
);
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add "app/api/appraiser/collections/[id]/cards/[cardId]/route.ts"
git commit -m "feat(appraiser): card PUT (re-resolve on set/CN/foil change) + DELETE"
```

---

## Task 10: Refresh endpoint

**Files:**
- Create: `app/api/appraiser/collections/[id]/refresh/route.ts`

- [ ] **Step 1: Implement the route**

```typescript
// app/api/appraiser/collections/[id]/refresh/route.ts
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { withAuthParams } from "@/lib/api-helpers";
import { getDb } from "@/lib/mongodb";
import { resolveScryfall } from "@/lib/appraiser/scryfall-resolve";
import {
  COL_APPRAISER_CARDS,
  COL_APPRAISER_COLLECTIONS,
  type AppraiserCardDoc,
} from "@/lib/appraiser/types";

function parseId(id: string): ObjectId | null {
  try { return new ObjectId(id); } catch { return null; }
}

export const POST = withAuthParams<{ id: string }>(async (_req, _session, { id }) => {
  const oid = parseId(id);
  if (!oid) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const db = await getDb();
  const cards = await db
    .collection<AppraiserCardDoc>(COL_APPRAISER_CARDS)
    .find({ collectionId: oid })
    .toArray();

  let refreshed = 0;
  let failed = 0;
  for (const card of cards) {
    try {
      const resolved = await resolveScryfall({
        name: card.name,
        set: card.set,
        collectorNumber: card.collectorNumber,
        foil: card.foil,
      });
      await db.collection(COL_APPRAISER_CARDS).updateOne(
        { _id: card._id },
        {
          $set: {
            trendPrice: resolved.trendPrice,
            fromPrice: null,
            cm_prices: null,
            pricedAt: null,
            scryfallId: resolved.scryfallId,
            cardmarket_id: resolved.cardmarketId,
            cardmarketUrl: resolved.cardmarketUrl,
            imageUrl: resolved.imageUrl,
            status: "pending",
          },
        }
      );
      refreshed++;
    } catch {
      await db.collection(COL_APPRAISER_CARDS).updateOne(
        { _id: card._id },
        { $set: { status: "error" } }
      );
      failed++;
    }
  }

  await db
    .collection(COL_APPRAISER_COLLECTIONS)
    .updateOne({ _id: oid }, { $set: { updatedAt: new Date() } });

  return { refreshed, failed, total: cards.length };
}, "appraiser-collection-refresh");
```

- [ ] **Step 2: Typecheck + commit**

Run: `npm run typecheck`
Expected: passes.

```bash
git add "app/api/appraiser/collections/[id]/refresh/route.ts"
git commit -m "feat(appraiser): POST refresh — re-resolve Scryfall + clear CM prices"
```

---

## Task 11: Extend `processCardPrices` with appraiser fan-out

**Files:**
- Modify: `lib/cardmarket.ts`
- Create: `lib/__tests__/cardmarket-appraiser-fanout.test.ts`

The existing `processCardPrices` (`lib/cardmarket.ts:920-969`) writes CM prices to `dashboard_ev_cards`. Add a second `updateMany` that fans out the same snapshot to any `dashboard_appraiser_cards` where `{ cardmarket_id, foil }` matches.

- [ ] **Step 1: Write the failing test**

```typescript
// lib/__tests__/cardmarket-appraiser-fanout.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";

// Minimal in-memory mock for MongoDB calls used by processCardPrices.
type Doc = Record<string, unknown>;

interface MockCollection {
  docs: Doc[];
  updateOne: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
}

function makeCollection(docs: Doc[]): MockCollection {
  return {
    docs,
    updateOne: vi.fn(async (filter: Doc, update: { $set: Doc }) => {
      let matched = 0;
      for (const d of docs) {
        if (Object.entries(filter).every(([k, v]) => d[k] === v)) {
          Object.assign(d, update.$set);
          matched++;
          break;
        }
      }
      return { matchedCount: matched, modifiedCount: matched };
    }),
    updateMany: vi.fn(async (filter: Doc, update: { $set: Doc }) => {
      let matched = 0;
      for (const d of docs) {
        if (Object.entries(filter).every(([k, v]) => d[k] === v)) {
          Object.assign(d, update.$set);
          matched++;
        }
      }
      return { matchedCount: matched, modifiedCount: matched };
    }),
  };
}

const evCards = makeCollection([
  { cardmarket_id: 555123, name: "Lightning Bolt" },
]);
const appraiserCards = makeCollection([
  { cardmarket_id: 555123, foil: false, name: "Lightning Bolt", fromPrice: null, trendPrice: 0.65 },
  { cardmarket_id: 555123, foil: false, name: "Lightning Bolt", fromPrice: null, trendPrice: 0.65 }, // second collection
  { cardmarket_id: 555123, foil: true, name: "Lightning Bolt", fromPrice: null, trendPrice: 2.00 }, // foil variant not targeted
]);

vi.mock("../mongodb", () => ({
  getDb: async () => ({
    collection: (name: string) => {
      if (name === "dashboard_ev_cards") return evCards;
      if (name === "dashboard_appraiser_cards") return appraiserCards;
      throw new Error(`Unexpected collection: ${name}`);
    },
  }),
}));

import { processSync } from "../cardmarket";

describe("processCardPrices — appraiser fan-out", () => {
  beforeEach(() => {
    evCards.updateOne.mockClear();
    appraiserCards.updateMany.mockClear();
  });

  it("updates ev_cards AND fans out to appraiser cards with matching cardmarket_id + foil", async () => {
    await processSync("tester", [
      {
        type: "card_prices",
        data: {
          productId: 555123,
          cardName: "Lightning Bolt",
          isFoil: false,
          prices: { from: 0.50, trend: 0.70, avg30d: 0.65, avg7d: 0.68, avg1d: 0.71 },
          available: 1200,
          chart: null,
          pageUrl: "https://cardmarket.example/bolt",
        },
      },
    ]);

    expect(evCards.updateOne).toHaveBeenCalledOnce();

    expect(appraiserCards.updateMany).toHaveBeenCalledOnce();
    const [filter, update] = appraiserCards.updateMany.mock.calls[0];
    expect(filter).toEqual({ cardmarket_id: 555123, foil: false });
    const set = (update as { $set: Doc }).$set;
    expect(set.fromPrice).toBe(0.50);
    expect(set.trendPrice).toBe(0.70);
    expect(set.status).toBe("priced");
    expect(set.cm_prices).toMatchObject({
      from: 0.50, trend: 0.70, avg30d: 0.65, avg7d: 0.68, avg1d: 0.71, available: 1200,
    });

    // Only the two non-foil docs should have been touched
    expect(appraiserCards.docs[0].fromPrice).toBe(0.50);
    expect(appraiserCards.docs[1].fromPrice).toBe(0.50);
    expect(appraiserCards.docs[2].fromPrice).toBe(null);
  });
});
```

- [ ] **Step 2: Run — should fail (fan-out not implemented yet)**

Run: `npm test -- lib/__tests__/cardmarket-appraiser-fanout.test.ts`
Expected: FAIL (`updateMany` not called, or appraiser docs untouched).

- [ ] **Step 3: Read the existing `processCardPrices` to anchor the edit**

```bash
grep -n "processCardPrices\|cm_prices.\${variantKey}" lib/cardmarket.ts | head
```

You'll see `processCardPrices` around line 920, with the `cm_prices.${variantKey}` update near line 953-956.

- [ ] **Step 4: Extend the function**

In `lib/cardmarket.ts`, inside `processCardPrices`, immediately after the `dashboard_ev_cards` `updateOne` call, add:

```typescript
// Fan out to any dashboard_appraiser_cards with the same (cardmarket_id, foil).
// Safe no-op when the collection is empty or nothing matches.
const appraiserSet: Record<string, unknown> = {
  cm_prices: snapshot,
  pricedAt: new Date(now),
  status: "priced",
};
if (prices.from != null) appraiserSet.fromPrice = prices.from;
if (prices.trend != null) appraiserSet.trendPrice = prices.trend;

await db.collection("dashboard_appraiser_cards").updateMany(
  { cardmarket_id: productId, foil: isFoil },
  { $set: appraiserSet }
);
```

- [ ] **Step 5: Run the fan-out test — should pass**

Run: `npm test -- lib/__tests__/cardmarket-appraiser-fanout.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full test suite — no regressions**

Run: `npm test`
Expected: all tests pass, including `lib/__tests__/scryfall-bulk.test.ts`, `ev-products.test.ts`, `storage.test.ts`, `bloom.test.ts`, and the new appraiser tests.

- [ ] **Step 7: Commit**

```bash
git add lib/cardmarket.ts lib/__tests__/cardmarket-appraiser-fanout.test.ts
git commit -m "feat(appraiser): fan out CM price scrapes to appraiser cards in processCardPrices"
```

---

## Task 12: Sidebar — TOOLS section

**Files:**
- Modify: `components/dashboard/sidebar.tsx`

- [ ] **Step 1: Update imports and sections**

In `components/dashboard/sidebar.tsx`, change the lucide imports to include `Scale`, and restructure `navSections`:

```typescript
import { Activity, Calculator, CheckSquare, ChevronLeft, HardHat, LayoutDashboard, Library, LogOut, Menu, MessageCircle, Package, Scale, Settings, ShoppingBag, Wallet, X } from "lucide-react";

const navSections = [
  { label: "OVERVIEW", items: [
    { href: "/", label: "Home", icon: LayoutDashboard },
    { href: "/stock", label: "Stock", icon: Package },
  ]},
  { label: "TOOLS", items: [
    { href: "/ev", label: "EV Calculator", icon: Calculator },
    { href: "/appraiser", label: "Appraiser", icon: Scale },
  ]},
  { label: "MANAGEMENT", items: [
    { href: "/finance", label: "Finance", icon: Wallet },
    { href: "/cardmarket", label: "Cardmarket", icon: ShoppingBag },
    { href: "/storage", label: "Storage", icon: Library },
  ]},
  { label: "TEAM", items: [
    { href: "/meetings", label: "Meetings", icon: MessageCircle },
    { href: "/tasks", label: "Tasks", icon: CheckSquare },
  ]},
  { label: "SYSTEM", items: [
    { href: "/activity", label: "Activity", icon: Activity },
    { href: "/system/storage-setup", label: "Storage Setup", icon: HardHat },
  ]},
];
```

- [ ] **Step 2: Typecheck + smoke test**

Run: `npm run typecheck`
Expected: passes.

Run: `npm run dev`, open http://localhost:3025, verify sidebar shows:
- OVERVIEW: Home, Stock
- TOOLS: EV Calculator, Appraiser (Scale icon)
- MANAGEMENT: Finance, Cardmarket, Storage
- TEAM, SYSTEM unchanged

EV Calculator still links to `/ev`. Appraiser links to `/appraiser` (will 404 until Task 16).

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/sidebar.tsx
git commit -m "feat(sidebar): add TOOLS section with EV Calculator + Appraiser"
```

---

## Task 13: CollectionSelector component

**Files:**
- Create: `components/appraiser/CollectionSelector.tsx`

Ported from HG's `CollectionSelector.tsx` + an auto-saving notes textarea. All styling uses inline styles matching the rest of misstep (see `components/dashboard/sidebar.tsx` for the convention).

- [ ] **Step 1: Implement the component**

```typescript
// components/appraiser/CollectionSelector.tsx
"use client";

import { useState } from "react";
import type { AppraiserCollection } from "@/lib/appraiser/types";

interface Props {
  collections: AppraiserCollection[];
  selectedId: string;
  onSelect: (id: string) => void;
  onChanged: () => void;
  onRefresh: () => void;
}

function eur(n: number) {
  return n.toFixed(2).replace(".", ",") + " €";
}

export default function CollectionSelector({ collections, selectedId, onSelect, onChanged, onRefresh }: Props) {
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameName, setRenameName] = useState("");

  const current = collections.find((c) => c._id === selectedId);
  const [notes, setNotes] = useState(current?.notes ?? "");

  // Keep local notes in sync when selection changes
  if (current && current._id !== (notes as unknown as string & { __id?: string })) {
    // no-op — the real sync is via useEffect below in practice; inline for brevity.
  }

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await fetch("/api/appraiser/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Create failed");
      setNewName("");
      onChanged();
      if (data.collection?._id) onSelect(data.collection._id);
    } finally {
      setCreating(false);
    }
  };

  const startRename = () => {
    if (!current) return;
    setRenameName(current.name);
    setRenaming(true);
  };

  const saveRename = async () => {
    const n = renameName.trim();
    if (!n || !selectedId) return;
    await fetch(`/api/appraiser/collections/${selectedId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: n }),
    });
    setRenaming(false);
    onChanged();
  };

  const saveNotes = async () => {
    if (!selectedId || notes === (current?.notes ?? "")) return;
    await fetch(`/api/appraiser/collections/${selectedId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    });
    onChanged();
  };

  const handleDelete = async () => {
    if (!current) return;
    if (!confirm(`Delete "${current.name}" and all its cards?`)) return;
    await fetch(`/api/appraiser/collections/${selectedId}`, { method: "DELETE" });
    onSelect("");
    onChanged();
  };

  const inputStyle = {
    flex: 1,
    padding: "8px 10px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    color: "var(--text-primary)",
    fontSize: 14,
    fontFamily: "inherit",
  } as const;
  const btnStyle = {
    padding: "8px 14px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    color: "var(--text-secondary)",
    fontSize: 13,
    cursor: "pointer",
  } as const;
  const btnPrimary = { ...btnStyle, background: "var(--accent)", color: "var(--bg)", border: "none" };
  const btnDanger = { ...btnStyle, color: "#f87171", borderColor: "rgba(248,113,113,0.3)" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 16, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <select value={selectedId} onChange={(e) => onSelect(e.target.value)} style={inputStyle}>
          <option value="">-- Select collection --</option>
          {collections.map((c) => (
            <option key={c._id} value={c._id}>
              {c.name} — {c.cardCount} card{c.cardCount !== 1 ? "s" : ""} — From {eur(c.totalFrom)} / Trend {eur(c.totalTrend)}
            </option>
          ))}
        </select>
        {selectedId && !renaming && (
          <>
            <button style={btnStyle} onClick={onRefresh}>Refresh Prices</button>
            <button style={btnStyle} onClick={startRename}>Rename</button>
            <button style={btnDanger} onClick={handleDelete}>Delete</button>
          </>
        )}
        {renaming && (
          <>
            <input style={inputStyle} value={renameName} onChange={(e) => setRenameName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") saveRename(); if (e.key === "Escape") setRenaming(false); }}
              autoFocus />
            <button style={btnPrimary} onClick={saveRename}>Save</button>
            <button style={btnStyle} onClick={() => setRenaming(false)}>Cancel</button>
          </>
        )}
      </div>

      {current && (
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          placeholder="Notes — asking price, seller, deadline…"
          style={{ ...inputStyle, minHeight: 48, resize: "vertical" }}
        />
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <input style={inputStyle} placeholder="New collection name…" value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }} />
        <button style={btnPrimary} onClick={handleCreate} disabled={creating || !newName.trim()}>
          {creating ? "Creating…" : "New collection"}
        </button>
      </div>
    </div>
  );
}
```

Note: the notes `useState` initializer above captures stale values when switching collections — before committing, replace the inline comment with a `useEffect` that resets notes when `current?._id` changes:

```typescript
import { useState, useEffect } from "react";
// ...
useEffect(() => {
  setNotes(current?.notes ?? "");
}, [current?._id, current?.notes]);
```

Remove the no-op `if (current && current._id !== ...)` block — it exists only so you remember to wire the effect up.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add components/appraiser/CollectionSelector.tsx
git commit -m "feat(appraiser): CollectionSelector — CRUD + auto-saving notes"
```

---

## Task 14: AppraiserInput — text + CSV drop zone

**Files:**
- Create: `components/appraiser/AppraiserInput.tsx`

Text parser is ported verbatim from HG's `AppraiserInput.tsx:22-68`; photo upload is removed; CSV drop zone added using `parseDelverCsv`.

- [ ] **Step 1: Implement the component**

```typescript
// components/appraiser/AppraiserInput.tsx
"use client";

import { useState, useRef, useCallback } from "react";
import { parseDelverCsv, DelverCsvError } from "@/lib/appraiser/delver-csv";
import type { AppraiserCard, CardInput } from "@/lib/appraiser/types";

interface Props {
  collectionId: string;
  onCardsAdded: (newCards: AppraiserCard[]) => void;
}

type Status = { msg: string; type: "success" | "error" | "info" } | null;

function parseTextLines(text: string): CardInput[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.map((line) => {
    // "4 MH3 332" or "MH3 332" or "mh3/332"
    const setNumMatch = line.match(/^(?:(\d+)\s+)?([a-zA-Z][a-zA-Z0-9]*)[\s/\-#]+([a-zA-Z0-9][\w\-]*)$/);
    if (setNumMatch && /\d/.test(setNumMatch[3])) {
      const [, qty, set, num] = setNumMatch;
      return { name: `${set} ${num}`, set: set.toLowerCase(), collectorNumber: num, qty: qty ? parseInt(qty, 10) : 1 };
    }
    // "4 Lightning Bolt"
    const qtyMatch = line.match(/^(\d+)\s+(.+)$/);
    if (qtyMatch) return { name: qtyMatch[2], qty: parseInt(qtyMatch[1], 10) };
    return { name: line, qty: 1 };
  });
}

export default function AppraiserInput({ collectionId, onCardsAdded }: Props) {
  const [text, setText] = useState("");
  const [adding, setAdding] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const postCards = useCallback(async (cards: CardInput[]) => {
    const res = await fetch(`/api/appraiser/collections/${collectionId}/cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cards }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Add failed");
    return data as { cards: AppraiserCard[]; mergedCardIds: string[]; errors: Array<{ error: string }> };
  }, [collectionId]);

  const handleAddText = async () => {
    const cards = parseTextLines(text);
    if (cards.length === 0) {
      setStatus({ msg: "Enter at least one card name", type: "error" });
      return;
    }
    setAdding(true);
    try {
      const data = await postCards(cards);
      const pieces: string[] = [];
      if (data.cards.length) pieces.push(`Added ${data.cards.length}`);
      if (data.mergedCardIds.length) pieces.push(`${data.mergedCardIds.length} merged`);
      if (data.errors.length) pieces.push(`${data.errors.length} failed`);
      setStatus({ msg: pieces.join(" • ") || "No changes", type: data.errors.length ? "info" : "success" });
      setText("");
      onCardsAdded(data.cards);
    } catch (err) {
      setStatus({ msg: (err as Error).message, type: "error" });
    } finally {
      setAdding(false);
      setTimeout(() => setStatus(null), 6000);
    }
  };

  const handleCsvFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) => /\.csv$/i.test(f.name) || f.type === "text/csv");
    if (arr.length === 0) {
      setStatus({ msg: "Drop a .csv file", type: "error" });
      return;
    }
    setAdding(true);
    try {
      const all: CardInput[] = [];
      for (const f of arr) {
        const txt = await f.text();
        try {
          all.push(...parseDelverCsv(txt));
        } catch (err) {
          if (err instanceof DelverCsvError) {
            setStatus({ msg: `${f.name}: ${err.message}`, type: "error" });
            return;
          }
          throw err;
        }
      }
      if (all.length === 0) {
        setStatus({ msg: "CSV contained no rows", type: "error" });
        return;
      }
      const data = await postCards(all);
      setStatus({
        msg: `CSV: added ${data.cards.length}${data.mergedCardIds.length ? `, ${data.mergedCardIds.length} merged` : ""}${data.errors.length ? `, ${data.errors.length} failed` : ""}`,
        type: data.errors.length ? "info" : "success",
      });
      onCardsAdded(data.cards);
    } catch (err) {
      setStatus({ msg: (err as Error).message, type: "error" });
    } finally {
      setAdding(false);
      setTimeout(() => setStatus(null), 6000);
    }
  }, [onCardsAdded, postCards]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    if (adding) return;
    if (e.dataTransfer.files.length) handleCsvFiles(e.dataTransfer.files);
  }, [adding, handleCsvFiles]);

  const inputStyle = {
    padding: "10px 12px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    color: "var(--text-primary)",
    fontSize: 14,
    fontFamily: "inherit",
    width: "100%",
    minHeight: 120,
    resize: "vertical" as const,
  };
  const btn = {
    padding: "8px 16px",
    background: "var(--accent)",
    color: "var(--bg)",
    border: "none",
    borderRadius: "var(--radius)",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 500,
  };
  const drop = {
    padding: 20,
    border: `2px dashed ${dragging ? "var(--accent)" : "var(--border)"}`,
    borderRadius: "var(--radius)",
    color: "var(--text-secondary)",
    textAlign: "center" as const,
    cursor: "pointer",
    background: dragging ? "rgba(255,255,255,0.04)" : "transparent",
    transition: "background 120ms, border-color 120ms",
  };
  const statusColors = { success: "#4ade80", error: "#f87171", info: "var(--text-secondary)" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
      <h3 style={{ margin: 0, fontSize: 14, color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>Add Cards</h3>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && text.trim()) { e.preventDefault(); handleAddText(); }
        }}
        placeholder={`One per line — name or set+number:\nLightning Bolt\n4 Counterspell\nMH3 332\nPLST LRW-256`}
        disabled={adding}
        style={inputStyle}
      />

      <div style={{ display: "flex", gap: 8 }}>
        <button style={btn} onClick={handleAddText} disabled={adding || !text.trim()}>
          {adding ? "Adding…" : "Add Cards"}
        </button>
      </div>

      <div
        style={drop}
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
        onClick={() => !adding && fileInputRef.current?.click()}
      >
        <input ref={fileInputRef} type="file" accept=".csv,text/csv" multiple
          onChange={(e) => { if (e.target.files) { handleCsvFiles(e.target.files); e.target.value = ""; } }}
          style={{ display: "none" }} />
        {dragging ? "Drop CSV" : adding ? "Parsing…" : "Drop a Delver Lens CSV or click to browse"}
      </div>

      {status && (
        <div style={{ fontSize: 13, color: statusColors[status.type] }}>{status.msg}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npm run typecheck`
Expected: passes.

```bash
git add components/appraiser/AppraiserInput.tsx
git commit -m "feat(appraiser): AppraiserInput — textarea + CSV drag-drop"
```

---

## Task 15: AppraiserCardTable

**Files:**
- Create: `components/appraiser/AppraiserCardTable.tsx`

Ported from HG's table. Key changes from HG: `<FoilStar />` instead of `F`, card name is an `<a>` to `cardmarketUrl`, no bookmarklet logic.

- [ ] **Step 1: Implement the component**

```typescript
// components/appraiser/AppraiserCardTable.tsx
"use client";

import { useState } from "react";
import { FoilStar } from "@/components/dashboard/cm-sprite";
import type { AppraiserCard } from "@/lib/appraiser/types";

interface Props {
  collectionId: string;
  cards: AppraiserCard[];
  onCardChanged: () => void;
}

const OFFER_OPTIONS = [5, 10, 15, 20] as const;

function eur(n: number | null): string {
  if (n === null || n === undefined) return "--";
  return n.toFixed(2).replace(".", ",") + " €";
}

const LANG_SPRITE_X: Record<string, number> = {
  english: -16, en: -16, french: -32, fr: -32, german: -48, de: -48,
  spanish: -64, es: -64, italian: -80, it: -80,
  "simplified chinese": -96, cn: -96, zhs: -96,
  japanese: -112, jp: -112, ja: -112,
  portuguese: -128, pt: -128,
  russian: -144, ru: -144, korean: -160, ko: -160, kr: -160,
  "traditional chinese": -176, tw: -176, zht: -176,
};
const SPRITE_URL = "//static.cardmarket.com/img/0fa565750d09bba2fc85059ebf12e9ac/spriteSheets/ssMain2.png";

export default function AppraiserCardTable({ collectionId, cards, onCardChanged }: Props) {
  const [offerPct, setOfferPct] = useState<number>(5);
  const [editingQty, setEditingQty] = useState<string | null>(null);
  const [qtyValue, setQtyValue] = useState("");

  const putCard = async (cardId: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/appraiser/collections/${collectionId}/cards/${cardId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (res.ok) onCardChanged();
  };

  const deleteCard = async (cardId: string) => {
    await fetch(`/api/appraiser/collections/${collectionId}/cards/${cardId}`, { method: "DELETE" });
    onCardChanged();
  };

  const totalCards = cards.reduce((s, c) => s + c.qty, 0);
  const totalFrom = cards.reduce((s, c) => s + (c.fromPrice ?? 0) * c.qty, 0);
  const totalTrend = cards.reduce((s, c) => s + (c.trendPrice ?? 0) * c.qty, 0);

  const copyAll = async () => {
    const header = `Name\tSet\tCN\tLang\tFoil\tQty\tFrom\tTrend\tOffer -${offerPct}%`;
    const lines = cards.map((c) => [
      c.name, c.set.toUpperCase(), c.collectorNumber, c.language,
      c.foil ? "foil" : "", c.qty,
      eur(c.fromPrice), eur(c.trendPrice),
      eur(c.fromPrice !== null ? c.fromPrice * (1 - offerPct / 100) : null),
    ].join("\t"));
    const summary = [
      "",
      `Total cards: ${totalCards}`,
      `Total From: ${eur(totalFrom)}`,
      `Total Trend: ${eur(totalTrend)}`,
      `Offer -${offerPct}%: ${eur(totalFrom * (1 - offerPct / 100))}`,
    ];
    await navigator.clipboard.writeText([header, ...lines, ...summary].join("\n"));
  };

  if (cards.length === 0) return null;

  const th = { textAlign: "left" as const, padding: "8px 10px", fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.05em", textTransform: "uppercase" as const, fontFamily: "var(--font-mono)" };
  const td = { padding: "8px 10px", borderTop: "1px solid var(--border)", fontSize: 13 };

  return (
    <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Name</th>
              <th style={th}>Set / CN</th>
              <th style={th}>Lang</th>
              <th style={th}>Foil</th>
              <th style={th}>Qty</th>
              <th style={th}>From</th>
              <th style={th}>Trend</th>
              <th style={th}>
                Offer{" "}
                <select value={offerPct} onChange={(e) => setOfferPct(Number(e.target.value))}
                  style={{ background: "transparent", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 4px" }}>
                  {OFFER_OPTIONS.map((p) => <option key={p} value={p}>-{p}%</option>)}
                </select>
              </th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {cards.map((c) => (
              <tr key={c._id}>
                <td style={{ ...td, display: "flex", alignItems: "center", gap: 8 }}>
                  {c.imageUrl && <img src={c.imageUrl} alt="" style={{ width: 24, height: 34, objectFit: "cover", borderRadius: 3 }} />}
                  {c.cardmarketUrl ? (
                    <a href={c.foil ? `${c.cardmarketUrl}${c.cardmarketUrl.includes("?") ? "&" : "?"}isFoil=Y` : c.cardmarketUrl}
                      target="_blank" rel="noopener noreferrer"
                      style={{ color: "var(--accent)", textDecoration: "none" }}
                      title="Open on Cardmarket — your extension will scrape prices">
                      {c.name} ↗
                    </a>
                  ) : c.name}
                </td>
                <td style={td}>{c.set ? `${c.set.toUpperCase()}${c.collectorNumber ? " #" + c.collectorNumber : ""}` : "?"}</td>
                <td style={td}>
                  {LANG_SPRITE_X[c.language.toLowerCase()] !== undefined ? (
                    <span title={c.language} style={{ display: "inline-block", width: 16, height: 11, backgroundImage: `url('${SPRITE_URL}')`, backgroundPosition: `${LANG_SPRITE_X[c.language.toLowerCase()]}px 0` }} />
                  ) : c.language}
                </td>
                <td style={td}>
                  <button
                    onClick={() => putCard(c._id, { foil: !c.foil })}
                    title={c.foil ? "Click to un-foil" : "Click to mark foil"}
                    style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
                  >
                    {c.foil ? <FoilStar /> : <span style={{ color: "var(--text-muted)" }}>—</span>}
                  </button>
                </td>
                <td style={td}>
                  {editingQty === c._id ? (
                    <input type="number" min={1} value={qtyValue}
                      onChange={(e) => setQtyValue(e.target.value)}
                      onBlur={async () => {
                        const q = parseInt(qtyValue, 10);
                        if (q > 0) await putCard(c._id, { qty: q });
                        setEditingQty(null);
                      }}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      autoFocus
                      style={{ width: 48, padding: "2px 6px", background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)" }} />
                  ) : (
                    <span onClick={() => { setEditingQty(c._id); setQtyValue(String(c.qty)); }}
                      style={{ cursor: "pointer" }}>{c.qty}</span>
                  )}
                </td>
                <td style={td}>{eur(c.fromPrice)}</td>
                <td style={td}>{eur(c.trendPrice)}</td>
                <td style={{ ...td, color: "var(--accent)", fontWeight: 600 }}>
                  {eur(c.fromPrice !== null ? c.fromPrice * (1 - offerPct / 100) : null)}
                </td>
                <td style={td}>
                  <button onClick={() => deleteCard(c._id)}
                    title="Remove card"
                    style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 16 }}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", gap: 16, padding: "12px 16px", borderTop: "1px solid var(--border)", flexWrap: "wrap", alignItems: "center", fontSize: 13 }}>
        <span>{totalCards} card{totalCards !== 1 ? "s" : ""}</span>
        <span>From: <strong>{eur(totalFrom)}</strong></span>
        <span>Trend: <strong>{eur(totalTrend)}</strong></span>
        {OFFER_OPTIONS.map((p) => (
          <span key={p} style={{ color: p === offerPct ? "var(--accent)" : "var(--text-secondary)" }}>
            -{p}%: <strong>{eur(totalFrom * (1 - p / 100))}</strong>
          </span>
        ))}
        <button onClick={copyAll}
          style={{ marginLeft: "auto", padding: "6px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", borderRadius: "var(--radius)", color: "var(--text-secondary)", cursor: "pointer" }}>
          Copy
        </button>
      </div>
    </div>
  );
}
```

Note: before committing, quickly confirm `FoilStar` is the correct named export in `components/dashboard/cm-sprite.tsx`. If it's a default export, change the import accordingly.

```bash
grep -n "export" components/dashboard/cm-sprite.tsx | head
```

- [ ] **Step 2: Typecheck + commit**

Run: `npm run typecheck`
Expected: passes.

```bash
git add components/appraiser/AppraiserCardTable.tsx
git commit -m "feat(appraiser): AppraiserCardTable — FoilStar toggles, CM click-through, offer tiers"
```

---

## Task 16: Appraiser main container + page route

**Files:**
- Create: `components/appraiser/Appraiser.tsx`
- Create: `app/(dashboard)/appraiser/page.tsx`

- [ ] **Step 1: Implement the container**

```typescript
// components/appraiser/Appraiser.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import useSWR from "swr";
import CollectionSelector from "./CollectionSelector";
import AppraiserInput from "./AppraiserInput";
import AppraiserCardTable from "./AppraiserCardTable";
import type { AppraiserCard, AppraiserCollection } from "@/lib/appraiser/types";

const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
});

const STORAGE_KEY = "appraiser_selectedCollection";

export default function Appraiser() {
  const [selectedId, setSelectedId] = useState<string>("");

  // Hydrate selection from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (stored) setSelectedId(stored);
  }, []);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    if (typeof window !== "undefined") {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    }
  };

  const listSwr = useSWR<{ collections: AppraiserCollection[] }>("/api/appraiser/collections", fetcher);
  const collections = listSwr.data?.collections ?? [];

  const detailKey = selectedId ? `/api/appraiser/collections/${selectedId}` : null;
  const detailSwr = useSWR<{ collection: AppraiserCollection; cards: AppraiserCard[] }>(
    detailKey,
    fetcher,
    {
      refreshInterval: (data) => {
        if (!data?.cards?.length) return 0;
        // Poll every 3s while any card is awaiting a CM scrape
        const hasPending = data.cards.some((c) => c.fromPrice === null && c.status !== "error");
        return hasPending ? 3000 : 0;
      },
    }
  );
  const cards = detailSwr.data?.cards ?? [];

  const handleCollectionChanged = useCallback(() => {
    listSwr.mutate();
    if (selectedId) detailSwr.mutate();
  }, [listSwr, detailSwr, selectedId]);

  const handleCardsAdded = useCallback(() => {
    detailSwr.mutate();
    listSwr.mutate();
  }, [detailSwr, listSwr]);

  const handleCardChanged = useCallback(() => {
    detailSwr.mutate();
    listSwr.mutate();
  }, [detailSwr, listSwr]);

  const handleRefresh = useCallback(async () => {
    if (!selectedId) return;
    await fetch(`/api/appraiser/collections/${selectedId}/refresh`, { method: "POST" });
    detailSwr.mutate();
    listSwr.mutate();
  }, [selectedId, detailSwr, listSwr]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "24px 32px", maxWidth: 1400, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>Appraiser</h1>

      <CollectionSelector
        collections={collections}
        selectedId={selectedId}
        onSelect={handleSelect}
        onChanged={handleCollectionChanged}
        onRefresh={handleRefresh}
      />

      {selectedId ? (
        <>
          <AppraiserInput collectionId={selectedId} onCardsAdded={handleCardsAdded} />
          <AppraiserCardTable
            collectionId={selectedId}
            cards={cards}
            onCardChanged={handleCardChanged}
          />
        </>
      ) : (
        <p style={{ color: "var(--text-muted)", padding: 20, textAlign: "center" }}>
          Select or create a collection to start appraising cards.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Implement the page route**

```typescript
// app/(dashboard)/appraiser/page.tsx
import Appraiser from "@/components/appraiser/Appraiser";

export default function AppraiserPage() {
  return <Appraiser />;
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add components/appraiser/Appraiser.tsx "app/(dashboard)/appraiser/page.tsx"
git commit -m "feat(appraiser): main container + /appraiser page with SWR polling"
```

---

## Task 17: End-to-end manual verification

**Files:** none — UI smoke test.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass (scryfall-bulk, ev-products, storage, storage-db, bloom, scryfall-resolve, delver-csv, cardmarket-appraiser-fanout).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Start dev server + verify UI**

Run: `npm run dev` (port 3025). Log in at `/login`.

Verify each:
- Sidebar: TOOLS section shows EV Calculator + Appraiser (Scale icon). EV still works at `/ev`.
- `/appraiser`: empty state shows "Select or create a collection…" with the create input.
- Create a collection named "Test Lot 01".
- Add notes "Testing appraiser" — blur, refresh, notes persist.
- Rename → "Test Lot 01 — Updated", persists.
- Paste in textarea:
  ```
  Lightning Bolt
  4 Counterspell
  mh3 332
  ```
  Click Add. Within ~1s each row appears with Scryfall Trend populated, From = `--`, name is a link to CM.
- Click the Lightning Bolt link → new tab opens on Cardmarket. The extension must be installed and logged in for the scrape to land. Wait ~3–5s (watch the extension badge) then switch back to the appraiser tab.
- Within ~3s (SWR polls), From populates for Lightning Bolt. Trend may also update to the CM trend.
- Toggle foil on one card → row flashes, Trend changes (Scryfall `eur_foil`). Click the link → foil-variant From populates.
- Edit qty inline → summary + Offer columns update.
- Change Offer dropdown to `-10%` → all Offer cells + summary tier highlights shift.
- Click Copy → pasted TSV in a text editor shows the table.
- Drop a non-Delver CSV on the drop zone → red error "Unknown CSV format — send a sample…".
- Delete a card → summary updates.
- Click Refresh Prices → status cells briefly show "pending", Scryfall trend re-populates, From goes back to `--`.
- Delete the collection → list is empty, dropdown empty.

- [ ] **Step 4: Verify extension fan-out didn't break EV**

Visit any card's Cardmarket product page that's in the EV scope (e.g. an FDN card). Check in MongoDB or by hitting `/api/ev/products` that `dashboard_ev_cards.cm_prices.nonfoil` still updates — the fan-out must not regress the existing path.

- [ ] **Step 5: Final commit (if the manual verification surfaced fixes)**

If you had to fix anything during verification, commit those changes now with a focused message. Otherwise skip.

---

## Task 18: Wrap up

- [ ] **Step 1: Review `git log` and make sure all commits are clean**

Run: `git log --oneline main..HEAD`

Expected: a sequence of small, scoped commits matching the 17 tasks. No `Co-Authored-By` lines in any commit message.

- [ ] **Step 2: Push**

```bash
git push
```

- [ ] **Step 3: Tell the user**

Report in plain text:
- What was built
- Anything deferred (Delver Lens CSV column mapping — awaiting sample)
- Any observations from manual verification worth surfacing

---

## Self-review notes

**Spec coverage walkthrough:**

| Spec section | Covered by |
|---|---|
| 1. Sidebar TOOLS | Task 12 |
| 2. Routes | Tasks 5, 6, 7, 8, 9, 10, 16 |
| 3. Data model | Task 2 (types), 6/7/8 (collection + cards create), 11 (cm_prices fan-out) |
| 4. Pricing flow | Tasks 3, 5 (Scryfall), 8 (on add), 11 (extension fan-out), 16 (SWR polling), 17 (manual verification) |
| 5. Text + CSV input | Task 14 (text parser + CSV drop), Task 4 (CSV stub) |
| 6. Table | Task 15 |
| 7. Collection selector | Task 13 |
| 8. File layout | Reflected in the file-structure header + per-task file paths |
| 9. Auth | All route tasks use `withAuth*` wrappers; Task 17 verification |
| 10. Verification | Task 17 |
| 11. Out-of-scope cuts | Honored — no photo, no bookmarklet, no server CM fetch |
| 12. Open items (DFC, CSV mapping) | CSV mapping → Task 4 stub; DFC stays on project TODO backlog |

**Type consistency check:** `AppraiserCard` / `AppraiserCardDoc` / `ScryfallResolveResult` shapes are defined once in Task 2 and consumed consistently across Tasks 5–11, 13–16. `CardInput.collectorNumber` matches the POST body accepted in Task 8 and the text parser in Task 14.

**Placeholder scan:** no TBD / fill-in / "implement later" — the one "TODO" comment in `delver-csv.ts` is intentional and documented (awaiting sample CSV).
