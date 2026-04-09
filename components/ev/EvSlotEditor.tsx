"use client";

import type { EvSlotDefinition, EvSlotOutcome } from "@/lib/types";
import { Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

const inputStyle = {
  background: "var(--bg-card)",
  borderColor: "var(--border)",
  color: "var(--text-primary)",
};

const RARITY_OPTIONS = ["common", "uncommon", "rare", "mythic", "special", "bonus"];
const TREATMENT_OPTIONS = ["normal", "borderless", "showcase", "extended_art", "textured", "serialized", "surge_foil", "galaxy_foil"];

interface EvSlotEditorProps {
  slot: EvSlotDefinition;
  onChange: (updated: EvSlotDefinition) => void;
  onRemove: () => void;
}

export default function EvSlotEditor({ slot, onChange, onRemove }: EvSlotEditorProps) {
  const [expanded, setExpanded] = useState(false);

  const probSum = slot.outcomes.reduce((s, o) => s + o.probability, 0);
  const isValid = slot.outcomes.length === 0 || Math.abs(probSum - 1) < 0.001;

  function updateOutcome(idx: number, updated: EvSlotOutcome) {
    const outcomes = [...slot.outcomes];
    outcomes[idx] = updated;
    onChange({ ...slot, outcomes });
  }

  function addOutcome() {
    onChange({
      ...slot,
      outcomes: [...slot.outcomes, { probability: 0, filter: {} }],
    });
  }

  function removeOutcome(idx: number) {
    const outcomes = slot.outcomes.filter((_, i) => i !== idx);
    onChange({ ...slot, outcomes });
  }

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        border: `1px solid ${isValid ? "var(--border)" : "rgba(239, 68, 68, 0.3)"}`,
        background: "rgba(255, 255, 255, 0.02)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
        style={{ background: "rgba(255, 255, 255, 0.03)" }}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="text-xs font-medium" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
          #{slot.slot_number}
        </span>
        <input
          type="text"
          value={slot.label}
          onChange={(e) => onChange({ ...slot, label: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          className="text-sm bg-transparent outline-none flex-1"
          style={{ color: "var(--text-primary)" }}
        />
        <label className="flex items-center gap-1 text-xs" style={{ color: "var(--text-muted)" }} onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={slot.is_foil}
            onChange={(e) => onChange({ ...slot, is_foil: e.target.checked })}
          />
          Foil
        </label>
        {!isValid && (
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(239, 68, 68, 0.15)", color: "#ef4444" }}>
            {probSum.toFixed(3)} != 1.0
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="p-1 rounded hover:bg-[var(--bg-hover)] transition-colors"
          style={{ color: "var(--text-muted)" }}
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Outcomes */}
      {expanded && (
        <div className="px-3 py-2 flex flex-col gap-2">
          {slot.outcomes.map((outcome, idx) => (
            <div key={idx} className="flex flex-wrap items-start gap-2 p-2 rounded" style={{ background: "rgba(255,255,255,0.02)" }}>
              <div>
                <label className="text-[10px] block" style={{ color: "var(--text-muted)" }}>Probability</label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  max="1"
                  value={outcome.probability}
                  onChange={(e) => updateOutcome(idx, { ...outcome, probability: parseFloat(e.target.value) || 0 })}
                  className="rounded border px-2 py-1 text-xs w-20 outline-none"
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="text-[10px] block" style={{ color: "var(--text-muted)" }}>Rarity (comma-sep)</label>
                <input
                  type="text"
                  value={outcome.filter.rarity?.join(", ") || ""}
                  onChange={(e) => {
                    const val = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                    updateOutcome(idx, { ...outcome, filter: { ...outcome.filter, rarity: val.length ? val : undefined } });
                  }}
                  placeholder={RARITY_OPTIONS.join(", ")}
                  className="rounded border px-2 py-1 text-xs w-36 outline-none"
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="text-[10px] block" style={{ color: "var(--text-muted)" }}>Treatment (comma-sep)</label>
                <input
                  type="text"
                  value={outcome.filter.treatment?.join(", ") || ""}
                  onChange={(e) => {
                    const val = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                    updateOutcome(idx, { ...outcome, filter: { ...outcome.filter, treatment: val.length ? val : undefined } });
                  }}
                  placeholder={TREATMENT_OPTIONS.join(", ")}
                  className="rounded border px-2 py-1 text-xs w-36 outline-none"
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="text-[10px] block" style={{ color: "var(--text-muted)" }}>Border Color</label>
                <input
                  type="text"
                  value={outcome.filter.border_color?.join(", ") || ""}
                  onChange={(e) => {
                    const val = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                    updateOutcome(idx, { ...outcome, filter: { ...outcome.filter, border_color: val.length ? val : undefined } });
                  }}
                  placeholder="black, borderless"
                  className="rounded border px-2 py-1 text-xs w-28 outline-none"
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="text-[10px] block" style={{ color: "var(--text-muted)" }}>Type Contains</label>
                <input
                  type="text"
                  value={outcome.filter.type_line_contains || ""}
                  onChange={(e) => updateOutcome(idx, { ...outcome, filter: { ...outcome.filter, type_line_contains: e.target.value || undefined } })}
                  placeholder="Basic Land"
                  className="rounded border px-2 py-1 text-xs w-28 outline-none"
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="text-[10px] block" style={{ color: "var(--text-muted)" }}>Promo Types</label>
                <input
                  type="text"
                  value={outcome.filter.promo_types?.join(", ") || ""}
                  onChange={(e) => {
                    const val = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                    updateOutcome(idx, { ...outcome, filter: { ...outcome.filter, promo_types: val.length ? val : undefined } });
                  }}
                  placeholder="spg, boosterfun"
                  className="rounded border px-2 py-1 text-xs w-28 outline-none"
                  style={inputStyle}
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => removeOutcome(idx)}
                  className="p-1 rounded hover:bg-[var(--bg-hover)] transition-colors"
                  style={{ color: "var(--text-muted)" }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
          <button
            onClick={addOutcome}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-[var(--bg-hover)] transition-colors self-start"
            style={{ color: "var(--accent)" }}
          >
            <Plus size={12} /> Add Outcome
          </button>
        </div>
      )}
    </div>
  );
}
