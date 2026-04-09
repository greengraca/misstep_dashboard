"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { EvSnapshot } from "@/lib/types";

interface EvHistoryChartProps {
  snapshots: EvSnapshot[];
  isLoading: boolean;
  isJumpstart?: boolean;
}

export default function EvHistoryChart({ snapshots, isLoading, isJumpstart }: EvHistoryChartProps) {
  if (isLoading) {
    return <div className="skeleton" style={{ height: "200px" }} />;
  }

  if (!snapshots.length) {
    return (
      <div>
        <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
          EV History
        </h3>
        <div
          className="text-center py-8 text-sm rounded-xl"
          style={{
            color: "var(--text-muted)",
            background: "rgba(255, 255, 255, 0.015)",
            border: "1px solid var(--border)",
          }}
        >
          No snapshots yet. Generate snapshots to track EV over time.
        </div>
      </div>
    );
  }

  const hasPlay = snapshots.some((s) => s.play_ev_net != null);
  const hasCollector = snapshots.some((s) => s.collector_ev_net != null);

  const data = snapshots.map((s) => ({
    date: new Date(s.date + "T00:00:00").toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" }),
    play: s.play_ev_net,
    collector: s.collector_ev_net,
  }));

  return (
    <div>
      <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
        EV History
      </h3>
      <div
        className="rounded-xl p-4"
        style={{
          background: "rgba(255, 255, 255, 0.015)",
          border: "1px solid var(--border)",
        }}
      >
        <div style={{ width: "100%", height: 200 }}>
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
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
                  borderRadius: "8px",
                  color: "var(--text-primary)",
                  fontSize: "12px",
                }}
                formatter={(value, name) => [
                  typeof value === "number" ? `€${value.toFixed(2)}` : "—",
                  name,
                ]}
              />
              {(hasPlay && hasCollector) && <Legend />}
              {hasPlay && (
                <Line
                  type="monotone"
                  dataKey="play"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  dot={false}
                  name={isJumpstart ? "Jumpstart Booster" : "Play Booster"}
                  connectNulls
                />
              )}
              {hasCollector && (
                <Line
                  type="monotone"
                  dataKey="collector"
                  stroke="#a855f7"
                  strokeWidth={2}
                  dot={false}
                  name="Collector Booster"
                  connectNulls
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
