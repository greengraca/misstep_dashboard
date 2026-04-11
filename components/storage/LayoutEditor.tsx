"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from "lucide-react";
import type { ShelfLayout } from "./types";
import type { BoxConfig, BoxType, ShelfRowConfig } from "@/lib/storage";

interface LayoutEditorProps {
  layout: ShelfLayout;
  onSave: (layout: ShelfLayout) => Promise<void>;
}

const BOX_TYPES: BoxType[] = ["1k", "2k", "4k"];

export default function LayoutEditor({ layout, onSave }: LayoutEditorProps) {
  const [local, setLocal] = useState<ShelfLayout>(layout);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setLocal(layout);
  }, [layout]);

  const addShelfRow = () => {
    setLocal({
      shelfRows: [
        ...local.shelfRows,
        { id: "", label: `Row ${local.shelfRows.length + 1}`, boxes: [] },
      ],
    });
  };

  const removeShelfRow = (idx: number) => {
    setLocal({ shelfRows: local.shelfRows.filter((_, i) => i !== idx) });
  };

  const moveShelfRow = (idx: number, delta: number) => {
    const next = [...local.shelfRows];
    const target = idx + delta;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setLocal({ shelfRows: next });
  };

  const updateRowLabel = (idx: number, label: string) => {
    const next = [...local.shelfRows];
    next[idx] = { ...next[idx], label };
    setLocal({ shelfRows: next });
  };

  const addBox = (rowIdx: number) => {
    const next = [...local.shelfRows];
    next[rowIdx] = {
      ...next[rowIdx],
      boxes: [...next[rowIdx].boxes, { id: "", type: "4k" as BoxType }],
    };
    setLocal({ shelfRows: next });
  };

  const removeBox = (rowIdx: number, boxIdx: number) => {
    const next = [...local.shelfRows];
    next[rowIdx] = {
      ...next[rowIdx],
      boxes: next[rowIdx].boxes.filter((_, i) => i !== boxIdx),
    };
    setLocal({ shelfRows: next });
  };

  const updateBoxType = (rowIdx: number, boxIdx: number, type: BoxType) => {
    const next = [...local.shelfRows];
    const boxes = [...next[rowIdx].boxes];
    boxes[boxIdx] = { ...boxes[boxIdx], type };
    next[rowIdx] = { ...next[rowIdx], boxes };
    setLocal({ shelfRows: next });
  };

  const moveBox = (rowIdx: number, boxIdx: number, delta: number) => {
    const next = [...local.shelfRows];
    const boxes = [...next[rowIdx].boxes];
    const target = boxIdx + delta;
    if (target < 0 || target >= boxes.length) return;
    [boxes[boxIdx], boxes[target]] = [boxes[target], boxes[boxIdx]];
    next[rowIdx] = { ...next[rowIdx], boxes };
    setLocal({ shelfRows: next });
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await onSave(local);
      setMessage("Layout saved. Press Rebuild to regenerate slots.");
    } catch (err) {
      setMessage(`Save failed: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-[var(--radius)] bg-[var(--card-bg)] border border-[var(--border)] p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Layout</h2>
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius)] bg-[var(--accent)] text-white text-sm hover:opacity-90 disabled:opacity-50"
        >
          <Save size={14} />
          {saving ? "Saving…" : "Save layout"}
        </button>
      </div>

      {message && (
        <div className="mb-3 text-xs text-[var(--text-muted)]" aria-live="polite">
          {message}
        </div>
      )}

      <div className="space-y-3">
        {local.shelfRows.map((row, rowIdx) => (
          <ShelfRowEditor
            key={rowIdx}
            row={row}
            onLabelChange={(v) => updateRowLabel(rowIdx, v)}
            onRemove={() => removeShelfRow(rowIdx)}
            onMoveUp={() => moveShelfRow(rowIdx, -1)}
            onMoveDown={() => moveShelfRow(rowIdx, 1)}
            onAddBox={() => addBox(rowIdx)}
            onRemoveBox={(boxIdx) => removeBox(rowIdx, boxIdx)}
            onBoxTypeChange={(boxIdx, type) => updateBoxType(rowIdx, boxIdx, type)}
            onMoveBoxUp={(boxIdx) => moveBox(rowIdx, boxIdx, -1)}
            onMoveBoxDown={(boxIdx) => moveBox(rowIdx, boxIdx, 1)}
          />
        ))}

        <button
          onClick={addShelfRow}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-[var(--radius)] border border-dashed border-[var(--border)] text-[var(--text-muted)] text-sm hover:text-[var(--text-primary)] hover:border-[var(--accent)]"
        >
          <Plus size={14} /> Add shelf row
        </button>
      </div>
    </div>
  );
}

interface ShelfRowEditorProps {
  row: ShelfRowConfig;
  onLabelChange: (v: string) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onAddBox: () => void;
  onRemoveBox: (boxIdx: number) => void;
  onBoxTypeChange: (boxIdx: number, type: BoxType) => void;
  onMoveBoxUp: (boxIdx: number) => void;
  onMoveBoxDown: (boxIdx: number) => void;
}

function ShelfRowEditor(props: ShelfRowEditorProps) {
  const { row, onLabelChange, onRemove, onMoveUp, onMoveDown, onAddBox, onRemoveBox, onBoxTypeChange, onMoveBoxUp, onMoveBoxDown } = props;

  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] p-3">
      <div className="flex items-center gap-2 mb-2">
        <input
          type="text"
          value={row.label}
          onChange={(e) => onLabelChange(e.target.value)}
          className="flex-1 bg-transparent text-sm font-medium text-[var(--text-primary)] border-b border-transparent focus:border-[var(--accent)] outline-none"
        />
        <button onClick={onMoveUp} className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
          <ArrowUp size={14} />
        </button>
        <button onClick={onMoveDown} className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
          <ArrowDown size={14} />
        </button>
        <button onClick={onRemove} className="p-1 text-[var(--text-muted)] hover:text-red-500">
          <Trash2 size={14} />
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {row.boxes.map((box, boxIdx) => (
          <BoxEditor
            key={boxIdx}
            box={box}
            onTypeChange={(type) => onBoxTypeChange(boxIdx, type)}
            onRemove={() => onRemoveBox(boxIdx)}
            onMoveUp={() => onMoveBoxUp(boxIdx)}
            onMoveDown={() => onMoveBoxDown(boxIdx)}
          />
        ))}
        <button
          onClick={onAddBox}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-[var(--radius)] border border-dashed border-[var(--border)] text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--accent)]"
        >
          <Plus size={12} /> box
        </button>
      </div>
    </div>
  );
}

interface BoxEditorProps {
  box: BoxConfig;
  onTypeChange: (type: BoxType) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function BoxEditor({ box, onTypeChange, onRemove, onMoveUp, onMoveDown }: BoxEditorProps) {
  return (
    <div className="inline-flex items-center gap-1 px-2 py-1 rounded-[var(--radius)] bg-[var(--bg)] border border-[var(--border)] text-xs">
      <select
        value={box.type}
        onChange={(e) => onTypeChange(e.target.value as BoxType)}
        className="bg-transparent text-[var(--text-primary)] outline-none"
      >
        {BOX_TYPES.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
      <button onClick={onMoveUp} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
        <ArrowUp size={10} />
      </button>
      <button onClick={onMoveDown} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
        <ArrowDown size={10} />
      </button>
      <button onClick={onRemove} className="text-[var(--text-muted)] hover:text-red-500">
        <Trash2 size={10} />
      </button>
    </div>
  );
}
