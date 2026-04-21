"use client";

import { useState } from "react";
import type { InvestmentDetail } from "@/lib/investments/types";

export default function CloseInvestmentModal({
  detail,
  onClose,
  onClosed,
}: {
  detail: InvestmentDetail;
  onClose: () => void;
  onClosed: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-lg w-full max-w-md p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">Close Investment</h2>
        <div className="text-sm text-gray-700 space-y-2">
          <p>
            Closing will freeze the lot ledger at its current state. Cost basis
            per card will be computed and stored on each lot. Sales from that
            point on will still deplete <code>qty_remaining</code> against these
            frozen lots.
          </p>
          <p className="font-medium">This cannot be undone.</p>
          <div className="bg-gray-50 rounded p-2 space-y-1 text-xs">
            <div>Outstanding cost (cost − sealed proceeds): €{outstanding.toFixed(2)}</div>
            <div className="text-gray-500">Cost basis/card is computed server-side at close.</div>
          </div>
        </div>
        {err && <div className="text-sm text-rose-600">{err}</div>}
        <div className="flex justify-end gap-2">
          <button className="px-3 py-1.5 text-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded disabled:opacity-50"
            disabled={submitting}
            onClick={submit}
          >
            {submitting ? "Closing…" : "Confirm close"}
          </button>
        </div>
      </div>
    </div>
  );
}
