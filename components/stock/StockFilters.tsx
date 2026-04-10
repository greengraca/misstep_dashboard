"use client";

import { STOCK_CONDITIONS, type StockCondition } from "@/lib/stock";

export interface StockFilterState {
  name: string;
  set: string;
  condition: StockCondition | "";
  foil: "" | "true" | "false";
  language: string;
  minPrice: string;
  maxPrice: string;
  minQty: string;
}

export const emptyStockFilters: StockFilterState = {
  name: "",
  set: "",
  condition: "",
  foil: "",
  language: "",
  minPrice: "",
  maxPrice: "",
  minQty: "",
};

interface StockFiltersProps {
  value: StockFilterState;
  onChange: (next: StockFilterState) => void;
  onClear: () => void;
}

const inputStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: 6,
  color: "var(--text-primary)",
  padding: "6px 8px",
  fontSize: 13,
  minWidth: 0,
};

export default function StockFilters({ value, onChange, onClear }: StockFiltersProps) {
  const set = <K extends keyof StockFilterState>(key: K, v: StockFilterState[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <div
      style={{
        background: "var(--surface-gradient)",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 10,
        padding: 12,
        marginBottom: 16,
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        gap: 8,
        alignItems: "end",
      }}
    >
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Name</span>
        <input
          style={inputStyle}
          value={value.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="card name"
        />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Set</span>
        <input
          style={inputStyle}
          value={value.set}
          onChange={(e) => set("set", e.target.value)}
          placeholder="e.g. m10"
        />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Condition</span>
        <select
          style={inputStyle}
          value={value.condition}
          onChange={(e) => set("condition", e.target.value as StockCondition | "")}
        >
          <option value="">All</option>
          {STOCK_CONDITIONS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Foil</span>
        <select
          style={inputStyle}
          value={value.foil}
          onChange={(e) => set("foil", e.target.value as "" | "true" | "false")}
        >
          <option value="">Any</option>
          <option value="true">Foil</option>
          <option value="false">Non-foil</option>
        </select>
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Language</span>
        <input
          style={inputStyle}
          value={value.language}
          onChange={(e) => set("language", e.target.value)}
          placeholder="e.g. English"
        />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Min €</span>
        <input
          style={inputStyle}
          type="number"
          step="0.01"
          min="0"
          value={value.minPrice}
          onChange={(e) => set("minPrice", e.target.value)}
        />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Max €</span>
        <input
          style={inputStyle}
          type="number"
          step="0.01"
          min="0"
          value={value.maxPrice}
          onChange={(e) => set("maxPrice", e.target.value)}
        />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Min qty</span>
        <input
          style={inputStyle}
          type="number"
          min="0"
          value={value.minQty}
          onChange={(e) => set("minQty", e.target.value)}
        />
      </label>
      <button
        type="button"
        onClick={onClear}
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 6,
          color: "var(--text-secondary)",
          padding: "6px 12px",
          fontSize: 13,
          cursor: "pointer",
          height: 32,
        }}
      >
        Clear
      </button>
    </div>
  );
}
