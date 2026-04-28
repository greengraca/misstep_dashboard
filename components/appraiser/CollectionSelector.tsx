"use client";

import { useState, useEffect } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import Select from "@/components/dashboard/select";
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
    </div>
  );
}
