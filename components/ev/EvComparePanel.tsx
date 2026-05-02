"use client";

import { X } from "lucide-react";
import type { EvSet } from "@/lib/types";
import { useDiscount } from "@/lib/discount";
import { Panel, H2 } from "@/components/dashboard/page-shell";
import { GitCompare } from "lucide-react";

interface EvComparePanelProps {
  /** Sets pinned for comparison, in pin order. */
  sets: EvSet[];
  /** Remove a set from the compare slot. */
  onRemove: (code: string) => void;
  /** Open a set's detail page (parent already routes this for the grid). */
  onOpen: (code: string) => void;
  /** Clear all pinned sets. */
  onClear: () => void;
}

const formatEur = (n: number | null | undefined) =>
  n != null
    ? `€${n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "—";

/** Side-by-side compare strip for pinned EV sets. Up to 3 sets render
 *  as columns showing the same metrics; deltas vs the leftmost set
 *  appear under each value (skipped on the leftmost column itself). */
export default function EvComparePanel({ sets, onRemove, onOpen, onClear }: EvComparePanelProps) {
  const { apply } = useDiscount();
  if (sets.length === 0) return null;

  const baseline = sets[0];
  const basePlay = apply(baseline.play_ev_net) ?? null;
  const baseColl = apply(baseline.collector_ev_net) ?? null;

  function pctDelta(curr: number | null, base: number | null): string | null {
    if (curr == null || base == null || base === 0) return null;
    const delta = ((curr - base) / Math.abs(base)) * 100;
    const arrow = delta >= 0 ? "↑" : "↓";
    const color = delta >= 0 ? "var(--success)" : "var(--error)";
    return `${arrow} ${Math.abs(delta).toFixed(1)}%|${color}`;
  }

  function renderDelta(curr: number | null, base: number | null) {
    const raw = pctDelta(curr, base);
    if (!raw) return null;
    const [text, color] = raw.split("|");
    return (
      <span
        className="text-[10px] mt-0.5"
        style={{ color, fontFamily: "var(--font-mono)", opacity: 0.75 }}
      >
        {text}
      </span>
    );
  }

  return (
    <Panel>
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <H2 icon={<GitCompare size={16} />}>Comparing {sets.length} set{sets.length === 1 ? "" : "s"}</H2>
        <button
          onClick={onClear}
          className="text-[11px] transition-colors"
          style={{
            background: "transparent",
            border: "1px solid var(--border)",
            color: "var(--text-muted)",
            padding: "4px 10px",
            borderRadius: 6,
            cursor: "pointer",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
        >
          Clear all
        </button>
      </div>
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(${sets.length}, minmax(0, 1fr))` }}
      >
        {sets.map((set, i) => {
          const playEv = apply(set.play_ev_net) ?? null;
          const collectorEv = apply(set.collector_ev_net) ?? null;
          const isBaseline = i === 0;
          return (
            <div
              key={set.code}
              className="flex flex-col gap-2 p-3 rounded-lg"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <button
                  onClick={() => onOpen(set.code)}
                  className="flex items-start gap-2 min-w-0 flex-1 text-left"
                  style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
                >
                  {set.icon_svg_uri && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={set.icon_svg_uri}
                      alt=""
                      style={{ width: 22, height: 22, filter: "invert(0.9)", flexShrink: 0 }}
                    />
                  )}
                  <div className="min-w-0">
                    <div
                      className="text-sm font-semibold truncate"
                      style={{ color: "var(--text-primary)" }}
                      title={set.name}
                    >
                      {set.name}
                    </div>
                    <div
                      className="text-[10px]"
                      style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
                    >
                      {set.code.toUpperCase()}
                      {isBaseline && (
                        <span style={{ color: "var(--accent)", marginLeft: 6 }}>baseline</span>
                      )}
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => onRemove(set.code)}
                  className="p-1 rounded transition-colors"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                  title="Remove from compare"
                  onMouseEnter={(e) => { e.currentTarget.style.color = "var(--error)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
                >
                  <X size={13} />
                </button>
              </div>
              <div className="flex flex-col gap-1.5 mt-1">
                <div>
                  <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                    Play / Box (net)
                  </div>
                  <div className="text-sm font-semibold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                    {formatEur(playEv)}
                  </div>
                  {!isBaseline && renderDelta(playEv, basePlay)}
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                    Collector / Box (net)
                  </div>
                  <div className="text-sm font-semibold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                    {formatEur(collectorEv)}
                  </div>
                  {!isBaseline && renderDelta(collectorEv, baseColl)}
                </div>
                <div className="flex items-center justify-between text-[11px]" style={{ color: "var(--text-muted)" }}>
                  <span>{set.card_count} cards</span>
                  <span>{set.set_type}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
