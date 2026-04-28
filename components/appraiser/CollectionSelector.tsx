"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, TrendingUp } from "lucide-react";
import Select from "@/components/dashboard/select";
import Modal from "@/components/dashboard/modal";
import type { AppraiserCollection } from "@/lib/appraiser/types";
import {
  card,
  sectionHeader,
  btnBaseClass,
  btnSecondaryClass,
  btnPrimaryClass,
  btnDangerClass,
  btnSecondary,
  btnPrimary,
  btnDanger,
  inputClass,
  textareaClass,
  inputStyle,
} from "./ui";

function eur(n: number) {
  return n.toFixed(2).replace(".", ",") + " €";
}

interface Props {
  collections: AppraiserCollection[];
  selectedId: string;
  onSelect: (id: string) => void;
  onChanged: () => void;
  onAfterRefresh: () => void | Promise<void>;
}

type RefreshProgress = { processed: number; total: number } | null;

export default function CollectionSelector({ collections, selectedId, onSelect, onChanged, onAfterRefresh }: Props) {
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [progress, setProgress] = useState<RefreshProgress>(null);

  // "Convert to Investment" modal state
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertName, setConvertName] = useState("");
  const [convertCost, setConvertCost] = useState<string>("");
  const [convertNotes, setConvertNotes] = useState("");
  const [convertSubmitting, setConvertSubmitting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const router = useRouter();

  const current = collections.find((c) => c._id === selectedId);
  const [notes, setNotes] = useState(current?.notes ?? "");

  useEffect(() => {
    setNotes(current?.notes ?? "");
  }, [current?._id, current?.notes]);

  async function handleRefresh() {
    if (!selectedId || refreshing) return;
    setRefreshing(true);
    setProgress(null);
    try {
      const res = await fetch(`/api/appraiser/collections/${selectedId}/refresh`, { method: "POST" });
      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            if (typeof msg.total === "number" && typeof msg.processed === "number") {
              setProgress({ processed: msg.processed, total: msg.total });
            }
          } catch {
            // skip malformed lines
          }
        }
      }
      await onAfterRefresh();
    } finally {
      setRefreshing(false);
      setProgress(null);
    }
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await fetch("/api/appraiser/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Create failed");
      setNewName("");
      onChanged();
      if (data.collection?._id) onSelect(data.collection._id);
    } finally {
      setCreating(false);
    }
  }

  function startRename() {
    if (!current) return;
    setRenameName(current.name);
    setRenaming(true);
  }

  async function saveRename() {
    const n = renameName.trim();
    if (!n || !selectedId) return;
    await fetch(`/api/appraiser/collections/${selectedId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: n }),
    });
    setRenaming(false);
    onChanged();
  }

  async function saveNotes() {
    if (!selectedId || notes === (current?.notes ?? "")) return;
    await fetch(`/api/appraiser/collections/${selectedId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    });
    onChanged();
  }

  async function handleDelete() {
    if (!current) return;
    if (!confirm(`Delete "${current.name}" and all its cards?`)) return;
    await fetch(`/api/appraiser/collections/${selectedId}`, { method: "DELETE" });
    onSelect("");
    onChanged();
  }

  function openConvert() {
    if (!current) return;
    setConvertName(current.name);
    setConvertCost("");
    setConvertNotes("");
    setConvertError(null);
    setConvertOpen(true);
  }

  async function submitConvert() {
    if (!current || convertSubmitting) return;
    const cost = parseFloat(convertCost);
    if (!Number.isFinite(cost) || cost < 0) {
      setConvertError("Total cost must be a non-negative number");
      return;
    }
    setConvertSubmitting(true);
    setConvertError(null);
    try {
      const res = await fetch(`/api/appraiser/collections/${selectedId}/convert-to-investment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: convertName.trim() || current.name,
          cost_total_eur: cost,
          cost_notes: convertNotes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setConvertError(data.error || "Conversion failed");
        return;
      }
      setConvertOpen(false);
      router.push(`/investments/${data.investment._id}`);
    } catch (err) {
      setConvertError(err instanceof Error ? err.message : "Network error");
    } finally {
      setConvertSubmitting(false);
    }
  }

  const selectOptions = [
    { value: "", label: "-- Select collection --" },
    ...collections.map((c) => ({
      value: c._id,
      label: `${c.name} — ${c.cardCount} card${c.cardCount !== 1 ? "s" : ""}`,
    })),
  ];

  const refreshLabel = progress
    ? `${progress.processed}/${progress.total}`
    : refreshing
    ? "Refreshing…"
    : "Refresh Prices";

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
      <h3 style={sectionHeader}>Collection</h3>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <Select
            size="sm"
            value={selectedId}
            onChange={onSelect}
            options={selectOptions}
            placeholder="-- Select collection --"
          />
        </div>
        {selectedId && !renaming && (
          <>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className={btnSecondaryClass}
              style={btnSecondary}
            >
              <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
              {refreshLabel}
            </button>
            <button onClick={startRename} className={btnSecondaryClass} style={btnSecondary}>
              Rename
            </button>
            <button
              onClick={openConvert}
              className={btnPrimaryClass}
              style={btnPrimary}
              title="Turn this collection into an Investment with a Cardmarket provenance code"
            >
              <TrendingUp size={12} />
              Convert to Investment
            </button>
            <button onClick={handleDelete} className={btnDangerClass} style={btnDanger}>
              Delete
            </button>
          </>
        )}
        {renaming && (
          <>
            <input
              className={inputClass}
              style={{ ...inputStyle, flex: 1, minWidth: 200 }}
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") saveRename(); if (e.key === "Escape") setRenaming(false); }}
              autoFocus
            />
            <button onClick={saveRename} className={btnPrimaryClass} style={btnPrimary}>Save</button>
            <button onClick={() => setRenaming(false)} className={btnSecondaryClass} style={btnSecondary}>Cancel</button>
          </>
        )}
      </div>

      {current && (
        <textarea
          className={textareaClass}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          placeholder="Notes — asking price, seller, deadline…"
          style={{ ...inputStyle, minHeight: 48, resize: "vertical", width: "100%" }}
        />
      )}

      {!selectedId && (
        <div style={{ display: "flex", gap: 8 }}>
          <input
            className={inputClass}
            style={{ ...inputStyle, flex: 1 }}
            placeholder="New collection name…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
          />
          <button
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
            className={btnPrimaryClass}
            style={btnPrimary}
          >
            {creating ? "Creating…" : "New collection"}
          </button>
        </div>
      )}

      <Modal
        open={convertOpen}
        onClose={() => setConvertOpen(false)}
        title="Convert to Investment"
        maxWidth="max-w-md"
      >
        {current && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 13, color: "var(--text-secondary)" }}>
            <p style={{ margin: 0 }}>
              <strong style={{ color: "var(--text-primary)" }}>{current.name}</strong>{" "}
              <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                {current.cardCount} card{current.cardCount === 1 ? "" : "s"}
              </span>
            </p>
            <div style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "10px 12px",
              fontSize: 11,
              color: "var(--text-muted)",
              lineHeight: 1.5,
            }}>
              The investment gets a unique <code style={{ fontFamily: "var(--font-mono)" }}>MS-XXXX</code> code.
              Paste it into every Cardmarket listing&apos;s comment field — sales of those tagged listings
              attribute back here automatically. Cards without a Cardmarket ID are skipped (use the
              &quot;set ID&quot; button on those rows first).
              <br />
              <br />
              For reference: appraiser totals show{" "}
              <strong style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>From {eur(current.totalFrom)}</strong>{" "}
              /{" "}
              <strong style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>Trend {eur(current.totalTrend)}</strong>.
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "var(--font-mono)" }}>Name</span>
              <input
                className={inputClass}
                style={{ ...inputStyle, fontSize: 13 }}
                value={convertName}
                onChange={(e) => setConvertName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") setConvertOpen(false); }}
                placeholder={current.name}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "var(--font-mono)" }}>Total cost paid (€)</span>
              <input
                autoFocus
                className={inputClass}
                style={{ ...inputStyle, fontSize: 13, fontFamily: "var(--font-mono)" }}
                type="number"
                inputMode="decimal"
                step="0.01"
                min={0}
                value={convertCost}
                onChange={(e) => setConvertCost(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitConvert();
                  if (e.key === "Escape") setConvertOpen(false);
                }}
                placeholder="0.00"
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "var(--font-mono)" }}>Notes (optional)</span>
              <textarea
                className={textareaClass}
                style={{ ...inputStyle, fontSize: 13, minHeight: 60, resize: "vertical" }}
                value={convertNotes}
                onChange={(e) => setConvertNotes(e.target.value)}
                placeholder="Seller, payment method, deal details…"
              />
            </label>
            {convertError && (
              <div style={{ color: "var(--error)", fontSize: 12 }}>{convertError}</div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setConvertOpen(false)}
                className={btnSecondaryClass}
                style={btnSecondary}
                disabled={convertSubmitting}
              >
                Cancel
              </button>
              <button
                onClick={submitConvert}
                className={btnPrimaryClass}
                style={btnPrimary}
                disabled={convertSubmitting || !convertCost.trim()}
              >
                {convertSubmitting ? "Creating…" : "Create investment"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
