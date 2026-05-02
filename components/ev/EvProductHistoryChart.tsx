"use client";

import useSWR from "swr";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { fetcher } from "@/lib/fetcher";
import { Panel, H2 } from "@/components/dashboard/page-shell";
import { TrendingUp } from "lucide-react";
import { useDiscount } from "@/lib/discount";

interface ProductSnapshot {
  product_slug: string;
  date: string;
  ev_net_cards_only: number | null;
  ev_net_sealed: number | null;
  ev_net_opened: number | null;
}

/**
 * EV-over-time chart for an EV product. Mirrors the per-set EvHistoryChart
 * but plots up to three lines — cards-only, +sealed, +opened — depending on
 * which fields the snapshots actually carry. Cards-only is always present;
 * the other two only render when the product includes booster boxes.
 */
export default function EvProductHistoryChart({ slug }: { slug: string }) {
  const { apply } = useDiscount();
  const { data, isLoading } = useSWR<{ data: ProductSnapshot[] }>(
    `/api/ev/products/${slug}/snapshot?days=180`,
    fetcher
  );
  const snapshots = data?.data ?? [];

  if (isLoading) {
    return (
      <Panel>
        <H2 icon={<TrendingUp size={16} />}>EV history</H2>
        <div className="skeleton" style={{ height: 200 }} />
      </Panel>
    );
  }

  if (!snapshots.length) {
    return (
      <Panel>
        <H2 icon={<TrendingUp size={16} />}>EV history</H2>
        <div
          className="text-center py-8 text-sm rounded-lg"
          style={{
            color: "var(--text-muted)",
            background: "rgba(255, 255, 255, 0.015)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          No snapshots yet. Open the page to trigger one — snapshots accumulate over time.
        </div>
      </Panel>
    );
  }

  const hasSealed = snapshots.some((s) => s.ev_net_sealed != null);
  const hasOpened = snapshots.some((s) => s.ev_net_opened != null);

  const chartData = snapshots.map((s) => ({
    date: new Date(s.date + "T00:00:00").toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" }),
    cards: s.ev_net_cards_only != null ? apply(s.ev_net_cards_only) : null,
    sealed: s.ev_net_sealed != null ? apply(s.ev_net_sealed) : null,
    opened: s.ev_net_opened != null ? apply(s.ev_net_opened) : null,
  }));

  return (
    <Panel>
      <H2 icon={<TrendingUp size={16} />}>EV history</H2>
      <div style={{ width: "100%", height: 200 }}>
        <ResponsiveContainer>
          <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
            <XAxis
              dataKey="date"
              tick={{ fill: "var(--text-muted)", fontSize: 10 }}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: "var(--text-muted)", fontSize: 10 }}
              tickFormatter={(v: number) => `€${v.toFixed(0)}`}
            />
            <Tooltip
              contentStyle={{
                background: "rgba(15, 20, 25, 0.95)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                color: "var(--text-primary)",
                fontSize: 12,
              }}
              formatter={(value, name) => [
                typeof value === "number" ? `€${value.toFixed(2)}` : "—",
                name,
              ]}
            />
            {(hasSealed || hasOpened) && <Legend wrapperStyle={{ fontSize: 11 }} />}
            <Line
              type="monotone"
              dataKey="cards"
              stroke="var(--accent)"
              strokeWidth={2}
              dot={false}
              name="Cards only"
              connectNulls
              isAnimationActive={false}
            />
            {hasSealed && (
              <Line
                type="monotone"
                dataKey="sealed"
                stroke="var(--success)"
                strokeWidth={2}
                dot={false}
                name="+ Sealed"
                connectNulls
                isAnimationActive={false}
              />
            )}
            {hasOpened && (
              <Line
                type="monotone"
                dataKey="opened"
                stroke="#a855f7"
                strokeWidth={2}
                dot={false}
                name="+ Opened"
                connectNulls
                isAnimationActive={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}
