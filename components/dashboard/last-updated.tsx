"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Loader2 } from "lucide-react";

interface LastUpdatedProps {
  /** Wall-clock time of the most recent successful fetch. Pass `null`
   *  while still loading the initial response. */
  at: Date | null;
  /** Manual refresh handler — typically calls `mutate()` from SWR. */
  onRefresh?: () => void | Promise<void>;
  /** When true, animate the icon to indicate an in-flight refresh. */
  refreshing?: boolean;
}

function formatAgo(at: Date): string {
  const ms = Date.now() - at.getTime();
  if (ms < 5_000) return "just now";
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

/** Tiny "updated 2m ago" stamp with an optional refresh button. Lives next
 *  to a page H1 to give the user a freshness signal for SWR-driven data.
 *  Re-renders every 30s so the relative-time stays current without spamming
 *  React for shorter intervals. */
export function LastUpdated({ at, onRefresh, refreshing }: LastUpdatedProps) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!at) {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-[11px]"
        style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
      >
        <Loader2 size={11} className="animate-spin" />
        loading…
      </span>
    );
  }

  const label = formatAgo(at);
  const button = (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] transition-colors"
      style={{
        color: "var(--text-muted)",
        fontFamily: "var(--font-mono)",
        cursor: onRefresh ? "pointer" : "default",
      }}
      title={`Updated ${at.toLocaleString()}`}
      onClick={onRefresh ? () => onRefresh() : undefined}
      onMouseEnter={(e) => {
        if (onRefresh) e.currentTarget.style.color = "var(--text-secondary)";
      }}
      onMouseLeave={(e) => {
        if (onRefresh) e.currentTarget.style.color = "var(--text-muted)";
      }}
    >
      {refreshing ? (
        <Loader2 size={11} className="animate-spin" />
      ) : (
        <RefreshCw size={11} />
      )}
      updated {label}
    </span>
  );

  return button;
}
