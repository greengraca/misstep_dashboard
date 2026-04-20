"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import Select from "@/components/dashboard/select";
import type { AppraiserCollection } from "@/lib/appraiser/types";
import {
  card,
  sectionHeader,
  input,
  textarea as textareaStyle,
  btnPrimary,
  btnPrimaryHover,
  btnSecondary,
  btnSecondaryHover,
  btnDanger,
  btnDangerHover,
  hoverHandlers,
} from "./ui";

interface Props {
  collections: AppraiserCollection[];
  selectedId: string;
  onSelect: (id: string) => void;
  onChanged: () => void;
  onRefresh: () => void | Promise<void>;
}

function eur(n: number) {
  return n.toFixed(2).replace(".", ",") + " €";
}

export default function CollectionSelector({ collections, selectedId, onSelect, onChanged, onRefresh }: Props) {
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const current = collections.find((c) => c._id === selectedId);
  const [notes, setNotes] = useState(current?.notes ?? "");

  useEffect(() => {
    setNotes(current?.notes ?? "");
  }, [current?._id, current?.notes]);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

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

  const selectOptions = [
    { value: "", label: "-- Select collection --" },
    ...collections.map((c) => ({
      value: c._id,
      label: `${c.name} — ${c.cardCount} card${c.cardCount !== 1 ? "s" : ""} — From ${eur(c.totalFrom)} / Trend ${eur(c.totalTrend)}`,
    })),
  ];

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
      <h3 style={sectionHeader}>Collection</h3>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <Select
            value={selectedId}
            onChange={onSelect}
            options={selectOptions}
            placeholder="-- Select collection --"
          />
        </div>
        {selectedId && !renaming && (
          <>
            <button
              style={btnSecondary}
              {...hoverHandlers(btnSecondaryHover)}
              onClick={handleRefresh}
              disabled={refreshing}
            >
              {refreshing ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Loader2 size={14} style={{ animation: "appraiserSpin 0.9s linear infinite" }} />
                  Refreshing…
                </span>
              ) : "Refresh Prices"}
            </button>
            <button style={btnSecondary} {...hoverHandlers(btnSecondaryHover)} onClick={startRename}>
              Rename
            </button>
            <button style={btnDanger} {...hoverHandlers(btnDangerHover)} onClick={handleDelete}>
              Delete
            </button>
          </>
        )}
        {renaming && (
          <>
            <input
              className="appraiser-field"
              style={{ ...input, flex: 1, minWidth: 200 }}
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") saveRename(); if (e.key === "Escape") setRenaming(false); }}
              autoFocus
            />
            <button style={btnPrimary} {...hoverHandlers(btnPrimaryHover)} onClick={saveRename}>
              Save
            </button>
            <button style={btnSecondary} {...hoverHandlers(btnSecondaryHover)} onClick={() => setRenaming(false)}>
              Cancel
            </button>
          </>
        )}
      </div>

      {current && (
        <textarea
          className="appraiser-field"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          placeholder="Notes — asking price, seller, deadline…"
          style={{ ...textareaStyle, minHeight: 56 }}
        />
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
        <input
          className="appraiser-field"
          style={{ ...input, flex: 1 }}
          placeholder="New collection name…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
        />
        <button
          style={btnPrimary}
          {...hoverHandlers(btnPrimaryHover)}
          onClick={handleCreate}
          disabled={creating || !newName.trim()}
        >
          {creating ? "Creating…" : "New collection"}
        </button>
      </div>
    </div>
  );
}
