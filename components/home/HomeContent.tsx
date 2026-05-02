"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { fetcher } from "@/lib/fetcher";
import type { PendingReimbursement } from "@/lib/types";
import StatCard from "@/components/dashboard/stat-card";
import NextGoal from "@/components/home/NextGoal";
import SalesEconomicsPanel from "@/components/cardmarket/SalesEconomicsPanel";
import { Panel, H1, H2 } from "@/components/dashboard/page-shell";
import { StatusPill } from "@/components/dashboard/status-pill";
import { LastUpdated } from "@/components/dashboard/last-updated";
import { Wallet, Store, CreditCard, PackageCheck, Clock, CheckCircle, Receipt } from "lucide-react";

export default function HomeContent() {
  const { data, isLoading, mutate: mutateStats } = useSWR("/api/home/stats", fetcher);
  const stats = data?.data;
  const [refreshing, setRefreshing] = useState(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  // Track last successful fetch wall-clock time so the LastUpdated stamp
  // can render. SWR doesn't expose this directly; we tick the timestamp
  // every time `data` arrives (initial load + each background revalidation).
  useEffect(() => {
    if (data) setLastFetched(new Date());
  }, [data]);

  const { data: pendingData, mutate: mutatePending } = useSWR<{ data: PendingReimbursement[] }>(
    "/api/finance/pending-reimbursements",
    fetcher
  );

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await Promise.all([mutateStats(), mutatePending()]);
      setLastFetched(new Date());
    } finally {
      setRefreshing(false);
    }
  }
  // Sort by oldest first — most-stale reimbursements bubble to the top so
  // they're visible. Then derive an "outstanding days" count for each so we
  // can color-code by urgency in the row.
  const pending = useMemo(() => {
    const rows = pendingData?.data ?? [];
    return [...rows].sort((a, b) => a.date.localeCompare(b.date));
  }, [pendingData]);
  const pendingTotal = pending.reduce((s, p) => s + p.amount, 0);

  function daysOutstanding(isoDate: string): number {
    const d = new Date(isoDate + "T00:00:00").getTime();
    const ms = Date.now() - d;
    return Math.floor(ms / 86_400_000);
  }
  function ageColor(days: number): string {
    if (days >= 30) return "var(--error)";
    if (days >= 7) return "var(--warning)";
    return "var(--text-muted)";
  }

  async function handleReimburse(item: PendingReimbursement) {
    await fetch("/api/finance/reimburse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, reimbursed: true }),
    });
    mutatePending();
    globalMutate((key: string) => typeof key === "string" && key.startsWith("/api/finance"), undefined, { revalidate: true });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <H1 subtitle="Outstanding actions, balance, and today's pulse">Dashboard</H1>
        <LastUpdated at={lastFetched} onRefresh={handleRefresh} refreshing={refreshing} />
      </div>

      <NextGoal />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          title="CM Balance"
          value={isLoading ? "..." : `€${(stats?.cmBalance ?? 0).toFixed(2)}`}
          icon={<CreditCard size={20} style={{ color: "var(--accent)" }} />}
          subtitle="Liquid on Cardmarket"
          href="/cardmarket"
        />
        <StatCard
          title="Treasury"
          value={isLoading ? "..." : `€${(stats?.treasury ?? 0).toFixed(2)}`}
          icon={<Wallet size={20} style={{ color: "var(--accent)" }} />}
          subtitle="All-time net position"
          href="/finance"
        />
        <StatCard
          title="Active Sales Value"
          value={isLoading ? "..." : `€${(stats?.activeSalesValue ?? 0).toFixed(2)}`}
          icon={<Store size={20} style={{ color: "var(--accent)" }} />}
          subtitle="Unpaid + Paid + Trustee Sent"
          href="/cardmarket?status=paid"
        />
        <StatCard
          title="Orders to Ship"
          value={isLoading ? "..." : (stats?.ordersToShip ?? 0).toLocaleString()}
          icon={<PackageCheck size={20} style={{ color: "var(--accent)" }} />}
          subtitle="Paid · awaiting send"
          tone={stats?.ordersToShip ? "warning" : "accent"}
          href="/cardmarket?status=paid"
        />
      </div>

      {/* Pending Reimbursements — actionable items first, before the
          read-only Sales Economics drilldown. */}
      <Panel>
        <div className="flex items-center justify-between mb-3">
          <H2 icon={<Receipt size={16} />}>Pending Reimbursements</H2>
          {pending.length > 0 && (
            <StatusPill tone="danger">€{pendingTotal.toFixed(2)} owed</StatusPill>
          )}
        </div>

        {pending.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: "14px", margin: 0 }}>
            No pending reimbursements.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            {pending.map((item) => {
              const days = daysOutstanding(item.date);
              const aged = ageColor(days);
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors"
                  style={{ background: "transparent" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-card-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Clock size={16} style={{ color: aged, flexShrink: 0 }} />
                    <div className="min-w-0">
                      <p className="text-sm truncate" style={{ color: "var(--text-primary)", margin: 0 }}>
                        {item.description}
                      </p>
                      <p className="text-xs" style={{ color: "var(--text-muted)", margin: 0 }}>
                        {item.paid_by} · {new Date(item.date + "T00:00:00").toLocaleDateString("pt-PT")}
                        {" · "}
                        <span style={{ color: aged, fontWeight: days >= 7 ? 600 : 400 }}>
                          {days === 0 ? "today" : days === 1 ? "1 day outstanding" : `${days} days outstanding`}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span
                      className="text-sm font-medium"
                      style={{ color: "var(--error)", fontFamily: "var(--font-mono)" }}
                    >
                      €{item.amount.toFixed(2)}
                    </span>
                    <button
                      onClick={() => handleReimburse(item)}
                      className="p-1.5 rounded-lg transition-colors"
                      style={{
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        color: "var(--success)",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--success-light)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                      title="Mark as reimbursed"
                    >
                      <CheckCircle size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {/* Sales economics — ASP/card, ship profit/pkg, by-status / method / country */}
      <SalesEconomicsPanel />
    </div>
  );
}
