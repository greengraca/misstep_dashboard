"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/dashboard/modal";

const fieldStyle: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  color: "var(--text-primary)",
};

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <div
        className="text-[10px] uppercase tracking-wider mb-1"
        style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
      >
        {label}
      </div>
      {children}
      {hint && (
        <div className="mt-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
          {hint}
        </div>
      )}
    </label>
  );
}

export default function SealedFlipModal({
  open,
  investmentId,
  onClose,
  onRecorded,
}: {
  open: boolean;
  investmentId: string;
  onClose: () => void;
  onRecorded: () => void;
}) {
  const [units, setUnits] = useState(1);
  const [proceeds, setProceeds] = useState(0);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setUnits(1);
      setProceeds(0);
      setNote("");
      setErr(null);
      setSubmitting(false);
    }
  }, [open]);

  async function submit() {
    setSubmitting(true);
    setErr(null);
    try {
      const r = await fetch(`/api/investments/${investmentId}/sealed-flip`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          unit_count: units,
          proceeds_eur: proceeds,
          note: note.trim() || undefined,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Failed");
      onRecorded();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  const valid = units > 0 && proceeds >= 0 && Number.isFinite(units) && Number.isFinite(proceeds);

  return (
    <Modal open={open} onClose={onClose} title="Record sealed flip" maxWidth="max-w-md">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Units sold sealed">
            <input
              type="number"
              min={1}
              className="appraiser-field w-full px-3 py-2 rounded-lg text-sm"
              style={{ ...fieldStyle, fontFamily: "var(--font-mono)" }}
              value={units}
              onChange={(e) => setUnits(Number(e.target.value))}
            />
          </Field>
          <Field label="Proceeds (EUR)" hint="After CM fees">
            <input
              type="number"
              min={0}
              step="0.01"
              className="appraiser-field w-full px-3 py-2 rounded-lg text-sm"
              style={{ ...fieldStyle, fontFamily: "var(--font-mono)" }}
              value={proceeds}
              onChange={(e) => setProceeds(Number(e.target.value))}
            />
          </Field>
        </div>
        <Field label="Note">
          <textarea
            rows={2}
            className="appraiser-field w-full px-3 py-2 rounded-lg text-sm resize-none"
            style={fieldStyle}
            placeholder="Optional — buyer, transaction ID, etc."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
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
            disabled={submitting || !valid}
            onClick={submit}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background: "var(--accent)",
              color: "var(--accent-text)",
              border: "1px solid var(--accent)",
              opacity: submitting || !valid ? 0.6 : 1,
              cursor: submitting || !valid ? "not-allowed" : "pointer",
            }}
          >
            {submitting ? "Recording…" : "Record"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
