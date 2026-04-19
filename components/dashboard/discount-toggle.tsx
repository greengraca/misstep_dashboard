"use client";

import { Percent } from "lucide-react";
import { useDiscount } from "@/lib/discount";

/**
 * Compact pill-style toggle: checkbox + percent input. Sits inline in page
 * headers next to other controls. State is global via useDiscount().
 */
export default function DiscountToggle() {
  const { enabled, percent, setEnabled, setPercent } = useDiscount();

  return (
    <div
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors"
      style={{
        background: "var(--surface-gradient)",
        backdropFilter: "var(--surface-blur)",
        border: `1px solid ${enabled ? "var(--accent)" : "rgba(255, 255, 255, 0.10)"}`,
        boxShadow: "var(--surface-shadow)",
      }}
      title="Subtract this percentage from every displayed EV / price (UI-only, doesn't change stored data)"
    >
      <label className="inline-flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="accent-[var(--accent)]"
        />
        <span
          className="text-sm font-medium"
          style={{ color: enabled ? "var(--accent)" : "var(--text-muted)" }}
        >
          Discount
        </span>
      </label>
      <div className="inline-flex items-center gap-1">
        <input
          type="number"
          value={percent}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") return;
            const n = Number(raw);
            if (Number.isFinite(n) && n >= 0 && n <= 100) setPercent(n);
          }}
          min={0}
          max={100}
          step={1}
          className="w-10 text-right text-sm"
          style={{
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: "4px",
            color: enabled ? "var(--text-primary)" : "var(--text-muted)",
            fontFamily: "var(--font-mono)",
            padding: "2px 4px",
          }}
        />
        <Percent size={12} style={{ color: enabled ? "var(--accent)" : "var(--text-muted)" }} />
      </div>
    </div>
  );
}
