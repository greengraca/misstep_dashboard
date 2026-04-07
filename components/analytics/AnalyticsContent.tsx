"use client";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import StatCard from "@/components/dashboard/stat-card";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { BarChart3, Eye, TrendingUp, CalendarDays } from "lucide-react";

const PIE_COLORS = ["var(--accent)", "var(--success)", "var(--warning, #f59e0b)", "var(--danger, #ef4444)"];

const panelStyle = {
  background: "var(--surface-gradient)",
  backdropFilter: "var(--surface-blur)",
  border: "var(--surface-border)",
  boxShadow: "var(--surface-shadow)",
  borderRadius: "var(--radius)",
  padding: "24px",
};

export default function AnalyticsContent() {
  const { data, isLoading } = useSWR<{
    totalViews: number;
    avgDaily: number;
    peakDay: string;
    trend: number;
    timeSeries: { date: string; views: number }[];
    byCategory: { name: string; value: number }[];
    barData: { label: string; count: number }[];
  }>("/api/analytics", fetcher);

  const timeSeries = data?.timeSeries ?? [];
  const byCategory = data?.byCategory ?? [];
  const barData = data?.barData ?? [];

  return (
    <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "24px" }}>
      <h1 style={{ fontSize: "24px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        Analytics
      </h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
        <StatCard
          title="Total Views"
          value={isLoading ? "..." : (data?.totalViews ?? 0).toLocaleString()}
          icon={<Eye size={20} />}
        />
        <StatCard
          title="Avg. Daily"
          value={isLoading ? "..." : (data?.avgDaily ?? 0).toLocaleString()}
          icon={<BarChart3 size={20} />}
        />
        <StatCard
          title="Peak Day"
          value={isLoading ? "..." : (data?.peakDay ?? "—")}
          icon={<CalendarDays size={20} />}
        />
        <StatCard
          title="Trend"
          value={isLoading ? "..." : `${data?.trend ?? 0}%`}
          icon={<TrendingUp size={20} />}
          active
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "16px" }}>
        <div style={panelStyle}>
          <h2 style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-primary)", marginTop: 0, marginBottom: "16px" }}>
            Views Over Time
          </h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={timeSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fill: "var(--text-muted)", fontSize: 12 }} />
              <YAxis tick={{ fill: "var(--text-muted)", fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  color: "var(--text-primary)",
                }}
              />
              <Line type="monotone" dataKey="views" stroke="var(--accent)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div style={panelStyle}>
          <h2 style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-primary)", marginTop: 0, marginBottom: "16px" }}>
            By Category
          </h2>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={byCategory}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {byCategory.map((_, index) => (
                  <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  color: "var(--text-primary)",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={panelStyle}>
        <h2 style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-primary)", marginTop: 0, marginBottom: "16px" }}>
          Activity Breakdown
        </h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={barData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 12 }} />
            <YAxis tick={{ fill: "var(--text-muted)", fontSize: 12 }} />
            <Tooltip
              contentStyle={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                color: "var(--text-primary)",
              }}
            />
            <Bar dataKey="count" fill="var(--accent)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
