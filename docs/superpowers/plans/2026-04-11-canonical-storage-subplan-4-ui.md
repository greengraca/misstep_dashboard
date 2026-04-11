# Canonical Storage — Sub-Plan 4: `/storage` Page UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `/storage` page and all supporting UI components. At the end of this sub-plan, the **Storage** tab finally appears in the sidebar and clicking it opens a page where the user can configure their shelf layout, trigger a rebuild, view the sorted slot sequence grouped by shelf-row/box/box-row, search for cards, and create drag-based cut overrides.

**Architecture:** One Next.js route (`app/(dashboard)/storage/page.tsx`) that renders a single client-component tree. Top-level `StorageContent.tsx` owns SWR state (stats, layout, slots, overrides), composes the four sections (Header, Drawer, LayoutEditor, Viewer), and wires up mutations. The viewer uses `react-virtuoso` for grouped scrolling. Drag-to-override is native HTML5 drag-and-drop, no external library.

**Tech Stack:** Next.js 16 App Router, React 19, SWR 2, Tailwind 4, Lucide icons, `react-virtuoso` (new dev dep). Follows existing `components/stock/*` patterns for fetching, styling, and layout.

---

## File Structure

**New files:**

| Path | Responsibility |
|---|---|
| `app/(dashboard)/storage/page.tsx` | Thin route wrapper — just imports and renders `StorageContent`. |
| `components/storage/StorageContent.tsx` | Top-level client component. Owns SWR hooks for stats/layout/slots/overrides. Renders the four sections and handles all mutations. |
| `components/storage/StorageHeader.tsx` | Stats cards row (total variants / total cards / placed / unplaced / last rebuild), Rebuild button, Search box. |
| `components/storage/StorageDrawer.tsx` | Collapsible drawer showing unmatched variants, stale overrides, spanned sets. Dismissible per category. |
| `components/storage/LayoutEditor.tsx` | Configuration UI: add/remove shelf rows, add/remove boxes in each row, pick box type (1k/2k/4k). Save button calls `PUT /api/storage/layout`. |
| `components/storage/StorageViewer.tsx` | Virtualised grouped list using `react-virtuoso`. Groups by shelf-row → box → box-row. Group headers are sticky and collapsible. |
| `components/storage/SlotRow.tsx` | Single slot display: position, thumbnail (lazy-loaded), name, set code, rarity pill, qty, drag handle. |
| `components/storage/OverrideDragContext.tsx` | Minimal React context to coordinate drag state between `SlotRow` (source) and box-row group headers (drop targets). |

**Modified files:**

| Path | Change |
|---|---|
| `package.json` | Add `react-virtuoso` (runtime dep). |
| `components/dashboard/sidebar.tsx` | Add `{ href: "/storage", label: "Storage", icon: Library }` entry to the MANAGEMENT section, between `/stock` and `/ev`. |

## Design conventions to follow

Look at `components/stock/StockContent.tsx` and `components/stock/StockTable.tsx` before starting. Match the visual language:
- Card surfaces: `bg-[var(--card-bg)]`, `border border-[var(--border)]`, `rounded-[var(--radius)]`
- Stat cards: reuse `components/dashboard/stat-card.tsx` — same component that `/stock` and `/finance` use
- Text colors: `text-[var(--text-primary)]`, `text-[var(--text-secondary)]`, `text-[var(--text-muted)]`
- Accent color: `var(--accent)` for active states and highlights
- Spacing: `gap-4` between cards, `p-4` inside cards, `px-6 py-4` page padding
- Lucide icons at `size={18}` for inline, `size={20}` for section headers

SWR fetcher: `const fetcher = (url: string) => fetch(url).then((r) => r.json());` — same as `StockContent.tsx:15`.

---

## Task 1: Add `react-virtuoso` dependency and sidebar entry

**Files:**
- Modify: `package.json`
- Modify: `components/dashboard/sidebar.tsx`

- [ ] **Step 1.1: Install `react-virtuoso`**

```bash
npm install react-virtuoso
```

- [ ] **Step 1.2: Add Storage entry to sidebar**

In `components/dashboard/sidebar.tsx`, find the MANAGEMENT section (around line 13-18). Add `Library` to the lucide-react import at line 6, then insert the Storage link between `/stock` and `/ev`:

```tsx
import { Activity, BarChart3, Calculator, CheckSquare, ChevronLeft, ChevronRight, LayoutDashboard, Library, LogOut, Menu, MessageCircle, Package, Settings, ShoppingBag, Wallet, X } from "lucide-react";
```

```tsx
  { label: "MANAGEMENT", items: [
    { href: "/finance", label: "Finance", icon: Wallet },
    { href: "/cardmarket", label: "Cardmarket", icon: ShoppingBag },
    { href: "/stock", label: "Stock", icon: Package },
    { href: "/storage", label: "Storage", icon: Library },
    { href: "/ev", label: "EV Calculator", icon: Calculator },
  ]},
```

- [ ] **Step 1.3: Create the page wrapper**

`app/(dashboard)/storage/page.tsx`:

```tsx
import StorageContent from "@/components/storage/StorageContent";

export default function StoragePage() {
  return <StorageContent />;
}
```

- [ ] **Step 1.4: Create a placeholder `StorageContent.tsx`** so the link doesn't 404 during subsequent task work:

`components/storage/StorageContent.tsx`:

```tsx
"use client";

export default function StorageContent() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-4">Storage</h1>
      <p className="text-[var(--text-muted)]">Under construction — sub-plan 4 in progress.</p>
    </div>
  );
}
```

