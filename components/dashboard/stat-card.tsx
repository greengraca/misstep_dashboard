"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

export type StatCardTitleTone = "muted" | "primary" | "accent";
export type StatCardTone = "accent" | "success" | "danger" | "warning" | "muted";

interface StatCardProps {
  title: string;
  value: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  active?: boolean;
  tooltip?: string;
  trend?: {
    value: number;
    label: string;
  };
  /** Color of the small uppercase mono label at the top of the card.
   *  Default 'muted' (current page-level look). Use 'accent' when the card
   *  is nested inside a Panel — the brighter header pops against the
   *  doubled-glass surface so each card reads as its own thing. */
  titleTone?: StatCardTitleTone;
  /** Semantic tone for the value text + icon bubble. Default 'accent' (cyan).
   *  Use 'success' for positive flows (income, profit), 'danger' for
   *  outflows (expenses, losses), 'warning' for status-attention metrics
   *  (stale sync, items needing action), 'muted' for neutral / status. */
  tone?: StatCardTone;
  /** Optional period-over-period delta — `↑ 12% vs March` style. Renders
   *  in success/danger color based on sign. */
  delta?: { value: number; label: string };
  /** When set, the entire card becomes a link with a chevron-right hint
   *  on hover. Use for stat tiles that should drill into a filtered view. */
  href?: string;
}

const TITLE_COLOR: Record<StatCardTitleTone, string> = {
  muted: "var(--text-muted)",
  primary: "var(--text-tertiary)",
  accent: "var(--accent)",
};

const TONE_PALETTE: Record<StatCardTone, { value: string; iconBg: string }> = {
  accent:  { value: "var(--text-primary)", iconBg: "var(--accent-light)" },
  success: { value: "var(--success)",      iconBg: "rgba(52,211,153,0.14)" },
  danger:  { value: "var(--error)",        iconBg: "rgba(252,165,165,0.14)" },
  warning: { value: "var(--warning)",      iconBg: "rgba(251,191,36,0.14)" },
  muted:   { value: "var(--text-tertiary)", iconBg: "rgba(255,255,255,0.06)" },
};

export default function StatCard({
  title,
  value,
  subtitle,
  icon,
  active,
  tooltip,
  trend,
  titleTone = "muted",
  tone = "accent",
  delta,
  href,
}: StatCardProps) {
  const titleColor = TITLE_COLOR[titleTone];
  const palette = TONE_PALETTE[tone];

  const cardBody = (
    <div
      className={`group/stat h-full p-3 sm:p-5 rounded-xl transition-all duration-200 ${href ? "hover:-translate-y-0.5 cursor-pointer" : "hover:-translate-y-0.5"}`}
      style={{
        background: "var(--surface-gradient)",
        backdropFilter: "var(--surface-blur)",
        border: active
          ? "1px solid var(--accent)"
          : "1px solid rgba(255, 255, 255, 0.10)",
        boxShadow: active
          ? "0 0 0 1px var(--accent), var(--surface-shadow)"
          : "var(--surface-shadow)",
      }}
    >
      <div className="flex items-start justify-between mb-1.5 sm:mb-3">
        <div className="flex items-baseline gap-1.5">
          <p
            className="text-[10px] sm:text-xs font-medium uppercase tracking-wider"
            style={{
              color: titleColor,
              fontFamily: "var(--font-mono)",
            }}
          >
            {title}
          </p>
          {tooltip && (
            <span className="relative group/tip">
              <span
                className="cursor-help text-[9px] sm:text-[10px] leading-none select-none inline-flex items-center justify-center rounded"
                style={{ color: "var(--text-muted)", opacity: 0.6, background: "rgba(0,0,0,0.25)", width: "14px", height: "14px" }}
              >
                ?
              </span>
              <span
                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-lg text-xs hidden group-hover/tip:block z-50 w-52 text-center pointer-events-none"
                style={{
                  background: "rgba(15, 20, 25, 0.95)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  color: "var(--text-secondary)",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                }}
              >
                {tooltip}
              </span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {icon && (
            <div
              className="hidden sm:block p-2 rounded-lg"
              style={{ background: palette.iconBg }}
            >
              {icon}
            </div>
          )}
          {href && (
            <ChevronRight
              size={14}
              className="opacity-0 group-hover/stat:opacity-100 transition-opacity"
              style={{ color: "var(--text-muted)" }}
            />
          )}
        </div>
      </div>
      <p
        className="text-lg sm:text-2xl font-bold"
        style={{
          color: palette.value,
          fontFamily: "var(--font-mono)",
        }}
      >
        {value}
      </p>
      {(subtitle || trend || delta) && (
        <div className="mt-0.5 sm:mt-1 flex items-center gap-2 flex-wrap">
          {trend && (
            <span
              className="text-[10px] sm:text-xs font-medium"
              style={{
                color:
                  trend.value >= 0 ? "var(--success)" : "var(--error)",
              }}
            >
              {trend.value >= 0 ? "+" : ""}
              {trend.value}%
            </span>
          )}
          {delta && (
            <span
              className="text-[10px] sm:text-xs font-medium inline-flex items-center gap-0.5"
              style={{
                color: delta.value >= 0 ? "var(--success)" : "var(--error)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {delta.value >= 0 ? "↑" : "↓"} {Math.abs(delta.value).toFixed(1)}%
              <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)", fontWeight: 400 }}>
                {" "}{delta.label}
              </span>
            </span>
          )}
          {subtitle && (
            <span className="text-[10px] sm:text-xs" style={{ color: "var(--text-muted)" }}>
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} style={{ textDecoration: "none", display: "block", height: "100%" }}>
        {cardBody}
      </Link>
    );
  }

  return cardBody;
}
