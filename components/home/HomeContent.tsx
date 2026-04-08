"use client";

import useSWR, { mutate as globalMutate } from "swr";
import { fetcher } from "@/lib/fetcher";
import type { PendingReimbursement } from "@/lib/types";
import StatCard from "@/components/dashboard/stat-card";
import { LayoutDashboard, Users, Activity, TrendingUp, Clock, CheckCircle } from "lucide-react";

export default function HomeContent() {
  const { data, isLoading } = useSWR("/api/home/stats", fetcher);
  const stats = data?.data;

  const { data: pendingData, mutate: mutatePending } = useSWR<{ data: PendingReimbursement[] }>(
    "/api/finance/pending-reimbursements",
    fetcher
  );
  const pending = pendingData?.data ?? [];
  const pendingTotal = pending.reduce((s, p) => s + p.amount, 0);

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
      <h1 style={{ fontSize: "24px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        Dashboard
      </h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px" }}>
        <StatCard
          title="Total Records"
          value={isLoading ? "..." : stats?.totalRecords ?? 0}
          icon={<LayoutDashboard size={20} style={{ color: "var(--accent)" }} />}
        />
        <StatCard
          title="Active Users"
          value={isLoading ? "..." : stats?.activeUsers ?? 0}
          icon={<Users size={20} style={{ color: "var(--accent)" }} />}
        />
        <StatCard
          title="Recent Activity"
          value={isLoading ? "..." : stats?.recentActivity ?? 0}
          icon={<Activity size={20} style={{ color: "var(--accent)" }} />}
          subtitle="Last 7 days"
        />
        <StatCard
          title="Growth"
          value={isLoading ? "..." : `${stats?.growth ?? 0}%`}
          icon={<TrendingUp size={20} style={{ color: "var(--accent)" }} />}
          trend={stats?.growthTrend ? { value: stats.growthTrend, label: "vs last month" } : undefined}
        />
      </div>

      {/* Pending Reimbursements */}
      <div
        style={{
          background: "var(--surface-gradient)",
          backdropFilter: "var(--surface-blur)",
          border: "var(--surface-border)",
          boxShadow: "var(--surface-shadow)",
          borderRadius: "var(--radius)",
          padding: "24px",
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
            Pending Reimbursements
          </h2>
          {pending.length > 0 && (
            <span
              className="text-sm font-medium"
              style={{ color: "var(--error, #ef4444)", fontFamily: "var(--font-mono)" }}
            >
              €{pendingTotal.toFixed(2)}
            </span>
          )}
        </div>

        {pending.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: "14px", margin: 0 }}>
            No pending reimbursements.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            {pending.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors"
                style={{ background: "transparent" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Clock size={16} style={{ color: "var(--warning, #f59e0b)", flexShrink: 0 }} />
                  <div className="min-w-0">
                    <p className="text-sm truncate" style={{ color: "var(--text-primary)", margin: 0 }}>
                      {item.description}
                    </p>
                    <p className="text-xs" style={{ color: "var(--text-muted)", margin: 0 }}>
                      {item.paid_by} · {new Date(item.date + "T00:00:00").toLocaleDateString("pt-PT")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span
                    className="text-sm font-medium"
                    style={{ color: "var(--error, #ef4444)", fontFamily: "var(--font-mono)" }}
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
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(34,197,94,0.1)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    title="Mark as reimbursed"
                  >
                    <CheckCircle size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
