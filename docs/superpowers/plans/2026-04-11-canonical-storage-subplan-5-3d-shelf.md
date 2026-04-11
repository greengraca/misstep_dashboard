# Canonical Storage — Sub-Plan 5: 3D Shelf Viewer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat virtualised slot list in `/storage` with a 3D perspective rendering of the user's physical shelf: a 1.85 m × 2.2 m × 0.40 m industrial frame with 3 shelf boards holding configurable rows of 4k / 2k / 1k card boxes. Clicking a box opens a slide-out side panel listing the cards inside it (reusing the `SlotRow` component from sub-plan 4). The camera is orbitable (drag-rotate, scroll-zoom, pan).

**Architecture:** One `Shelf3D.tsx` component wraps `<Canvas>` from `@react-three/fiber`. Inside, `<ShelfFrame>` renders the rails / crossbars / shelf boards as stylized meshes. `<ShelfRowBoxes>` renders the configured boxes on each shelf with `<Box3D>` components per box. Selection state lives in `StorageContent` and drives the side panel. Physical dimensions live in a single `physical-config.ts` module that tomorrow's real measurements will edit.

**Tech Stack:** `@react-three/fiber` (r3f) + `@react-three/drei` (OrbitControls, basic materials). Next.js 16 App Router. No other new deps.

---

## What this replaces

Sub-plan 4 shipped `StorageViewer.tsx` (a `GroupedVirtuoso` list) and the `SlotRow` component. This sub-plan:

- **Replaces** `StorageViewer` with the 3D scene as the primary view.
- **Keeps** `SlotRow` — it's reused verbatim inside the new side panel.
- **Keeps** `StorageHeader`, `StorageDrawer`, `LayoutEditor` unchanged.
- **Modifies** `StorageContent` to compose the new 3D viewer + side panel instead of the list.

If the user wants the old list as a fallback "list mode", we add a toggle in a follow-up. Not in scope for this sub-plan.

## File Structure

| Path | Responsibility |
|---|---|
| `components/storage/physical-config.ts` | Constants: shelf W/H/D, shelf Y positions, box cm dimensions, scale factor. Single source of truth. |
| `components/storage/Shelf3D.tsx` | Top-level r3f `<Canvas>`, scene setup, OrbitControls, lighting. Receives `layout` + `onBoxClick`. |
| `components/storage/ShelfFrame.tsx` | Stylized metal frame: 4 vertical rails, top + bottom rails, horizontal crossbars between shelves, 3 shelf boards. Pure geometry. |
| `components/storage/Box3D.tsx` | Single card box mesh — simple `<mesh>` with box geometry sized by type. Handles hover highlight and click. |
| `components/storage/BoxContentsPanel.tsx` | Slide-out panel showing the ordered `SlotRow` list for the selected box. |

**Modified:**
- `package.json` — add `@react-three/fiber`, `@react-three/drei`, `three`, `@types/three`
- `components/storage/StorageContent.tsx` — remove `StorageViewer` import, add `Shelf3D` + `BoxContentsPanel`, manage `selectedBoxId` state

**Deleted:**
- `components/storage/StorageViewer.tsx` — removed entirely. Sub-plan 4's commit history preserves it if we want to resurrect as a "list mode".

---

## Task 1: Install r3f dependencies and create physical-config

**Files:**
- Modify: `package.json`
- Create: `components/storage/physical-config.ts`

- [ ] **Step 1.1: Install dependencies**

```bash
npm install three @react-three/fiber @react-three/drei
npm install --save-dev @types/three
```

Version floor: `three@^0.170`, `@react-three/fiber@^9`, `@react-three/drei@^10`. Pick the latest compatible with React 19 — r3f v9 and drei v10 support React 19.

- [ ] **Step 1.2: Create `components/storage/physical-config.ts`**

