"use client";

import type { EvCalculationResult } from "@/lib/types";

interface EvSlotBreakdownProps {
  slots: EvCalculationResult["slot_breakdown"];
  boxEvGross: number;
}

export default function EvSlotBreakdown({ slots, boxEvGross }: EvSlotBreakdownProps) {
  const activeSlots = slots.filter((s) => s.slot_ev > 0);
  if (!activeSlots.length) return null;

  const maxEv = Math.max(...activeSlots.map((s) => s.slot_ev));

  return (
    <div>
      <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
        EV by Slot
      </h3>
      <div
        className="rounded-xl p-4"
        style={{
          background: "rgba(255, 255, 255, 0.015)",
          border: "1px solid var(--border)",
        }}
      >
        <div className="flex flex-col gap-2">
          {activeSlots.map((slot) => {
            const pct = boxEvGross > 0 ? (slot.slot_ev / boxEvGross) * 100 : 0;
            const barWidth = maxEv > 0 ? (slot.slot_ev / maxEv) * 100 : 0;
            return (
              <div key={slot.slot_number} className="flex items-center gap-3">
                <span
                  className="text-xs w-[140px] shrink-0 truncate"
                  style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}
                >
                  {slot.label}
                </span>
                <div className="flex-1 h-5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${barWidth}%`,
                      background: "linear-gradient(90deg, var(--accent), rgba(168, 85, 247, 0.8))",
                    }}
                  />
                </div>
                <span
                  className="text-xs w-[70px] text-right shrink-0"
                  style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}
                >
                  &euro;{slot.slot_ev.toFixed(2)}
                </span>
                <span
                  className="text-xs w-[40px] text-right shrink-0"
                  style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
                >
                  {pct.toFixed(0)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
