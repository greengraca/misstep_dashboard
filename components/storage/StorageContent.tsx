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