```ts
// components/storage/physical-config.ts
//
// Physical dimensions of the user's shelf and card boxes, in METERS.
// Tomorrow's real measurements edit these constants and nothing else.

import type { BoxType } from "@/lib/storage";

/** Total shelf frame dimensions (width × height × depth), in meters. */
export const SHELF_FRAME = {
  width: 1.85,
  height: 2.20,
  depth: 0.40,
} as const;

/**
 * Y coordinate (height above floor) of each shelf board, in meters.
 * The array order maps to the `layout.shelfRows` array: index 0 is the top
 * shelf, index 1 is the middle, index 2 is the bottom.
 */
export const SHELF_BOARD_Y: readonly number[] = [1.80, 1.25, 0.65];

/** Thickness of each shelf board, in meters. */
export const SHELF_BOARD_THICKNESS = 0.02;

/** Thickness of vertical frame rails. */
export const FRAME_RAIL_THICKNESS = 0.04;

/**
 * Box dimensions per type, in meters. Order: width (across shelf, X axis),
 * height (vertical, Y axis), depth (front-to-back, Z axis).
 */
export const BOX_DIMENSIONS: Record<BoxType, { width: number; height: number; depth: number }> = {
  "1k": { width: 0.08, height: 0.10, depth: 0.40 },
  "2k": { width: 0.17, height: 0.10, depth: 0.40 },
  "4k": { width: 0.32, height: 0.10, depth: 0.40 },
};

/** Small gap between adjacent boxes in the same shelf row, in meters. */
export const BOX_GAP = 0.002;

/**
 * Scene camera defaults. The camera is positioned at a front-3/4 angle so
 * the user can see the box fronts without the shelf frame occluding them.
 */
export const CAMERA_DEFAULTS = {
  position: [2.8, 1.5, 2.5] as [number, number, number],
  fov: 50,
  target: [0.925, 1.1, 0.2] as [number, number, number], // shelf center-ish
};
```

- [ ] **Step 1.3: Type-check + commit**

```bash
npx tsc --noEmit
git add package.json package-lock.json components/storage/physical-config.ts
git commit -m "Add react-three-fiber deps and physical shelf config"
```

---

## Task 2: `ShelfFrame` component — stylized metal frame

**Files:**
- Create: `components/storage/ShelfFrame.tsx`

Renders the shelf structure: 4 vertical rails (corner posts), top and bottom rails, shelf boards at the configured Y positions. No interactivity — pure geometry.

Color palette: dark metal gray (`#2a2a2e`) for the frame, warm off-white (`#f2ecdc`) for the shelf boards. These approximate the photo.

The frame is positioned so its bottom-left-front corner is at origin `(0, 0, 0)`. Width runs along +X, height along +Y, depth along +Z (into the scene).

- [ ] **Step 2.1: Write the component**

```tsx
// components/storage/ShelfFrame.tsx
"use client";

import {
  SHELF_FRAME,
  SHELF_BOARD_Y,
  SHELF_BOARD_THICKNESS,
  FRAME_RAIL_THICKNESS,
} from "./physical-config";

const FRAME_COLOR = "#2a2a2e";
const BOARD_COLOR = "#f2ecdc";

export default function ShelfFrame() {
  const W = SHELF_FRAME.width;
  const H = SHELF_FRAME.height;
  const D = SHELF_FRAME.depth;
  const R = FRAME_RAIL_THICKNESS;

  return (
    <group>
      {/* Four vertical corner rails */}
      {[
        [0 + R / 2, H / 2, 0 + R / 2],
        [W - R / 2, H / 2, 0 + R / 2],
        [0 + R / 2, H / 2, D - R / 2],
        [W - R / 2, H / 2, D - R / 2],
      ].map(([x, y, z], i) => (
        <mesh key={`rail-${i}`} position={[x, y, z]}>
          <boxGeometry args={[R, H, R]} />
          <meshStandardMaterial color={FRAME_COLOR} />
        </mesh>
      ))}

      {/* Top rail across the front */}
      <mesh position={[W / 2, H - R / 2, 0 + R / 2]}>
        <boxGeometry args={[W, R, R]} />
        <meshStandardMaterial color={FRAME_COLOR} />
      </mesh>

      {/* Bottom rail across the front (at floor level) */}
      <mesh position={[W / 2, 0 + R / 2, 0 + R / 2]}>
        <boxGeometry args={[W, R, R]} />
        <meshStandardMaterial color={FRAME_COLOR} />
      </mesh>

      {/* Shelf boards at configured Y positions */}
      {SHELF_BOARD_Y.map((y, i) => (
        <mesh
          key={`board-${i}`}
          position={[W / 2, y - SHELF_BOARD_THICKNESS / 2, D / 2]}
        >
          <boxGeometry args={[W - R * 2, SHELF_BOARD_THICKNESS, D - R * 2]} />
          <meshStandardMaterial color={BOARD_COLOR} />
        </mesh>
      ))}

      {/* Horizontal support crossbar under each shelf board (front edge only, for visual weight) */}
      {SHELF_BOARD_Y.map((y, i) => (
        <mesh
          key={`crossbar-${i}`}
          position={[W / 2, y - SHELF_BOARD_THICKNESS - R / 2, 0 + R / 2]}
        >
          <boxGeometry args={[W, R, R]} />
          <meshStandardMaterial color={FRAME_COLOR} />
        </mesh>
      ))}
    </group>
  );
}
```

