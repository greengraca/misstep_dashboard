"use client";

import { STOCK_CONDITIONS, type StockCondition } from "@/lib/stock-types";
import Select from "@/components/dashboard/select";
import SetCombobox from "./SetCombobox";
import type { SetMap } from "./StockTable";

export interface StockFilterState {
  name: string;
  set: string;
  condition: StockCondition | "";
  foil: "" | "true" | "false";
  signed: "" | "true" | "false";
  language: string;
  minPrice: string;
  maxPrice: string;
  minQty: string;
  minOverpricedPct: string;
  hasStock: boolean;
}

export const emptyStockFilters: StockFilterState = {
  name: "",
  set: "",
  condition: "",
  foil: "",
  signed: "",
  language: "",
  minPrice: "",
  maxPrice: "",
  minQty: "",
  minOverpricedPct: "",
  hasStock: true,
};

interface StockFiltersProps {
  value: StockFilterState;
  onChange: (next: StockFilterState) => void;
  onClear: () => void;
  setNames: string[];
  setMap?: SetMap;
  languages: string[];
}

const inputStyle: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--text-primary)",
  padding: "6px 10px",
  fontSize: 13,
  minWidth: 0,
  outline: "none",
};

const labelCol: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const labelText: React.CSSProperties = {
  fontSize: 10,
  color: "var(--text-muted)",
  fontFamily: "var(--font-mono)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

export default function StockFilters({
  value,
  onChange,
  onClear,
  setNames,
  setMap,
  languages,
}: StockFiltersProps) {
  const set = <K extends keyof StockFilterState>(key: K, v: StockFilterState[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <div
      style={{
        background: "var(--surface-gradient)",
        backdropFilter: "var(--surface-blur)",
        border: "var(--surface-border)",
        boxShadow: "var(--surface-shadow)",
        borderRadius: "var(--radius)",
        padding: 14,
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        gap: 10,
        alignItems: "end",
      }}
    >
      <label style={labelCol}>
        <span style={labelText}>Name</span>
        <input
          className="appraiser-field"
          style={inputStyle}
          value={value.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="card name"
        />
      </label>
      <label style={labelCol}>
        <span style={labelText}>Set</span>
        <SetCombobox
          value={value.set}
          onChange={(v) => set("set", v)}
          setMap={setMap}
          setNames={setNames}
        />
      </label>
      <label style={labelCol}>
        <span style={labelText}>Condition</span>
        <Select
          size="sm"
          value={value.condition}
          onChange={(v) => set("condition", v as StockCondition | "")}
          options={[
            { value: "", label: "All" },
            ...STOCK_CONDITIONS.map((c) => ({ value: c, label: c })),
          ]}
        />
      </label>
      <label style={labelCol}>
        <span style={labelText}>Foil</span>
        <Select
          size="sm"
          value={value.foil}
          onChange={(v) => set("foil", v as "" | "true" | "false")}
          options={[
            { value: "", label: "Any" },
            { value: "true", label: "Foil" },
            { value: "false", label: "Non-foil" },
          ]}
        />
      </label>
      <label style={labelCol}>
        <span style={labelText}>Signed</span>
        <Select
          size="sm"
          value={value.signed}
          onChange={(v) => set("signed", v as "" | "true" | "false")}
          options={[
            { value: "", label: "Any" },
            { value: "true", label: "Signed" },
            { value: "false", label: "Unsigned" },
          ]}
        />
      </label>
      <label style={labelCol}>
        <span style={labelText}>Language</span>
        <Select
          size="sm"
          value={value.language}
          onChange={(v) => set("language", v)}
          options={[
            { value: "", label: "All" },
            ...languages.map((l) => ({ value: l, label: l })),
          ]}
        />
      </label>
      <label style={labelCol}>
        <span style={labelText}>Min €</span>
        <input
          className="appraiser-field"
          style={inputStyle}
          type="number"
          step="0.01"
          min="0"
          value={value.minPrice}
          onChange={(e) => set("minPrice", e.target.value)}
        />
      </label>
      <label style={labelCol}>
        <span style={labelText}>Max €</span>
        <input
          className="appraiser-field"
          style={inputStyle}
          type="number"
          step="0.01"
          min="0"
          value={value.maxPrice}
          onChange={(e) => set("maxPrice", e.target.value)}
        />
      </label>
      <label style={labelCol}>
        <span style={labelText}>Min qty</span>
        <input
          className="appraiser-field"
          style={inputStyle}
          type="number"
          min="0"
          value={value.minQty}
          onChange={(e) => set("minQty", e.target.value)}
        />
      </label>
      <label style={labelCol} title="Only show listings priced at least this % above Scryfall trend">
        <span style={labelText}>Overpriced ≥ %</span>
        <input
          className="appraiser-field"
          style={inputStyle}
          type="number"
          step="1"
          value={value.minOverpricedPct}
          onChange={(e) => set("minOverpricedPct", e.target.value)}
          placeholder="e.g. 20"
        />
      </label>
      <label
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          color: "var(--text-secondary)",
          whiteSpace: "nowrap",
          height: 30,
        }}
      >
        <input
          type="checkbox"
          checked={value.hasStock}
          onChange={(e) => set("hasStock", e.target.checked)}
        />
        In stock only
      </label>
      <button
        type="button"
        onClick={onClear}
        className="transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 8,
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
