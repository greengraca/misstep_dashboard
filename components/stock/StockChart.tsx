"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { StockHistoryPoint, HistoryRange } from "@/lib/stock";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const ranges: { value: HistoryRange; label: string }[] = [
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "all", label: "All" },
];

export default function StockChart() {
  const [range, setRange] = useState<HistoryRange>("30d");
  const { data, isLoading, error } = useSWR<{ points: StockHistoryPoint[] }>(
    `/api/stock/history?range=${range}`,
    fetcher
  );

  const points =
    data?.points.map((p) => ({
      ...p,
      date: new Date(p.extractedAt).toLocaleDateString(),
    })) || [];

  return (
    <div
      style={{
        background: "var(--surface-gradient)",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 10,
        padding: 16,
        marginBottom: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <h3
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--text-primary)",
            margin: 0,
          }}
        >
          Stock over time
        </h3>
        <div style={{ display: "flex", gap: 4 }}>
          {ranges.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setRange(r.value)}
              style={{
                background:
                  range === r.value ? "rgba(255,255,255,0.08)" : "transparent",
                border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: 6,
                color:
                  range === r.value ? "var(--text-primary)" : "var(--text-muted)",
                padding: "4px 10px",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ width: "100%", height: 280 }}>
        {isLoading && (
          <div
            style={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-muted)",
              fontSize: 12,
            }}
          >
            Loading…
          </div>
        )}
        {error && (
          <div
            style={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--danger, #f87171)",
              fontSize: 12,
            }}
          >
            Failed to load history
          </div>
        )}
        {!isLoading && !error && points.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="date"
                stroke="var(--text-muted)"
                fontSize={11}
                tickLine={false}
              />
              <YAxis
                yAxisId="left"
                stroke="var(--text-muted)"
                fontSize={11}
                tickLine={false}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="var(--text-muted)"
                fontSize={11}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "#111",
                  border: "1px solid rgba(255,255,255,0.10)",
                  borderRadius: 6,
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="totalQty"
                name="Total Stock"
                stroke="#60a5fa"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="distinctNameSet"
                name="Listings"
                stroke="#a78bfa"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="totalValue"
                name="Value (€)"
                stroke="#34d399"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        )}
        {!isLoading && !error && points.length === 0 && (
          <div
            style={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-muted)",
              fontSize: 12,
            }}
          >
            No history yet. Run the backfill script or wait for the next sync.
          </div>
        )}
      </div>
    </div>
  );
}
