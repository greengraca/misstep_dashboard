"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { TrendingUp, Plus, Package, Boxes } from "lucide-react";
import StatCard from "@/components/dashboard/stat-card";
import CreateInvestmentModal from "./CreateInvestmentModal";
import type { InvestmentListItem, InvestmentStatus } from "@/lib/investments/types";

const surfaceStyle = {
  background: "var(--surface-gradient)",
  backdropFilter: "var(--surface-blur)",
  border: "1px solid rgba(255,255,255,0.10)",
};

const formatEur = (n: number | null | undefined) =>
  n != null ? `${n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : "—";

function sourceLabel(src: InvestmentListItem["source"]): string {
  if (src.kind === "box") {
    return `${src.box_count}× ${src.set_code.toUpperCase()} · ${src.booster_type}`;
  }
  if (src.kind === "product") {
    return `${src.unit_count}× ${src.product_slug}`;
  }
  return `Collection · ${src.card_count} cards`;
}

const STATUS_TABS: { key: InvestmentStatus | "all"; label: string }[] = [
  { key: "listing", label: "Listing" },
  { key: "closed", label: "Closed" },
  { key: "archived", label: "Archived" },
  { key: "all", label: "All" },
];

function statusBadge(status: InvestmentStatus) {
  const map: Record<InvestmentStatus, { bg: string; color: string; label: string }> = {
    listing: { bg: "rgba(63,206,229,0.15)", color: "var(--accent)", label: "listing" },
    closed: { bg: "rgba(52, 211, 153, 0.12)", color: "var(--success)", label: "closed" },
    archived: { bg: "rgba(255,255,255,0.06)", color: "var(--text-muted)", label: "archived" },
  };
  const s = map[status];
  return (
    <span
      className="px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap"
      style={{ background: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}

export default function InvestmentsContent() {
  const [tab, setTab] = useState<InvestmentStatus | "all">("listing");
  const [showCreate, setShowCreate] = useState(false);

  // Fetch all investments once. Filter/count client-side — volume is low (tens).
  const { data, mutate, isLoading } = useSWR<{ investments: InvestmentListItem[] }>(
    "/api/investments",
    fetcher,
    { dedupingInterval: 30_000 }
  );
  const allRows = data?.investments ?? [];

  const countsByStatus = useMemo(() => {
    const counts: Record<InvestmentStatus, number> = {
      listing: 0,
      closed: 0,
      archived: 0,
    };
    for (const r of allRows) counts[r.status] += 1;
    return counts;
  }, [allRows]);

  const rows = useMemo(
    () => (tab === "all" ? allRows : allRows.filter((r) => r.status === tab)),
    [allRows, tab]
  );

  const { deployed, realized, listed, plBlended } = useMemo(() => {
    let deployed = 0, realized = 0, listed = 0;
    for (const r of allRows) {
      if (r.status === "archived") continue;
      deployed += r.cost_total_eur;
      realized += r.realized_eur + r.sealed_flips_total_eur;
      listed += r.listed_value_eur;
    }
    return { deployed, realized, listed, plBlended: realized + listed - deployed };
  }, [allRows]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
            Investments
          </h1>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Sealed purchases + their attributed singles
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ background: "var(--accent)", color: "var(--accent-text)" }}
        >
          <Plus size={14} /> New Investment
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="Deployed"
          value={formatEur(deployed)}
          subtitle={(() => {
            const active = countsByStatus.listing + countsByStatus.closed;
            return active ? `${active} investment${active === 1 ? "" : "s"}` : undefined;
          })()}
          icon={<Boxes size={18} style={{ color: "var(--accent)" }} />}
        />
        <StatCard
          title="Listed value"
          value={formatEur(listed)}
          subtitle="Current stock × live price"
          icon={<Package size={18} style={{ color: "var(--accent)" }} />}
        />
        <StatCard
          title="Realized net"
          value={formatEur(realized)}
          subtitle="Sold + sealed flips"
          icon={<TrendingUp size={18} style={{ color: "var(--accent)" }} />}
        />
        <StatCard
          title="P/L blended"
          value={formatEur(plBlended)}
          subtitle={plBlended >= 0 ? "Above cost" : "Below cost"}
          icon={
            <TrendingUp
              size={18}
              style={{ color: plBlended >= 0 ? "var(--success)" : "var(--error)" }}
            />
          }
        />
      </div>

      <div className="rounded-xl overflow-hidden" style={surfaceStyle}>
        <div
          className="flex gap-0 px-4 pt-4 overflow-x-auto"
          style={{ borderBottom: "1px solid var(--border)", scrollbarWidth: "thin" }}
        >
          {STATUS_TABS.map((t) => {
            const active = tab === t.key;
            const count =
              t.key === "all"
                ? allRows.length
                : countsByStatus[t.key];
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="px-3 py-2 text-xs font-medium transition-all whitespace-nowrap shrink-0"
                style={{
                  color: active ? "var(--accent)" : "var(--text-muted)",
                  borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
                  marginBottom: "-1px",
                }}
              >
                {t.label}
                {count > 0 && (
                  <span
                    className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px]"
                    style={{
                      background: active ? "rgba(63,206,229,0.2)" : "rgba(255,255,255,0.08)",
                      color: active ? "var(--accent)" : "var(--text-muted)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="px-4 pb-4">
          {isLoading ? (
            <p className="text-xs py-6 text-center" style={{ color: "var(--text-muted)" }}>
              Loading…
            </p>
          ) : rows.length === 0 ? (
            <p className="text-xs py-6 text-center" style={{ color: "var(--text-muted)" }}>
              {tab === "listing" ? "No active investments." : "Nothing here yet."}
            </p>
          ) : (
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-xs min-w-[720px]" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
                <thead>
                  <tr style={{ color: "var(--text-muted)" }}>
                    <th className="text-left py-2 px-2 font-medium">Status</th>
                    <th className="text-left py-2 px-2 font-medium">Name</th>
                    <th className="text-left py-2 px-2 font-medium">Source</th>
                    <th className="text-right py-2 px-2 font-medium">Cost</th>
                    <th className="text-right py-2 px-2 font-medium">Listed</th>
                    <th className="text-right py-2 px-2 font-medium">Realized</th>
                    <th className="text-left py-2 px-2 font-medium w-40">Break-even</th>
                    <th className="text-right py-2 px-2 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const totalRealized = r.realized_eur + r.sealed_flips_total_eur;
                    const ratio = r.cost_total_eur > 0 ? totalRealized / r.cost_total_eur : 0;
                    const clamped = Math.min(Math.max(ratio, 0), 2);
                    const past = ratio >= 1;
                    return (
                      <tr
                        key={r.id}
                        className="transition-all"
                        style={{ borderBottom: "1px solid var(--border)" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                      >
                        <td className="py-2 px-2">{statusBadge(r.status)}</td>
                        <td className="py-2 px-2">
                          <Link
                            href={`/investments/${r.id}`}
                            style={{ color: "var(--accent)", textDecoration: "none" }}
                            onMouseEnter={(e) => { e.currentTarget.style.textDecoration = "underline"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.textDecoration = "none"; }}
                          >
                            {r.name}
                          </Link>
                        </td>
                        <td className="py-2 px-2" style={{ color: "var(--text-muted)" }}>
                          {sourceLabel(r.source)}
                        </td>
                        <td className="py-2 px-2 text-right" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                          {formatEur(r.cost_total_eur)}
                        </td>
                        <td className="py-2 px-2 text-right" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                          {formatEur(r.listed_value_eur)}
                        </td>
                        <td
                          className="py-2 px-2 text-right"
                          style={{
                            color: past ? "var(--success)" : "var(--text-secondary)",
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          {formatEur(totalRealized)}
                        </td>
                        <td className="py-2 px-2">
                          <div className="flex items-center gap-2">
                            <div
                              className="flex-1 h-1.5 rounded-full overflow-hidden"
                              style={{ background: "rgba(255,255,255,0.06)", maxWidth: "120px" }}
                            >
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${(clamped / 2) * 100}%`,
                                  background: past ? "var(--success)" : "var(--accent)",
                                }}
                              />
                            </div>
                            <span
                              className="text-[10px] tabular-nums"
                              style={{
                                color: past ? "var(--success)" : "var(--text-muted)",
                                minWidth: "32px",
                                fontFamily: "var(--font-mono)",
                              }}
                            >
                              {Math.round(ratio * 100)}%
                            </span>
                          </div>
                        </td>
                        <td className="py-2 px-2 text-right" style={{ color: "var(--text-muted)" }}>
                          {new Date(r.created_at).toLocaleDateString("pt-PT")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <CreateInvestmentModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => {
          setShowCreate(false);
          setTab("listing");
          mutate();
        }}
      />
    </div>
  );
}
