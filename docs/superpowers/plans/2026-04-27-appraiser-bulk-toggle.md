# Appraiser bulk toggle — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-collection toggle on the Appraiser tab that excludes ≤€1 trend cards from the main totals/offer math and optionally re-prices them at a flat bulk rate.

**Architecture:** Pure UI feature with one additive schema change. Three optional fields on `dashboard_appraiser_collections` (`bulkExcludeEnabled`, `bulkThreshold`, `bulkRate`). The existing `PUT /api/appraiser/collections/[id]` validator extends to accept them; the existing `GET` mapper supplies defaults so older docs work. All UI logic lives in `AppraiserCardTable.tsx`; `Appraiser.tsx` plumbs the `collection` prop down.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript 5.9, MongoDB native driver, SWR.

**Spec:** `docs/superpowers/specs/2026-04-27-appraiser-bulk-toggle-design.md`

**Testing posture:** No new automated tests (per spec). Manual smoke walkthrough at the end. Each task ends with a `npm run typecheck` gate before commit.

---

### Task 1: Extend schema types

**Files:**
- Modify: `lib/appraiser/types.ts`

- [ ] **Step 1: Add the three optional fields to `AppraiserCollectionDoc`**

In `lib/appraiser/types.ts`, replace the `AppraiserCollectionDoc` interface (lines 6-12) with:

```ts
export interface AppraiserCollectionDoc {
  _id: ObjectId;
  name: string;
  notes: string;
  /** When true, cards with `trendPrice < bulkThreshold` (or null trend) are
   *  excluded from main From/Trend totals and the offer-tier math. Default false. */
  bulkExcludeEnabled?: boolean;
  /** EUR threshold below which a card is treated as bulk. Default 1.0. */
  bulkThreshold?: number;
  /** Flat EUR/card rate added back to the offer total via `bulkCount × bulkRate`.
   *  0 means pure exclusion. Default 0. */
  bulkRate?: number;
  createdAt: Date;
  updatedAt: Date;
}
```

- [ ] **Step 2: Add the three fields as REQUIRED to `AppraiserCollection`**

The API mapper always supplies defaults, so consumers never see `undefined`. Replace the `AppraiserCollection` interface (lines 14-23) with:

