"use client";

import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/dashboard/modal";
import Select from "@/components/dashboard/select";
import { Field } from "@/components/dashboard/page-shell";
import ManualSaleCardPicker, { type SellableCardOption } from "./ManualSaleCardPicker";

interface Props {
  open: boolean;
  onClose: () => void;
  investmentId: string;
  onSaved: () => void;
}

const CONDITION_OPTIONS = ["MT", "NM", "EX", "GD", "LP", "PL", "PO"].map((v) => ({ value: v, label: v }));
const LANGUAGE_OPTIONS = ["English", "German", "French", "Italian", "Spanish", "Portuguese", "Japanese", "Chinese", "Korean", "Russian"]
  .map((v) => ({ value: v, label: v }));

const fieldStyle: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  color: "var(--text-primary)",
  borderRadius: 8,
};

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ManualSaleModal({ open, onClose, investmentId, onSaved }: Props) {
  const [card, setCard] = useState<SellableCardOption | null>(null);
  const [condition, setCondition] = useState("NM");
  const [foil, setFoil] = useState(false);
  const [language, setLanguage] = useState("English");
  const [qty, setQty] = useState(1);
  const [unitPriceEur, setUnitPriceEur] = useState<number | "">("");
  const [wasListed, setWasListed] = useState(true);
  const [date, setDate] = useState(isoToday);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset on close.
  useEffect(() => {
    if (!open) {
      setCard(null);
      setCondition("NM");
      setFoil(false);
      setLanguage("English");
      setQty(1);
      setUnitPriceEur("");
      setWasListed(true);
      setDate(isoToday());
      setNote("");
      setError(null);
    }
  }, [open]);

  // Auto-defaults when picking a card.
  useEffect(() => {
    if (!card) return;
    setFoil(card.foil_default);
    // Default disposition: "was listed" if a tracked lot exists for this card,
    // else "off-the-books" (more likely if there's no tracking yet).
    setWasListed(card.lot_remaining != null && card.lot_remaining > 0);
  }, [card]);

  const previewLine = useMemo(() => {
    if (!card || !Number.isFinite(qty) || qty <= 0) return null;
    if (wasListed) {
      const have = card.lot_remaining ?? 0;
      if (have < qty) {
        return `Lot only has ${have} remaining — increase the lot or switch to "never listed".`;
      }
      return `Lot will go from Remaining ${have} to ${have - qty}, Sold +${qty}.`;
    }
    if (card.lot_remaining == null) {
      return `Will create a new lot: Opened ${qty}, Sold ${qty}, Remaining 0.`;
    }
    return `Lot's Opened will grow by ${qty} and Sold by ${qty}. Remaining stays at ${card.lot_remaining}.`;
  }, [card, qty, wasListed]);

  const canSubmit =
    card != null &&
    Number.isFinite(qty) && qty > 0 &&
    typeof unitPriceEur === "number" && Number.isFinite(unitPriceEur) && unitPriceEur >= 0 &&
    !!condition && !!language && !!date && !submitting;

  async function submit() {
    if (!card) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/investments/${investmentId}/manual-sale`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cardmarketId: card.cardmarket_id,
          foil,
          condition,
          language,
          qty,
          unitPriceEur: typeof unitPriceEur === "number" ? unitPriceEur : 0,
          wasListed,
          date: new Date(`${date}T12:00:00Z`).toISOString(),
          note: note.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || `HTTP ${res.status}`);
        return;
      }
      onSaved();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Record a sale outside Cardmarket" maxWidth="max-w-xl">
      <div className="flex flex-col gap-4">
        <Field label="Card sold">
          <ManualSaleCardPicker
            investmentId={investmentId}
            selected={card}
            onSelect={setCard}
          />
          {card && (
            <div className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
              Picked: <span style={{ color: "var(--text-secondary)" }}>{card.name}</span>
              {card.set_name && <> · {card.set_name}</>}
              {card.lot_remaining != null && <> · {card.lot_remaining} remaining in this investment</>}
            </div>
          )}
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Condition">
            <Select size="sm" value={condition} onChange={setCondition} options={CONDITION_OPTIONS} />
          </Field>
          <Field label="Language">
            <Select size="sm" value={language} onChange={setLanguage} options={LANGUAGE_OPTIONS} />
          </Field>
          <Field label="Foil">
            <label className="flex items-center gap-2 text-xs h-8" style={{ color: "var(--text-secondary)" }}>
              <input type="checkbox" checked={foil} onChange={(e) => setFoil(e.target.checked)} />
              Foil printing
            </label>
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Quantity">
            <input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
              className="appraiser-field text-xs py-2 px-3"
              style={{ ...fieldStyle, fontFamily: "var(--font-mono)" }}
            />
          </Field>
          <Field label="Sale price per unit (€, gross)">
            <input
              type="number"
              min={0}
              step="0.01"
              value={unitPriceEur}
              onChange={(e) => {
                const v = e.target.value;
                setUnitPriceEur(v === "" ? "" : Number(v));
              }}
              className="appraiser-field text-xs py-2 px-3"
              style={{ ...fieldStyle, fontFamily: "var(--font-mono)" }}
              placeholder="e.g. 5.00"
            />
          </Field>
          <Field label="Sale date">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="appraiser-field text-xs py-2 px-3"
              style={{ ...fieldStyle, fontFamily: "var(--font-mono)" }}
            />
          </Field>
        </div>

        <Field label="Note (optional)">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Buyer name, FNM trade-in, etc."
            className="appraiser-field text-xs py-2 px-3 w-full"
            style={fieldStyle}
          />
        </Field>

        <div className="flex flex-col gap-2 mt-2">
          <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
            Was this card already listed on Cardmarket?
          </span>
          <label
            className="flex items-start gap-2 p-3 rounded-lg cursor-pointer"
            style={{
              border: `1px solid ${wasListed ? "var(--accent)" : "var(--border)"}`,
              background: wasListed ? "rgba(96, 165, 250, 0.08)" : "var(--bg-card)",
            }}
          >
            <input
              type="radio"
              checked={wasListed}
              onChange={() => setWasListed(true)}
              className="mt-0.5"
            />
            <span className="text-xs" style={{ color: "var(--text-primary)" }}>
              <strong>I&apos;m pulling this card out of my Cardmarket stock</strong>
              <div className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                I had this card listed on CM and I&apos;m taking it down because it sold in person. It already shows up in this investment&apos;s &quot;Remaining&quot; count. Recording this sale will subtract <strong>{qty}</strong> from Remaining and add <strong>{qty}</strong> to Sold.
              </div>
            </span>
          </label>
          <label
            className="flex items-start gap-2 p-3 rounded-lg cursor-pointer"
            style={{
              border: `1px solid ${!wasListed ? "var(--accent)" : "var(--border)"}`,
              background: !wasListed ? "rgba(96, 165, 250, 0.08)" : "var(--bg-card)",
            }}
          >
            <input
              type="radio"
              checked={!wasListed}
              onChange={() => setWasListed(false)}
              className="mt-0.5"
            />
            <span className="text-xs" style={{ color: "var(--text-primary)" }}>
              <strong>I sold it without ever listing it on Cardmarket</strong>
              <div className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                This copy was opened from the box and sold without ever being listed on CM. The lot ledger doesn&apos;t know about it yet, so recording this sale will add <strong>{qty}</strong> to Opened (so the cost basis sees it) and <strong>{qty}</strong> to Sold. Remaining stays the same.
              </div>
            </span>
          </label>
        </div>

        {previewLine && (
          <div
            className="text-[11px] px-3 py-2 rounded-lg"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {previewLine}
          </div>
        )}

        {error && (
          <div className="text-xs px-3 py-2 rounded-lg" style={{ background: "var(--error-light)", color: "var(--error)" }}>
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-2">
          <button
            onClick={onClose}
            className="px-3 py-2 text-xs rounded-lg"
            style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="px-4 py-2 text-xs rounded-lg font-medium"
            style={{
              background: canSubmit ? "var(--accent)" : "var(--bg-card)",
              color: canSubmit ? "var(--accent-text)" : "var(--text-muted)",
              border: "1px solid var(--border)",
              cursor: canSubmit ? "pointer" : "not-allowed",
            }}
          >
            {submitting ? "Saving…" : "Record sale"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
