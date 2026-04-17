"use client";

import { useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import StatCard from "@/components/dashboard/stat-card";
import type { EvJumpstartResult, EvJumpstartThemeResult, EvSimulationResult } from "@/lib/types";
import { DollarSign, TrendingUp, Package, ChevronDown, ChevronRight, Layers, FlaskConical, Dices, PackageOpen } from "lucide-react";
import EvJumpstartOpenSession from "./EvJumpstartOpenSession";

const COLOR_STYLES: Record<string, { bg: string; color: string }> = {
  white: { bg: "rgba(255, 255, 224, 0.10)", color: "#fde68a" },
  blue: { bg: "rgba(96, 165, 250, 0.10)", color: "#60a5fa" },
  black: { bg: "rgba(168, 162, 158, 0.10)", color: "#a8a29e" },
  red: { bg: "rgba(248, 113, 113, 0.10)", color: "#f87171" },
  green: { bg: "rgba(74, 222, 128, 0.10)", color: "#4ade80" },
  multi: { bg: "rgba(234, 179, 8, 0.10)", color: "#eab308" },
};

interface EvJumpstartThemesProps {
  setCode: string;
  siftFloor: number;
}

export default function EvJumpstartThemes({ setCode, siftFloor }: EvJumpstartThemesProps) {
  const [expandedTheme, setExpandedTheme] = useState<string | null>(null);
  const [colorFilter, setColorFilter] = useState<string | null>(null);
  const [showPullData, setShowPullData] = useState(false);
  const [boxCost, setBoxCost] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("1");
  const [iterations, setIterations] = useState(10000);
  const [simRunning, setSimRunning] = useState(false);
  const [simResult, setSimResult] = useState<EvSimulationResult | null>(null);
  const [sessionOpen, setSessionOpen] = useState(false);

  const { data, isLoading, mutate } = useSWR<{ data: EvJumpstartResult }>(
    `/api/ev/jumpstart/${setCode}?floor=${siftFloor}`,
    fetcher
  );

  const result = data?.data;

  if (isLoading) {
    return (
      <div>
        <div className="skeleton" style={{ height: "100px" }} />
        <div className="skeleton mt-4" style={{ height: "400px" }} />
      </div>
    );
  }

  if (!result) {
    return (
      <div className="text-center py-8 text-sm" style={{ color: "var(--text-muted)" }}>
        No Jumpstart theme data available for this set.
      </div>
    );
  }

  const filteredThemes = colorFilter
    ? result.themes.filter((t) => t.color === colorFilter)
    : result.themes;

  const themeKey = (t: EvJumpstartThemeResult) => `${t.name}-v${t.variant}`;

  return (
    <div className="flex flex-col gap-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="Box EV (Gross)"
          value={`€${result.box_ev_gross.toFixed(2)}`}
          icon={<DollarSign size={18} style={{ color: "var(--accent)" }} />}
        />
        <StatCard
          title="Box EV (Net)"
          value={`€${result.box_ev_net.toFixed(2)}`}
          subtitle={`After ${(result.fee_rate * 100).toFixed(0)}% fee`}
          icon={<TrendingUp size={18} style={{ color: "var(--accent)" }} />}
        />
        <StatCard
          title="Avg Theme EV"
          value={`€${result.avg_theme_ev_net.toFixed(2)}`}
          subtitle={`${result.theme_count} themes`}
          icon={<Package size={18} style={{ color: "var(--accent)" }} />}
        />
        <StatCard
          title="Packs / Box"
          value={`${result.packs_per_box}`}
          subtitle="Jumpstart Booster"
          icon={<Layers size={18} style={{ color: "var(--accent)" }} />}
        />
      </div>

      {/* Pull rate data */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          border: "1px solid var(--border)",
          background: "rgba(255, 255, 255, 0.015)",
        }}
      >
        <button
          onClick={() => setShowPullData(!showPullData)}
          className="flex items-center gap-2 w-full px-4 py-3 hover:bg-[var(--bg-hover)] transition-colors"
        >
          <FlaskConical size={14} style={{ color: "var(--accent)" }} />
          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            Tier Pull Rates
          </span>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            Derived from 120-pack sample
          </span>
          <span className="ml-auto">
            {showPullData
              ? <ChevronDown size={14} style={{ color: "var(--text-muted)" }} />
              : <ChevronRight size={14} style={{ color: "var(--text-muted)" }} />
            }
          </span>
        </button>

        {showPullData && (
          <div className="px-4 pb-4 flex flex-col gap-4">
            {/* Weights used */}
            <div>
              <p className="text-xs font-medium mb-2" style={{ color: "var(--text-muted)" }}>
                EV weights used in calculation
              </p>
              <div className="flex gap-3">
                {[
                  { tier: "Common", weight: "65%", variants: 80, perVariant: "0.813%", color: "var(--text-muted)" },
                  { tier: "Rare", weight: "30%", variants: 30, perVariant: "1.000%", color: "#eab308" },
                  { tier: "Mythic", weight: "5%", variants: 11, perVariant: "0.455%", color: "#ef4444" },
                ].map((t) => (
                  <div
                    key={t.tier}
                    className="flex-1 p-3 rounded-lg"
                    style={{ background: "rgba(255,255,255,0.03)" }}
                  >
                    <p className="text-xs font-semibold" style={{ color: t.color }}>{t.tier}</p>
                    <p className="text-lg font-bold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                      {t.weight}
                    </p>
                    <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                      {t.variants} variants &middot; {t.perVariant} each
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Sample data table */}
            <div>
              <p className="text-xs font-medium mb-2" style={{ color: "var(--text-muted)" }}>
                Observed data (5 boxes, 120 packs)
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs" style={{ fontFamily: "var(--font-mono)" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <th className="text-left py-1.5 px-2" style={{ color: "var(--text-muted)" }}>Tier</th>
                      <th className="text-right py-1.5 px-2" style={{ color: "var(--text-muted)" }}>B1</th>
                      <th className="text-right py-1.5 px-2" style={{ color: "var(--text-muted)" }}>B2</th>
                      <th className="text-right py-1.5 px-2" style={{ color: "var(--text-muted)" }}>B3</th>
                      <th className="text-right py-1.5 px-2" style={{ color: "var(--text-muted)" }}>B4</th>
                      <th className="text-right py-1.5 px-2" style={{ color: "var(--text-muted)" }}>B5</th>
                      <th className="text-right py-1.5 px-2" style={{ color: "var(--text-muted)" }}>Total</th>
                      <th className="text-right py-1.5 px-2" style={{ color: "var(--text-muted)" }}>Observed</th>
                      <th className="text-right py-1.5 px-2" style={{ color: "var(--text-muted)" }}>Model</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { tier: "Common", data: [14, 16, 15, 20, 14], total: 79, pct: "65.8%", model: "65%", color: "var(--text-secondary)" },
                      { tier: "Rare", data: [9, 6, 8, 4, 9], total: 36, pct: "30.0%", model: "30%", color: "#eab308" },
                      { tier: "Mythic", data: [1, 2, 1, 0, 1], total: 5, pct: "4.2%", model: "5%", color: "#ef4444" },
                    ].map((row) => (
                      <tr key={row.tier} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                        <td className="py-1.5 px-2 font-medium" style={{ color: row.color }}>{row.tier}</td>
                        {row.data.map((v, i) => (
                          <td key={i} className="text-right py-1.5 px-2" style={{ color: "var(--text-secondary)" }}>{v}</td>
                        ))}
                        <td className="text-right py-1.5 px-2 font-medium" style={{ color: "var(--text-primary)" }}>{row.total}</td>
                        <td className="text-right py-1.5 px-2" style={{ color: "var(--text-primary)" }}>{row.pct}</td>
                        <td className="text-right py-1.5 px-2 font-medium" style={{ color: "var(--accent)" }}>{row.model}</td>
                      </tr>
                    ))}
                    <tr>
                      <td className="py-1.5 px-2 font-medium" style={{ color: "var(--text-muted)" }}>Total</td>
                      {[24, 24, 24, 24, 24].map((v, i) => (
                        <td key={i} className="text-right py-1.5 px-2" style={{ color: "var(--text-muted)" }}>{v}</td>
                      ))}
                      <td className="text-right py-1.5 px-2 font-medium" style={{ color: "var(--text-muted)" }}>120</td>
                      <td className="text-right py-1.5 px-2" style={{ color: "var(--text-muted)" }}>100%</td>
                      <td className="text-right py-1.5 px-2" style={{ color: "var(--text-muted)" }}>100%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Visual bars */}
            <div className="flex flex-col gap-1.5">
              {[
                { tier: "Common", observed: 65.8, model: 65, color: "rgba(255,255,255,0.3)" },
                { tier: "Rare", observed: 30.0, model: 30, color: "#eab308" },
                { tier: "Mythic", observed: 4.2, model: 5, color: "#ef4444" },
              ].map((row) => (
                <div key={row.tier} className="flex items-center gap-2">
                  <span className="text-[10px] w-14 text-right" style={{ color: "var(--text-muted)" }}>{row.tier}</span>
                  <div className="flex-1 h-4 rounded-full overflow-hidden relative" style={{ background: "rgba(255,255,255,0.05)" }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${row.observed}%`, background: row.color, opacity: 0.6 }}
                    />
                    <div
                      className="absolute top-0 h-full border-r-2"
                      style={{ left: `${row.model}%`, borderColor: row.color }}
                    />
                  </div>
                  <span className="text-[10px] w-12" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                    {row.observed}%
                  </span>
                </div>
              ))}
              <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
                Bar = observed &middot; Line = model weight &middot; Source: 5 box openings (YouTube + manual tracking)
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Open Session + weights indicator */}
      <div
        className="flex flex-wrap items-center gap-3 px-3 py-2 rounded-lg"
        style={{
          background: "rgba(234,179,8,0.06)",
          border: "1px solid rgba(234,179,8,0.2)",
        }}
      >
        <PackageOpen size={16} style={{ color: "#eab308" }} />
        <div className="flex-1 min-w-0 text-xs" style={{ color: "var(--text-secondary)" }}>
          {result.weights_source === "empirical" ? (
            <>
              Using <span style={{ color: "#eab308", fontWeight: 600 }}>empirical weights</span>
              {" "}from {result.weights_sample_size ?? 0} observed packs.
            </>
          ) : (
            <>Opening boxes? Tally the themes you pull to improve tier and theme pull rates.</>
          )}
        </div>
        <button
          onClick={() => setSessionOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{ background: "#eab308", color: "#000" }}
        >
          <PackageOpen size={12} /> Start Opening Session
        </button>
      </div>

      {/* Color filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>Filter:</span>
        <button
          onClick={() => setColorFilter(null)}
          className="text-xs px-2 py-1 rounded-full transition-colors"
          style={{
            background: !colorFilter ? "var(--accent)" : "rgba(255,255,255,0.05)",
            color: !colorFilter ? "#fff" : "var(--text-secondary)",
          }}
        >
          All
        </button>
        {["white", "blue", "black", "red", "green", "multi"].map((c) => {
          const s = COLOR_STYLES[c];
          return (
            <button
              key={c}
              onClick={() => setColorFilter(colorFilter === c ? null : c)}
              className="text-xs px-2 py-1 rounded-full capitalize transition-colors"
              style={{
                background: colorFilter === c ? s.color : s.bg,
                color: colorFilter === c ? "#000" : s.color,
              }}
            >
              {c}
            </button>
          );
        })}
      </div>

      {/* Theme list */}
      <div>
        <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
          EV per Theme ({filteredThemes.length})
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
          {filteredThemes.map((theme) => {
            const key = themeKey(theme);
            const expanded = expandedTheme === key;
            const cs = COLOR_STYLES[theme.color] ?? COLOR_STYLES.multi;

            return (
              <div
                key={key}
                className="rounded-lg overflow-hidden"
                style={{
                  border: "1px solid var(--border-subtle)",
                  background: "rgba(255, 255, 255, 0.015)",
                  gridColumn: expanded ? "1 / -1" : undefined,
                }}
              >
                {/* Theme header */}
                <div
                  className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-[var(--bg-hover)] transition-colors"
                  onClick={() => setExpandedTheme(expanded ? null : key)}
                >
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0"
                    style={{ background: cs.color }}
                  />
                  <span className="text-xs flex-1 truncate" style={{ color: "var(--text-primary)" }}>
                    {theme.name}
                    {theme.tier !== "mythic" && (
                      <span className="ml-1" style={{ color: "var(--text-muted)" }}>v{theme.variant}</span>
                    )}
                  </span>
                  <span
                    className="text-xs font-bold text-right"
                    style={{
                      fontFamily: "var(--font-mono)",
                      color:
                        theme.tier === "mythic" ? "#ef4444"
                        : theme.tier === "rare" ? "#eab308"
                        : "var(--accent)",
                    }}
                  >
                    &euro;{theme.ev_net.toFixed(2)}
                  </span>
                </div>

                {/* Expanded card list */}
                {expanded && (
                  <div className="px-4 pb-3 pt-1">
                    <div className="flex flex-col gap-1">
                      {theme.cards.map((card, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 py-0.5"
                        >
                          {card.image_uri && (
                            <img
                              src={card.image_uri}
                              alt={card.name}
                              className="w-6 h-8 rounded-sm object-cover"
                              loading="lazy"
                            />
                          )}
                          <span className="text-xs flex-1" style={{ color: "var(--text-secondary)" }}>
                            {card.name}
                          </span>
                          <span
                            className="text-[10px] px-1 rounded capitalize"
                            style={{
                              background:
                                card.rarity === "mythic" ? "rgba(239, 68, 68, 0.15)"
                                : card.rarity === "rare" ? "rgba(234, 179, 8, 0.15)"
                                : "rgba(255, 255, 255, 0.05)",
                              color:
                                card.rarity === "mythic" ? "#ef4444"
                                : card.rarity === "rare" ? "#eab308"
                                : "var(--text-muted)",
                            }}
                          >
                            {card.rarity}
                          </span>
                          <span
                            className="text-xs w-[55px] text-right"
                            style={{
                              color: card.price > 0 ? "var(--text-primary)" : "var(--text-muted)",
                              fontFamily: "var(--font-mono)",
                            }}
                          >
                            &euro;{card.price.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div
                      className="flex justify-between mt-2 pt-2 text-xs"
                      style={{ borderTop: "1px solid var(--border-subtle)" }}
                    >
                      <span style={{ color: "var(--text-muted)" }}>
                        Gross: &euro;{theme.ev_gross.toFixed(2)}
                      </span>
                      <span style={{ color: "var(--accent)", fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                        Net: &euro;{theme.ev_net.toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Monte Carlo Simulation */}
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
                placeholder="e.g. 85"
                className="rounded-lg border px-3 py-1.5 text-sm w-28 outline-none"
                style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text-primary)" }}
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
                style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text-primary)" }}
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
                style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text-primary)" }}
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={async () => {
                  setSimRunning(true);
                  try {
                    const res = await fetch(`/api/ev/jumpstart/${setCode}`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        iterations,
                        floor: siftFloor,
                        boxCost: boxCost ? parseFloat(boxCost) : undefined,
                        quantity: quantity ? parseInt(quantity, 10) : 1,
                      }),
                    });
                    const json = await res.json();
                    if (json.data) setSimResult(json.data);
                  } finally {
                    setSimRunning(false);
                  }
                }}
                disabled={simRunning}
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
                style={{
                  background: "var(--accent)",
                  color: "#fff",
                  opacity: simRunning ? 0.6 : 1,
                }}
              >
                <Dices size={14} className={simRunning ? "animate-spin" : ""} />
                {simRunning ? "Simulating..." : "Run Simulation"}
              </button>
            </div>
          </div>

          {/* Results */}
          {simResult && (
            <div className="flex flex-col gap-4">
              {/* Stats grid with tooltips */}
              <div
                className="grid gap-3"
                style={{ gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}
              >
                {[
                  { label: "Mean", value: `€${simResult.mean.toFixed(2)}`, tip: "Average box value across all simulations. The expected value you'd get if you opened many boxes." },
                  { label: "Median", value: `€${simResult.median.toFixed(2)}`, tip: "The middle value — 50% of boxes are worth more, 50% less. More representative than mean when distribution is skewed." },
                  { label: "Std Dev", value: `€${simResult.stddev.toFixed(2)}`, tip: "Standard deviation — measures how spread out box values are. Higher means more variance between boxes." },
                  { label: "Min", value: `€${simResult.min.toFixed(2)}`, tip: "Worst box in the simulation — the floor of what you might get." },
                  { label: "Max", value: `€${simResult.max.toFixed(2)}`, tip: "Best box in the simulation — the ceiling with perfect luck." },
                  { label: "Time", value: `${simResult.duration_ms}ms`, tip: `Time to simulate ${simResult.iterations.toLocaleString()} box openings.` },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="p-2 rounded-lg relative group cursor-help"
                    style={{ background: "rgba(255,255,255,0.03)" }}
                  >
                    <p className="text-[10px] uppercase" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{s.label}</p>
                    <p className="text-sm font-bold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>{s.value}</p>
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

              {/* Histogram with CI overlays */}
              {(() => {
                // Snap a value to the nearest bin_min for ReferenceLine on categorical axis
                const bins = simResult.histogram.map((b) => b.bin_min);
                const snap = (v: number) => bins.reduce((best, b) => Math.abs(b - v) < Math.abs(best - v) ? b : best, bins[0]);

                return (
                  <div style={{ width: "100%", height: 220 }}>
                    <ResponsiveContainer>
                      <BarChart data={simResult.histogram} margin={{ top: 10, right: 5, bottom: 5, left: 5 }}>
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
                            const binW = (simResult.histogram[1]?.bin_min ?? 0) - (simResult.histogram[0]?.bin_min ?? 0);
                            return `€${n.toFixed(2)} – €${(n + binW).toFixed(2)}`;
                          }}
                          cursor={{ fill: "rgba(255,255,255,0.04)" }}
                        />
                        {/* 95% CI band */}
                        <ReferenceLine x={snap(simResult.percentiles.p2_5)} stroke="rgba(234,179,8,0.4)" strokeDasharray="3 3" />
                        <ReferenceLine x={snap(simResult.percentiles.p97_5)} stroke="rgba(234,179,8,0.4)" strokeDasharray="3 3" />
                        {/* 68% CI band */}
                        <ReferenceLine x={snap(simResult.percentiles.p16)} stroke="rgba(99,102,241,0.6)" strokeDasharray="4 4" />
                        <ReferenceLine x={snap(simResult.percentiles.p84)} stroke="rgba(99,102,241,0.6)" strokeDasharray="4 4" />
                        {/* Mean */}
                        <ReferenceLine x={snap(simResult.mean)} stroke="rgba(255,255,255,0.7)" strokeDasharray="6 3" />
                        {/* Median */}
                        <ReferenceLine x={snap(simResult.median)} stroke="rgba(34,197,94,0.7)" strokeDasharray="6 3" />
                        {simResult.roi && (
                          <ReferenceLine x={snap(simResult.roi.box_cost)} stroke="#ef4444" strokeDasharray="4 4" />
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
                  Likely range (68%): €{simResult.percentiles.p16.toFixed(0)}–€{simResult.percentiles.p84.toFixed(0)}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: "rgba(234,179,8,0.3)" }} />
                  Almost certain (95%): €{simResult.percentiles.p2_5.toFixed(0)}–€{simResult.percentiles.p97_5.toFixed(0)}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: "rgba(255,255,255,0.6)" }} />
                  Mean
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: "rgba(34,197,94,0.6)" }} />
                  Median
                </span>
                {simResult.roi && (
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: "#ef4444" }} />
                    Cost
                  </span>
                )}
              </div>

              {/* ROI */}
              {simResult.roi && (
                <div
                  className="p-3 rounded-lg flex flex-wrap gap-4"
                  style={{
                    background: simResult.roi.profit_per_box >= 0
                      ? "rgba(34, 197, 94, 0.08)"
                      : "rgba(239, 68, 68, 0.08)",
                    border: `1px solid ${simResult.roi.profit_per_box >= 0 ? "rgba(34, 197, 94, 0.2)" : "rgba(239, 68, 68, 0.2)"}`,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <TrendingUp size={16} style={{ color: simResult.roi.profit_per_box >= 0 ? "var(--success)" : "var(--error)" }} />
                    <div>
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>ROI</p>
                      <p className="text-sm font-bold" style={{
                        color: simResult.roi.roi_percent >= 0 ? "var(--success)" : "var(--error)",
                        fontFamily: "var(--font-mono)",
                      }}>
                        {simResult.roi.roi_percent >= 0 ? "+" : ""}{simResult.roi.roi_percent.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>Profit / Box</p>
                    <p className="text-sm font-bold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                      {simResult.roi.profit_per_box >= 0 ? "+" : ""}&euro;{simResult.roi.profit_per_box.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>Total ({simResult.roi.quantity} boxes)</p>
                    <p className="text-sm font-bold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                      {simResult.roi.total_profit >= 0 ? "+" : ""}&euro;{simResult.roi.total_profit.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>Profit Chance</p>
                    <p className="text-sm font-bold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                      {simResult.roi.profit_probability.toFixed(1)}%
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {sessionOpen && (
        <EvJumpstartOpenSession
          setCode={setCode}
          themes={result.themes}
          onClose={() => setSessionOpen(false)}
          onSaved={() => { mutate(); setSimResult(null); }}
        />
      )}
    </div>
  );
}
