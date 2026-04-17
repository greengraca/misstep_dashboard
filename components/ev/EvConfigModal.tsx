"use client";

import { useState } from "react";
import Modal from "@/components/dashboard/modal";
import Select from "@/components/dashboard/select";
import EvSlotEditor from "./EvSlotEditor";
import type { EvConfig, EvBoosterConfig, EvSlotDefinition } from "@/lib/types";
import { Plus, Save } from "lucide-react";

const inputStyle = {
  background: "var(--bg-card)",
  borderColor: "var(--border)",
  color: "var(--text-primary)",
};

interface EvConfigModalProps {
  open: boolean;
  onClose: () => void;
  config: EvConfig;
  onSave: (config: EvConfig) => void;
  saving: boolean;
  boosterLabel?: string;
}

export default function EvConfigModal({ open, onClose, config, onSave, saving, boosterLabel }: EvConfigModalProps) {
  const [tab, setTab] = useState<"play" | "collector">("play");
  const [localConfig, setLocalConfig] = useState<EvConfig>(config);

  const boosterConfig = tab === "play" ? localConfig.play_booster : localConfig.collector_booster;

  function setBoosterConfig(updated: EvBoosterConfig | null) {
    if (tab === "play") {
      setLocalConfig({ ...localConfig, play_booster: updated });
    } else {
      setLocalConfig({ ...localConfig, collector_booster: updated });
    }
  }

  function updateSlot(idx: number, updated: EvSlotDefinition) {
    if (!boosterConfig) return;
    const slots = [...boosterConfig.slots];
    slots[idx] = updated;
    setBoosterConfig({ ...boosterConfig, slots });
  }

  function removeSlot(idx: number) {
    if (!boosterConfig) return;
    const slots = boosterConfig.slots.filter((_, i) => i !== idx);
    // Renumber
    slots.forEach((s, i) => (s.slot_number = i + 1));
    setBoosterConfig({ ...boosterConfig, slots });
  }

  function addSlot() {
    if (!boosterConfig) return;
    const nextNum = boosterConfig.slots.length + 1;
    setBoosterConfig({
      ...boosterConfig,
      slots: [
        ...boosterConfig.slots,
        { slot_number: nextNum, label: `Slot ${nextNum}`, is_foil: false, outcomes: [] },
      ],
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="EV Configuration" maxWidth="max-w-3xl">
      <div className="flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
        {/* Global settings */}
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>Sift Floor (&euro;)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={localConfig.sift_floor}
              onChange={(e) => setLocalConfig({ ...localConfig, sift_floor: parseFloat(e.target.value) || 0 })}
              className="rounded-lg border px-3 py-1.5 text-sm w-24 outline-none"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>Fee Rate (%)</label>
            <input
              type="number"
              step="0.5"
              min="0"
              max="100"
              value={localConfig.fee_rate * 100}
              onChange={(e) => setLocalConfig({ ...localConfig, fee_rate: (parseFloat(e.target.value) || 0) / 100 })}
              className="rounded-lg border px-3 py-1.5 text-sm w-24 outline-none"
              style={inputStyle}
            />
          </div>
        </div>

        {/* Booster type tabs */}
        <div className="flex flex-wrap items-center gap-2">
          {boosterLabel ? (
            <span
              className="text-sm font-medium px-3 py-1.5 rounded-lg"
              style={{
                background: "var(--surface-gradient)",
                border: "1px solid rgba(255, 255, 255, 0.10)",
                color: "var(--text-primary)",
              }}
            >
              {boosterLabel}
            </span>
          ) : (
            <Select
              value={tab}
              onChange={(v) => setTab(v as "play" | "collector")}
              options={[
                { value: "play", label: "Play Booster" },
                { value: "collector", label: "Collector Booster" },
              ]}
              size="sm"
            />
          )}
          {boosterConfig && (
            <div className="flex flex-wrap gap-3 sm:ml-auto text-xs" style={{ color: "var(--text-muted)" }}>
              <span>
                Packs/box:{" "}
                <input
                  type="number"
                  min="1"
                  value={boosterConfig.packs_per_box}
                  onChange={(e) => setBoosterConfig({ ...boosterConfig, packs_per_box: parseInt(e.target.value, 10) || 1 })}
                  className="rounded border px-1.5 py-0.5 w-14 outline-none text-xs"
                  style={inputStyle}
                />
              </span>
              <span>
                Cards/pack:{" "}
                <input
                  type="number"
                  min="1"
                  value={boosterConfig.cards_per_pack}
                  onChange={(e) => setBoosterConfig({ ...boosterConfig, cards_per_pack: parseInt(e.target.value, 10) || 1 })}
                  className="rounded border px-1.5 py-0.5 w-14 outline-none text-xs"
                  style={inputStyle}
                />
              </span>
            </div>
          )}
        </div>

        {/* Slot list */}
        {boosterConfig ? (
          <div className="flex flex-col gap-2">
            {boosterConfig.slots.map((slot, idx) => (
              <EvSlotEditor
                key={`${tab}-${slot.slot_number}`}
                slot={slot}
                onChange={(updated) => updateSlot(idx, updated)}
                onRemove={() => removeSlot(idx)}
              />
            ))}
            <button
              onClick={addSlot}
              className="flex items-center gap-1 text-sm px-3 py-2 rounded-lg hover:bg-[var(--bg-hover)] transition-colors self-start"
              style={{ color: "var(--accent)" }}
            >
              <Plus size={14} /> Add Slot
            </button>
          </div>
        ) : (
          <div className="text-center py-8 text-sm" style={{ color: "var(--text-muted)" }}>
            No {tab} booster configuration. Click Add Slot to start.
          </div>
        )}

        {/* Save button */}
        <div className="flex justify-end pt-2 border-t" style={{ borderColor: "var(--border)" }}>
          <button
            onClick={() => onSave(localConfig)}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              background: "var(--accent)",
              color: "#fff",
              opacity: saving ? 0.6 : 1,
            }}
          >
            <Save size={14} />
            {saving ? "Saving..." : "Save Configuration"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