```ts
export interface AppraiserCollection {
  _id: string;
  name: string;
  notes: string;
  cardCount: number;
  totalTrend: number;
  totalFrom: number;
  bulkExcludeEnabled: boolean;
  bulkThreshold: number;
  bulkRate: number;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS. (Compile errors will appear in tasks 2-3 and will be fixed there.)

If typecheck fails with unrelated errors, stop and ask before continuing.

- [ ] **Step 4: Commit**

```bash
git add lib/appraiser/types.ts
git commit -m "feat(appraiser): add bulk-toggle fields to collection types"
```

---

### Task 2: Extend GET mapper to surface defaulted bulk fields

**Files:**
- Modify: `app/api/appraiser/collections/[id]/route.ts:70-79`

- [ ] **Step 1: Add the three fields to the GET payload mapper**

In `app/api/appraiser/collections/[id]/route.ts`, replace the `payload: AppraiserCollection = {...}` block (lines 70-79) with:

```ts
  const payload: AppraiserCollection = {
    _id: String(c._id),
    name: c.name,
    notes: c.notes ?? "",
    cardCount: totals.cardCount,
    totalTrend: totals.totalTrend,
    totalFrom: totals.totalFrom,
    bulkExcludeEnabled: c.bulkExcludeEnabled ?? false,
    bulkThreshold: c.bulkThreshold ?? 1,
    bulkRate: c.bulkRate ?? 0,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/api/appraiser/collections/[id]/route.ts
git commit -m "feat(appraiser): surface bulk settings on collection GET"
```

---

### Task 3: Extend PUT validator to accept and validate bulk fields

**Files:**
- Modify: `app/api/appraiser/collections/[id]/route.ts:84-119`

- [ ] **Step 1: Replace the PUT handler with the extended validator**

In `app/api/appraiser/collections/[id]/route.ts`, replace the entire `export const PUT = withAuthParams<{ id: string }>(...)` block (lines 84-119) with:

```ts
export const PUT = withAuthParams<{ id: string }>(async (req, session, { id }) => {
  const oid = parseId(id);
  if (!oid) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = (await req.json()) as {
    name?: unknown;
    notes?: unknown;
    bulkExcludeEnabled?: unknown;
    bulkThreshold?: unknown;
    bulkRate?: unknown;
  };
  const update: Partial<AppraiserCollectionDoc> = { updatedAt: new Date() };

  if (typeof body.name === "string") {
    const n = body.name.trim();
    if (!n) return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    update.name = n;
  }
  if (typeof body.notes === "string") update.notes = body.notes;

  if (body.bulkExcludeEnabled !== undefined) {
    if (typeof body.bulkExcludeEnabled !== "boolean") {
      return NextResponse.json({ error: "bulkExcludeEnabled must be a boolean" }, { status: 400 });
    }
    update.bulkExcludeEnabled = body.bulkExcludeEnabled;
  }
  if (body.bulkThreshold !== undefined) {
    if (typeof body.bulkThreshold !== "number" || !Number.isFinite(body.bulkThreshold) || body.bulkThreshold < 0 || body.bulkThreshold > 1000) {
      return NextResponse.json({ error: "bulkThreshold must be a finite number between 0 and 1000" }, { status: 400 });
    }
    update.bulkThreshold = body.bulkThreshold;
  }
  if (body.bulkRate !== undefined) {
    if (typeof body.bulkRate !== "number" || !Number.isFinite(body.bulkRate) || body.bulkRate < 0) {
      return NextResponse.json({ error: "bulkRate must be a finite non-negative number" }, { status: 400 });
    }
    // Cross-field check: bulkRate must not exceed bulkThreshold (incoming or persisted).
    // Pricing bulk above the threshold cutoff would be nonsensical.
    const effectiveThreshold =
      update.bulkThreshold !== undefined
        ? update.bulkThreshold
        : (await db.collection<AppraiserCollectionDoc>(COL_APPRAISER_COLLECTIONS).findOne({ _id: oid }))?.bulkThreshold ?? 1;
    if (body.bulkRate > effectiveThreshold) {
      return NextResponse.json({ error: "bulkRate cannot exceed bulkThreshold" }, { status: 400 });
    }
    update.bulkRate = body.bulkRate;
  }

  const db = await getDb();
  const result = await db
    .collection<AppraiserCollectionDoc>(COL_APPRAISER_COLLECTIONS)
    .updateOne({ _id: oid }, { $set: update });
  if (result.matchedCount === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updateBits = [
    update.name !== undefined ? `name="${update.name}"` : null,
    update.notes !== undefined ? `notes=${update.notes.length} chars` : null,
    update.bulkExcludeEnabled !== undefined ? `bulkExcludeEnabled=${update.bulkExcludeEnabled}` : null,
    update.bulkThreshold !== undefined ? `bulkThreshold=${update.bulkThreshold}` : null,
    update.bulkRate !== undefined ? `bulkRate=${update.bulkRate}` : null,
  ].filter(Boolean).join(", ");
  logActivity(
    "update",
    "appraiser_collection",
    id,
    `Updated appraiser collection (${updateBits || "no-op"})`,
    session.user?.id ?? "system",
    session.user?.name ?? "unknown",
  );

  return { ok: true };
}, "appraiser-collection-update");
```

Note the cross-field check uses `db` before it's declared in the outer `await getDb()` call — that's intentional. Move the `const db = await getDb();` line **above** the validator block. Replace the whole PUT block with this corrected version:

```ts
export const PUT = withAuthParams<{ id: string }>(async (req, session, { id }) => {
  const oid = parseId(id);
  if (!oid) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = (await req.json()) as {
    name?: unknown;
    notes?: unknown;
    bulkExcludeEnabled?: unknown;
    bulkThreshold?: unknown;
    bulkRate?: unknown;
  };
  const update: Partial<AppraiserCollectionDoc> = { updatedAt: new Date() };
  const db = await getDb();

  if (typeof body.name === "string") {
    const n = body.name.trim();
    if (!n) return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    update.name = n;
  }
  if (typeof body.notes === "string") update.notes = body.notes;

  if (body.bulkExcludeEnabled !== undefined) {
    if (typeof body.bulkExcludeEnabled !== "boolean") {
      return NextResponse.json({ error: "bulkExcludeEnabled must be a boolean" }, { status: 400 });
    }
    update.bulkExcludeEnabled = body.bulkExcludeEnabled;
  }
  if (body.bulkThreshold !== undefined) {
    if (typeof body.bulkThreshold !== "number" || !Number.isFinite(body.bulkThreshold) || body.bulkThreshold < 0 || body.bulkThreshold > 1000) {
      return NextResponse.json({ error: "bulkThreshold must be a finite number between 0 and 1000" }, { status: 400 });
    }
    update.bulkThreshold = body.bulkThreshold;
  }
  if (body.bulkRate !== undefined) {
    if (typeof body.bulkRate !== "number" || !Number.isFinite(body.bulkRate) || body.bulkRate < 0) {
      return NextResponse.json({ error: "bulkRate must be a finite non-negative number" }, { status: 400 });
    }
    const effectiveThreshold =
      update.bulkThreshold !== undefined
        ? update.bulkThreshold
        : (await db.collection<AppraiserCollectionDoc>(COL_APPRAISER_COLLECTIONS).findOne({ _id: oid }))?.bulkThreshold ?? 1;
    if (body.bulkRate > effectiveThreshold) {
      return NextResponse.json({ error: "bulkRate cannot exceed bulkThreshold" }, { status: 400 });
    }
    update.bulkRate = body.bulkRate;
  }

  const result = await db
    .collection<AppraiserCollectionDoc>(COL_APPRAISER_COLLECTIONS)
    .updateOne({ _id: oid }, { $set: update });
  if (result.matchedCount === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updateBits = [
    update.name !== undefined ? `name="${update.name}"` : null,
    update.notes !== undefined ? `notes=${update.notes.length} chars` : null,
    update.bulkExcludeEnabled !== undefined ? `bulkExcludeEnabled=${update.bulkExcludeEnabled}` : null,
    update.bulkThreshold !== undefined ? `bulkThreshold=${update.bulkThreshold}` : null,
    update.bulkRate !== undefined ? `bulkRate=${update.bulkRate}` : null,
  ].filter(Boolean).join(", ");
  logActivity(
    "update",
    "appraiser_collection",
    id,
    `Updated appraiser collection (${updateBits || "no-op"})`,
    session.user?.id ?? "system",
    session.user?.name ?? "unknown",
  );

  return { ok: true };
}, "appraiser-collection-update");
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Manual API smoke (optional but recommended before component work)**

Start the dev server (`npm run dev`) and from a logged-in tab DevTools console:

```js
// Replace ID with any existing collection id from /api/appraiser/collections
const id = "<paste-collection-id-here>";

// 1. Valid update — should succeed
await fetch(`/api/appraiser/collections/${id}`, {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ bulkExcludeEnabled: true, bulkThreshold: 1.5, bulkRate: 0.05 }),
}).then((r) => r.json());
// Expected: { ok: true }

// 2. Invalid: rate > threshold — should 400
await fetch(`/api/appraiser/collections/${id}`, {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ bulkRate: 2 }),
}).then((r) => r.json());
// Expected: { error: "bulkRate cannot exceed bulkThreshold" }

// 3. Invalid: negative threshold — should 400
await fetch(`/api/appraiser/collections/${id}`, {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ bulkThreshold: -1 }),
}).then((r) => r.json());
// Expected: { error: "bulkThreshold must be a finite number between 0 and 1000" }

// 4. Confirm GET surfaces the persisted values
await fetch(`/api/appraiser/collections/${id}`).then((r) => r.json()).then((d) => d.collection);
// Expected to include: bulkExcludeEnabled: true, bulkThreshold: 1.5, bulkRate: 0.05
```

If any expectation fails, stop and debug before continuing.

- [ ] **Step 4: Commit**

```bash
git add app/api/appraiser/collections/[id]/route.ts
git commit -m "feat(appraiser): accept bulk settings on collection PUT"
```

---

### Task 4: Plumb `collection` prop down from Appraiser to AppraiserCardTable

**Files:**
- Modify: `components/appraiser/Appraiser.tsx:87-91`
- Modify: `components/appraiser/AppraiserCardTable.tsx:11-15`

- [ ] **Step 1: Pass `collection` prop in `Appraiser.tsx`**

In `components/appraiser/Appraiser.tsx`, replace the table render (lines 87-91) with:

```tsx
          <AppraiserCardTable
            collectionId={selectedId}
            collection={detailSwr.data?.collection}
            cards={cards}
            onCardChanged={handleCardChanged}
          />
```

- [ ] **Step 2: Accept the prop in `AppraiserCardTable.tsx`**

In `components/appraiser/AppraiserCardTable.tsx`, replace the `interface Props` block (lines 11-15) with:

```tsx
interface Props {
  collectionId: string;
  collection: AppraiserCollection | undefined;
  cards: AppraiserCard[];
  onCardChanged: () => void;
}
```

And update the import line (line 8) from:

```tsx
import type { AppraiserCard } from "@/lib/appraiser/types";
```

to:

```tsx
import type { AppraiserCard, AppraiserCollection } from "@/lib/appraiser/types";
```

And update the function signature (line 25) from:

```tsx
export default function AppraiserCardTable({ collectionId, cards, onCardChanged }: Props) {
```

to:

```tsx
export default function AppraiserCardTable({ collectionId, collection, cards, onCardChanged }: Props) {
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/appraiser/Appraiser.tsx components/appraiser/AppraiserCardTable.tsx
git commit -m "refactor(appraiser): thread collection prop into card table"
```

---

### Task 5: Add bulk state, hydration, and derived totals

**Files:**
- Modify: `components/appraiser/AppraiserCardTable.tsx`

- [ ] **Step 1: Add the new state and hydration effect**

In `components/appraiser/AppraiserCardTable.tsx`, replace the existing `useState` import line (line 3) with:

```tsx
import { useState, useEffect, useMemo, useRef } from "react";
```

Inside the `AppraiserCardTable` component, replace the existing state block (line 26-28):

```tsx
  const [offerPct, setOfferPct] = useState<number>(5);
  const [editingQty, setEditingQty] = useState<string | null>(null);
  const [qtyValue, setQtyValue] = useState("");
```

with:

```tsx
  const [offerPct, setOfferPct] = useState<number>(5);
  const [editingQty, setEditingQty] = useState<string | null>(null);
  const [qtyValue, setQtyValue] = useState("");
  const [bulkExclude, setBulkExclude] = useState<boolean>(false);
  const [bulkThreshold, setBulkThreshold] = useState<number>(1);
  const [bulkRate, setBulkRate] = useState<number>(0);

  // Hydrate bulk settings on collection ID change ONLY — not on every collection
  // update. Otherwise SWR polling would overwrite mid-typing edits in the
  // threshold/rate fields. The debounced PUT (Task 6) is the source of truth
  // from the moment the user starts editing.
  const lastHydratedId = useRef<string | null>(null);
  useEffect(() => {
    if (!collection) return;
    if (lastHydratedId.current === collection._id) return;
    setBulkExclude(collection.bulkExcludeEnabled);
    setBulkThreshold(collection.bulkThreshold);
    setBulkRate(collection.bulkRate);
    lastHydratedId.current = collection._id;
  }, [collection]);
```

- [ ] **Step 2: Replace the inline totals with memoized split + derived values**

Replace the existing totals block (lines 43-45):

```tsx
  const totalCards = cards.reduce((s, c) => s + c.qty, 0);
  const totalFrom = cards.reduce((s, c) => s + (c.fromPrice ?? 0) * c.qty, 0);
  const totalTrend = cards.reduce((s, c) => s + (c.trendPrice ?? 0) * c.qty, 0);
```

with:

```tsx
  const { mainCards, bulkCards, totalCards, totalFrom, totalTrend, bulkCount, bulkAddOn, offerTotal } = useMemo(() => {
    const isBulk = (c: AppraiserCard) =>
      bulkExclude && (c.trendPrice == null || c.trendPrice < bulkThreshold);
    const mainCards = cards.filter((c) => !isBulk(c));
    const bulkCards = cards.filter((c) =>  isBulk(c));
    const totalCards = cards.reduce((s, c) => s + c.qty, 0);
    const totalFrom  = mainCards.reduce((s, c) => s + (c.fromPrice  ?? 0) * c.qty, 0);
    const totalTrend = mainCards.reduce((s, c) => s + (c.trendPrice ?? 0) * c.qty, 0);
    const bulkCount  = bulkCards.reduce((s, c) => s + c.qty, 0);
    const bulkAddOn  = bulkCount * bulkRate;
    const offerTotal = totalFrom * (1 - offerPct / 100) + bulkAddOn;
    return { mainCards, bulkCards, totalCards, totalFrom, totalTrend, bulkCount, bulkAddOn, offerTotal };
  }, [cards, bulkExclude, bulkThreshold, bulkRate, offerPct]);
```

- [ ] **Step 3: Build a per-card bulk lookup for the row map**

Add right below the `useMemo` block from Step 2:

```tsx
  const bulkIds = useMemo(() => new Set(bulkCards.map((c) => c._id)), [bulkCards]);
```

This lets us style bulk rows in Task 7 without re-running the filter inside the JSX.

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/appraiser/AppraiserCardTable.tsx
git commit -m "feat(appraiser): split cards into main/bulk and derive totals"
```

---

### Task 6: Persist bulk settings via debounced PUT

**Files:**
- Modify: `components/appraiser/AppraiserCardTable.tsx`

- [ ] **Step 1: Add debounced save effect**

In `components/appraiser/AppraiserCardTable.tsx`, immediately AFTER the hydration `useEffect` (added in Task 5 Step 1), add:

```tsx
  // Debounced persistence — fires 300ms after the last change to any of the
  // three bulk fields. Skip until hydration has happened (avoids saving the
  // initial useState defaults over the persisted values on mount).
  useEffect(() => {
    if (!collection || lastHydratedId.current !== collection._id) return;
    // Skip if local state still matches the hydrated values — nothing to save.
    if (
      bulkExclude   === collection.bulkExcludeEnabled &&
      bulkThreshold === collection.bulkThreshold &&
      bulkRate      === collection.bulkRate
    ) return;
    const handle = setTimeout(async () => {
      try {
        await fetch(`/api/appraiser/collections/${collectionId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bulkExcludeEnabled: bulkExclude,
            bulkThreshold,
            bulkRate,
          }),
        });
      } catch (err) {
        // Silent failure — user can keep editing; next debounced save will retry.
        console.warn("[appraiser] bulk-settings save failed", err);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [collectionId, collection, bulkExclude, bulkThreshold, bulkRate]);
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/appraiser/AppraiserCardTable.tsx
git commit -m "feat(appraiser): debounced persistence of bulk settings"
```

---

### Task 7: Add the header strip controls (toggle + threshold + rate)

**Files:**
- Modify: `components/appraiser/AppraiserCardTable.tsx`

- [ ] **Step 1: Replace the existing header bar with the extended one**

In `components/appraiser/AppraiserCardTable.tsx`, replace the header strip (the `<div>` with `style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px"... }}` containing `<h3>Cards</h3>` and the Offer select — lines 89-100) with:

```tsx
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid var(--border)", flexWrap: "wrap", gap: 12 }}>
        <h3 style={sectionHeader}>Cards</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 11, color: "var(--text-muted)", flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none" }}>
            <input
              type="checkbox"
              checked={bulkExclude}
              onChange={(e) => setBulkExclude(e.target.checked)}
              style={{ accentColor: "var(--accent)" }}
            />
            Exclude bulk
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 4, opacity: bulkExclude ? 1 : 0.5 }}>
            Trend &lt;
            <input
              type="number"
              min={0}
              max={1000}
              step={0.1}
              value={bulkThreshold}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (Number.isFinite(v) && v >= 0) setBulkThreshold(v);
              }}
              disabled={!bulkExclude}
              className="appraiser-field"
              style={{
                width: 60,
                padding: "2px 6px",
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                color: "var(--text-primary)",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
              }}
            />
            €
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 4, opacity: bulkExclude ? 1 : 0.5 }}>
            Bulk @
            <input
              type="number"
              min={0}
              max={bulkThreshold}
              step={0.01}
              value={bulkRate}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (Number.isFinite(v) && v >= 0 && v <= bulkThreshold) setBulkRate(v);
              }}
              disabled={!bulkExclude}
              className="appraiser-field"
              style={{
                width: 60,
                padding: "2px 6px",
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                color: "var(--text-primary)",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
              }}
            />
            €/ea
          </label>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            Offer
            <Select
              value={String(offerPct)}
              onChange={(v) => setOfferPct(Number(v))}
              options={OFFER_SELECT_OPTIONS}
              size="sm"
            />
          </span>
        </div>
      </div>
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Visual smoke (boot dev server)**

```bash
npm run dev
```

Open `http://localhost:3025/appraiser`, pick a collection with cards. Verify:
- The Exclude-bulk checkbox renders.
- Threshold and Rate inputs are dimmed (`opacity: 0.5`) and `disabled` when the checkbox is off.
- Toggling the checkbox un-dims the inputs.
- Inputs accept numeric edits.
- Page does NOT visibly change card data yet — that's Task 8.

- [ ] **Step 4: Commit**

```bash
git add components/appraiser/AppraiserCardTable.tsx
git commit -m "feat(appraiser): bulk-toggle controls in card-table header"
```

---

### Task 8: Render bulk-row dimming + chip and the second summary line

**Files:**
- Modify: `components/appraiser/AppraiserCardTable.tsx`

- [ ] **Step 1: Add the bulk chip + dim style on bulk rows**

In `components/appraiser/AppraiserCardTable.tsx`, find the row map (the `cards.map((c) => (` block — currently around line 137). Replace ONLY the opening `<tr>` (line 138):

```tsx
              <tr key={c._id} className="hover:bg-[var(--bg-card-hover)] transition-colors">
```

with:

```tsx
              <tr
                key={c._id}
                className="hover:bg-[var(--bg-card-hover)] transition-colors"
                style={bulkIds.has(c._id) ? { opacity: 0.4 } : undefined}
              >
```

Then, inside the qty cell (currently shows `{c.qty}` inside the conditional `editingQty === c._id ? <input/> : <span>...</span>`), add the bulk chip next to the displayed qty. Replace the `<span>{c.qty}</span>` block (lines 220-234):

```tsx
                  ) : (
                    <span
                      onClick={() => { setEditingQty(c._id); setQtyValue(String(c.qty)); }}
                      title="Click to edit quantity"
                      className="hover:bg-[var(--bg-hover)] transition-colors"
                      style={{
                        cursor: "pointer",
                        padding: "2px 6px",
                        borderRadius: 4,
                        borderBottom: "1px dashed var(--text-muted)",
                      }}
                    >
                      {c.qty}
                    </span>
                  )}
```

with:

```tsx
                  ) : (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span
                        onClick={() => { setEditingQty(c._id); setQtyValue(String(c.qty)); }}
                        title="Click to edit quantity"
                        className="hover:bg-[var(--bg-hover)] transition-colors"
                        style={{
                          cursor: "pointer",
                          padding: "2px 6px",
                          borderRadius: 4,
                          borderBottom: "1px dashed var(--text-muted)",
                        }}
                      >
                        {c.qty}
                      </span>
                      {bulkIds.has(c._id) && (
                        <span
                          title={`Trend < €${bulkThreshold.toFixed(2).replace(".", ",")} — excluded from main totals`}
                          style={{
                            fontSize: 9,
                            padding: "1px 5px",
                            borderRadius: 3,
                            background: "rgba(255,255,255,0.06)",
                            color: "var(--text-muted)",
                            fontFamily: "var(--font-mono)",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                          }}
                        >
                          bulk
                        </span>
                      )}
                    </span>
                  )}
```

- [ ] **Step 2: Add the second summary line**

Find the existing summary bar `<div>` (the one with `display: "flex", gap: 14, padding: "10px 14px"`, contains "Total cards", "From:", "Trend:" and the offer tier spans — currently around line 103-119). Right AFTER the closing `</div>` of that block (immediately before the table-wrapping `<div style={{ overflowX: "auto" }}>`), insert:

```tsx
      {bulkExclude && bulkCards.length > 0 && (
        <div style={{ display: "flex", gap: 14, padding: "8px 14px 10px 14px", borderBottom: "1px solid var(--border)", flexWrap: "wrap", alignItems: "center", fontSize: 11, color: "var(--text-muted)", background: "var(--bg-card)" }}>
          <span>↳ excludes {bulkCount} bulk card{bulkCount !== 1 ? "s" : ""} (Trend &lt; €{bulkThreshold.toFixed(2).replace(".", ",")})</span>
          {bulkRate > 0 && (
            <span>
              Bulk add-on: {bulkCount} × €{bulkRate.toFixed(2).replace(".", ",")} ={" "}
              <strong style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{eur(bulkAddOn)}</strong>
            </span>
          )}
          <span style={{ marginLeft: "auto", color: "var(--accent)" }}>
            Offer total: <strong style={{ fontFamily: "var(--font-mono)" }}>{eur(offerTotal)}</strong>
          </span>
        </div>
      )}
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Visual smoke**

Reload the appraiser page. With a collection that has both ≥€1 and <€1 trend cards loaded:
- Toggle on `Exclude bulk`. Verify rows where `Trend < €1` (and rows with no Trend yet) become dim with a `bulk` chip next to qty.
- Verify summary `From` / `Trend` / offer tiers shrink (because bulk cards no longer contribute).
- Verify the second summary line appears with `excludes N bulk cards` and `Offer total`.
- Set Bulk @ to `0.05`. Verify the `Bulk add-on` chunk appears and the Offer total grows by `bulkCount × 0.05`.
- Toggle off. Verify everything reverts and the second line disappears.
- Refresh the page. Verify the toggle state, threshold, and rate all persist.

- [ ] **Step 5: Commit**

```bash
git add components/appraiser/AppraiserCardTable.tsx
git commit -m "feat(appraiser): dim bulk rows and surface bulk-aware offer total"
```

---

### Task 9: Update the Copy export to two blocks with bulk-aware footer

**Files:**
- Modify: `components/appraiser/AppraiserCardTable.tsx`

- [ ] **Step 1: Replace `copyAll`**

In `components/appraiser/AppraiserCardTable.tsx`, replace the existing `copyAll` function (lines 47-63) with:

```tsx
  const copyAll = async () => {
    const header = `Name\tSet\tCN\tLang\tFoil\tQty\tFrom\tTrend\tOffer -${offerPct}%`;
    const formatRow = (c: AppraiserCard) => [
      c.name, c.set.toUpperCase(), c.collectorNumber, c.language,
      c.foil ? "foil" : "", c.qty,
      eur(c.fromPrice), eur(c.trendPrice),
      eur(c.fromPrice !== null ? c.fromPrice * (1 - offerPct / 100) : null),
    ].join("\t");
    const mainLines = mainCards.map(formatRow);
    const bulkBlock =
      bulkExclude && bulkCards.length > 0
        ? [
            "",
            `# Bulk (Trend < €${bulkThreshold.toFixed(2).replace(".", ",")}) — excluded from offer math`,
            ...bulkCards.map(formatRow),
          ]
        : [];
    const summary = [
      "",
      `Total cards: ${totalCards}${bulkExclude && bulkCards.length > 0 ? ` (${totalCards - bulkCount} main + ${bulkCount} bulk)` : ""}`,
      `Total From${bulkExclude && bulkCards.length > 0 ? " (main)" : ""}: ${eur(totalFrom)}`,
      `Total Trend${bulkExclude && bulkCards.length > 0 ? " (main)" : ""}: ${eur(totalTrend)}`,
      ...(bulkExclude && bulkRate > 0 && bulkCount > 0
        ? [`Bulk add-on: ${bulkCount} × ${eur(bulkRate)} = ${eur(bulkAddOn)}`]
        : []),
      `Offer -${offerPct}%: ${eur(offerTotal)}`,
    ];
    await navigator.clipboard.writeText([header, ...mainLines, ...bulkBlock, ...summary].join("\n"));
  };
```

- [ ] **Step 2: Move the `Copy` button into the new header strip**

The original `Copy` button lived inside the summary bar (around line 112-118). With the header bar now containing all controls, the Copy button should sit at the end of the controls group. Find this in the new header strip (added in Task 7):

```tsx
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            Offer
            <Select
              value={String(offerPct)}
              onChange={(v) => setOfferPct(Number(v))}
              options={OFFER_SELECT_OPTIONS}
              size="sm"
            />
          </span>
        </div>
      </div>
```

Replace with:

```tsx
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            Offer
            <Select
              value={String(offerPct)}
              onChange={(v) => setOfferPct(Number(v))}
              options={OFFER_SELECT_OPTIONS}
              size="sm"
            />
          </span>
          <button
            onClick={copyAll}
            className={btnSecondaryClass}
            style={btnSecondary}
          >
            Copy
          </button>
        </div>
      </div>
```

Then remove the old Copy button from the summary bar (the existing `<button onClick={copyAll} ... >Copy</button>` plus its enclosing whitespace, lines 112-118):

```tsx
        <button
          onClick={copyAll}
          className={btnSecondaryClass}
          style={{ ...btnSecondary, marginLeft: "auto" }}
        >
          Copy
        </button>
```

Delete those lines entirely.

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Visual smoke**

Reload the page. With bulk excluded and bulk rate set:
- Click Copy. Paste into a text editor.
- Verify the output has: header → main rows → blank → `# Bulk (...)` heading → bulk rows → blank → footer with `(N main + M bulk)`, `Total From (main)`, `Bulk add-on`, and `Offer -X%`.
- Toggle bulk off and copy again. Verify output matches the original single-block format with no `# Bulk` header.

- [ ] **Step 5: Commit**

```bash
git add components/appraiser/AppraiserCardTable.tsx
git commit -m "feat(appraiser): two-block Copy export with bulk-aware footer"
```

---

### Task 10: End-to-end manual smoke

**Files:** None — verification only.

- [ ] **Step 1: Final typecheck**

```bash
npm run typecheck
```

Expected: PASS, zero errors.

- [ ] **Step 2: Walkthrough on a real collection**

Boot `npm run dev` and open `http://localhost:3025/appraiser`.

1. Pick (or create) a collection with at least 5 cards: some <€1 trend, some ≥€1, ideally one with `trendPrice == null` (an unscraped one).
2. With Exclude-bulk OFF: confirm From / Trend / offer tiers match the pre-feature behavior (i.e. include every card).
3. Toggle Exclude-bulk ON. Confirm:
   - The <€1 cards and the unscraped card are dimmed and chipped `bulk`.
   - From / Trend / offer-tier values shrink.
   - A second line shows `excludes N bulk cards` and `Offer total`.
4. Set Bulk @ to `0.05`. Confirm:
   - `Bulk add-on: N × €0,05 = €X` appears.
   - `Offer total` increases by exactly `N × 0.05`.
5. Try Bulk @ = `2`. Confirm the input clamps (won't accept >€1 because `max={bulkThreshold}`).
6. Bump threshold to `2`. Confirm more cards become bulk and totals re-derive.
7. Reload the page. Confirm all three settings persisted.
8. Open the same collection in a second browser/incognito tab. Confirm settings are visible there too (DB persistence, not localStorage).
9. Click Copy. Paste in a text editor. Confirm two blocks + bulk-aware footer.
10. Switch to a different collection. Confirm its bulk settings are independent (default off / €1 / €0).
11. Toggle Exclude-bulk OFF on the second collection, set its threshold to €5, set rate to €0.10. Reload. Switch back to the first collection. Confirm first collection's settings did NOT bleed across.

- [ ] **Step 3: Pre-existing regression check**

Confirm nothing else on the Appraiser tab broke:
- Adding a card via the input still works.
- Editing a card's qty / foil still works.
- Refresh Prices on the collection selector still works.
- Renaming and deleting a collection still work.

- [ ] **Step 4: If everything passes — done.**

No further commit needed; the feature is complete.

If any step fails, file the failure as a bug and fix in a follow-up commit.

---

## Spec coverage check

| Spec section | Implemented in |
|---|---|
| `Exclude bulk` checkbox in header | Task 7 |
| Threshold input (default €1) | Task 7 |
| Bulk rate input | Task 7 |
| Null trend treated as bulk | Task 5 (`isBulk` includes `c.trendPrice == null`) |
| Bulk rows dimmed + chip | Task 8 |
| Main totals exclude bulk | Task 5 |
| Second summary line with bulk add-on / offer total | Task 8 |
| Copy export two-block format | Task 9 |
| Schema fields on `AppraiserCollectionDoc` | Task 1 |
| API GET supplies defaults | Task 2 |
| API PUT validates and persists | Task 3 |
| `AppraiserCollection` required fields | Task 1 |
| Hydration on `_id` change only | Task 5 |
| Debounced PUT (300ms) | Task 6 |
| Failure: log to console, no rollback | Task 6 |
| List endpoint unchanged | Confirmed in spec — no task needed |
| Manual smoke walkthrough | Task 10 |
