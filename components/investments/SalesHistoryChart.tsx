"use client";

import useSWR from "swr";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { fetcher } from "@/lib/fetcher";
import { Panel, H2 } from "@/components/dashboard/page-shell";
import { TrendingUp } from "lucide-react";

interface SalesHistory {
  cost: number;
  created_at: string;
  closed_at: string | null;
  events: { date: string; kind: "sale" | "flip"; amount: number }[];
  daily: { date: string; cumulative: number }[];
  summary: {
    first_event_at: string | null;
    last_event_at: string | null;
    sale_count: number;
    flip_count: number;
  };
}

const formatEur = (n: number) =>
  `€${n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function formatLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
}

interface ChartTooltipPayload {
  payload: { date: string; cumulative: number };
}

function ChartTooltip({ active, payload, cost }: {
  active?: boolean;
  payload?: ChartTooltipPayload[];
  cost: number;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const ratio = cost > 0 ? p.cumulative / cost : 0;
  return (
    <div
      style={{
        background: "rgba(15, 20, 25, 0.95)",
        border: "1px solid rgba(255,255,255,0.15)",
        borderRadius: 8,
        padding: "8px 10px",
        fontSize: 11,
        color: "var(--text-primary)",
        boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
        fontFamily: "var(--font-mono)",
      }}
    >
      <div style={{ color: "var(--text-muted)", marginBottom: 2 }}>
        {formatLabel(p.date)}
      </div>
      <div style={{ color: "var(--success)" }}>
        {formatEur(p.cumulative)} realized
      </div>
      <div style={{ color: "var(--text-muted)", fontSize: 10, marginTop: 2 }}>
        {Math.round(ratio * 100)}% of cost
      </div>
    </div>
  );
}

export default function SalesHistoryChart({ investmentId }: { investmentId: string }) {
  const { data, isLoading } = useSWR<{ data: SalesHistory }>(
    `/api/investments/${investmentId}/sales-history`,
    fetcher,
    { dedupingInterval: 30_000 }
  );

  if (isLoading) {
    return (
      <Panel>
        <H2 icon={<TrendingUp size={16} />}>Sales over time</H2>
        <div className="skeleton" style={{ height: 160 }} />
      </Panel>
    );
  }

  const sh = data?.data;
  if (!sh || sh.daily.length === 0) {
    return (
      <Panel>
        <H2 icon={<TrendingUp size={16} />}>Sales over time</H2>
        <div
          className="text-center text-sm py-8 rounded-lg"
          style={{
            color: "var(--text-muted)",
            background: "rgba(255,255,255,0.015)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          No sales or sealed flips yet — once cards start selling on Cardmarket and the extension picks them up, the curve will show your cumulative realized vs. cost.
        </div>
      </Panel>
    );
  }

  const last = sh.daily[sh.daily.length - 1];
  const past = last.cumulative >= sh.cost;
  const realizedPct = sh.cost > 0 ? Math.round((last.cumulative / sh.cost) * 100) : 0;

  return (
    <Panel>
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <H2 icon={<TrendingUp size={16} />}>Sales over time</H2>
        <div className="flex items-center gap-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
          <span style={{ color: "var(--success)", fontFamily: "var(--font-mono)" }}>
            {formatEur(last.cumulative)} realized
          </span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
            {formatEur(sh.cost)} cost
          </span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span style={{
            color: past ? "var(--success)" : "var(--accent)",
            fontFamily: "var(--font-mono)",
          }}>
            {realizedPct}%
          </span>
        </div>
      </div>
      <div style={{ width: "100%", height: 160 }}>
        <ResponsiveContainer>
          <AreaChart data={sh.daily} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
            <defs>
              <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--success)" stopOpacity={0.45} />
                <stop offset="100%" stopColor="var(--success)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tickFormatter={formatLabel}
              tick={{ fontSize: 9, fill: "var(--text-muted)" }}
              interval="preserveStartEnd"
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 9, fill: "var(--text-muted)" }}
              tickFormatter={(v: number) => `€${v.toFixed(0)}`}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip
              content={<ChartTooltip cost={sh.cost} />}
              cursor={{ stroke: "var(--success)", strokeOpacity: 0.4, strokeDasharray: "3 3" }}
            />
            <ReferenceLine
              y={sh.cost}
              stroke="var(--text-muted)"
              strokeDasharray="4 4"
              strokeOpacity={0.6}
              label={{
                value: "cost",
                position: "right",
                fill: "var(--text-muted)",
                fontSize: 9,
                fontFamily: "var(--font-mono)",
              }}
            />
            <Area
              type="monotone"
              dataKey="cumulative"
              stroke="var(--success)"
              strokeWidth={2}
              fill="url(#salesFill)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}
