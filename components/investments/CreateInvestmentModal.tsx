"use client";

import { useEffect, useState } from "react";
import type {
  BoosterType,
  CreateInvestmentBody,
  InvestmentSource,
} from "@/lib/investments/types";

const DEFAULT_PACKS: Record<BoosterType, { packs: number; cards: number }> = {
  play: { packs: 36, cards: 15 },
  collector: { packs: 12, cards: 15 },
  jumpstart: { packs: 24, cards: 20 },
  set: { packs: 30, cards: 15 },
};

export default function CreateInvestmentModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [step, setStep] = useState<"source" | "details">("source");
  const [kind, setKind] = useState<"box" | "product">("box");

  // Box fields
  const [setCode, setSetCode] = useState("");
  const [boosterType, setBoosterType] = useState<BoosterType>("play");
  const [boxCount, setBoxCount] = useState(1);
  const [packsPerBox, setPacksPerBox] = useState(DEFAULT_PACKS.play.packs);
  const [cardsPerPack, setCardsPerPack] = useState(DEFAULT_PACKS.play.cards);

  // Product fields
  const [productSlug, setProductSlug] = useState("");
  const [unitCount, setUnitCount] = useState(1);

  // Details
  const [name, setName] = useState("");
  const [cost, setCost] = useState(0);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Apply booster-type defaults
  useEffect(() => {
    setPacksPerBox(DEFAULT_PACKS[boosterType].packs);
    setCardsPerPack(DEFAULT_PACKS[boosterType].cards);
  }, [boosterType]);

  const source: InvestmentSource =
    kind === "box"
      ? {
          kind: "box",
          set_code: setCode.trim(),
          booster_type: boosterType,
          packs_per_box: packsPerBox,
          cards_per_pack: cardsPerPack,
          box_count: boxCount,
        }
      : { kind: "product", product_slug: productSlug.trim(), unit_count: unitCount };

  const defaultName =
    kind === "box"
      ? `${boxCount}× ${setCode || "?"} (${boosterType}) — ${monthYear()}`
      : `${unitCount}× ${productSlug || "?"}`;

  async function submit() {
    setSubmitting(true);
    setErr(null);
    try {
      const body: CreateInvestmentBody = {
        name: name.trim() || defaultName,
        cost_total_eur: cost,
        cost_notes: notes.trim() || undefined,
        source,
      };
      const r = await fetch("/api/investments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Create failed");
      onCreated(String(data.investment._id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Create failed");
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
        <h2 className="text-lg font-semibold">New Investment</h2>

        {step === "source" ? (
          <div className="space-y-3">
            <label className="block">
              <div className="text-xs uppercase text-gray-500 mb-1">Kind</div>
              <div className="flex gap-2">
                <button
                  onClick={() => setKind("box")}
                  className={radioClass(kind === "box")}
                >
                  Random-pool box
                </button>
                <button
                  onClick={() => setKind("product")}
                  className={radioClass(kind === "product")}
                >
                  Fixed-pool product
                </button>
              </div>
            </label>

            {kind === "box" ? (
              <>
                <Field label="Set code">
                  <input
                    className="border rounded px-2 py-1 w-full"
                    placeholder="e.g. fdn"
                    value={setCode}
                    onChange={(e) => setSetCode(e.target.value.toLowerCase().trim())}
                  />
                </Field>
                <Field label="Booster type">
                  <select
                    className="border rounded px-2 py-1 w-full"
                    value={boosterType}
                    onChange={(e) => setBoosterType(e.target.value as BoosterType)}
                  >
                    <option value="play">Play</option>
                    <option value="collector">Collector</option>
                    <option value="jumpstart">Jumpstart</option>
                    <option value="set">Set</option>
                  </select>
                </Field>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Packs/box">
                    <input
                      type="number"
                      className="border rounded px-2 py-1 w-full"
                      value={packsPerBox}
                      onChange={(e) => setPacksPerBox(Number(e.target.value))}
                    />
                  </Field>
                  <Field label="Cards/pack">
                    <input
                      type="number"
                      className="border rounded px-2 py-1 w-full"
                      value={cardsPerPack}
                      onChange={(e) => setCardsPerPack(Number(e.target.value))}
                    />
                  </Field>
                  <Field label="Boxes">
                    <input
                      type="number"
                      className="border rounded px-2 py-1 w-full"
                      value={boxCount}
                      onChange={(e) => setBoxCount(Number(e.target.value))}
                    />
                  </Field>
                </div>
              </>
            ) : (
              <>
                <Field label="Product slug">
                  <input
                    className="border rounded px-2 py-1 w-full"
                    placeholder="e.g. tdm-commander-001"
                    value={productSlug}
                    onChange={(e) => setProductSlug(e.target.value)}
                  />
                </Field>
                <Field label="Unit count">
                  <input
                    type="number"
                    className="border rounded px-2 py-1 w-full"
                    value={unitCount}
                    onChange={(e) => setUnitCount(Number(e.target.value))}
                  />
                </Field>
              </>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button className="px-3 py-1.5 text-sm" onClick={onClose}>
                Cancel
              </button>
              <button
                className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded disabled:opacity-50"
                disabled={
                  kind === "box" ? !setCode || boxCount <= 0 : !productSlug || unitCount <= 0
                }
                onClick={() => setStep("details")}
              >
                Next
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Field label="Name">
              <input
                className="border rounded px-2 py-1 w-full"
                placeholder={defaultName}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field label="Cost (EUR)">
              <input
                type="number"
                className="border rounded px-2 py-1 w-full"
                value={cost}
                onChange={(e) => setCost(Number(e.target.value))}
              />
            </Field>
            <Field label="Notes (optional)">
              <textarea
                className="border rounded px-2 py-1 w-full"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
            {err && <div className="text-sm text-rose-600">{err}</div>}
            <div className="flex justify-end gap-2 pt-2">
              <button className="px-3 py-1.5 text-sm" onClick={() => setStep("source")}>
                Back
              </button>
              <button
                className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded disabled:opacity-50"
                disabled={submitting || cost < 0}
                onClick={submit}
              >
                {submitting ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function radioClass(active: boolean): string {
  return (
    "flex-1 px-3 py-2 rounded border text-sm " +
    (active ? "border-indigo-600 text-indigo-600 bg-indigo-50" : "border-gray-300 text-gray-600")
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs uppercase text-gray-500 mb-1">{label}</div>
      {children}
    </label>
  );
}

function monthYear(): string {
  return new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" });
}
