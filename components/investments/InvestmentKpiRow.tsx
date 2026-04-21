"use client";

import { Wallet, Target, Package, TrendingUp, Sparkles } from "lucide-react";
import StatCard from "@/components/dashboard/stat-card";
import type { InvestmentDetail } from "@/lib/investments/types";

const formatEur = (n: number | null | undefined) =>
  n != null ? `${n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : "—";

export default function InvestmentKpiRow({ kpis }: { kpis: InvestmentDetail["kpis"] }) {
  const ratio = kpis.break_even_pct;
  const clamped = Math.min(Math.max(ratio, 0), 2);
  const past = ratio >= 1;
  const realizedTone = kpis.realized_net_eur >= 0 ? "var(--text-primary)" : "var(--error)";
  const plTone =
    kpis.net_pl_blended_eur > 0
      ? "var(--success)"
      : kpis.net_pl_blended_eur < 0
        ? "var(--error)"
        : "var(--text-primary)";

  return (
    <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
      <StatCard
        title="Cost"
        value={formatEur(kpis.cost_eur)}
        icon={<Wallet size={18} style={{ color: "var(--accent)" }} />}
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
      <div
        className="h-full p-3 sm:p-5 rounded-xl"
        style={{
          background: "var(--surface-gradient)",
          backdropFilter: "var(--surface-blur)",
          border: "1px solid rgba(255, 255, 255, 0.10)",
          boxShadow: "var(--surface-shadow)",
        }}
      >
        <div className="flex items-start justify-between mb-1.5 sm:mb-3">
          <p
            className="text-[10px] sm:text-xs font-medium uppercase tracking-wider"
            style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
          >
            Realized net
          </p>
          <div className="hidden sm:block p-2 rounded-lg" style={{ background: "var(--accent-light)" }}>
            <TrendingUp size={18} style={{ color: "var(--accent)" }} />
          </div>
        </div>
        <p
          className="text-lg sm:text-2xl font-bold"
          style={{ color: realizedTone, fontFamily: "var(--font-mono)" }}
        >
          {formatEur(kpis.realized_net_eur)}
        </p>
        <p className="mt-0.5 sm:mt-1 text-[10px] sm:text-xs" style={{ color: "var(--text-muted)" }}>
          Sold cards + sealed flips
        </p>
      </div>
      <div
        className="h-full p-3 sm:p-5 rounded-xl"
        style={{
          background: "var(--surface-gradient)",
          backdropFilter: "var(--surface-blur)",
          border: "1px solid rgba(255, 255, 255, 0.10)",
          boxShadow: "var(--surface-shadow)",
        }}
      >
        <div className="flex items-start justify-between mb-1.5 sm:mb-3">
          <p
            className="text-[10px] sm:text-xs font-medium uppercase tracking-wider"
            style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
          >
            P/L blended
          </p>
          <div className="hidden sm:block p-2 rounded-lg" style={{ background: "var(--accent-light)" }}>
            <TrendingUp size={18} style={{ color: plTone }} />
          </div>
        </div>
        <p
          className="text-lg sm:text-2xl font-bold"
          style={{ color: plTone, fontFamily: "var(--font-mono)" }}
        >
          {formatEur(kpis.net_pl_blended_eur)}
        </p>
        <p className="mt-0.5 sm:mt-1 text-[10px] sm:text-xs" style={{ color: "var(--text-muted)" }}>
          Realized + listed − cost
        </p>
      </div>
      <div
        className="h-full p-3 sm:p-5 rounded-xl flex flex-col"
        style={{
          background: "var(--surface-gradient)",
          backdropFilter: "var(--surface-blur)",
          border: past ? "1px solid var(--success)" : "1px solid rgba(255, 255, 255, 0.10)",
          boxShadow: "var(--surface-shadow)",
        }}
      >
        <div className="flex items-start justify-between mb-1.5 sm:mb-3">
          <p
            className="text-[10px] sm:text-xs font-medium uppercase tracking-wider"
            style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
          >
            Break-even
          </p>
          <div className="hidden sm:block p-2 rounded-lg" style={{ background: past ? "rgba(52,211,153,0.12)" : "var(--accent-light)" }}>
            <Target size={18} style={{ color: past ? "var(--success)" : "var(--accent)" }} />
          </div>
        </div>
        <p
          className="text-lg sm:text-2xl font-bold"
          style={{
            color: past ? "var(--success)" : "var(--text-primary)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {Math.round(ratio * 100)}%
        </p>
        <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${(clamped / 2) * 100}%`,
              background: past ? "var(--success)" : "var(--accent)",
            }}
          />
        </div>
      </div>
    </div>
  );
}
