"use client";

import { useState, useEffect } from "react";
import type { AppraiserCollection } from "@/lib/appraiser/types";

interface Props {
  collections: AppraiserCollection[];
  selectedId: string;
  onSelect: (id: string) => void;
  onChanged: () => void;
  onRefresh: () => void;
}

function eur(n: number) {
  return n.toFixed(2).replace(".", ",") + " €";
}

export default function CollectionSelector({ collections, selectedId, onSelect, onChanged, onRefresh }: Props) {
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameName, setRenameName] = useState("");

  const current = collections.find((c) => c._id === selectedId);
  const [notes, setNotes] = useState(current?.notes ?? "");

  // Sync local notes when the selected collection changes
  useEffect(() => {
    setNotes(current?.notes ?? "");
  }, [current?._id, current?.notes]);

  const handleCreate = async () => {
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
  };

  const startRename = () => {
    if (!current) return;
    setRenameName(current.name);
    setRenaming(true);
  };

  const saveRename = async () => {
    const n = renameName.trim();
    if (!n || !selectedId) return;
    await fetch(`/api/appraiser/collections/${selectedId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: n }),
    });
    setRenaming(false);
    onChanged();
  };

  const saveNotes = async () => {
    if (!selectedId || notes === (current?.notes ?? "")) return;
    await fetch(`/api/appraiser/collections/${selectedId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    });
    onChanged();
  };

  const handleDelete = async () => {
    if (!current) return;
    if (!confirm(`Delete "${current.name}" and all its cards?`)) return;
    await fetch(`/api/appraiser/collections/${selectedId}`, { method: "DELETE" });
    onSelect("");
    onChanged();
  };

  const inputStyle = {
    flex: 1,
    padding: "8px 10px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    color: "var(--text-primary)",
    fontSize: 14,
    fontFamily: "inherit",
  } as const;
  const btnStyle = {
    padding: "8px 14px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    color: "var(--text-secondary)",
    fontSize: 13,
    cursor: "pointer",
  } as const;
  const btnPrimary = { ...btnStyle, background: "var(--accent)", color: "var(--bg)", border: "none" };
  const btnDanger = { ...btnStyle, color: "#f87171", borderColor: "rgba(248,113,113,0.3)" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 16, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <select value={selectedId} onChange={(e) => onSelect(e.target.value)} style={inputStyle}>
          <option value="">-- Select collection --</option>
          {collections.map((c) => (
            <option key={c._id} value={c._id}>
              {c.name} — {c.cardCount} card{c.cardCount !== 1 ? "s" : ""} — From {eur(c.totalFrom)} / Trend {eur(c.totalTrend)}
            </option>
          ))}
        </select>
        {selectedId && !renaming && (
          <>
            <button style={btnStyle} onClick={onRefresh}>Refresh Prices</button>
            <button style={btnStyle} onClick={startRename}>Rename</button>
            <button style={btnDanger} onClick={handleDelete}>Delete</button>
          </>
        )}
        {renaming && (
          <>
            <input style={inputStyle} value={renameName} onChange={(e) => setRenameName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") saveRename(); if (e.key === "Escape") setRenaming(false); }}
              autoFocus />
            <button style={btnPrimary} onClick={saveRename}>Save</button>
            <button style={btnStyle} onClick={() => setRenaming(false)}>Cancel</button>
          </>
        )}
      </div>

      {current && (
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          placeholder="Notes — asking price, seller, deadline…"
          style={{ ...inputStyle, minHeight: 48, resize: "vertical" }}
        />
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <input style={inputStyle} placeholder="New collection name…" value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }} />
        <button style={btnPrimary} onClick={handleCreate} disabled={creating || !newName.trim()}>
          {creating ? "Creating…" : "New collection"}
        </button>
      </div>
    </div>
  );
}