- [ ] **Step 1.5: Verify build + smoke-test the sidebar link**

```bash
npx tsc --noEmit
npm run build 2>&1 | grep -E "storage|error" | head -5
```
Expected: `/storage` appears in the build output, no errors.

- [ ] **Step 1.6: Commit**

```bash
git add package.json package-lock.json components/dashboard/sidebar.tsx app/\(dashboard\)/storage/page.tsx components/storage/StorageContent.tsx
git commit -m "Add Storage sidebar entry and /storage route placeholder"
```

---

## Task 2: Types + shared fetcher for the storage UI

**Files:**
- Create: `components/storage/types.ts`

Small module with the TypeScript shapes that SWR returns, so component files don't re-derive them.

- [ ] **Step 2.1: Create the types file**

```tsx
// components/storage/types.ts
import type {
  PlacedCell,
  ShelfLayout,
  CutOverride,
  StaleOverrideReport,
  UnmatchedVariant,
} from "@/lib/storage";
import type { RebuildResult, StorageStats } from "@/lib/storage-db";

export type { PlacedCell, ShelfLayout, CutOverride, StaleOverrideReport, UnmatchedVariant, RebuildResult, StorageStats };

export interface SlotsResponse {
  data: {
    slots: PlacedCell[];
    total: number;
    page: number;
    pageSize: number;
  };
}

export interface StatsResponse {
  data: StorageStats;
}

export interface LayoutResponse {
  data: ShelfLayout;
}

export interface OverridesResponse {
  data: CutOverride[];
}

export interface RebuildResponse {
  data: RebuildResult;
}

export const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Request failed: ${r.status}`);
    return r.json();
  });
```

- [ ] **Step 2.2: Type-check + commit**

```bash
npx tsc --noEmit
git add components/storage/types.ts
git commit -m "Add storage component types and shared fetcher"
```

---

## Task 3: `StorageHeader` — stats cards + rebuild button + search box

**Files:**
- Create: `components/storage/StorageHeader.tsx`

Props:
- `stats: StorageStats | null`
- `onRebuild: () => Promise<void>`
- `isRebuilding: boolean`
- `search: string`
- `onSearchChange: (s: string) => void`

Layout (inside a `div className="space-y-4"`):
1. **Row 1:** four `StatCard` components from `components/dashboard/stat-card.tsx` — Variants, Cards, Placed, Unplaced. Each reads from `stats` and shows "—" when `stats === null`.
2. **Row 2:** a flex row with a Rebuild button (primary accent color, shows `<Loader2 className="animate-spin" />` when `isRebuilding`), and a debounced search input growing to fill the row.

Search input uses the same pattern as `StockContent.tsx:36-43` — a `useDebounced` hook with 300ms delay, then calls `onSearchChange` with the debounced value.

Rebuild button is disabled while `isRebuilding`. On click it calls `onRebuild()` and awaits. Errors bubble to the parent.

Last-rebuild timestamp goes as a subline under the "Variants" stat card: `stats?.lastRebuildAt ? new Date(stats.lastRebuildAt).toLocaleString() : "never"`.

- [ ] **Step 3.1: Write the component**

Use this skeleton — fill in the stat card rows and the rebuild row per the description above. Exact JSX format should match `components/stock/StockContent.tsx` styling.

```tsx
"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw, Search } from "lucide-react";
import StatCard from "@/components/dashboard/stat-card";
import type { StorageStats } from "./types";

interface StorageHeaderProps {
  stats: StorageStats | null;
  onRebuild: () => Promise<void>;
  isRebuilding: boolean;
  search: string;
  onSearchChange: (s: string) => void;
}

export default function StorageHeader({
  stats,
  onRebuild,
  isRebuilding,
  search,
  onSearchChange,
}: StorageHeaderProps) {
  const [localSearch, setLocalSearch] = useState(search);

  useEffect(() => {
    const id = setTimeout(() => onSearchChange(localSearch), 300);
    return () => clearTimeout(id);
  }, [localSearch, onSearchChange]);

  const lastRebuildLabel = stats?.lastRebuildAt
    ? new Date(stats.lastRebuildAt).toLocaleString()
    : "never";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Variants"
          value={stats ? stats.totalVariants.toLocaleString() : "—"}
          subline={`last rebuild: ${lastRebuildLabel}`}
        />
        <StatCard title="Cards" value={stats ? stats.totalCards.toLocaleString() : "—"} />
        <StatCard title="Placed" value={stats ? stats.placedSlots.toLocaleString() : "—"} />
        <StatCard
          title="Unplaced"
          value={stats ? stats.unplacedSlots.toLocaleString() : "—"}
          subline={stats && stats.unplacedSlots > 0 ? "needs more capacity" : undefined}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => onRebuild()}
          disabled={isRebuilding}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-[var(--radius)] bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {isRebuilding ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          {isRebuilding ? "Rebuilding…" : "Rebuild"}
        </button>

        <div className="flex-1 relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none"
          />
          <input
            type="text"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder="Search by name…"
            className="w-full pl-9 pr-3 py-2 rounded-[var(--radius)] bg-[var(--card-bg)] border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          />
        </div>
      </div>
    </div>
  );
}
```

Check that `StatCard`'s exported props match what I'm passing (`title`, `value`, `subline`). If not, adjust to match the real signature in `components/dashboard/stat-card.tsx`.

- [ ] **Step 3.2: Type-check + commit**

```bash
npx tsc --noEmit
git add components/storage/StorageHeader.tsx
git commit -m "Add StorageHeader with stats cards, rebuild button, search"
```

---

## Task 4: `StorageDrawer` — collapsible notifications

**Files:**
- Create: `components/storage/StorageDrawer.tsx`

Props:
- `unmatched: UnmatchedVariant[]`
- `staleOverrides: { staleMissingSlot: StaleOverrideReport[]; staleMissingTarget: StaleOverrideReport[]; staleRegression: StaleOverrideReport[]; }`
- `onDeleteStale: (id: string) => Promise<void>`
- `onClearAllStale: () => Promise<void>`

Layout: a single card with three collapsible sub-sections. Default state is collapsed.

Sub-sections (each with count badge and chevron toggle):
1. **Unmatched variants** — scrollable table showing name/set/qty.
2. **Stale overrides** — three groups (missing slot, missing target, regression). Each row has a small delete button. Bulk "Clear all stale" button at the top of this sub-section.
3. Collapsed view: a single summary line per sub-section (e.g., `"⚠ 49 unmatched · 2 stale overrides"`).

If all counts are zero, render nothing (return `null`).

Use `ChevronDown` / `ChevronRight` from lucide. Collapse state is local to the component (`useState<Set<string>>`).

- [ ] **Step 4.1: Write the component**

Full implementation. Keep it focused — no fancy animations, just expand/collapse via conditional rendering.

```tsx
"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import type { UnmatchedVariant, StaleOverrideReport } from "./types";

