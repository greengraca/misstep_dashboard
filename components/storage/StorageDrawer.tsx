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
