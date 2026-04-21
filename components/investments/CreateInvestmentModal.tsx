"use client";

import { useEffect, useState } from "react";
import { Boxes, Layers, ChevronDown, Sliders } from "lucide-react";
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
      type="button"
      className="flex flex-col items-start gap-3 p-4 rounded-xl text-left transition-all"
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
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Box fields
  const [setCode, setSetCode] = useState("");
  const [boosterType, setBoosterType] = useState<BoosterType>("play");
  const [boxCount, setBoxCount] = useState(1);
  const [packsPerBox, setPacksPerBox] = useState(DEFAULT_PACKS.play.packs);
  const [cardsPerPack, setCardsPerPack] = useState(DEFAULT_PACKS.play.cards);

  // Product fields
  const [productSlug, setProductSlug] = useState("");
  const [unitCount, setUnitCount] = useState(1);

  // Common fields
  const [cost, setCost] = useState(0);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Apply booster defaults on type change
  useEffect(() => {
    setPacksPerBox(DEFAULT_PACKS[boosterType].packs);
    setCardsPerPack(DEFAULT_PACKS[boosterType].cards);
  }, [boosterType]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setKind(null);
      setAdvancedOpen(false);
      setSetCode("");
      setBoosterType("play");
      setBoxCount(1);
      setProductSlug("");
      setUnitCount(1);
      setCost(0);
      setName("");
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

  const valid = sourceValid && cost >= 0 && Number.isFinite(cost);

  // Did the user override the booster defaults?
  const packsOverridden =
    kind === "box" &&
    (packsPerBox !== DEFAULT_PACKS[boosterType].packs ||
      cardsPerPack !== DEFAULT_PACKS[boosterType].cards);

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
    <Modal open={open} onClose={onClose} title="New Investment" maxWidth="max-w-xl">
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
            description="Commander precon, Planeswalker deck, Starter deck — known card list."
          />
        </div>

        {/* Box form */}
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

            <div className="grid grid-cols-3 gap-3">
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
              <Field label="Total cost (€)">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="appraiser-field w-full px-3 py-2 rounded-lg text-sm"
                  style={{ ...fieldStyle, fontFamily: "var(--font-mono)" }}
                  placeholder="0.00"
                  value={cost || ""}
                  onChange={(e) => setCost(Number(e.target.value))}
                />
              </Field>
            </div>

            {/* Advanced — pack/card override */}
            <div>
              <button
                type="button"
                onClick={() => setAdvancedOpen((x) => !x)}
                className="flex items-center gap-2 text-[11px] px-2 py-1 -ml-2 rounded transition-colors"
                style={{ color: "var(--text-muted)" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
              >
                <Sliders size={11} />
                <span>Advanced</span>
                <span style={{ color: packsOverridden ? "var(--accent)" : "var(--text-muted)" }}>
                  {packsOverridden
                    ? `${packsPerBox} packs × ${cardsPerPack} cards (override)`
                    : `${packsPerBox} packs × ${cardsPerPack} cards (${boosterType} default)`}
                </span>
                <ChevronDown
                  size={12}
                  className="transition-transform"
                  style={{ transform: advancedOpen ? "rotate(180deg)" : "rotate(0)" }}
                />
              </button>
              {advancedOpen && (
                <div
                  className="mt-2 p-3 rounded-lg grid grid-cols-2 gap-3 animate-[fadeIn_0.2s_ease]"
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
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
                  <div
                    className="col-span-2 text-[10px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Caps lot attribution at{" "}
                    <span style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                      {(packsPerBox * cardsPerPack * boxCount).toLocaleString()}
                    </span>{" "}
                    cards total. Override only if this product's box size differs from the{" "}
                    {boosterType} default.
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Product form */}
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
            <div className="grid grid-cols-2 gap-3">
              <Field label="Units">
                <input
                  type="number"
                  min={1}
                  className="appraiser-field w-full px-3 py-2 rounded-lg text-sm"
                  style={{ ...fieldStyle, fontFamily: "var(--font-mono)" }}
                  value={unitCount}
                  onChange={(e) => setUnitCount(Number(e.target.value))}
                />
              </Field>
              <Field label="Total cost (€)">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="appraiser-field w-full px-3 py-2 rounded-lg text-sm"
                  style={{ ...fieldStyle, fontFamily: "var(--font-mono)" }}
                  placeholder="0.00"
                  value={cost || ""}
                  onChange={(e) => setCost(Number(e.target.value))}
                />
              </Field>
            </div>
          </div>
        )}

        {/* Common: Name + Notes */}
        {kind && (
          <div className="flex flex-col gap-3 animate-[fadeIn_0.2s_ease]">
            <Field label="Name" hint="Leave blank to use the auto-generated name">
              <input
                className="appraiser-field w-full px-3 py-2 rounded-lg text-sm"
                style={fieldStyle}
                placeholder={defaultName}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field label="Notes">
              <textarea
                rows={2}
                className="appraiser-field w-full px-3 py-2 rounded-lg text-sm resize-none"
                style={fieldStyle}
                placeholder="Optional — payment method, seller, etc."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
          </div>
        )}

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

        {kind && (
          <div className="flex justify-end gap-2 pt-1 animate-[fadeIn_0.2s_ease]">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}
            >
              Cancel
            </button>
            <button
              disabled={!valid || submitting}
              onClick={submit}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                background: valid ? "var(--accent)" : "var(--bg-card)",
                color: valid ? "var(--accent-text)" : "var(--text-muted)",
                border: valid ? "1px solid var(--accent)" : "1px solid var(--border)",
                opacity: valid && !submitting ? 1 : 0.6,
                cursor: valid && !submitting ? "pointer" : "not-allowed",
              }}
            >
              {submitting ? "Creating…" : "Create investment"}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function monthYear(): string {
  return new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" });
}
