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

  // Match the existing action-button sizing (Snapshot / Sync Cards / Configure
  // in EvSetDetail): px-3 py-1.5 rounded-lg text-xs. Keep the accent outline
  // when on so it's visually distinct from the neutral action buttons.
  return (
    <div
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200"
      style={{
        background: enabled ? "rgba(99, 102, 241, 0.10)" : "rgba(255, 255, 255, 0.05)",
        border: `1px solid ${enabled ? "rgba(99, 102, 241, 0.40)" : "transparent"}`,
        color: enabled ? "var(--accent)" : "var(--text-secondary)",
      }}
      title="Undercut: subtract this % from every displayed EV / price (UI-only, doesn't change stored data)"
    >
      {/* Compact iOS-style switch sized to fit the px-3 py-1.5 row */}
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="Toggle undercut"
        onClick={() => setEnabled(!enabled)}
        className="relative shrink-0 transition-colors duration-200"
        style={{
          width: "26px",
          height: "14px",
          borderRadius: "9999px",
          background: enabled ? "var(--accent)" : "rgba(255, 255, 255, 0.18)",
          border: "none",
          cursor: "pointer",
          padding: 0,
        }}
      >
        <span
          className="absolute top-0.5 transition-transform duration-200"
          style={{
            left: "2px",
            width: "10px",
            height: "10px",
            borderRadius: "9999px",
            background: "#fff",
            boxShadow: "0 1px 2px rgba(0, 0, 0, 0.25)",
            transform: enabled ? "translateX(12px)" : "translateX(0)",
          }}
        />
      </button>

      <span className="select-none">Undercut</span>

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
          className="text-right transition-colors duration-200 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          style={{
            width: "22px",
            background: "transparent",
            border: "none",
            color: enabled ? "var(--text-primary)" : "var(--text-muted)",
            fontFamily: "var(--font-mono)",
            fontWeight: 600,
            padding: 0,
            fontSize: "inherit",
          }}
        />
        <span style={{ opacity: 0.7 }}>%</span>
      </div>
    </div>
  );
}
