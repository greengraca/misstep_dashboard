"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Lock } from "lucide-react";
import Modal from "@/components/dashboard/modal";
import type { InvestmentDetail } from "@/lib/investments/types";

const formatEur = (n: number | null | undefined) =>
  n != null ? `${n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : "—";

export default function CloseInvestmentModal({
  open,
  detail,
  onClose,
  onClosed,
}: {
  open: boolean;
  detail: InvestmentDetail;
  onClose: () => void;
  onClosed: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSubmitting(false);
      setErr(null);
    }
  }, [open]);

  const sealedProceeds = detail.sealed_flips.reduce((s, f) => s + f.proceeds_eur, 0);
  const outstanding = detail.cost_total_eur - sealedProceeds;

  async function submit() {
    setSubmitting(true);
    setErr(null);
    try {
      const r = await fetch(`/api/investments/${detail.id}/close`, { method: "POST" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Failed");
      onClosed();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Close investment" maxWidth="max-w-md">
      <div className="flex flex-col gap-4">
        <div
          className="flex items-start gap-3 p-3 rounded-lg"
          style={{
            background: "rgba(251, 191, 36, 0.08)",
            border: "1px solid rgba(251, 191, 36, 0.28)",
          }}
        >
          <AlertTriangle
            size={16}
            style={{ color: "var(--warning)", flexShrink: 0, marginTop: "1px" }}
          />
          <div className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            Closing freezes the lot ledger at its current state. Cost basis per card is
            computed and stored on each lot. Sales after close still deplete{" "}
            <code
              className="px-1 rounded text-[10px]"
              style={{ background: "rgba(255,255,255,0.06)", fontFamily: "var(--font-mono)" }}
            >
              qty_remaining
            </code>{" "}
            against these frozen lots.{" "}
            <strong style={{ color: "var(--warning)" }}>This cannot be undone.</strong>
          </div>
        </div>

        <div
          className="rounded-lg p-3 flex flex-col gap-2"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
          <div className="flex justify-between items-baseline text-xs">
            <span style={{ color: "var(--text-muted)" }}>Total cost</span>
            <span style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
              {formatEur(detail.cost_total_eur)}
            </span>
          </div>
          <div className="flex justify-between items-baseline text-xs">
            <span style={{ color: "var(--text-muted)" }}>Sealed proceeds</span>
            <span style={{ color: "var(--success)", fontFamily: "var(--font-mono)" }}>
              − {formatEur(sealedProceeds)}
            </span>
          </div>
          <div
            className="flex justify-between items-baseline text-xs pt-2"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>
              Outstanding cost
            </span>
            <span
              style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontWeight: 600 }}
            >
              {formatEur(outstanding)}
            </span>
          </div>
          <p
            className="text-[10px] pt-1"
            style={{ color: "var(--text-muted)", fontStyle: "italic" }}
          >
            Cost basis per card is computed server-side from this outstanding total ÷ total
            opened cards at the moment of close.
          </p>
        </div>

        {err && (
          <div
            className="text-xs px-3 py-2 rounded-lg"
            style={{
              background: "var(--error-light)",
              border: "1px solid var(--error-border)",
              color: "var(--error)",
            }}
          >
            {err}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}
          >
            Cancel
          </button>
          <button
            disabled={submitting}
            onClick={submit}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background: "rgba(52, 211, 153, 0.12)",
              color: "var(--success)",
              border: "1px solid rgba(52, 211, 153, 0.35)",
              opacity: submitting ? 0.6 : 1,
              cursor: submitting ? "not-allowed" : "pointer",
            }}
          >
            <Lock size={13} />
            {submitting ? "Closing…" : "Confirm close"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