- [ ] **Step 2.2: Commit**

```bash
git add components/storage/ShelfFrame.tsx
git commit -m "Add 3D shelf frame with rails and boards"
```

---

## Task 3: `Box3D` component — single box mesh with hover/click

**Files:**
- Create: `components/storage/Box3D.tsx`

One box mesh. Props:
- `position: [number, number, number]` — bottom-left-front corner of the box in scene coordinates
- `type: BoxType`
- `boxId: string`
- `label?: string`
- `isSelected: boolean`
- `onClick: (boxId: string) => void`

Renders a `<mesh>` with `<boxGeometry>` sized by type. Color is a warm off-white by default (matching real card boxes), tinted slightly orange when hovered, highlighted with an accent outline when `isSelected`.

Use `<meshStandardMaterial>` for diffuse lighting. Hover is local state via `useState`.

For the highlight outline when selected, the simplest approach is rendering a slightly larger, semi-transparent box underneath with the accent color. Or use drei's `<Outlines>` helper if available.

- [ ] **Step 3.1: Write the component**

```tsx
// components/storage/Box3D.tsx
"use client";

import { useState } from "react";
import { BOX_DIMENSIONS } from "./physical-config";
import type { BoxType } from "@/lib/storage";

interface Box3DProps {
  position: [number, number, number];
  type: BoxType;
  boxId: string;
  isSelected: boolean;
  onClick: (boxId: string) => void;
}

const BOX_COLOR = "#e9ddbe";
const BOX_HOVER_COLOR = "#f5eacb";
const BOX_SELECTED_COLOR = "#8c5a18";

export default function Box3D({ position, type, boxId, isSelected, onClick }: Box3DProps) {
  const [hovered, setHovered] = useState(false);
  const dim = BOX_DIMENSIONS[type];

  const color = isSelected
    ? BOX_SELECTED_COLOR
    : hovered
      ? BOX_HOVER_COLOR
      : BOX_COLOR;

  // Position is the bottom-left-front corner; mesh is centered, so offset by half-dims.
  const meshPosition: [number, number, number] = [
    position[0] + dim.width / 2,
    position[1] + dim.height / 2,
    position[2] + dim.depth / 2,
  ];

  return (
    <mesh
      position={meshPosition}
      onPointerEnter={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerLeave={() => {
        setHovered(false);
        document.body.style.cursor = "";
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick(boxId);
      }}
    >
      <boxGeometry args={[dim.width, dim.height, dim.depth]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}
```

- [ ] **Step 3.2: Commit**

```bash
git add components/storage/Box3D.tsx
git commit -m "Add 3D box mesh with hover and selection"
```

---

## Task 4: `Shelf3D` component — scene root with camera, lights, layout → boxes

**Files:**
- Create: `components/storage/Shelf3D.tsx`

Top-level scene. Composes `<Canvas>` with lighting, `<OrbitControls>`, `<ShelfFrame>`, and iterates the layout to render boxes at the right positions.

