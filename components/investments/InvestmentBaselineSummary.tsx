"use client";

import { Archive, Scale } from "lucide-react";
import type { BaselineTotals } from "@/lib/investments/types";

const formatEur = (n: number) =>
  `${n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/**
 * Pre-opening stock snapshot. Rendered between the baseline banner and the
 * KPI row so the user can quickly see "what I already had of this set
 * before opening the boxes" — both in card count and listings value.
 * Hidden entirely when the investment has no baseline rows (backfilled
 * from the server-side null check on baseline_totals).
 */
export default function InvestmentBaselineSummary({
  totals,
}: {
  totals: BaselineTotals;
}) {
  return (
    <div
      className="rounded-xl p-4 flex flex-wrap items-center justify-between gap-4"
      style={{
        background: "var(--surface-gradient)",
        backdropFilter: "var(--surface-blur)",
        border: "1px solid rgba(255,255,255,0.10)",
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="p-2 rounded-lg shrink-0"
          style={{ background: "var(--accent-light)" }}
        >
          <Archive size={16} style={{ color: "var(--accent)" }} />
        </div>
        <div className="min-w-0">
          <div
            className="text-[10px] uppercase tracking-wider"
            style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
          >
            Baseline — what you already had
          </div>
          <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            Cards listed of this set before the opening. Subtracted from stock
            growth to attribute opened singles.
          </div>
        </div>
      </div>
      <div className="flex items-center gap-6">
        <div>
          <div
            className="text-[10px] uppercase tracking-wider"
            style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
          >
            Cards
          </div>
          <div
            className="text-lg font-semibold mt-0.5"
            style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}
          >
            {totals.total_cards.toLocaleString()}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Scale size={14} style={{ color: "var(--text-muted)" }} />
          <div>
            <div
              className="text-[10px] uppercase tracking-wider"
              style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
            >
              Listings value
            </div>
            <div
              className="text-lg font-semibold mt-0.5"
              style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}
            >
              {formatEur(totals.total_value_eur)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
