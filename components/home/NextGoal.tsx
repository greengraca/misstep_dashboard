"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { Target } from "lucide-react";

interface GoalData {
  name: string;
  description: string;
  target: number;
  current: number;
  breakdown: {
    cmBalance: number;
    treasury: number;
  };
}

export default function NextGoal() {
  const { data, isLoading } = useSWR<{ data: GoalData }>("/api/home/goal", fetcher);
  const goal = data?.data;

  if (isLoading) {
    return (
      <div
        className="rounded-xl"
        style={{
          background: "var(--surface-gradient)",
          backdropFilter: "var(--surface-blur)",
          border: "var(--surface-border)",
          boxShadow: "var(--surface-shadow)",
          padding: "24px",
          minHeight: "120px",
        }}
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-lg" style={{ background: "var(--accent-light)" }}>
            <Target size={16} style={{ color: "var(--accent)" }} />
          </div>
          <span
            className="text-xs font-medium uppercase tracking-wider"
            style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
          >
            Next Goal
          </span>
        </div>
        <div className="h-3 rounded-full" style={{ background: "rgba(255,255,255,0.05)" }} />
      </div>
    );
  }

  if (!goal) return null;

  const pct = Math.min((goal.current / goal.target) * 100, 100);

  return (
    <div
      className="rounded-xl"
      style={{
        background: "var(--surface-gradient)",
        backdropFilter: "var(--surface-blur)",
        border: "var(--surface-border)",
        boxShadow: "var(--surface-shadow)",
        padding: "24px",
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 rounded-lg" style={{ background: "var(--accent-light)" }}>
          <Target size={16} style={{ color: "var(--accent)" }} />
        </div>
        <span
          className="text-xs font-medium uppercase tracking-wider"
          style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
        >
          Next Goal
        </span>
      </div>

      {/* Title row */}
      <div className="flex items-baseline justify-between mb-1">
        <h2 style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
          {goal.name}
        </h2>
        <span
          className="text-xl font-bold"
          style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}
        >
          €{goal.current.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
        </span>
      </div>

      {/* Description + target */}
      <div className="flex items-baseline justify-between mb-4">
        <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: 0 }}>
          {goal.description}
        </p>
        <span
          className="text-sm"
          style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
        >
          / €{goal.target.toLocaleString("pt-PT")}
        </span>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-3 mb-3">
        <div
          className="flex-1 h-3 rounded-full overflow-hidden"
          style={{ background: "rgba(255,255,255,0.05)" }}
        >
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${pct}%`,
              background: `linear-gradient(90deg, var(--accent-dim), var(--accent))`,
              boxShadow: pct > 0 ? "0 0 8px rgba(63, 206, 229, 0.3)" : "none",
            }}
          />
        </div>
        <span
          className="text-xs font-medium flex-shrink-0"
          style={{ color: "var(--accent)", fontFamily: "var(--font-mono)", minWidth: "42px", textAlign: "right" }}
        >
          {pct.toFixed(1)}%
        </span>
      </div>

      {/* Breakdown */}
      <div className="flex items-center gap-4">
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          CM Balance:{" "}
          <span style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
            €{goal.breakdown.cmBalance.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
          </span>
        </span>
        <span className="text-xs" style={{ color: "rgba(255,255,255,0.15)" }}>·</span>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          Treasury:{" "}
          <span style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
            €{goal.breakdown.treasury.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
          </span>
        </span>
      </div>
    </div>
  );
}