Layout → box positions algorithm:
- For each shelf row `i` with its boxes array, place boxes starting at X=0 and moving right.
- Y coordinate is `SHELF_BOARD_Y[i]` (box sits on top of the shelf board).
- Z coordinate is 0 (boxes flush with front of shelf).
- Between consecutive boxes, add `BOX_GAP` spacing.
- If there are more shelf rows in the layout than entries in `SHELF_BOARD_Y`, ignore the extras (or stack them below the bottom shelf — probably ignore with a console warning).

Props:
- `layout: ShelfLayout`
- `selectedBoxId: string | null`
- `onBoxClick: (boxId: string) => void`

- [ ] **Step 4.1: Write the component**

```tsx
// components/storage/Shelf3D.tsx
"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import ShelfFrame from "./ShelfFrame";
import Box3D from "./Box3D";
import {
  SHELF_FRAME,
  SHELF_BOARD_Y,
  SHELF_BOARD_THICKNESS,
  BOX_DIMENSIONS,
  BOX_GAP,
  CAMERA_DEFAULTS,
} from "./physical-config";
import type { ShelfLayout } from "./types";

interface Shelf3DProps {
  layout: ShelfLayout;
  selectedBoxId: string | null;
  onBoxClick: (boxId: string) => void;
}

export default function Shelf3D({ layout, selectedBoxId, onBoxClick }: Shelf3DProps) {
  return (
    <div className="w-full rounded-[var(--radius)] bg-[var(--card-bg)] border border-[var(--border)] overflow-hidden" style={{ height: 600 }}>
      <Canvas
        camera={{ position: CAMERA_DEFAULTS.position, fov: CAMERA_DEFAULTS.fov }}
        shadows
      >
        <color attach="background" args={["#13151a"]} />

        {/* Key light */}
        <directionalLight
          position={[3, 4, 2]}
          intensity={1.2}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        {/* Fill light */}
        <ambientLight intensity={0.5} />
        {/* Subtle rim */}
        <directionalLight position={[-2, 2, -2]} intensity={0.3} />

        <ShelfFrame />

        {/* Boxes */}
        {layout.shelfRows.map((row, shelfIdx) => {
          const shelfY = SHELF_BOARD_Y[shelfIdx];
          if (shelfY === undefined) {
            console.warn(`Layout has more shelf rows than physical shelves; ignoring row ${shelfIdx}`);
            return null;
          }
          let x = 0;
          return row.boxes.map((box, boxIdx) => {
            const boxDim = BOX_DIMENSIONS[box.type];
            const position: [number, number, number] = [x, shelfY, 0];
            x += boxDim.width + BOX_GAP;
            return (
              <Box3D
                key={box.id || `shelf-${shelfIdx}-box-${boxIdx}`}
                position={position}
                type={box.type}
                boxId={box.id}
                isSelected={selectedBoxId === box.id}
                onClick={onBoxClick}
              />
            );
          });
        })}

        <OrbitControls
          target={CAMERA_DEFAULTS.target}
          enableDamping
          dampingFactor={0.08}
          minDistance={1.5}
          maxDistance={8}
          maxPolarAngle={Math.PI / 2}
        />
      </Canvas>
    </div>
  );
}
```

Note: `shadows` on `<Canvas>` enables shadow casting. `castShadow` on the directional light and `receiveShadow` / `castShadow` on meshes would give proper shadows, but that's optional polish — initial commit without shadows is fine. If you want the first render to look cleaner, remove `shadows` and `castShadow` for now and add back in a follow-up.

- [ ] **Step 4.2: Type-check + commit**

```bash
npx tsc --noEmit
git add components/storage/Shelf3D.tsx
git commit -m "Add Shelf3D scene with camera, lights, and box placement"
```

---

## Task 5: `BoxContentsPanel` — slide-out side panel with card list

**Files:**
- Create: `components/storage/BoxContentsPanel.tsx`

When a box is selected, show a side panel (fixed-position right-aligned, 400 px wide, backdrop blur) listing all slots assigned to that box. Reuses the existing `SlotRow` component.

