"use client";

import { Radar } from "lucide-react";
import type { InvestmentDetail } from "@/lib/investments/types";

export default function BaselineBanner({ detail }: { detail: InvestmentDetail }) {
  if (detail.status !== "baseline_captured" || !detail.baseline_progress) return null;
  const {
    captured_count: cap,
    expected_total_count: tot,
    complete,
  } = detail.baseline_progress;
  const pct = tot && tot > 0 ? Math.min((cap / tot) * 100, 100) : 0;
  const showBar = tot != null && tot > 0;

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{
        background:
          "linear-gradient(135deg, rgba(251, 191, 36, 0.08), rgba(251, 191, 36, 0.02))",
        border: "1px solid rgba(251, 191, 36, 0.30)",
        backdropFilter: "var(--surface-blur)",
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="p-2 rounded-lg shrink-0"
          style={{ background: "rgba(251, 191, 36, 0.12)" }}
        >
          <Radar size={18} style={{ color: "var(--warning)" }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              {complete ? "Baseline ready to close" : "Baseline capture in progress"}
            </h3>
            <span
              className="text-xs tabular-nums"
              style={{ color: "var(--warning)", fontFamily: "var(--font-mono)" }}
            >
              {showBar
                ? `${cap.toLocaleString()} / ${tot!.toLocaleString()} · ${pct.toFixed(0)}%`
                : `${cap.toLocaleString()} captured`}
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
            Open the Misstep browser extension, pick this investment, and visit
            your stock page filtered to the expansion (
            <code style={{ fontFamily: "var(--font-mono)" }}>
              /Stock/Offers/Singles?idExpansion=N
            </code>
            ). The extension captures every listing as you page through price
            brackets. Mark complete when the page-header count matches.
          </p>
        </div>
      </div>
      {showBar && (
        <div
          className="h-1.5 rounded-full overflow-hidden"
          style={{ background: "rgba(251, 191, 36, 0.12)" }}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, background: "var(--warning)" }}
          />
        </div>
      )}
    </div>
  );
}
