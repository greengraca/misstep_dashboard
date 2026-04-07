"use client";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import StatCard from "@/components/dashboard/stat-card";
import { LayoutDashboard, Users, Activity, TrendingUp } from "lucide-react";

export default function HomeContent() {
  const { data, isLoading } = useSWR("/api/home/stats", fetcher);
  const stats = data?.data;

  return (
    <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "24px" }}>
      <h1 style={{ fontSize: "24px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        Dashboard
      </h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px" }}>
        <StatCard
          title="Total Records"
          value={isLoading ? "..." : stats?.totalRecords ?? 0}
          icon={<LayoutDashboard size={20} />}
        />
        <StatCard
          title="Active Users"
          value={isLoading ? "..." : stats?.activeUsers ?? 0}
          icon={<Users size={20} />}
        />
        <StatCard
          title="Recent Activity"
          value={isLoading ? "..." : stats?.recentActivity ?? 0}
          icon={<Activity size={20} />}
          subtitle="Last 7 days"
        />
        <StatCard
          title="Growth"
          value={isLoading ? "..." : `${stats?.growth ?? 0}%`}
          icon={<TrendingUp size={20} />}
          trend={stats?.growthTrend ? { value: stats.growthTrend, label: "vs last month" } : undefined}
        />
      </div>

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
        <h2 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", marginTop: 0, marginBottom: "16px" }}>
          Recent Activity
        </h2>
        <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>
          No activity yet. Activity will appear here as you use the dashboard.
        </p>
      </div>
    </div>
  );
}
