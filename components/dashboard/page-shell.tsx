"use client";

import { AlertTriangle } from "lucide-react";

interface PanelProps {
  children: React.ReactNode;
  /** Optional 3px left border in the given color — used to tint a section without overpowering the surface. */
  accent?: string;
  /** Tighter padding for nested panels (e.g. an expanded order's detail block inside the Orders Panel). */
  inset?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function Panel({ children, accent, inset, className, style }: PanelProps) {
  return (
    <div
      className={`p-4 sm:p-6 ${className ?? ""}`}
      style={{
        background: "var(--surface-gradient)",
        backdropFilter: "var(--surface-blur)",
        border: "var(--surface-border)",
        boxShadow: "var(--surface-shadow)",
        borderRadius: "var(--radius)",
        borderLeft: accent ? `3px solid ${accent}` : undefined,
        padding: inset ? "16px 18px" : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

interface H1Props {
  children: React.ReactNode;
  /** Optional muted line under the title — for "Income, expenses, reimbursements" style scene-setters. */
  subtitle?: React.ReactNode;
}

export function H1({ children, subtitle }: H1Props) {
  return (
    <div>
      <h1
        style={{
          fontSize: 32,
          fontWeight: 700,
          color: "var(--text-primary)",
          margin: 0,
          letterSpacing: "-0.02em",
          lineHeight: 1.1,
        }}
      >
        {children}
      </h1>
      {subtitle && (
        <p
          style={{
            fontSize: 13,
            color: "var(--text-muted)",
            margin: "6px 0 0",
            lineHeight: 1.4,
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}

interface H2Props {
  children: React.ReactNode;
  id?: string;
  /** Rendered in accent color, 16px, to the left of the title. */
  icon?: React.ReactNode;
}

export function H2({ children, id, icon }: H2Props) {
  return (
    <h2
      id={id}
      style={{
        fontSize: 18,
        fontWeight: 600,
        color: "var(--text-primary)",
        margin: "0 0 14px",
        letterSpacing: "-0.01em",
        display: "flex",
        alignItems: "center",
        gap: 10,
        scrollMarginTop: 80,
      }}
    >
      {icon && <span style={{ color: "var(--accent)", display: "inline-flex" }}>{icon}</span>}
      {children}
    </h2>
  );
}

interface H3Props {
  children: React.ReactNode;
}

export function H3({ children }: H3Props) {
  return (
    <h3
      style={{
        fontSize: 12,
        fontWeight: 600,
        color: "var(--text-secondary)",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        margin: "20px 0 10px",
        fontFamily: "var(--font-mono)",
      }}
    >
      {children}
    </h3>
  );
}

interface FieldProps {
  label: string;
  children: React.ReactNode;
  hint?: string;
}

/** Form-field wrapper used by all modal forms. 10px mono uppercase muted label,
 *  child input, optional muted hint underneath. Pair with the `appraiser-field`
 *  CSS class on the input itself for hover/focus states. */
export function Field({ label, children, hint }: FieldProps) {
  return (
    <label className="block">
      <div
        className="text-[10px] uppercase tracking-wider mb-1"
        style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
      >
        {label}
      </div>
      {children}
      {hint && (
        <div className="mt-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
          {hint}
        </div>
      )}
    </label>
  );
}

type NoteTone = "info" | "warn" | "danger" | "success";

interface NoteProps {
  tone?: NoteTone;
  icon?: React.ReactNode;
  title?: string;
  children: React.ReactNode;
}

export function Note({ tone = "info", icon, title, children }: NoteProps) {
  const palette = {
    info: { bg: "var(--accent-light)", border: "var(--accent-border)", color: "var(--accent)" },
    warn: { bg: "var(--warning-light)", border: "rgba(251,191,36,0.3)", color: "var(--warning)" },
    danger: { bg: "var(--error-light)", border: "var(--error-border)", color: "var(--error)" },
    success: { bg: "var(--success-light)", border: "rgba(52,211,153,0.3)", color: "var(--success)" },
  }[tone];
  return (
    <div
      style={{
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        borderRadius: 8,
        padding: "12px 14px",
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
        fontSize: 13,
        lineHeight: 1.6,
        color: "var(--text-secondary)",
        margin: "10px 0",
      }}
    >
      <span style={{ color: palette.color, flexShrink: 0, marginTop: 2 }}>
        {icon ?? <AlertTriangle size={16} />}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && (
          <div style={{ fontWeight: 600, color: palette.color, marginBottom: 4, fontSize: 13 }}>
            {title}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
