"use client";

import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import type { EvSimulationResult } from "@/lib/types";
import { Dices, TrendingUp } from "lucide-react";

const inputStyle = {
  background: "var(--bg-card)",
  borderColor: "var(--border)",
  color: "var(--text-primary)",
};

interface EvSimulationPanelProps {
  setCode: string;
  boosterType: "play" | "collector";
  siftFloor: number;
}

export default function EvSimulationPanel({ setCode, boosterType, siftFloor }: EvSimulationPanelProps) {
  const [boxCost, setBoxCost] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("1");
  const [iterations, setIterations] = useState(10000);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<EvSimulationResult | null>(null);

  async function runSimulation() {
    setRunning(true);
    try {
      const res = await fetch(`/api/ev/simulate/${setCode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          booster: boosterType,
          iterations,
          floor: siftFloor,
          boxCost: boxCost ? parseFloat(boxCost) : undefined,
          quantity: quantity ? parseInt(quantity, 10) : 1,
        }),
      });
      const json = await res.json();
      if (json.data) setResult(json.data);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
        Monte Carlo Simulation
      </h3>

      <div
        className="rounded-xl p-4"
        style={{
          background: "rgba(255, 255, 255, 0.015)",
          border: "1px solid var(--border)",
        }}
      >
        {/* Inputs */}
        <div className="flex flex-wrap gap-3 mb-4">
          <div>
            <label className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>Box Cost (&euro;)</label>
            <input
              type="number"
              step="0.01"
              value={boxCost}
              onChange={(e) => setBoxCost(e.target.value)}
              placeholder="e.g. 95"
              className="rounded-lg border px-3 py-1.5 text-sm w-28 outline-none"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>Quantity</label>
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="rounded-lg border px-3 py-1.5 text-sm w-20 outline-none"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>Iterations</label>
            <input
              type="number"
              min="1000"
              max="50000"
              step="1000"
              value={iterations}
              onChange={(e) => setIterations(parseInt(e.target.value, 10) || 10000)}
              className="rounded-lg border px-3 py-1.5 text-sm w-24 outline-none"
              style={inputStyle}
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={runSimulation}
              disabled={running}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
              style={{
                background: "var(--accent)",
                color: "#fff",
                opacity: running ? 0.6 : 1,
              }}
            >
              <Dices size={14} className={running ? "animate-spin" : ""} />
              {running ? "Simulating..." : "Run Simulation"}
            </button>
          </div>
        </div>

        {/* Results */}
        {result && (
          <div className="flex flex-col gap-4">
            {/* Stats grid */}
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}
            >
              {[
                { label: "Mean", value: `€${result.mean.toFixed(2)}` },
                { label: "Median", value: `€${result.median.toFixed(2)}` },
                { label: "Std Dev", value: `€${result.stddev.toFixed(2)}` },
                { label: "Min", value: `€${result.min.toFixed(2)}` },
                { label: "Max", value: `€${result.max.toFixed(2)}` },
                { label: "Time", value: `${result.duration_ms}ms` },
              ].map((s) => (
                <div
                  key={s.label}
                  className="p-2 rounded-lg"
                  style={{ background: "rgba(255,255,255,0.03)" }}
                >
                  <p className="text-[10px] uppercase" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                    {s.label}
                  </p>
                  <p className="text-sm font-bold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                    {s.value}
                  </p>
                </div>
              ))}
            </div>

            {/* Confidence intervals */}
            <div className="flex flex-wrap gap-4 text-xs" style={{ fontFamily: "var(--font-mono)" }}>
              <span style={{ color: "var(--text-muted)" }}>
                68% CI: <span style={{ color: "var(--text-primary)" }}>€{result.percentiles.p16.toFixed(2)} – €{result.percentiles.p84.toFixed(2)}</span>
              </span>
              <span style={{ color: "var(--text-muted)" }}>
                90% CI: <span style={{ color: "var(--text-primary)" }}>€{result.percentiles.p5.toFixed(2)} – €{result.percentiles.p95.toFixed(2)}</span>
              </span>
              <span style={{ color: "var(--text-muted)" }}>
                95% CI: <span style={{ color: "var(--text-primary)" }}>€{result.percentiles.p2_5.toFixed(2)} – €{result.percentiles.p97_5.toFixed(2)}</span>
              </span>
            </div>

            {/* Histogram */}
            <div style={{ width: "100%", height: 200 }}>
              <ResponsiveContainer>
                <BarChart data={result.histogram} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                  <XAxis
                    dataKey="bin_min"
                    tickFormatter={(v: number) => `€${v.toFixed(0)}`}
                    tick={{ fill: "var(--text-muted)", fontSize: 10 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{
                      background: "rgba(15, 20, 25, 0.95)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "8px",
                      color: "var(--text-primary)",
                      fontSize: "12px",
                    }}
                    formatter={(value) => [`${value} boxes`, "Count"]}
                    labelFormatter={(v) => {
                      const n = typeof v === "number" ? v : parseFloat(String(v));
                      const binW = (result.histogram[1]?.bin_min ?? 0) - (result.histogram[0]?.bin_min ?? 0);
                      return `€${n.toFixed(2)} – €${(n + binW).toFixed(2)}`;
                    }}
                  />
                  <Bar dataKey="count" fill="var(--accent)" radius={[2, 2, 0, 0]} />
                  {result.roi && (
                    <ReferenceLine
                      x={result.roi.box_cost}
                      stroke="#ef4444"
                      strokeDasharray="4 4"
                      label={{ value: "Cost", fill: "#ef4444", fontSize: 10 }}
                    />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* ROI */}
            {result.roi && (
              <div
                className="p-3 rounded-lg flex flex-wrap gap-4"
                style={{
                  background: result.roi.profit_per_box >= 0
                    ? "rgba(34, 197, 94, 0.08)"
                    : "rgba(239, 68, 68, 0.08)",
                  border: `1px solid ${result.roi.profit_per_box >= 0 ? "rgba(34, 197, 94, 0.2)" : "rgba(239, 68, 68, 0.2)"}`,
                }}
              >
                <div className="flex items-center gap-2">
                  <TrendingUp size={16} style={{ color: result.roi.profit_per_box >= 0 ? "var(--success)" : "var(--error)" }} />
                  <div>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>ROI</p>
                    <p className="text-sm font-bold" style={{
                      color: result.roi.roi_percent >= 0 ? "var(--success)" : "var(--error)",
                      fontFamily: "var(--font-mono)",
                    }}>
                      {result.roi.roi_percent >= 0 ? "+" : ""}{result.roi.roi_percent.toFixed(1)}%
                    </p>
                  </div>
                </div>
                <div>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>Profit / Box</p>
                  <p className="text-sm font-bold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                    {result.roi.profit_per_box >= 0 ? "+" : ""}&euro;{result.roi.profit_per_box.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>Total ({result.roi.quantity} boxes)</p>
                  <p className="text-sm font-bold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                    {result.roi.total_profit >= 0 ? "+" : ""}&euro;{result.roi.total_profit.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>Profit Chance</p>
                  <p className="text-sm font-bold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                    {result.roi.profit_probability.toFixed(1)}%
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
