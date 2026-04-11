"use client";

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
