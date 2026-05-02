"use client";

import { useState } from "react";
import { Plus, Receipt } from "lucide-react";
import type { SealedFlip } from "@/lib/investments/types";
import SealedFlipModal from "./SealedFlipModal";
import { Panel, H2 } from "@/components/dashboard/page-shell";
import { StatusPill } from "@/components/dashboard/status-pill";

const formatEur = (n: number | null | undefined) =>
  n != null ? `${n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : "—";

export default function SealedFlipsSection({
  investmentId,
  flips,
  canRecord,
  onChanged,
}: {
  investmentId: string;
  flips: SealedFlip[];
  canRecord: boolean;
  onChanged: () => void;
}) {
  const [show, setShow] = useState(false);
  const totalProceeds = flips.reduce((s, f) => s + f.proceeds_eur, 0);
  const totalUnits = flips.reduce((s, f) => s + f.unit_count, 0);

  return (
    <Panel>
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <H2 icon={<Receipt size={16} />}>Sealed flips</H2>
          {flips.length > 0 && (
            <StatusPill tone="accent">
              {totalUnits} unit{totalUnits === 1 ? "" : "s"} · {formatEur(totalProceeds)}
            </StatusPill>
          )}
        </div>
        {canRecord && (
          <button
            onClick={() => setShow(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--accent)";
              e.currentTarget.style.color = "var(--accent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.color = "var(--text-secondary)";
            }}
          >
            <Plus size={12} /> Record flip
          </button>
        )}
      </div>

      {flips.length === 0 ? (
        <p
          className="text-xs py-5 text-center"
          style={{ color: "var(--text-muted)" }}
        >
          No sealed flips yet. Record one when you sell a unit without opening it.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table
            className="w-full text-xs"
            style={{ borderCollapse: "separate", borderSpacing: 0 }}
          >
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <th className="text-left py-2 font-medium">Date</th>
                <th className="text-right py-2 font-medium">Units</th>
                <th className="text-right py-2 font-medium">Proceeds</th>
                <th className="text-left py-2 pl-3 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {flips.map((f, i) => (
                <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                  <td className="py-2" style={{ color: "var(--text-secondary)" }}>
                    {new Date(f.recorded_at).toLocaleDateString("pt-PT")}
                  </td>
                  <td
                    className="py-2 text-right"
                    style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}
                  >
                    {f.unit_count}
                  </td>
                  <td
                    className="py-2 text-right"
                    style={{ color: "var(--success)", fontFamily: "var(--font-mono)" }}
                  >
                    {formatEur(f.proceeds_eur)}
                  </td>
                  <td className="py-2 pl-3" style={{ color: "var(--text-muted)" }}>
                    {f.note || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SealedFlipModal
        open={show}
        investmentId={investmentId}
        onClose={() => setShow(false)}
        onRecorded={() => {
          setShow(false);
          onChanged();
        }}
      />
    </Panel>
  );
}
