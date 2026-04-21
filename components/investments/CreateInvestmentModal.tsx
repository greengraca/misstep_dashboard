"use client";

import { useEffect, useState } from "react";
import { Boxes, Layers, ArrowLeft } from "lucide-react";
import Modal from "@/components/dashboard/modal";
import Select from "@/components/dashboard/select";
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

type Kind = "box" | "product" | null;

const fieldStyle: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
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

function KindCard({
  active,
  icon,
  title,
  description,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-start gap-3 p-5 rounded-xl text-left transition-all"
      style={{
        background: active ? "var(--accent-light)" : "var(--bg-card)",
        border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
        boxShadow: active ? "0 0 0 1px var(--accent)" : "none",
      }}
      onMouseEnter={(e) => {
        if (active) return;
        e.currentTarget.style.borderColor = "var(--border-hover)";
        e.currentTarget.style.background = "var(--bg-card-hover)";
      }}
      onMouseLeave={(e) => {
        if (active) return;
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.background = "var(--bg-card)";
      }}
    >
      <div
        className="p-2 rounded-lg"
        style={{ background: active ? "rgba(63,206,229,0.20)" : "var(--accent-light)" }}
      >
        {icon}
      </div>
      <div>
        <div
          className="text-sm font-semibold"
          style={{ color: active ? "var(--accent)" : "var(--text-primary)" }}
        >
          {title}
        </div>
        <div
          className="text-[11px] mt-1 leading-relaxed"
          style={{ color: "var(--text-muted)" }}
        >
          {description}
        </div>
      </div>
    </button>
  );
}

