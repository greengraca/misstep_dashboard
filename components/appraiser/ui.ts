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

// Base dimensions shared by input + button so they line up perfectly in a row
const FIELD_PADDING_Y = 9;
const FIELD_FONT_SIZE = 14;
const FIELD_LINE_HEIGHT = 1.4;

export const input: CSSProperties = {
  padding: `${FIELD_PADDING_Y}px 12px`,
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  color: "var(--text-primary)",
  fontSize: FIELD_FONT_SIZE,
  lineHeight: FIELD_LINE_HEIGHT,
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
  padding: `${FIELD_PADDING_Y}px 14px`,
  borderRadius: "var(--radius)",
  fontSize: FIELD_FONT_SIZE,
  lineHeight: FIELD_LINE_HEIGHT,
  fontWeight: 500,
  cursor: "pointer",
  transition: "background 120ms, border-color 120ms, color 120ms, opacity 120ms",
  border: "1px solid transparent",
  fontFamily: "inherit",
  whiteSpace: "nowrap",
};

export const btnPrimary: CSSProperties = {
  ...btnBase,
  background: "var(--accent)",
  color: "var(--accent-text)",
  border: "1px solid var(--accent)", // transparent-equivalent: same color as bg, keeps height parity with bordered inputs
};

export const btnPrimaryHover: CSSProperties = {
  background: "var(--accent-hover)",
  borderColor: "var(--accent-hover)",
};

export const btnSecondary: CSSProperties = {
  ...btnBase,
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  color: "var(--text-secondary)",
};

export const btnSecondaryHover: CSSProperties = {
  background: "var(--bg-hover)",
  borderColor: "var(--border-hover)",
  color: "var(--text-primary)",
};

export const btnDanger: CSSProperties = {
  ...btnBase,
  background: "transparent",
  border: "1px solid var(--error-border)",
  color: "var(--error)",
};

export const btnDangerHover: CSSProperties = {
  background: "var(--error-light)",
};

export const btnGhost: CSSProperties = {
  ...btnBase,
  background: "transparent",
  border: "1px solid transparent",
  color: "var(--text-muted)",
  padding: "4px 6px",
};

/**
 * Apply a hover style on any button via inline mouse handlers.
 *
 *   <button style={btnSecondary} {...hoverHandlers(btnSecondaryHover)} />
 */
export function hoverHandlers(hoverStyle: CSSProperties) {
  return {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      if ((e.currentTarget as HTMLButtonElement).disabled) return;
      Object.assign(e.currentTarget.style, hoverStyle);
    },
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
      // Reset the properties we set — re-applying the base style as a delta.
      for (const key of Object.keys(hoverStyle)) {
        (e.currentTarget.style as unknown as Record<string, string>)[key] = "";
      }
    },
  };
}

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

export const spinKeyframes = "appraiserSpin";
