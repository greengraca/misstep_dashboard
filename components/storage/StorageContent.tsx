// components/storage/StorageContent.tsx
"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import StorageHeader from "./StorageHeader";
import StorageDrawer from "./StorageDrawer";
import LayoutEditor from "./LayoutEditor";
import Shelf3D from "./Shelf3D";
import BoxContentsPanel from "./BoxContentsPanel";
import { H1 } from "@/components/dashboard/page-shell";
import type { BoxData, BoxRowData, BoxSetRun } from "./Box3D";

/** HSL → #rrggbb — three.js's Color.setStyle can't parse modern hsl() syntax. */
function hslToHex(h: number, s: number, l: number): string {
  const sN = s / 100;
  const lN = l / 100;
  const a = sN * Math.min(lN, 1 - lN);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = lN - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
import {
  fetcher,
  type StatsResponse,
  type LayoutResponse,
  type SlotsResponse,
  type RebuildResponse,
  type ShelfLayout,
  type PlacedCell,
} from "./types";

export default function StorageContent() {
  const [search, setSearch] = useState("");
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [lastRebuild, setLastRebuild] = useState<RebuildResponse["data"] | null>(null);

  const statsSwr = useSWR<StatsResponse>("/api/storage/stats", fetcher);
  const layoutSwr = useSWR<LayoutResponse>("/api/storage/layout", fetcher);

  // Fetch ALL placed slots in one go — both the 3D scene (per-box fill bars)
  // and the click-to-open BoxContentsPanel read from the same global list,
  // so partial fetches hide content from any box past the first ~5.
  const slotsUrl = `/api/storage/slots?pageSize=50000${search ? `&search=${encodeURIComponent(search)}` : ""}`;
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
    const map = new Map<string, PlacedCell[]>();
    for (const slot of slots) {
      if (slot.kind === "empty-reserved") continue;
      if (!("boxId" in slot) || !slot.boxId) continue;
      const bucket = map.get(slot.boxId) ?? [];
      bucket.push(slot);
      map.set(slot.boxId, bucket);
    }
    return map;
  }, [slots]);

  // Assign a pastel color to every distinct set code, in chronological
  // order (the order set codes first appear in the sorted slot stream).
  // Uses the golden angle (137.508°) so adjacent sets get maximally
  // different hues even for dense palettes.
  const setColors = useMemo(() => {
    const map = new Map<string, { fillColor: string; dividerColor: string }>();
    let index = 0;
    const sortedByPosition = [...slots].sort((a, b) => {
      const pa = "position" in a ? a.position : 0;
      const pb = "position" in b ? b.position : 0;
      return pa - pb;
    });
    for (const cell of sortedByPosition) {
      if (cell.kind === "empty-reserved") continue;
      if (map.has(cell.set)) continue;
      const hue = (index * 137.508) % 360;
      // Both the fill and the divider stay in the soft-pastel range
      // (high lightness, moderate saturation). Divider is slightly less
      // light than the fill so it reads as an accent without going dark.
      map.set(cell.set, {
        fillColor: hslToHex(hue, 50, 86), // very soft pastel body
        dividerColor: hslToHex(hue, 58, 72), // slightly deeper pastel accent
      });
      index += 1;
    }
    return map;
  }, [slots]);

  // Derive per-box row + set-run data for the 3D scene. Each box row becomes
  // a list of (set, slotCount) runs in reading order, which Box3D renders as
  // color-coded blocks inside the internal channel.
  const boxData = useMemo(() => {
    const result = new Map<string, BoxData>();
    for (const [boxId, boxSlots] of slotsByBoxId) {
      // Bucket by rowIndex first.
      const byRow = new Map<number, PlacedCell[]>();
      for (const cell of boxSlots) {
        if (cell.kind === "empty-reserved") continue;
        if (!("boxRowIndex" in cell)) continue;
        const list = byRow.get(cell.boxRowIndex) ?? [];
        list.push(cell);
        byRow.set(cell.boxRowIndex, list);
      }
      // Convert each row to ordered set runs.
      const rows: BoxRowData[] = [];
      for (const [rowIndex, rowCells] of byRow) {
        const sorted = [...rowCells].sort((a, b) => {
          const pa = "positionInBoxRow" in a ? a.positionInBoxRow : 0;
          const pb = "positionInBoxRow" in b ? b.positionInBoxRow : 0;
          return pa - pb;
        });
        const setRuns: BoxSetRun[] = [];
        for (const cell of sorted) {
          if (cell.kind === "empty-reserved") continue;
          const last = setRuns[setRuns.length - 1];
          if (last && last.set === cell.set) {
            last.slotCount += 1;
          } else {
            const colors = setColors.get(cell.set);
            setRuns.push({
              set: cell.set,
              setName: cell.setName,
              slotCount: 1,
              fillColor: colors?.fillColor,
              dividerColor: colors?.dividerColor,
            });
          }
        }
        rows.push({ rowIndex, setRuns });
      }
      rows.sort((a, b) => a.rowIndex - b.rowIndex);
      result.set(boxId, { rows });
    }
    return result;
  }, [slotsByBoxId, setColors]);

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
    <div className="flex flex-col gap-6">
      <H1 subtitle="Shelves, boxes, and the canonical sort across the wall">Storage</H1>

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

      <Shelf3D
        layout={layout}
        selectedBoxId={selectedBoxId}
        onBoxClick={setSelectedBoxId}
        boxData={boxData}
      />

      <LayoutEditor layout={layout} onSave={handleLayoutSave} />

      <BoxContentsPanel
        boxId={selectedBoxId}
        boxLabel={selectedBoxLabel}
        slots={selectedBoxSlots}
        onClose={() => setSelectedBoxId(null)}
      />
    </div>
  );
}
