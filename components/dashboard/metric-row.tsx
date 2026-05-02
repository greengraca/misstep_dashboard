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
 *  Mobile: hard-cap at 2 columns so €-formatted numbers like "12,345.67 €"
 *  don't bleed past their tile. sm+ gets 3 cols, md+ stretches to one row.
 *  Auto-fit was too sensitive to ancestor padding chains and produced 5–6
 *  col layouts on mid-size viewports. */
function gridColsClass(n: number): string {
  // Each branch is a literal so Tailwind's source scanner picks up every
  // class that could appear here.
  switch (n) {
    case 1: return "grid-cols-1";
    case 2: return "grid-cols-2";
    case 3: return "grid-cols-2 sm:grid-cols-3";
    case 4: return "grid-cols-2 sm:grid-cols-2 md:grid-cols-4";
    case 5: return "grid-cols-2 sm:grid-cols-3 md:grid-cols-5";
    case 6: return "grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-6";
    default: return "grid-cols-2 sm:grid-cols-3 md:grid-cols-4";
  }
}

export function MetricRow({ items }: MetricRowProps) {
  return (
    <div className={`grid gap-3 ${gridColsClass(items.length)}`}>
      {items.map((m) => (
        <div
          key={m.label}
          // min-w-0 stops a long mono number from forcing its track wider
          // than 1fr — without it the whole row pushes other tiles off-screen.
          className="flex flex-col gap-1 p-2.5 sm:p-3 rounded-lg min-w-0 overflow-hidden"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <span
            className="text-[10px] uppercase tracking-wider truncate"
            style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
          >
            {m.label}
          </span>
          <span
            className="text-sm sm:text-base font-semibold truncate"
            style={{
              color: TONE_COLOR[m.tone ?? "default"],
              fontFamily: "var(--font-mono)",
            }}
            title={m.value}
          >
            {m.value}
          </span>
        </div>
      ))}
    </div>
  );
}
