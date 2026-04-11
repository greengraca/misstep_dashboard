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