export default function CreateInvestmentModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [kind, setKind] = useState<Kind>(null);
  const [step, setStep] = useState<"source" | "details">("source");

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

  // Apply booster defaults
  useEffect(() => {
    setPacksPerBox(DEFAULT_PACKS[boosterType].packs);
    setCardsPerPack(DEFAULT_PACKS[boosterType].cards);
  }, [boosterType]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setKind(null);
      setStep("source");
      setSetCode("");
      setBoosterType("play");
      setBoxCount(1);
      setProductSlug("");
      setUnitCount(1);
      setName("");
      setCost(0);
      setNotes("");
      setErr(null);
      setSubmitting(false);
    }
  }, [open]);

  const source: InvestmentSource | null =
    kind === "box"
      ? {
          kind: "box",
          set_code: setCode.trim().toLowerCase(),
          booster_type: boosterType,
          packs_per_box: packsPerBox,
          cards_per_pack: cardsPerPack,
          box_count: boxCount,
        }
      : kind === "product"
        ? { kind: "product", product_slug: productSlug.trim(), unit_count: unitCount }
        : null;

  const defaultName =
    kind === "box"
      ? `${boxCount}× ${setCode ? setCode.toUpperCase() : "?"} ${boosterType} — ${monthYear()}`
      : kind === "product"
        ? `${unitCount}× ${productSlug || "?"}`
        : "";

  const sourceValid =
    kind === "box"
      ? !!setCode && boxCount > 0 && packsPerBox > 0 && cardsPerPack > 0
      : kind === "product"
        ? !!productSlug && unitCount > 0
        : false;

  async function submit() {
    if (!source) return;
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
    <Modal
      open={open}
      onClose={onClose}
      title={step === "details" ? "Investment details" : "New Investment"}
      maxWidth="max-w-xl"
    >
      {step === "source" ? (
        <div className="flex flex-col gap-5">
          {/* Kind selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <KindCard
              active={kind === "box"}
              onClick={() => setKind("box")}
              icon={<Boxes size={22} style={{ color: "var(--accent)" }} />}
              title="Random-pool box"
              description="Booster box or Jumpstart box — opens into random packs from a set."
            />
            <KindCard
              active={kind === "product"}
              onClick={() => setKind("product")}
              icon={<Layers size={22} style={{ color: "var(--accent)" }} />}
              title="Fixed-pool product"
              description="Commander precon, Planeswalker deck, Starter deck — known 100-card list."
            />
          </div>

          {/* Inputs reveal once a kind is chosen */}
          {kind === "box" && (
            <div className="flex flex-col gap-3 animate-[fadeIn_0.2s_ease]">
              <Field label="Set code" hint="Scryfall code — e.g. fdn, dsk, otj">
                <input
                  className="appraiser-field w-full px-3 py-2 rounded-lg text-sm"
                  style={fieldStyle}
                  placeholder="fdn"
                  value={setCode}
                  onChange={(e) => setSetCode(e.target.value.toLowerCase().trim())}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Booster type">
                  <Select
                    className="w-full"
                    value={boosterType}
                    onChange={(v) => setBoosterType(v as BoosterType)}
                    options={[
                      { value: "play", label: "Play" },
                      { value: "collector", label: "Collector" },
                      { value: "jumpstart", label: "Jumpstart" },
                      { value: "set", label: "Set" },
                    ]}
                  />
                </Field>
                <Field label="Boxes">
                  <input
                    type="number"
                    min={1}
                    className="appraiser-field w-full px-3 py-2 rounded-lg text-sm"
                    style={{ ...fieldStyle, fontFamily: "var(--font-mono)" }}
                    value={boxCount}
                    onChange={(e) => setBoxCount(Number(e.target.value))}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Packs / box">
                  <input
                    type="number"
                    min={1}
                    className="appraiser-field w-full px-3 py-2 rounded-lg text-sm"
                    style={{ ...fieldStyle, fontFamily: "var(--font-mono)" }}
                    value={packsPerBox}
                    onChange={(e) => setPacksPerBox(Number(e.target.value))}
                  />
                </Field>
                <Field label="Cards / pack">
                  <input
                    type="number"
                    min={1}
                    className="appraiser-field w-full px-3 py-2 rounded-lg text-sm"
                    style={{ ...fieldStyle, fontFamily: "var(--font-mono)" }}
                    value={cardsPerPack}
                    onChange={(e) => setCardsPerPack(Number(e.target.value))}
                  />
                </Field>
              </div>
              <div
                className="text-[11px] px-3 py-2 rounded-lg"
                style={{ background: "var(--bg-card)", color: "var(--text-muted)" }}
              >
                Expected pool:{" "}
                <span style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                  {(packsPerBox * cardsPerPack * boxCount).toLocaleString()}
                </span>{" "}
                cards to attribute
              </div>
            </div>
          )}

          {kind === "product" && (
            <div className="flex flex-col gap-3 animate-[fadeIn_0.2s_ease]">
              <Field label="Product slug" hint="Existing EV product — e.g. tdm-commander-001">
                <input
                  className="appraiser-field w-full px-3 py-2 rounded-lg text-sm"
                  style={fieldStyle}
                  placeholder="tdm-commander-001"
                  value={productSlug}
                  onChange={(e) => setProductSlug(e.target.value)}
                />
              </Field>
              <Field label="Unit count">
                <input
                  type="number"
                  min={1}
                  className="appraiser-field w-full px-3 py-2 rounded-lg text-sm"
                  style={{ ...fieldStyle, fontFamily: "var(--font-mono)" }}
                  value={unitCount}
                  onChange={(e) => setUnitCount(Number(e.target.value))}
                />
              </Field>
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
              disabled={!sourceValid}
              onClick={() => setStep("details")}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                background: sourceValid ? "var(--accent)" : "var(--bg-card)",
                color: sourceValid ? "var(--accent-text)" : "var(--text-muted)",
                border: sourceValid ? "1px solid var(--accent)" : "1px solid var(--border)",
                opacity: sourceValid ? 1 : 0.6,
                cursor: sourceValid ? "pointer" : "not-allowed",
              }}
            >
              Next
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Field label="Name">
            <input
              className="appraiser-field w-full px-3 py-2 rounded-lg text-sm"
              style={fieldStyle}
              placeholder={defaultName}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Cost (EUR)" hint="Total paid including shipping if applicable">
            <input
              type="number"
              min={0}
              step="0.01"
              className="appraiser-field w-full px-3 py-2 rounded-lg text-sm"
              style={{ ...fieldStyle, fontFamily: "var(--font-mono)" }}
              value={cost}
              onChange={(e) => setCost(Number(e.target.value))}
            />
          </Field>
          <Field label="Notes">
            <textarea
              rows={3}
              className="appraiser-field w-full px-3 py-2 rounded-lg text-sm resize-none"
              style={fieldStyle}
              placeholder="Payment method, who it was bought from, etc."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
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
          <div className="flex justify-between pt-1">
            <button
              onClick={() => setStep("source")}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}
            >
              <ArrowLeft size={14} /> Back
            </button>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}
              >
                Cancel
              </button>
              <button
                disabled={submitting || cost < 0}
                onClick={submit}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: "var(--accent)",
                  color: "var(--accent-text)",
                  border: "1px solid var(--accent)",
                  opacity: submitting || cost < 0 ? 0.6 : 1,
                  cursor: submitting || cost < 0 ? "not-allowed" : "pointer",
                }}
              >
                {submitting ? "Creating…" : "Create investment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function monthYear(): string {
  return new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" });
}
