"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { SealedFlip } from "@/lib/investments/types";
import SealedFlipModal from "./SealedFlipModal";

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
  const total = flips.reduce((s, f) => s + f.proceeds_eur, 0);
  return (
    <div className="rounded-lg border bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Sealed flips</h2>
        {canRecord && (
          <button
            className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700"
            onClick={() => setShow(true)}
          >
            <Plus className="h-3.5 w-3.5" /> Record
          </button>
        )}
      </div>
      {flips.length === 0 ? (
        <div className="text-sm text-gray-500">No sealed flips recorded.</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-gray-500 border-b">
              <th className="py-1">Date</th>
              <th>Units</th>
              <th className="text-right">Proceeds</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {flips.map((f, i) => (
              <tr key={i} className="border-b">
                <td className="py-1">
                  {new Date(f.recorded_at).toLocaleDateString()}
                </td>
                <td>{f.unit_count}</td>
                <td className="text-right">€{f.proceeds_eur.toFixed(2)}</td>
                <td className="text-gray-600">{f.note ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="text-xs text-gray-500">
        Total sealed proceeds: €{total.toFixed(2)}
      </div>
      {show && (
        <SealedFlipModal
          investmentId={investmentId}
          onClose={() => setShow(false)}
          onRecorded={() => {
            setShow(false);
            onChanged();
          }}
        />
      )}
    </div>
  );
}
