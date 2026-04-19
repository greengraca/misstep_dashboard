"use client";

import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import type { EvSimulationResult } from "@/lib/types";
import { useDiscount } from "@/lib/discount";
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
  const { apply } = useDiscount();
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
            {/* Stats grid with tooltips */}
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}
            >
              {[
                { label: "Mean", value: `€${apply(result.mean).toFixed(2)}`, tip: "Average box value across all simulations. The expected value you'd get if you opened many boxes." },
                { label: "Median", value: `€${apply(result.median).toFixed(2)}`, tip: "The middle value — 50% of boxes are worth more, 50% less. More representative than mean when distribution is skewed." },
                { label: "Std Dev", value: `€${apply(result.stddev).toFixed(2)}`, tip: "Standard deviation — measures how spread out box values are. Higher means more variance between boxes." },
                { label: "Min", value: `€${apply(result.min).toFixed(2)}`, tip: "Worst box in the simulation — the floor of what you might get." },
                { label: "Max", value: `€${apply(result.max).toFixed(2)}`, tip: "Best box in the simulation — the ceiling with perfect luck." },
                { label: "Time", value: `${result.duration_ms}ms`, tip: `Time to simulate ${result.iterations.toLocaleString()} box openings.` },
              ].map((s) => (
                <div
                  key={s.label}
                  className="p-2 rounded-lg relative group cursor-help"
                  style={{ background: "rgba(255,255,255,0.03)" }}
                >
                  <p className="text-[10px] uppercase" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                    {s.label}
                  </p>
                  <p className="text-sm font-bold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                    {s.value}
                  </p>
                  <div
                    className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-lg text-xs hidden group-hover:block z-50 w-56 text-center"
                    style={{
                      background: "rgba(15, 20, 25, 0.95)",
                      border: "1px solid rgba(255,255,255,0.15)",
                      color: "var(--text-secondary)",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                    }}
                  >
                    {s.tip}
                  </div>
                </div>
              ))}
            </div>

            {/* Confidence intervals */}
            <div className="flex flex-wrap gap-4 text-xs" style={{ fontFamily: "var(--font-mono)" }}>
              <span style={{ color: "var(--text-muted)" }}>
                68% CI: <span style={{ color: "var(--text-primary)" }}>€{apply(result.percentiles.p16).toFixed(2)} – €{apply(result.percentiles.p84).toFixed(2)}</span>
              </span>
              <span style={{ color: "var(--text-muted)" }}>
                90% CI: <span style={{ color: "var(--text-primary)" }}>€{apply(result.percentiles.p5).toFixed(2)} – €{apply(result.percentiles.p95).toFixed(2)}</span>
              </span>
              <span style={{ color: "var(--text-muted)" }}>
                95% CI: <span style={{ color: "var(--text-primary)" }}>€{apply(result.percentiles.p2_5).toFixed(2)} – €{apply(result.percentiles.p97_5).toFixed(2)}</span>
              </span>
            </div>

            {/* Histogram with CI overlays */}
            {(() => {
              const bins = result.histogram.map((b) => b.bin_min);
              const snap = (v: number) => bins.reduce((best, b) => Math.abs(b - v) < Math.abs(best - v) ? b : best, bins[0]);

              return (
                <div style={{ width: "100%", height: 220 }}>
                  <ResponsiveContainer>
                    <BarChart data={result.histogram} margin={{ top: 10, right: 5, bottom: 5, left: 5 }}>
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
                        cursor={{ fill: "rgba(255,255,255,0.04)" }}
                      />
                      {/* 95% CI band */}
                      <ReferenceLine x={snap(result.percentiles.p2_5)} stroke="rgba(234,179,8,0.4)" strokeDasharray="3 3" />
                      <ReferenceLine x={snap(result.percentiles.p97_5)} stroke="rgba(234,179,8,0.4)" strokeDasharray="3 3" />
                      {/* 68% CI band */}
                      <ReferenceLine x={snap(result.percentiles.p16)} stroke="rgba(99,102,241,0.6)" strokeDasharray="4 4" />
                      <ReferenceLine x={snap(result.percentiles.p84)} stroke="rgba(99,102,241,0.6)" strokeDasharray="4 4" />
                      {/* Mean */}
                      <ReferenceLine x={snap(result.mean)} stroke="rgba(255,255,255,0.7)" strokeDasharray="6 3" />
                      {/* Median */}
                      <ReferenceLine x={snap(result.median)} stroke="rgba(34,197,94,0.7)" strokeDasharray="6 3" />
                      {result.roi && (
                        <ReferenceLine x={snap(result.roi.box_cost)} stroke="#ef4444" strokeDasharray="4 4" />
                      )}
                      <Bar dataKey="count" fill="var(--accent)" fillOpacity={0.7} radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              );
            })()}

            {/* CI legend */}
            <div className="flex flex-wrap gap-4 text-[10px]" style={{ color: "var(--text-muted)" }}>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: "rgba(99,102,241,0.5)" }} />
                Likely range (68%): €{apply(result.percentiles.p16).toFixed(0)}–€{apply(result.percentiles.p84).toFixed(0)}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: "rgba(234,179,8,0.3)" }} />
                Almost certain (95%): €{apply(result.percentiles.p2_5).toFixed(0)}–€{apply(result.percentiles.p97_5).toFixed(0)}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: "rgba(255,255,255,0.6)" }} />
                Mean
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: "rgba(34,197,94,0.6)" }} />
                Median
              </span>
              {result.roi && (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: "#ef4444" }} />
                  Cost
                </span>
              )}
            </div>

            {/* ROI — recomputed against the discounted mean so undercut
                flows through to profit/loss numbers. Box cost is unchanged. */}
            {result.roi && (() => {
              const profitPerBox = apply(result.mean) - result.roi.box_cost;
              const totalProfit = profitPerBox * result.roi.quantity;
              const roiPercent = result.roi.box_cost > 0 ? (profitPerBox / result.roi.box_cost) * 100 : 0;
              return (
              <div
                className="p-3 rounded-lg flex flex-wrap gap-4"
                style={{
                  background: profitPerBox >= 0
                    ? "rgba(34, 197, 94, 0.08)"
                    : "rgba(239, 68, 68, 0.08)",
                  border: `1px solid ${profitPerBox >= 0 ? "rgba(34, 197, 94, 0.2)" : "rgba(239, 68, 68, 0.2)"}`,
                }}
              >
                <div className="flex items-center gap-2">
                  <TrendingUp size={16} style={{ color: profitPerBox >= 0 ? "var(--success)" : "var(--error)" }} />
                  <div>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>ROI</p>
                    <p className="text-sm font-bold" style={{
                      color: roiPercent >= 0 ? "var(--success)" : "var(--error)",
                      fontFamily: "var(--font-mono)",
                    }}>
                      {roiPercent >= 0 ? "+" : ""}{roiPercent.toFixed(1)}%
                    </p>
                  </div>
                </div>
                <div>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>Profit / Box</p>
                  <p className="text-sm font-bold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                    {profitPerBox >= 0 ? "+" : ""}&euro;{profitPerBox.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>Total ({result.roi.quantity} boxes)</p>
                  <p className="text-sm font-bold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                    {totalProfit >= 0 ? "+" : ""}&euro;{totalProfit.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>Profit Chance</p>
                  <p className="text-sm font-bold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                    {result.roi.profit_probability.toFixed(1)}%
                  </p>
                </div>
              </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
