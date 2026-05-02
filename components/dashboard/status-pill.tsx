"use client";

export type StatusPillTone = "info" | "accent" | "success" | "warning" | "danger" | "muted";

interface StatusPillProps {
  tone?: StatusPillTone;
  children: React.ReactNode;
  className?: string;
}

const TONE_PALETTE: Record<StatusPillTone, { bg: string; color: string }> = {
  info:    { bg: "rgba(96,165,250,0.10)",  color: "var(--info)"    },
  accent:  { bg: "var(--accent-light)",    color: "var(--accent)"  },
  success: { bg: "var(--success-light)",   color: "var(--success)" },
  warning: { bg: "var(--warning-light)",   color: "var(--warning)" },
  danger:  { bg: "var(--error-light)",     color: "var(--error)"   },
  muted:   { bg: "rgba(255,255,255,0.05)", color: "var(--text-muted)" },
};

/** Small `rounded-full` tinted chip. Used for inline status / count badges
 *  next to section headings and for stat tags on cards. */
export function StatusPill({ tone = "muted", children, className = "" }: StatusPillProps) {
  const palette = TONE_PALETTE[tone];
  return (
    <span
      className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded-full font-medium ${className}`}
      style={{
        background: palette.bg,
        color: palette.color,
        fontFamily: "var(--font-mono)",
      }}
    >
      {children}
    </span>
  );
}
