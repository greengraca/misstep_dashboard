"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw, Search } from "lucide-react";
import StatCard from "@/components/dashboard/stat-card";
import type { StorageStats } from "./types";

interface StorageHeaderProps {
  stats: StorageStats | null;
  onRebuild: () => void | Promise<void>;
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          title="Variants"
          value={stats ? stats.totalVariants.toLocaleString() : "—"}
          subtitle={`last rebuild: ${lastRebuildLabel}`}
        />
        <StatCard title="Cards" value={stats ? stats.totalCards.toLocaleString() : "—"} />
        <StatCard title="Placed" value={stats ? stats.placedSlots.toLocaleString() : "—"} />
        <StatCard
          title="Unplaced"
          value={stats ? stats.unplacedSlots.toLocaleString() : "—"}
          subtitle={stats && stats.unplacedSlots > 0 ? "needs more capacity" : undefined}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => onRebuild()}
          disabled={isRebuilding}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-[var(--radius)] bg-[var(--accent)] text-[var(--accent-text)] text-sm font-medium hover:opacity-90 disabled:opacity-50"
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
            className="appraiser-field w-full pl-9 pr-3 py-2 rounded-[var(--radius)] bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          />
        </div>
      </div>
    </div>
  );
}