Props:
- `boxId: string | null`
- `onClose: () => void`
- `slots: PlacedCell[]` (pre-filtered by parent to only the slots in this box)

Layout:
- Header: box label + close button
- Scrollable list of SlotRow components
- Empty state if the box has no slots

- [ ] **Step 5.1: Write the component**

```tsx
// components/storage/BoxContentsPanel.tsx
"use client";

import { X } from "lucide-react";
import SlotRow from "./SlotRow";
import type { PlacedCell } from "./types";

interface BoxContentsPanelProps {
  boxId: string | null;
  boxLabel?: string;
  slots: PlacedCell[];
  onClose: () => void;
}

export default function BoxContentsPanel({
  boxId,
  boxLabel,
  slots,
  onClose,
}: BoxContentsPanelProps) {
  if (!boxId) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Panel */}
      <aside
        className="fixed top-0 right-0 z-50 h-full w-full max-w-[420px] bg-[var(--card-bg)] border-l border-[var(--border)] shadow-2xl flex flex-col"
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              {boxLabel || "Box"}
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              {slots.length} slot{slots.length === 1 ? "" : "s"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto">
          {slots.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--text-muted)]">
              No cards in this box yet. Run a rebuild to populate.
            </div>
          ) : (
            slots.map((slot, i) => (
              <SlotRow key={i} slot={slot} />
            ))
          )}
        </div>
      </aside>
    </>
  );
}
```

- [ ] **Step 5.2: Commit**

```bash
git add components/storage/BoxContentsPanel.tsx
git commit -m "Add BoxContentsPanel slide-out with per-box card list"
```

---

## Task 6: Wire `StorageContent` to use the 3D scene and panel

**Files:**
- Modify: `components/storage/StorageContent.tsx`
- Delete: `components/storage/StorageViewer.tsx`

- [ ] **Step 6.1: Update StorageContent**

Replace the `<StorageViewer>` usage in the JSX with `<Shelf3D>` + `<BoxContentsPanel>`. Add `selectedBoxId` state. When a box is clicked, set it and the panel opens. Filter the loaded slots by `boxId` before passing to the panel.

```tsx
// components/storage/StorageContent.tsx
"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import StorageHeader from "./StorageHeader";
import StorageDrawer from "./StorageDrawer";
import LayoutEditor from "./LayoutEditor";
import Shelf3D from "./Shelf3D";
import BoxContentsPanel from "./BoxContentsPanel";
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
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
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

  // Pre-compute slot buckets per box for the side panel.
  const slotsByBoxId = useMemo(() => {
    const map = new Map<string, typeof slots>();
    for (const slot of slots) {
      if (slot.kind === "empty-reserved") continue;
      if (!("boxId" in slot) || !slot.boxId) continue;
      const bucket = map.get(slot.boxId) ?? [];
      bucket.push(slot);
      map.set(slot.boxId, bucket);
    }
    return map;
  }, [slots]);

  const selectedBoxSlots = selectedBoxId ? slotsByBoxId.get(selectedBoxId) ?? [] : [];
  const selectedBoxLabel = selectedBoxId
    ? (() => {
        for (const row of layout.shelfRows) {
          const box = row.boxes.find((b) => b.id === selectedBoxId);
          if (box) return `${row.label} · ${box.type}${box.label ? ` · ${box.label}` : ""}`;
        }
        return undefined;
      })()
    : undefined;

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

      <Shelf3D
        layout={layout}
        selectedBoxId={selectedBoxId}
        onBoxClick={setSelectedBoxId}
      />

      <BoxContentsPanel
        boxId={selectedBoxId}
        boxLabel={selectedBoxLabel}
        slots={selectedBoxSlots}
        onClose={() => setSelectedBoxId(null)}
      />
    </div>
  );
}
```

- [ ] **Step 6.2: Delete the old viewer**

```bash
rm components/storage/StorageViewer.tsx
```

- [ ] **Step 6.3: Type-check + build**

```bash
npx tsc --noEmit
npm run build 2>&1 | grep -E "storage|error" | head -15
```
Expected: `/storage` still in build output, no errors. `react-virtuoso` is now unused but that's OK — it's still a dependency for now, we can remove it in a cleanup commit later.