interface StorageDrawerProps {
  unmatched: UnmatchedVariant[];
  staleOverrides: {
    staleMissingSlot: StaleOverrideReport[];
    staleMissingTarget: StaleOverrideReport[];
    staleRegression: StaleOverrideReport[];
  };
  onDeleteStale: (id: string) => Promise<void>;
  onClearAllStale: () => Promise<void>;
}

export default function StorageDrawer({
  unmatched,
  staleOverrides,
  onDeleteStale,
  onClearAllStale,
}: StorageDrawerProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const staleCount =
    staleOverrides.staleMissingSlot.length +
    staleOverrides.staleMissingTarget.length +
    staleOverrides.staleRegression.length;

  if (unmatched.length === 0 && staleCount === 0) return null;

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderSection = (key: string, label: string, count: number, body: React.ReactNode) => {
    if (count === 0) return null;
    const isOpen = expanded.has(key);
    return (
      <div className="border-t border-[var(--border)] first:border-t-0">
        <button
          onClick={() => toggle(key)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-[var(--hover-bg)]"
        >
          <span className="flex items-center gap-2 text-[var(--text-primary)]">
            {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            {label}
            <span className="text-[var(--text-muted)]">({count})</span>
          </span>
        </button>
        {isOpen && <div className="px-4 pb-4">{body}</div>}
      </div>
    );
  };

  return (
    <div className="rounded-[var(--radius)] bg-[var(--card-bg)] border border-[var(--border)]">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)]">
        <AlertTriangle size={16} className="text-yellow-500" />
        <span className="text-sm font-medium text-[var(--text-primary)]">
          Needs attention
        </span>
      </div>

      {renderSection(
        "unmatched",
        "Unmatched variants",
        unmatched.length,
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[var(--text-muted)]">
              <tr>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Set</th>
                <th className="py-2">Qty</th>
              </tr>
            </thead>
            <tbody>
              {unmatched.map((v, i) => (
                <tr key={i} className="border-t border-[var(--border)]">
                  <td className="py-2 pr-4 text-[var(--text-primary)]">{v.name}</td>
                  <td className="py-2 pr-4 text-[var(--text-secondary)]">{v.set}</td>
                  <td className="py-2 text-[var(--text-secondary)]">{v.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {renderSection(
        "stale",
        "Stale overrides",
        staleCount,
        <div className="space-y-3">
          <button
            onClick={() => onClearAllStale()}
            className="text-xs text-red-500 hover:underline"
          >
            Clear all stale
          </button>
          {[
            ["Anchor slot no longer exists", staleOverrides.staleMissingSlot],
            ["Target box no longer in layout", staleOverrides.staleMissingTarget],
            ["Natural flow moved past this override", staleOverrides.staleRegression],
          ].map(([label, list]) => {
            const items = list as StaleOverrideReport[];
            if (items.length === 0) return null;
            return (
              <div key={label as string}>
                <div className="text-xs font-medium text-[var(--text-muted)] mb-1">
                  {label as string} ({items.length})
                </div>
                <ul className="space-y-1">
                  {items.map((s) => (
                    <li
                      key={s.override.id}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="text-[var(--text-secondary)]">
                        {s.override.anchorSlotKey}
                      </span>
                      <button
                        onClick={() => onDeleteStale(s.override.id)}
                        className="p-1 text-[var(--text-muted)] hover:text-red-500"
                        title="Delete override"
                      >
                        <Trash2 size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4.2: Type-check + commit**

```bash
npx tsc --noEmit
git add components/storage/StorageDrawer.tsx
git commit -m "Add StorageDrawer for unmatched variants and stale overrides"
```

---

## Task 5: `LayoutEditor` — shelf-row and box configuration

**Files:**
- Create: `components/storage/LayoutEditor.tsx`

Props:
- `layout: ShelfLayout`
- `onSave: (layout: ShelfLayout) => Promise<void>`

Behavior:
- Maintain a local editable copy via `useState`. The parent's `layout` becomes the initial value; subsequent edits live locally until Save.
- "Add shelf row" button adds `{ id: "", label: "New row", boxes: [] }` — the server will fill in the UUID on save.
- Per-shelf-row controls: editable label, list of boxes, "Add box" button.
- Per-box controls: box type select (1k / 2k / 4k), optional label input, delete button.
- Reorder via drag handles on shelf rows and boxes (HTML5 DnD, using `draggable` + `onDragStart` / `onDragOver` / `onDrop`). If time-constrained, ship without reorder and add "Move up" / "Move down" arrows instead — easier and still functional.
- Save button POSTs the local state to `PUT /api/storage/layout`. After save, show a toast-style message "Layout saved. Press Rebuild to regenerate slots." (Toast can be a simple `aria-live` region; don't add a toast library.)

Render a card-style container matching the other sections.

- [ ] **Step 5.1: Write the component**

Start with the non-reordering version (arrows instead of drag). Drag reorder can ship in a follow-up commit inside this task if you have time.

```tsx
"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from "lucide-react";
import type { ShelfLayout } from "./types";
import type { BoxConfig, BoxType, ShelfRowConfig } from "@/lib/storage";

interface LayoutEditorProps {
  layout: ShelfLayout;
  onSave: (layout: ShelfLayout) => Promise<void>;
}

const BOX_TYPES: BoxType[] = ["1k", "2k", "4k"];

export default function LayoutEditor({ layout, onSave }: LayoutEditorProps) {
  const [local, setLocal] = useState<ShelfLayout>(layout);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setLocal(layout);
  }, [layout]);

  const addShelfRow = () => {
    setLocal({
      shelfRows: [
        ...local.shelfRows,
        { id: "", label: `Row ${local.shelfRows.length + 1}`, boxes: [] },
      ],
    });
  };

  const removeShelfRow = (idx: number) => {
    setLocal({ shelfRows: local.shelfRows.filter((_, i) => i !== idx) });
  };

  const moveShelfRow = (idx: number, delta: number) => {
    const next = [...local.shelfRows];
    const target = idx + delta;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setLocal({ shelfRows: next });
  };

  const updateRowLabel = (idx: number, label: string) => {
    const next = [...local.shelfRows];
    next[idx] = { ...next[idx], label };
    setLocal({ shelfRows: next });
  };

  const addBox = (rowIdx: number) => {
    const next = [...local.shelfRows];
    next[rowIdx] = {
      ...next[rowIdx],
      boxes: [...next[rowIdx].boxes, { id: "", type: "4k" as BoxType }],
    };
    setLocal({ shelfRows: next });
  };

  const removeBox = (rowIdx: number, boxIdx: number) => {
    const next = [...local.shelfRows];
    next[rowIdx] = {
      ...next[rowIdx],
      boxes: next[rowIdx].boxes.filter((_, i) => i !== boxIdx),
    };
    setLocal({ shelfRows: next });
  };

  const updateBoxType = (rowIdx: number, boxIdx: number, type: BoxType) => {
    const next = [...local.shelfRows];
    const boxes = [...next[rowIdx].boxes];
    boxes[boxIdx] = { ...boxes[boxIdx], type };
    next[rowIdx] = { ...next[rowIdx], boxes };
    setLocal({ shelfRows: next });
  };

  const moveBox = (rowIdx: number, boxIdx: number, delta: number) => {
    const next = [...local.shelfRows];
    const boxes = [...next[rowIdx].boxes];
    const target = boxIdx + delta;
    if (target < 0 || target >= boxes.length) return;
    [boxes[boxIdx], boxes[target]] = [boxes[target], boxes[boxIdx]];
    next[rowIdx] = { ...next[rowIdx], boxes };
    setLocal({ shelfRows: next });
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await onSave(local);
      setMessage("Layout saved. Press Rebuild to regenerate slots.");
    } catch (err) {
      setMessage(`Save failed: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-[var(--radius)] bg-[var(--card-bg)] border border-[var(--border)] p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Layout</h2>
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius)] bg-[var(--accent)] text-white text-sm hover:opacity-90 disabled:opacity-50"
        >
          <Save size={14} />
          {saving ? "Saving…" : "Save layout"}
        </button>
      </div>

      {message && (
        <div className="mb-3 text-xs text-[var(--text-muted)]" aria-live="polite">
          {message}
        </div>
      )}

      <div className="space-y-3">
        {local.shelfRows.map((row, rowIdx) => (
          <ShelfRowEditor
            key={rowIdx}
            row={row}
            onLabelChange={(v) => updateRowLabel(rowIdx, v)}
            onRemove={() => removeShelfRow(rowIdx)}
            onMoveUp={() => moveShelfRow(rowIdx, -1)}
            onMoveDown={() => moveShelfRow(rowIdx, 1)}
            onAddBox={() => addBox(rowIdx)}
            onRemoveBox={(boxIdx) => removeBox(rowIdx, boxIdx)}
            onBoxTypeChange={(boxIdx, type) => updateBoxType(rowIdx, boxIdx, type)}
            onMoveBoxUp={(boxIdx) => moveBox(rowIdx, boxIdx, -1)}
            onMoveBoxDown={(boxIdx) => moveBox(rowIdx, boxIdx, 1)}
          />
        ))}

        <button
          onClick={addShelfRow}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-[var(--radius)] border border-dashed border-[var(--border)] text-[var(--text-muted)] text-sm hover:text-[var(--text-primary)] hover:border-[var(--accent)]"
        >
          <Plus size={14} /> Add shelf row
        </button>
      </div>
    </div>
  );
}

interface ShelfRowEditorProps {
  row: ShelfRowConfig;
  onLabelChange: (v: string) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onAddBox: () => void;
  onRemoveBox: (boxIdx: number) => void;
  onBoxTypeChange: (boxIdx: number, type: BoxType) => void;
  onMoveBoxUp: (boxIdx: number) => void;
  onMoveBoxDown: (boxIdx: number) => void;
}

function ShelfRowEditor(props: ShelfRowEditorProps) {
  const { row, onLabelChange, onRemove, onMoveUp, onMoveDown, onAddBox, onRemoveBox, onBoxTypeChange, onMoveBoxUp, onMoveBoxDown } = props;

  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] p-3">
      <div className="flex items-center gap-2 mb-2">
        <input
          type="text"
          value={row.label}
          onChange={(e) => onLabelChange(e.target.value)}
          className="flex-1 bg-transparent text-sm font-medium text-[var(--text-primary)] border-b border-transparent focus:border-[var(--accent)] outline-none"
        />
        <button onClick={onMoveUp} className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
          <ArrowUp size={14} />
        </button>
        <button onClick={onMoveDown} className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
          <ArrowDown size={14} />
        </button>
        <button onClick={onRemove} className="p-1 text-[var(--text-muted)] hover:text-red-500">
          <Trash2 size={14} />
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {row.boxes.map((box, boxIdx) => (
          <BoxEditor
            key={boxIdx}
            box={box}
            onTypeChange={(type) => onBoxTypeChange(boxIdx, type)}
            onRemove={() => onRemoveBox(boxIdx)}
            onMoveUp={() => onMoveBoxUp(boxIdx)}
            onMoveDown={() => onMoveBoxDown(boxIdx)}
          />
        ))}
        <button
          onClick={onAddBox}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-[var(--radius)] border border-dashed border-[var(--border)] text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--accent)]"
        >
          <Plus size={12} /> box
        </button>
      </div>
    </div>
  );
}

interface BoxEditorProps {
  box: BoxConfig;
  onTypeChange: (type: BoxType) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function BoxEditor({ box, onTypeChange, onRemove, onMoveUp, onMoveDown }: BoxEditorProps) {
  return (
    <div className="inline-flex items-center gap-1 px-2 py-1 rounded-[var(--radius)] bg-[var(--bg)] border border-[var(--border)] text-xs">
      <select
        value={box.type}
        onChange={(e) => onTypeChange(e.target.value as BoxType)}
        className="bg-transparent text-[var(--text-primary)] outline-none"
      >
        {BOX_TYPES.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
      <button onClick={onMoveUp} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
        <ArrowUp size={10} />
      </button>
      <button onClick={onMoveDown} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
        <ArrowDown size={10} />
      </button>
      <button onClick={onRemove} className="text-[var(--text-muted)] hover:text-red-500">
        <Trash2 size={10} />
      </button>
    </div>
  );
}
```

- [ ] **Step 5.2: Type-check + commit**

```bash
npx tsc --noEmit
git add components/storage/LayoutEditor.tsx
git commit -m "Add LayoutEditor for shelf row and box configuration"
```

---

## Task 6: `SlotRow` — single card display

**Files:**
- Create: `components/storage/SlotRow.tsx`

Props:
- `slot: PlacedCell` (discriminated union between `PlacedSlot` and `EmptyReservedCell`)
- `onDragStart?: (slotKey: string) => void` (only attached for PlacedSlot)
- `onDragEnd?: () => void`

Two rendering modes based on `slot.kind`:
1. `kind === "empty-reserved"` → render a muted divider row: `"— reserved gap —"` with a small "clear" button that deletes the underlying override (delegated to parent via a callback; add a `onClearGap` prop).
2. Regular `PlacedSlot` → render a full row: position number, thumbnail, name, set code, rarity pill, qty, and a drag handle.

Drag handle uses `draggable={true}` on a wrapping `div` or on a dedicated handle icon. `onDragStart` sets `dataTransfer` with the slot key.

- [ ] **Step 6.1: Write the component**

```tsx
"use client";

import Image from "next/image";
import { GripVertical, X } from "lucide-react";
import type { PlacedCell } from "./types";

interface SlotRowProps {
  slot: PlacedCell;
  onDragStart?: (slotKey: string) => void;
  onDragEnd?: () => void;
  onClearGap?: () => void;
}

const RARITY_COLORS: Record<string, string> = {
  mythic: "bg-orange-500",
  rare: "bg-yellow-500",
  uncommon: "bg-gray-400",
  common: "bg-gray-600",
};

export default function SlotRow({ slot, onDragStart, onDragEnd, onClearGap }: SlotRowProps) {
  if (slot.kind === "empty-reserved") {
    return (
      <div className="flex items-center justify-between px-4 py-1.5 text-xs text-[var(--text-muted)] italic border-l-2 border-dashed border-[var(--border)]">
        <span>— reserved gap —</span>
        {onClearGap && (
          <button onClick={onClearGap} className="hover:text-red-500" title="Clear override">
            <X size={12} />
          </button>
        )}
      </div>
    );
  }

  const flagged = slot.unplaced || slot.spansShelfRow;

  return (
    <div
      draggable={onDragStart !== undefined}
      onDragStart={(e) => {
        if (!onDragStart) return;
        e.dataTransfer.setData("application/x-slot-key", slot.slotKey);
        e.dataTransfer.effectAllowed = "move";
        onDragStart(slot.slotKey);
      }}
      onDragEnd={onDragEnd}
      className={`flex items-center gap-3 px-4 py-2 border-t border-[var(--border)] ${
        flagged ? "bg-red-500/5" : ""
      } hover:bg-[var(--hover-bg)]`}
    >
      <span className="w-12 text-xs text-[var(--text-muted)] font-mono">{slot.position}</span>

      {slot.imageUri ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={slot.imageUri}
          alt={slot.name}
          loading="lazy"
          className="w-8 h-11 rounded-sm object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-8 h-11 rounded-sm bg-[var(--bg)] flex-shrink-0" />
      )}

      <span className="flex-1 text-sm text-[var(--text-primary)] truncate">{slot.name}</span>

      <span className="text-xs text-[var(--text-muted)] uppercase">{slot.set}</span>

      <span
        className={`w-2 h-2 rounded-full ${RARITY_COLORS[slot.rarity] ?? "bg-gray-500"}`}
        title={slot.rarity}
      />

      <span className="text-xs text-[var(--text-secondary)] w-8 text-right">×{slot.qtyInSlot}</span>

      <GripVertical size={14} className="text-[var(--text-muted)] cursor-grab" />
    </div>
  );
}
```

Note on the `<img>` tag: using a plain `img` instead of `next/image` because Scryfall URLs are hotlinked and we don't want the Next image optimizer to fetch and cache 15k+ different URLs. The eslint-disable is intentional. If the project's eslint config blocks this strictly, fall back to `next/image` with a `remotePatterns` entry for `cards.scryfall.io`.

- [ ] **Step 6.2: Type-check + commit**

```bash
npx tsc --noEmit
git add components/storage/SlotRow.tsx
git commit -m "Add SlotRow for slot and empty-reserved cell display"
```

---

## Task 7: `StorageViewer` — virtualised grouped list

**Files:**
- Create: `components/storage/StorageViewer.tsx`

This is the hardest component of the sub-plan. It uses `react-virtuoso`'s `GroupedVirtuoso` to render grouped sticky headers over a flat slot list.

Props:
- `slots: PlacedCell[]`
- `total: number` (for infinite-scroll cutoff)
- `onDragStart: (slotKey: string) => void`
- `onDragEnd: () => void`
- `onDrop: (targetShelfRowId: string, targetBoxId: string, targetBoxRowIdx: number) => void`
- `onClearGap: (slotKey: string) => void`
- `scrollToPosition?: number` (search-to-scroll)

Behavior:
- Compute groups from `slots`: one group per unique `(shelfRowId, boxId, boxRowIndex)` tuple, in the order they appear.
- Each group header shows `"Shelf row 'Top' · Box 'Blue lid' · Row 0 (far→near)"` and a slot count.
- Group headers are drop targets for override creation: `onDragOver` sets the drop effect, `onDrop` reads the slot key from `dataTransfer` and calls the parent's `onDrop(shelfRowId, boxId, boxRowIndex)`.
- When `scrollToPosition` changes, call `virtuoso.scrollToIndex({ index: position - 1, behavior: "smooth" })`.
- Support collapse/expand of groups via local state (default: all expanded). Collapsed groups render only the header.

**Warning:** `GroupedVirtuoso` with expand/collapse is non-trivial. If you run into trouble, a simpler approach is plain `Virtuoso` with group-header rows interleaved in the item list — you lose sticky headers but keep virtualisation.

Given the complexity, this task can legitimately take multiple iterations. Ship a simplified version first (no collapse, no drop targets) in step 7.1, then layer on the interactions in 7.2 and 7.3.

- [ ] **Step 7.1: Minimal viewer — virtualised list with group headers, no interactions**

```tsx
"use client";

import { useMemo, useRef, useEffect } from "react";
import { GroupedVirtuoso, type GroupedVirtuosoHandle } from "react-virtuoso";
import SlotRow from "./SlotRow";
import type { PlacedCell } from "./types";

interface StorageViewerProps {
  slots: PlacedCell[];
  onDragStart: (slotKey: string) => void;
  onDragEnd: () => void;
  onDrop: (targetShelfRowId: string, targetBoxId: string, targetBoxRowIdx: number) => void;
  onClearGap: (slotKey: string) => void;
  scrollToPosition?: number;
}

interface SlotGroup {
  key: string;
  label: string;
  shelfRowId: string;
  boxId: string;
  boxRowIndex: number;
  count: number;
}

function groupSlots(slots: PlacedCell[]): { groups: SlotGroup[]; counts: number[] } {
  const groups: SlotGroup[] = [];
  const counts: number[] = [];
  let currentKey = "";
  for (const slot of slots) {
    if (slot.kind === "empty-reserved" || slot.shelfRowIndex < 0) {
      // Group empty-reserved and unplaced cells together at the tail.
      if (currentKey !== "__tail") {
        groups.push({
          key: "__tail",
          label: "Unplaced / reserved",
          shelfRowId: "",
          boxId: "",
          boxRowIndex: -1,
          count: 0,
        });
        counts.push(0);
        currentKey = "__tail";
      }
      counts[counts.length - 1]++;
      groups[groups.length - 1].count++;
      continue;
    }

    const k = `${slot.shelfRowId}|${slot.boxId}|${slot.boxRowIndex}`;
    if (k !== currentKey) {
      groups.push({
        key: k,
        label: `${slot.shelfRowId || "—"} · ${slot.boxId} · row ${slot.boxRowIndex} (${slot.readingDirection})`,
        shelfRowId: slot.shelfRowId,
        boxId: slot.boxId,
        boxRowIndex: slot.boxRowIndex,
        count: 0,
      });
      counts.push(0);
      currentKey = k;
    }
    counts[counts.length - 1]++;
    groups[groups.length - 1].count++;
  }
  return { groups, counts };
}

export default function StorageViewer({
  slots,
  onDragStart,
  onDragEnd,
  onDrop,
  onClearGap,
  scrollToPosition,
}: StorageViewerProps) {
  const virtuoso = useRef<GroupedVirtuosoHandle>(null);
  const { groups, counts } = useMemo(() => groupSlots(slots), [slots]);

  useEffect(() => {
    if (!scrollToPosition || !virtuoso.current) return;
    const target = slots.findIndex(
      (s) => s.kind !== "empty-reserved" && (s as { position?: number }).position === scrollToPosition
    );
    if (target >= 0) {
      virtuoso.current.scrollToIndex({ index: target, behavior: "smooth" });
    }
  }, [scrollToPosition, slots]);

  if (slots.length === 0) {
    return (
      <div className="rounded-[var(--radius)] bg-[var(--card-bg)] border border-[var(--border)] p-8 text-center text-sm text-[var(--text-muted)]">
        No slots yet. Configure a layout and press Rebuild.
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius)] bg-[var(--card-bg)] border border-[var(--border)] overflow-hidden">
      <GroupedVirtuoso
        ref={virtuoso}
        style={{ height: 600 }}
        groupCounts={counts}
        groupContent={(i) => (
          <GroupHeader
            group={groups[i]}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const slotKey = e.dataTransfer.getData("application/x-slot-key");
              if (slotKey && groups[i].boxRowIndex >= 0) {
                onDrop(groups[i].shelfRowId, groups[i].boxId, groups[i].boxRowIndex);
              }
            }}
          />
        )}
        itemContent={(idx) => {
          const slot = slots[idx];
          return (
            <SlotRow
              slot={slot}
              onDragStart={slot.kind !== "empty-reserved" ? onDragStart : undefined}
              onDragEnd={onDragEnd}
              onClearGap={slot.kind === "empty-reserved" ? () => onClearGap((slot as unknown as { slotKey?: string }).slotKey ?? "") : undefined}
            />
          );
        }}
      />
    </div>
  );
}

interface GroupHeaderProps {
  group: SlotGroup;
  onDragOver: React.DragEventHandler;
  onDrop: React.DragEventHandler;
}

function GroupHeader({ group, onDragOver, onDrop }: GroupHeaderProps) {
  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      className="flex items-center justify-between px-4 py-2 bg-[var(--bg)] border-b border-[var(--border)] text-xs font-medium text-[var(--text-secondary)] sticky top-0 z-10"
    >
      <span>{group.label}</span>
      <span className="text-[var(--text-muted)]">{group.count} slots</span>
    </div>
  );
}
```

- [ ] **Step 7.2: Type-check + commit**

```bash
npx tsc --noEmit
git add components/storage/StorageViewer.tsx
git commit -m "Add StorageViewer with grouped virtualised slot list"
```

---

## Task 8: `StorageContent` — wire it all together

**Files:**
- Modify: `components/storage/StorageContent.tsx` (replace placeholder)

This is the glue layer. SWR hooks for all four data sources, mutation handlers, and composition of the four sub-components.

- [ ] **Step 8.1: Replace `StorageContent.tsx`**

```tsx
"use client";

import { useState } from "react";
import useSWR from "swr";
import StorageHeader from "./StorageHeader";
import StorageDrawer from "./StorageDrawer";
import LayoutEditor from "./LayoutEditor";
import StorageViewer from "./StorageViewer";
import {
  fetcher,
  type StatsResponse,
  type LayoutResponse,
  type SlotsResponse,
  type RebuildResponse,
  type ShelfLayout,
} from "./types";

export default function StorageContent() {
  const [search, setSearch] = useState("");
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [scrollToPosition, setScrollToPosition] = useState<number | undefined>();
  const [lastRebuild, setLastRebuild] = useState<RebuildResponse["data"] | null>(null);

  const statsSwr = useSWR<StatsResponse>("/api/storage/stats", fetcher);
  const layoutSwr = useSWR<LayoutResponse>("/api/storage/layout", fetcher);

  const slotsUrl = `/api/storage/slots?pageSize=500${search ? `&search=${encodeURIComponent(search)}` : ""}`;
  const slotsSwr = useSWR<SlotsResponse>(slotsUrl, fetcher);

  const handleRebuild = async () => {
    setIsRebuilding(true);
    try {
      const res = await fetch("/api/storage/rebuild", { method: "POST" });
      if (!res.ok) throw new Error(`Rebuild failed: ${res.status}`);
      const body = (await res.json()) as RebuildResponse;
      setLastRebuild(body.data);
      // Refetch everything.
      await Promise.all([statsSwr.mutate(), slotsSwr.mutate()]);
    } finally {
      setIsRebuilding(false);
    }
  };

  const handleLayoutSave = async (layout: ShelfLayout) => {
    const res = await fetch("/api/storage/layout", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(layout),
    });
    if (!res.ok) throw new Error(`Save failed: ${res.status}`);
    await layoutSwr.mutate();
  };

  const handleDragStart = (_slotKey: string) => {
    // Drag state is tracked via HTML5 dataTransfer; nothing to do here yet.
  };

  const handleDragEnd = () => {
    // Cleanup if needed.
  };

  const handleDrop = async (
    targetShelfRowId: string,
    targetBoxId: string,
    targetBoxRowIdx: number
  ) => {
    // Read from the drop event's dataTransfer — but StorageViewer already
    // extracted the slotKey and called this. For now, ask the user to
    // confirm in the next iteration; for this initial commit, just log.
    console.log("override drop:", { targetShelfRowId, targetBoxId, targetBoxRowIdx });
    // Full implementation in a follow-up: POST /api/storage/overrides.
  };

  const handleDeleteStale = async (id: string) => {
    await fetch(`/api/storage/overrides/${id}`, { method: "DELETE" });
    await slotsSwr.mutate();
  };

  const handleClearAllStale = async () => {
    await fetch("/api/storage/overrides/clear-stale", { method: "POST" });
    await slotsSwr.mutate();
  };

  const stats = statsSwr.data?.data ?? null;
  const layout: ShelfLayout = layoutSwr.data?.data ?? { shelfRows: [] };
  const slots = slotsSwr.data?.data.slots ?? [];

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Storage</h1>

      <StorageHeader
        stats={stats}
        onRebuild={handleRebuild}
        isRebuilding={isRebuilding}
        search={search}
        onSearchChange={setSearch}
      />

      {lastRebuild && (
        <StorageDrawer
          unmatched={lastRebuild.unmatchedVariants}
          staleOverrides={{
            staleMissingSlot: lastRebuild.overrides.staleMissingSlot,
            staleMissingTarget: lastRebuild.overrides.staleMissingTarget,
            staleRegression: lastRebuild.overrides.staleRegression,
          }}
          onDeleteStale={handleDeleteStale}
          onClearAllStale={handleClearAllStale}
        />
      )}

      <LayoutEditor layout={layout} onSave={handleLayoutSave} />

      <StorageViewer
        slots={slots}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDrop={handleDrop}
        onClearGap={() => {}}
        scrollToPosition={scrollToPosition}
      />
    </div>
  );
}
```

- [ ] **Step 8.2: Type-check + build + smoke-test**

```bash
npx tsc --noEmit
npm run build 2>&1 | grep -E "storage|error" | head -5
```
Expected: clean compile, `/storage` in build output.

- [ ] **Step 8.3: Commit**

```bash
git add components/storage/StorageContent.tsx
git commit -m "Wire StorageContent with SWR and component composition"
```

---

## Task 9: Manual verification

No unit tests for this sub-plan — it's UI, Vitest in node env can't render it. Manual check in the browser.

- [ ] **Step 9.1: Start the dev server** (if not already running)

```bash
npm run dev
```

- [ ] **Step 9.2: Click the Storage link** in the sidebar

Expected: `/storage` loads, shows the page header, stats cards (possibly `—` if stats haven't loaded yet), the layout editor with your existing 5-box test layout, and the viewer with slots from the last rebuild.

- [ ] **Step 9.3: Press Rebuild**

Expected: spinner on the button, after ~7 seconds the stats refresh, the drawer shows `~49 unmatched variants`, the viewer repopulates.

- [ ] **Step 9.4: Scroll through the viewer**

Expected: smooth scrolling through all ~2200 placed slots. Group headers should be visible above each box-row block.

- [ ] **Step 9.5: Type in the search box**

Expected: after 300ms, the viewer filters to matching slots (e.g., typing "bolt" shows Lightning Bolt in all its printings).

- [ ] **Step 9.6: Edit the layout**

Expected: add a new shelf row, change a box type, press Save → the `message` line says "Layout saved. Press Rebuild to regenerate slots." Press Rebuild → new placement reflects the new layout.

- [ ] **Step 9.7: Verify existing pages still work**

Click `/stock`, `/ev`, `/finance` in the sidebar. Expected: no regressions, all pages load as before.

---

## Known limitations shipping with this sub-plan

These are deliberate simplifications for sub-plan 4. If you want any of them fleshed out, they go into a sub-plan 5 or follow-up PR.

1. **Drag-to-override is stubbed.** The drop target exists on box-row headers and the drag state plumbs through components, but the actual `POST /api/storage/overrides` call isn't wired up — `handleDrop` just logs. Completing it is ~15 lines: read the source slotKey from `dataTransfer`, POST the override, mutate SWR, surface a "rebuild required" badge on the header.
2. **No collapsed groups in the viewer.** All groups render expanded. Collapse/expand would be a per-group local state in `StorageViewer`.
3. **Search is server-side only.** The search input hits `/api/storage/slots?search=...` which does substring name match. "Jump to a specific card" (scroll-into-view on click) is partially wired via `scrollToPosition` but no search result dropdown yet.
4. **No Scryfall set icons in group headers.** `stats.perSet` carries enough info but the viewer groups are box-based, not set-based. If you want per-set icons in the viewer, it's a second rendering mode.
5. **Layout editor reorder via arrows only.** No HTML5 drag-reorder. Arrows work.
6. **No toast library.** "Layout saved" is an inline `aria-live` message. If you want proper toasts they're a separate dependency.

---

## Self-Review Checklist

- [ ] `/storage` appears in the sidebar under MANAGEMENT between Stock and EV Calculator
- [ ] Clicking it opens a page that doesn't 404
- [ ] Header stat cards show real numbers after initial SWR load
- [ ] Rebuild button works and updates the stats
- [ ] Layout editor can add/remove shelf rows and boxes, and Save persists via PUT
- [ ] Viewer scrolls through a realistic inventory smoothly
- [ ] Search filters slots by name substring
- [ ] `npm run build` succeeds
- [ ] No regressions on `/stock`, `/ev`, `/finance`

## Exit Criteria

Sub-plan 4 is done — and the whole canonical-storage feature MVP is done — when:

1. Build + type-check are clean.
2. Manual verification (Task 9) passes.
3. The user can load `/storage`, configure a layout, rebuild, browse the slot list, and search.

Drag-to-override, collapsed groups, and set-icon viewer mode can all ship as follow-ups.
