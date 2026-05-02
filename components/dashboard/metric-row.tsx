"use client";

export type MetricTone = "default" | "success" | "danger" | "muted";

export interface MetricRowItem {
  label: string;
  value: string;
  tone?: MetricTone;
}

interface MetricRowProps {
  items: MetricRowItem[];
}

const TONE_COLOR: Record<MetricTone, string> = {
  default: "var(--text-primary)",
  success: "var(--success)",
  danger:  "var(--error)",
  muted:   "var(--text-muted)",
};

/** Inline row of 4–6 small numeric stats. Each tile is label-above /
 *  mono-value-below. Used for breakdown strips that don't deserve full
 *  StatCards (Cardmarket Revenue, EV per-rarity contributions, etc.).
 *
 *  Mobile: tiles wrap onto multiple rows via auto-fit so labels and mono
 *  values keep enough room to read. The minmax is generous (140px) because
 *  €-formatted numbers like "1,234.56 €" need ~110px to not truncate. */
export function MetricRow({ items }: MetricRowProps) {
  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}
    >
      {items.map((m) => (
        <div
          key={m.label}
          className="flex flex-col gap-1 p-3 rounded-lg"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <span
            className="text-[10px] uppercase tracking-wider"
            style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
          >
            {m.label}
          </span>
          <span
            className="text-base font-semibold"
            style={{
              color: TONE_COLOR[m.tone ?? "default"],
              fontFamily: "var(--font-mono)",
            }}
          >
            {m.value}
          </span>
        </div>
      ))}
    </div>
  );
}
