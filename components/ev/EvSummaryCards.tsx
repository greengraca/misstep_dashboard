"use client";

import StatCard from "@/components/dashboard/stat-card";
import Select from "@/components/dashboard/select";
import type { EvCalculationResult } from "@/lib/types";
import { useDiscount } from "@/lib/discount";
import { DollarSign, Package, TrendingUp, BarChart3 } from "lucide-react";

interface EvSummaryCardsProps {
  result: EvCalculationResult | null;
  isLoading: boolean;
  boosterType: "play" | "collector";
  onBoosterTypeChange: (type: "play" | "collector") => void;
  boosterLabel?: string;
  packsPerBox?: number;
  cardsPerPack?: number;
  /** When defined, renders a checkbox to include/exclude Masterpieces. */
  masterpiecesEnabled?: boolean;
  onMasterpiecesChange?: (v: boolean) => void;
}

export default function EvSummaryCards({
  result,
  isLoading,
  boosterType,
  onBoosterTypeChange,
  boosterLabel,
  packsPerBox,
  cardsPerPack,
  masterpiecesEnabled,
  onMasterpiecesChange,
}: EvSummaryCardsProps) {
  const { apply } = useDiscount();
  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        {boosterLabel ? (
          <span
            className="text-sm font-medium px-3 py-1.5 rounded-lg"
            style={{
              background: "var(--surface-gradient)",
              border: "1px solid rgba(255, 255, 255, 0.10)",
              color: "var(--text-primary)",
            }}
          >
            {boosterLabel}
          </span>
        ) : (
          <Select
            value={boosterType}
            onChange={(v) => onBoosterTypeChange(v as "play" | "collector")}
            options={[
              { value: "play", label: "Play Booster" },
              { value: "collector", label: "Collector Booster" },
            ]}
            size="sm"
          />
        )}
        {masterpiecesEnabled !== undefined && onMasterpiecesChange && (
          <label
            className="inline-flex items-center gap-2 text-sm select-none cursor-pointer"
            style={{ color: "var(--text-muted)" }}
          >
            <input
              type="checkbox"
              checked={masterpiecesEnabled}
              onChange={(e) => onMasterpiecesChange(e.target.checked)}
              className="accent-[var(--accent)]"
            />
            Include Masterpieces
          </label>
        )}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="Box EV (Gross)"
          value={isLoading ? "..." : result ? `€${apply(result.box_ev_gross).toFixed(2)}` : "—"}
          icon={<DollarSign size={18} style={{ color: "var(--accent)" }} />}
        />
        <StatCard
          title="Box EV (Net)"
          value={isLoading ? "..." : result ? `€${apply(result.box_ev_net).toFixed(2)}` : "—"}
          subtitle={result ? `After ${(result.fee_rate * 100).toFixed(0)}% fee` : undefined}
          icon={<TrendingUp size={18} style={{ color: "var(--accent)" }} />}
        />
        <StatCard
          title="Pack EV"
          value={isLoading ? "..." : result ? `€${apply(result.pack_ev).toFixed(2)}` : "—"}
          subtitle={packsPerBox && cardsPerPack ? `${packsPerBox} packs × ${cardsPerPack} cards` : undefined}
          icon={<Package size={18} style={{ color: "var(--accent)" }} />}
        />
        <StatCard
          title="Above Floor"
          value={
            isLoading
              ? "..."
              : result
                ? `${result.cards_above_floor} / ${result.cards_counted}`
                : "—"
          }
          subtitle={result ? `≥ €${result.sift_floor.toFixed(2)} sift floor` : undefined}
          icon={<BarChart3 size={18} style={{ color: "var(--accent)" }} />}
        />
      </div>
    </div>
  );
}