- [ ] **Step 6.4: Commit**

```bash
git add components/storage/StorageContent.tsx components/storage/StorageViewer.tsx
git commit -m "Replace flat viewer with 3D shelf scene and box panel"
```

---

## Task 7: Manual verification

- [ ] **Step 7.1: Browser check**

`npm run dev`, navigate to `/storage`. Expected:
- 3D canvas renders a dark scene with a metal shelf frame and ~19 boxes across 3 shelves
- Camera angle shows the front-3/4 view; shelf is centered
- Dragging on the canvas rotates the camera around the shelf
- Scroll wheel zooms in/out
- Hovering a box turns the cursor to a pointer and lightens the box color
- Clicking a box opens a right-side slide-out panel listing the cards inside
- Pressing ESC or clicking the backdrop closes the panel
- Other pages (`/stock`, `/ev`) still work

- [ ] **Step 7.2: Check the box layout matches your physical shelf**

Count boxes per shelf in the 3D view. Expected:
- Top: 7 boxes (1k + 5×4k + 2k)
- Middle: 5 boxes (5×4k)
- Bottom: 6 boxes (5×4k + 2k)

If counts are wrong, the layout config from `PUT /api/storage/layout` isn't saved with the top-row layout the user specified. Re-run the layout PUT from the dev console:

```js
await fetch("/api/storage/layout", {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    shelfRows: [
      { id: "sr-top", label: "Top row", boxes: [
        { id: "b-top-1k", type: "1k" },
        { id: "b-top-4k-1", type: "4k" },
        { id: "b-top-4k-2", type: "4k" },
        { id: "b-top-4k-3", type: "4k" },
        { id: "b-top-4k-4", type: "4k" },
        { id: "b-top-4k-5", type: "4k" },
        { id: "b-top-2k", type: "2k" },
      ]},
      { id: "sr-mid", label: "Middle row", boxes: [
        { id: "b-mid-1", type: "4k" },
        { id: "b-mid-2", type: "4k" },
        { id: "b-mid-3", type: "4k" },
        { id: "b-mid-4", type: "4k" },
        { id: "b-mid-5", type: "4k" },
      ]},
      { id: "sr-bot", label: "Bottom row", boxes: [
        { id: "b-bot-1", type: "4k" },
        { id: "b-bot-2", type: "4k" },
        { id: "b-bot-3", type: "4k" },
        { id: "b-bot-4", type: "4k" },
        { id: "b-bot-5", type: "4k" },
        { id: "b-bot-2k", type: "2k" },
      ]},
    ],
  }),
}).then(r => r.json());
```

Then rebuild.

---

## Known limitations shipping with this sub-plan

1. **No search-to-box highlight.** Typing in the header search box still filters the slots fetched from `/api/storage/slots`, but the 3D scene doesn't highlight the boxes containing matches. Follow-up: derive `matchedBoxIds` from filtered slots, pass to `Shelf3D`, tint those boxes in a different color.
2. **No drag-to-override.** Deferred from sub-plan 4 and still deferred. The side panel renders slots read-only. Adding drag-create-override comes in a later pass, probably via drag handles on SlotRow inside the panel dropping onto other boxes in the 3D scene.
3. **No shadows yet.** Canvas has `shadows` enabled but meshes don't explicitly cast/receive. The scene looks flat-lit. Add `castShadow` / `receiveShadow` as polish.
4. **No cards visible on boxes.** The box mesh is an opaque rectangle. Real boxes in the photo show card edges sticking up. A more faithful render would put a textured or striped top surface on each box showing the card fronts. Follow-up polish.
5. **No room / floor / wall.** The scene background is a solid color. Adding a floor plane and a back wall would give the shelf context. Follow-up polish.

## Exit Criteria

Sub-plan 5 is done when:
1. `/storage` renders a 3D shelf with your actual box layout
2. Camera orbits freely via mouse
3. Clicking a box opens the side panel with its card list
4. Type-check and build are clean
5. No regressions on other pages
