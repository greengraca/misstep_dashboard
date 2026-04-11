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
