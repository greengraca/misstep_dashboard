// components/storage/StorageContent.tsx
"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import StorageHeader from "./StorageHeader";
import StorageDrawer from "./StorageDrawer";
import LayoutEditor from "./LayoutEditor";
import Shelf3D from "./Shelf3D";
import BoxContentsPanel from "./BoxContentsPanel";
import type { BoxData, BoxRowData, BoxSetRun } from "./Box3D";
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
            setRuns.push({
              set: cell.set,
              setName: cell.setName,
              slotCount: 1,
            });
          }
        }
        rows.push({ rowIndex, setRuns });
      }
      rows.sort((a, b) => a.rowIndex - b.rowIndex);
      result.set(boxId, { rows });
    }
    return result;
  }, [slotsByBoxId]);

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
        boxData={boxData}
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
