"use client";

import StatCard from "@/components/dashboard/stat-card";
import Select from "@/components/dashboard/select";
import type { EvCalculationResult } from "@/lib/types";
import { DollarSign, Package, TrendingUp, BarChart3 } from "lucide-react";

interface EvSummaryCardsProps {
  result: EvCalculationResult | null;
  isLoading: boolean;
  boosterType: "play" | "collector";
  onBoosterTypeChange: (type: "play" | "collector") => void;
  boosterLabel?: string;
  packsPerBox?: number;
  cardsPerPack?: number;
}

export default function EvSummaryCards({
  result,
  isLoading,
  boosterType,
  onBoosterTypeChange,
  boosterLabel,
  packsPerBox,
  cardsPerPack,
}: EvSummaryCardsProps) {
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
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="Box EV (Gross)"
          value={isLoading ? "..." : result ? `€${result.box_ev_gross.toFixed(2)}` : "—"}
          icon={<DollarSign size={18} style={{ color: "var(--accent)" }} />}
        />
        <StatCard
          title="Box EV (Net)"
          value={isLoading ? "..." : result ? `€${result.box_ev_net.toFixed(2)}` : "—"}
          subtitle={result ? `After ${(result.fee_rate * 100).toFixed(0)}% fee` : undefined}
          icon={<TrendingUp size={18} style={{ color: "var(--accent)" }} />}
        />
        <StatCard
          title="Pack EV"
          value={isLoading ? "..." : result ? `€${result.pack_ev.toFixed(2)}` : "—"}
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
