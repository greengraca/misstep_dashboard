"use client";

import { useDiscount } from "@/lib/discount";

/**
 * Pill control combining an iOS-style sliding switch + percent input. Used
 * for the "undercut" view adjustment — subtracts the entered percentage
 * from every displayed EV / price so the user sees what they'd net if they
 * listed each card N% below trend (the practical strategy for actually
 * selling on Cardmarket).
 *
 * State is global via useDiscount() (localStorage-backed), so flipping the
 * switch on the Sets tab also updates the Products tab and any open detail
 * page in real time.
 */
export default function DiscountToggle() {
  const { enabled, percent, setEnabled, setPercent } = useDiscount();

  return (
    <div
      className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-full transition-all duration-200"
      style={{
        background: enabled
          ? "linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(99, 102, 241, 0.05))"
          : "var(--surface-gradient)",
        backdropFilter: "var(--surface-blur)",
        border: `1px solid ${enabled ? "rgba(99, 102, 241, 0.40)" : "rgba(255, 255, 255, 0.10)"}`,
        boxShadow: enabled
          ? "0 0 0 1px rgba(99, 102, 241, 0.20), 0 4px 12px rgba(99, 102, 241, 0.10), var(--surface-shadow)"
          : "var(--surface-shadow)",
      }}
      title="Undercut: subtract this % from every displayed EV / price (UI-only, doesn't change stored data)"
    >
      {/* iOS-style sliding switch — clickable target */}
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="Toggle undercut"
        onClick={() => setEnabled(!enabled)}
        className="relative shrink-0 transition-colors duration-200"
        style={{
          width: "32px",
          height: "18px",
          borderRadius: "9999px",
          background: enabled
            ? "var(--accent)"
            : "rgba(255, 255, 255, 0.10)",
          border: "none",
          cursor: "pointer",
          padding: 0,
          boxShadow: enabled
            ? "inset 0 1px 2px rgba(0, 0, 0, 0.15)"
            : "inset 0 1px 2px rgba(0, 0, 0, 0.20)",
        }}
      >
        <span
          className="absolute top-0.5 transition-transform duration-200"
          style={{
            left: "2px",
            width: "14px",
            height: "14px",
            borderRadius: "9999px",
            background: "#fff",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.30)",
            transform: enabled ? "translateX(14px)" : "translateX(0)",
          }}
        />
      </button>

      {/* Label + number input + percent sign */}
      <span
        className="text-sm font-medium select-none transition-colors duration-200"
        style={{ color: enabled ? "var(--accent)" : "var(--text-muted)" }}
      >
        Undercut
      </span>
      <div className="inline-flex items-baseline gap-0.5">
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
          className="text-right text-sm transition-colors duration-200 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          style={{
            width: "28px",
            background: "transparent",
            border: "none",
            color: enabled ? "var(--text-primary)" : "var(--text-muted)",
            fontFamily: "var(--font-mono)",
            fontWeight: 600,
            padding: 0,
          }}
        />
        <span
          className="text-sm transition-colors duration-200"
          style={{ color: enabled ? "var(--accent)" : "var(--text-muted)" }}
        >
          %
        </span>
      </div>
    </div>
  );
}
