"use client";

import { Wallet, Target, Package, TrendingUp, Sparkles } from "lucide-react";
import StatCard from "@/components/dashboard/stat-card";
import type { InvestmentDetail } from "@/lib/investments/types";

const formatEur = (n: number | null | undefined) =>
  n != null ? `${n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : "—";

export default function InvestmentKpiRow({ kpis }: { kpis: InvestmentDetail["kpis"] }) {
  const ratio = kpis.break_even_pct;
  const past = ratio >= 1;

  // Realized: success when positive, danger when negative, muted when zero.
  const realizedTone =
    kpis.realized_net_eur > 0 ? "success" : kpis.realized_net_eur < 0 ? "danger" : "muted";
  const realizedIconColor =
    kpis.realized_net_eur > 0 ? "var(--success)" : kpis.realized_net_eur < 0 ? "var(--error)" : "var(--text-tertiary)";

  // P/L: same logic.
  const plTone =
    kpis.net_pl_blended_eur > 0 ? "success" : kpis.net_pl_blended_eur < 0 ? "danger" : "muted";
  const plIconColor =
    kpis.net_pl_blended_eur > 0 ? "var(--success)" : kpis.net_pl_blended_eur < 0 ? "var(--error)" : "var(--text-tertiary)";

  // Break-even: success at/past 100%, accent below.
  const breakevenTone = past ? "success" : "accent";

  return (
    <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
      <StatCard
        title="Cost"
        value={formatEur(kpis.cost_eur)}
        icon={<Wallet size={18} style={{ color: "var(--text-tertiary)" }} />}
        tone="muted"
      />
      <StatCard
        title="Expected EV"
        value={formatEur(kpis.expected_ev_eur)}
        subtitle={kpis.expected_ev_eur == null ? "Not yet available" : "From latest snapshots"}
        icon={<Sparkles size={18} style={{ color: "var(--accent)" }} />}
      />
      <StatCard
        title="Listed"
        value={formatEur(kpis.listed_value_eur)}
        subtitle="Qty remaining × live price"
        icon={<Package size={18} style={{ color: "var(--accent)" }} />}
      />
      <StatCard
        title="Realized net"
        value={formatEur(kpis.realized_net_eur)}
        subtitle="Sold cards + sealed flips"
        icon={<TrendingUp size={18} style={{ color: realizedIconColor }} />}
        tone={realizedTone}
      />
      <StatCard
        title="P/L blended"
        value={formatEur(kpis.net_pl_blended_eur)}
        subtitle="Realized + listed − cost"
        icon={<TrendingUp size={18} style={{ color: plIconColor }} />}
        tone={plTone}
      />
      <StatCard
        title="Break-even"
        value={`${Math.round(ratio * 100)}%`}
        subtitle={
          /* Inline progress bar in the subtitle slot — past breakeven turns
             solid success and the bar caps at the 100% marker. */
          (() => {
            const trackPct = Math.min(ratio, 2) / 2; // 100% trackPct == 200% recovery
            const breakevenMarker = 50; // 100% = halfway across (since track maxes at 200%)
            return (
              <span className="block w-full">
                <span
                  className="block h-1.5 rounded-full overflow-hidden relative"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                >
                  <span
                    className="block h-full rounded-full transition-all"
                    style={{
                      width: `${trackPct * 100}%`,
                      background: past ? "var(--success)" : "var(--accent)",
                    }}
                  />
                  <span
                    className="absolute top-0 bottom-0"
                    style={{
                      left: `${breakevenMarker}%`,
                      width: 1,
                      background: "rgba(255,255,255,0.25)",
                    }}
                    title="100% break-even marker"
                  />
                </span>
              </span>
            );
          })()
        }
        icon={<Target size={18} style={{ color: past ? "var(--success)" : "var(--accent)" }} />}
        tone={breakevenTone}
      />
    </div>
  );
}
