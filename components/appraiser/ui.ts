import type { CSSProperties } from "react";

/**
 * Shared class + style tokens for the Appraiser feature.
 * Matches the canonical misstep idioms from CardmarketContent + EvSetDetail:
 *   - Compact header buttons: `px-3 py-1.5 text-xs font-medium rounded-lg`
 *   - CSS-variable backgrounds/borders on inline style, hover via Tailwind
 *     arbitrary-value `hover:` classes (no JS hover handlers)
 *   - Inputs share the same padding/radius/font so controls line up in a row
 */

// Class strings — one shape for header buttons + inline inputs so they align
export const btnBaseClass =
  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed";

export const btnSecondaryClass =
  `${btnBaseClass} hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]`;

export const btnPrimaryClass =
  `${btnBaseClass} hover:opacity-90`;

export const btnDangerClass =
  `${btnBaseClass} hover:bg-[var(--error-light)]`;

export const inputClass =
  "appraiser-field px-3 py-1.5 rounded-lg text-xs";

export const textareaClass =
  "appraiser-field px-3 py-1.5 rounded-lg text-xs leading-relaxed";

// Inline style objects for colour/background tokens (Tailwind arbitrary values
// work but inline-style keeps the token surface visible at each call site).
export const btnSecondary: CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  color: "var(--text-secondary)",
};

export const btnPrimary: CSSProperties = {
  background: "var(--accent)",
  border: "1px solid var(--accent)",
  color: "var(--accent-text)",
};

export const btnDanger: CSSProperties = {
  background: "transparent",
  border: "1px solid var(--error-border)",
  color: "var(--error)",
};

export const inputStyle: CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  color: "var(--text-primary)",
  fontFamily: "inherit",
};

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

export const statusStyle = (type: "success" | "error" | "info"): CSSProperties => {
  const map = {
    success: { color: "var(--success)", background: "var(--success-light)", border: "1px solid rgba(52, 211, 153, 0.2)" },
    error:   { color: "var(--error)",   background: "var(--error-light)",   border: "1px solid var(--error-border)" },
    info:    { color: "var(--text-secondary)", background: "var(--bg-card)", border: "1px solid var(--border)" },
  };
  return {
    ...map[type],
    fontSize: 12,
    padding: "6px 10px",
    borderRadius: 8,
  };
};
