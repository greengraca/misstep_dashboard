"use client";

import { useState } from "react";

export default function SealedFlipModal({
  investmentId,
  onClose,
  onRecorded,
}: {
  investmentId: string;
  onClose: () => void;
  onRecorded: () => void;
}) {
  const [units, setUnits] = useState(1);
  const [proceeds, setProceeds] = useState(0);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-lg w-full max-w-md p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">Record Sealed Flip</h2>
        <label className="block">
          <div className="text-xs uppercase text-gray-500 mb-1">Units sold sealed</div>
          <input
            type="number"
            className="border rounded px-2 py-1 w-full"
            value={units}
            onChange={(e) => setUnits(Number(e.target.value))}
          />
        </label>
        <label className="block">
          <div className="text-xs uppercase text-gray-500 mb-1">Proceeds (EUR, after fees)</div>
          <input
            type="number"
            className="border rounded px-2 py-1 w-full"
            value={proceeds}
            onChange={(e) => setProceeds(Number(e.target.value))}
          />
        </label>
        <label className="block">
          <div className="text-xs uppercase text-gray-500 mb-1">Note (optional)</div>
          <textarea
            className="border rounded px-2 py-1 w-full"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        {err && <div className="text-sm text-rose-600">{err}</div>}
        <div className="flex justify-end gap-2">
          <button className="px-3 py-1.5 text-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded disabled:opacity-50"
            disabled={submitting || units <= 0 || proceeds < 0}
            onClick={submit}
          >
            {submitting ? "Recording…" : "Record"}
          </button>
        </div>
      </div>
    </div>
  );
}
