import type { CSSProperties } from "react";

export const card: CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  padding: 16,
};

export const sectionHeader: CSSProperties = {
  margin: 0,
  fontSize: 11,
  color: "var(--text-muted)",
  fontWeight: 600,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  fontFamily: "var(--font-mono)",
};

export const input: CSSProperties = {
  padding: "8px 12px",
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  color: "var(--text-primary)",
  fontSize: 14,
  fontFamily: "inherit",
};

export const textarea: CSSProperties = {
  ...input,
  minHeight: 120,
  resize: "vertical",
  width: "100%",
  lineHeight: 1.5,
};

export const btnBase: CSSProperties = {
  padding: "8px 14px",
  borderRadius: "var(--radius)",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
  transition: "background 120ms, border-color 120ms, color 120ms",
  border: "1px solid transparent",
  fontFamily: "inherit",
};

export const btnPrimary: CSSProperties = {
  ...btnBase,
  background: "var(--accent)",
  color: "var(--accent-text)",
  border: "none",
};

export const btnSecondary: CSSProperties = {
  ...btnBase,
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  color: "var(--text-secondary)",
};

export const btnDanger: CSSProperties = {
  ...btnBase,
  background: "transparent",
  border: "1px solid var(--error-border)",
  color: "var(--error)",
};

export const btnGhost: CSSProperties = {
  ...btnBase,
  background: "transparent",
  border: "none",
  color: "var(--text-muted)",
  padding: "4px 6px",
};

export const statusStyle = (type: "success" | "error" | "info"): CSSProperties => {
  const map = {
    success: { color: "var(--success)", background: "var(--success-light)", border: "1px solid rgba(52, 211, 153, 0.2)" },
    error:   { color: "var(--error)",   background: "var(--error-light)",   border: "1px solid var(--error-border)" },
    info:    { color: "var(--text-secondary)", background: "var(--bg-card)", border: "1px solid var(--border)" },
  };
  return {
    ...map[type],
    fontSize: 13,
    padding: "8px 12px",
    borderRadius: "var(--radius)",
  };
};
