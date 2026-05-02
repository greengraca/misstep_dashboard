// components/storage/BoxContentsPanel.tsx
"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import SlotRow from "./SlotRow";
import type { PlacedCell } from "./types";

interface BoxContentsPanelProps {
  boxId: string | null;
  boxLabel?: string;
  slots: PlacedCell[];
  onClose: () => void;
}

interface SetGroup {
  set: string;
  setName: string;
  slots: PlacedCell[];
  totalQty: number;
}

export default function BoxContentsPanel({
  boxId,
  boxLabel,
  slots,
  onClose,
}: BoxContentsPanelProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Group slots by set in the order they first appear (which is canonical
  // sort order, so sets come out chronologically within the box).
  const groups = useMemo<SetGroup[]>(() => {
    const order: string[] = [];
    const byCode = new Map<string, SetGroup>();
    const sorted = [...slots].sort((a, b) => {
      const pa = "position" in a ? a.position : 0;
      const pb = "position" in b ? b.position : 0;
      return pa - pb;
    });
    for (const cell of sorted) {
      if (cell.kind === "empty-reserved") continue;
      const existing = byCode.get(cell.set);
      if (existing) {
        existing.slots.push(cell);
        existing.totalQty += "qtyInSlot" in cell ? cell.qtyInSlot : 0;
      } else {
        const g: SetGroup = {
          set: cell.set,
          setName: cell.setName,
          slots: [cell],
          totalQty: "qtyInSlot" in cell ? cell.qtyInSlot : 0,
        };
        byCode.set(cell.set, g);
        order.push(cell.set);
      }
    }
    return order.map((s) => byCode.get(s)!);
  }, [slots]);

  if (!boxId) return null;

  const toggle = (setCode: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(setCode)) next.delete(setCode);
      else next.add(setCode);
      return next;
    });
  };

  const totalCards = groups.reduce((n, g) => n + g.totalQty, 0);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Panel */}
      <aside className="fixed top-0 right-0 z-50 h-full w-full max-w-[460px] bg-[var(--bg-card)] border-l border-[var(--border)] shadow-2xl flex flex-col">
        <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              {boxLabel || "Box"}
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              {groups.length} set{groups.length === 1 ? "" : "s"} ·{" "}
              {totalCards.toLocaleString()} card{totalCards === 1 ? "" : "s"}
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
          {groups.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--text-muted)]">
              No cards in this box yet. Run a rebuild to populate.
            </div>
          ) : (
            groups.map((group) => {
              const isOpen = expanded.has(group.set);
              return (
                <div
                  key={group.set}
                  className="border-b border-[var(--border)]"
                >
                  <button
                    onClick={() => toggle(group.set)}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-[var(--hover-bg)] transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isOpen ? (
                        <ChevronDown
                          size={14}
                          className="text-[var(--text-muted)] flex-shrink-0"
                        />
                      ) : (
                        <ChevronRight
                          size={14}
                          className="text-[var(--text-muted)] flex-shrink-0"
                        />
                      )}
                      <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                        {group.setName}
                      </span>
                      <span className="text-xs text-[var(--text-muted)] uppercase font-mono flex-shrink-0">
                        {group.set}
                      </span>
                    </div>
                    <span className="text-xs text-[var(--text-muted)] tabular-nums flex-shrink-0 ml-2">
                      {group.slots.length} slot
                      {group.slots.length === 1 ? "" : "s"} ·{" "}
                      {group.totalQty}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="bg-[var(--bg)]">
                      {group.slots.map((slot, i) => (
                        <SlotRow key={i} slot={slot} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </aside>
    </>
  );
}
