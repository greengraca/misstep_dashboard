"use client";

import { useState, useRef, useCallback } from "react";
import { parseDelverCsv, DelverCsvError } from "@/lib/appraiser/delver-csv";
import type { AppraiserCard, CardInput } from "@/lib/appraiser/types";

interface Props {
  collectionId: string;
  onCardsAdded: (newCards: AppraiserCard[]) => void;
}

type Status = { msg: string; type: "success" | "error" | "info" } | null;

function parseTextLines(text: string): CardInput[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.map((line) => {
    // "4 MH3 332" or "MH3 332" or "mh3/332"
    const setNumMatch = line.match(/^(?:(\d+)\s+)?([a-zA-Z][a-zA-Z0-9]*)[\s/\-#]+([a-zA-Z0-9][\w\-]*)$/);
    if (setNumMatch && /\d/.test(setNumMatch[3])) {
      const [, qty, set, num] = setNumMatch;
      return { name: `${set} ${num}`, set: set.toLowerCase(), collectorNumber: num, qty: qty ? parseInt(qty, 10) : 1 };
    }
    // "4 Lightning Bolt"
    const qtyMatch = line.match(/^(\d+)\s+(.+)$/);
    if (qtyMatch) return { name: qtyMatch[2], qty: parseInt(qtyMatch[1], 10) };
    return { name: line, qty: 1 };
  });
}

export default function AppraiserInput({ collectionId, onCardsAdded }: Props) {
  const [text, setText] = useState("");
  const [adding, setAdding] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const postCards = useCallback(async (cards: CardInput[]) => {
    const res = await fetch(`/api/appraiser/collections/${collectionId}/cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cards }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Add failed");
    return data as { cards: AppraiserCard[]; mergedCardIds: string[]; errors: Array<{ error: string }> };
  }, [collectionId]);

  const handleAddText = async () => {
    const cards = parseTextLines(text);
    if (cards.length === 0) {
      setStatus({ msg: "Enter at least one card name", type: "error" });
      return;
    }
    setAdding(true);
    try {
      const data = await postCards(cards);
      const pieces: string[] = [];
      if (data.cards.length) pieces.push(`Added ${data.cards.length}`);
      if (data.mergedCardIds.length) pieces.push(`${data.mergedCardIds.length} merged`);
      if (data.errors.length) pieces.push(`${data.errors.length} failed`);
      setStatus({ msg: pieces.join(" • ") || "No changes", type: data.errors.length ? "info" : "success" });
      setText("");
      onCardsAdded(data.cards);
    } catch (err) {
      setStatus({ msg: (err as Error).message, type: "error" });
    } finally {
      setAdding(false);
      setTimeout(() => setStatus(null), 6000);
    }
  };

  const handleCsvFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) => /\.csv$/i.test(f.name) || f.type === "text/csv");
    if (arr.length === 0) {
      setStatus({ msg: "Drop a .csv file", type: "error" });
      return;
    }
    setAdding(true);
    try {
      const all: CardInput[] = [];
      for (const f of arr) {
        const txt = await f.text();
        try {
          all.push(...parseDelverCsv(txt));
        } catch (err) {
          if (err instanceof DelverCsvError) {
            setStatus({ msg: `${f.name}: ${err.message}`, type: "error" });
            return;
          }
          throw err;
        }
      }
      if (all.length === 0) {
        setStatus({ msg: "CSV contained no rows", type: "error" });
        return;
      }
      const data = await postCards(all);
      setStatus({
        msg: `CSV: added ${data.cards.length}${data.mergedCardIds.length ? `, ${data.mergedCardIds.length} merged` : ""}${data.errors.length ? `, ${data.errors.length} failed` : ""}`,
        type: data.errors.length ? "info" : "success",
      });
      onCardsAdded(data.cards);
    } catch (err) {
      setStatus({ msg: (err as Error).message, type: "error" });
    } finally {
      setAdding(false);
      setTimeout(() => setStatus(null), 6000);
    }
  }, [onCardsAdded, postCards]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    if (adding) return;
    if (e.dataTransfer.files.length) handleCsvFiles(e.dataTransfer.files);
  }, [adding, handleCsvFiles]);

  const inputStyle = {
    padding: "10px 12px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    color: "var(--text-primary)",
    fontSize: 14,
    fontFamily: "inherit",
    width: "100%",
    minHeight: 120,
    resize: "vertical" as const,
  };
  const btn = {
    padding: "8px 16px",
    background: "var(--accent)",
    color: "var(--bg)",
    border: "none",
    borderRadius: "var(--radius)",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 500,
  };
  const drop = {
    padding: 20,
    border: `2px dashed ${dragging ? "var(--accent)" : "var(--border)"}`,
    borderRadius: "var(--radius)",
    color: "var(--text-secondary)",
    textAlign: "center" as const,
    cursor: "pointer",
    background: dragging ? "rgba(255,255,255,0.04)" : "transparent",
    transition: "background 120ms, border-color 120ms",
  };
  const statusColors = { success: "#4ade80", error: "#f87171", info: "var(--text-secondary)" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
      <h3 style={{ margin: 0, fontSize: 14, color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>Add Cards</h3>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && text.trim()) { e.preventDefault(); handleAddText(); }
        }}
        placeholder={`One per line — name or set+number:\nLightning Bolt\n4 Counterspell\nMH3 332\nPLST LRW-256`}
        disabled={adding}
        style={inputStyle}
      />

      <div style={{ display: "flex", gap: 8 }}>
        <button style={btn} onClick={handleAddText} disabled={adding || !text.trim()}>
          {adding ? "Adding…" : "Add Cards"}
        </button>
      </div>

      <div
        style={drop}
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
        onClick={() => !adding && fileInputRef.current?.click()}
      >
        <input ref={fileInputRef} type="file" accept=".csv,text/csv" multiple
          onChange={(e) => { if (e.target.files) { handleCsvFiles(e.target.files); e.target.value = ""; } }}
          style={{ display: "none" }} />
        {dragging ? "Drop CSV" : adding ? "Parsing…" : "Drop a Delver Lens CSV or click to browse"}
      </div>

      {status && (
        <div style={{ fontSize: 13, color: statusColors[status.type] }}>{status.msg}</div>
      )}
    </div>
  );
}
