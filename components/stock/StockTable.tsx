"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import type { CmStockListing } from "@/lib/types";
import type { StockSortField } from "@/lib/stock-types";
import Select from "@/components/dashboard/select";
import CardHoverPreview from "./CardHoverPreview";

export interface SetMeta {
  code: string;
  name: string;
  iconSvgUri: string;
}

export type SetMap = Record<string, SetMeta>;

function SetCell({ setName, meta }: { setName: string; meta?: SetMeta }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {meta?.iconSvgUri && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={meta.iconSvgUri}
          alt={meta.name}
          width={14}
          height={14}
          style={{ filter: "invert(1)", flexShrink: 0 }}
        />
      )}
      <span>{setName}</span>
      {meta?.code && (
        <span
          style={{
            color: "var(--text-muted)",
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          · {meta.code}
        </span>
      )}
    </span>
  );
}

interface StockTableProps {
  rows: CmStockListing[];
  sort: StockSortField;
  dir: "asc" | "desc";
  onSortChange: (sort: StockSortField, dir: "asc" | "desc") => void;
  loading: boolean;
  error: string | null;
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  setMap?: SetMap;
}

interface Column {
  key: StockSortField;
  label: string;
  align?: "left" | "right";
  render: (row: CmStockListing, setMap?: SetMap) => React.ReactNode;
}

const columns: Column[] = [
  { key: "name", label: "Name", render: (r) => r.name },
  {
    key: "set",
    label: "Set",
    render: (r, setMap) => <SetCell setName={r.set} meta={setMap?.[r.set]} />,
  },
  { key: "condition", label: "Cond", render: (r) => r.condition },
  { key: "foil", label: "Foil", render: (r) => (r.foil ? "Yes" : "No") },
  { key: "language", label: "Lang", render: (r) => r.language },
  { key: "qty", label: "Qty", align: "right", render: (r) => r.qty },
  {
    key: "price",
    label: "Price",
    align: "right",
    render: (r) => `€${r.price.toFixed(2)}`,
  },
  {
    key: "lastSeenAt",
    label: "Last seen",
    render: (r) => (r.lastSeenAt ? new Date(r.lastSeenAt).toLocaleDateString() : "—"),
  },
];

const thStyle: React.CSSProperties = {
  textAlign: "left",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "var(--text-muted)",
  padding: 0, // padding moved to inner <button> so the full cell is clickable
  borderBottom: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.03)",
  userSelect: "none",
  whiteSpace: "nowrap",
};

const sortButtonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  width: "100%",
  padding: "10px 12px",
  background: "transparent",
  border: "none",
  color: "inherit",
  font: "inherit",
  textTransform: "inherit",
  letterSpacing: "inherit",
  cursor: "pointer",
  textAlign: "left",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 13,
  color: "var(--text-primary)",
  borderBottom: "1px solid rgba(255,255,255,0.05)",
};

export default function StockTable({
  rows,
  sort,
  dir,
  onSortChange,
  loading,
  error,
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  setMap,
}: StockTableProps) {
  const toggleSort = (key: StockSortField) => {
    if (sort === key) {
      onSortChange(key, dir === "asc" ? "desc" : "asc");
    } else {
      onSortChange(key, "desc");
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div
      style={{
        background: "var(--surface-gradient)",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, padding: "10px 12px", width: 40 }} />
              {columns.map((col) => {
                const isActive = sort === col.key;
                const align = col.align || "left";
                return (
                  <th
                    key={col.key}
                    style={{ ...thStyle, textAlign: align }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      aria-sort={
                        isActive ? (dir === "asc" ? "ascending" : "descending") : "none"
                      }
                      style={{
                        ...sortButtonStyle,
                        justifyContent: align === "right" ? "flex-end" : "flex-start",
                        textAlign: align,
                        color: isActive ? "var(--text-primary)" : "inherit",
                      }}
                    >
                      <span>{col.label}</span>
                      {isActive &&
                        (dir === "asc" ? (
                          <ChevronUp size={12} />
                        ) : (
                          <ChevronDown size={12} />
                        ))}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              <tr>
                <td style={tdStyle} colSpan={columns.length + 1}>
                  Loading…
                </td>
              </tr>
            )}
            {error && (
              <tr>
                <td
                  style={{ ...tdStyle, color: "var(--danger, #f87171)" }}
                  colSpan={columns.length + 1}
                >
                  {error}
                </td>
              </tr>
            )}
            {!loading && !error && rows.length === 0 && (
              <tr>
                <td style={tdStyle} colSpan={columns.length + 1}>
                  No stock matches these filters.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.dedupKey}>
                <td style={{ ...tdStyle, width: 40 }}>
                  <CardHoverPreview name={row.name} set={row.set} />
                </td>
                {columns.map((col) => (
                  <td
                    key={col.key}
                    style={{ ...tdStyle, textAlign: col.align || "left" }}
                  >
                    {col.render(row, setMap)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 12px",
          borderTop: "1px solid rgba(255,255,255,0.10)",
          fontSize: 12,
          color: "var(--text-muted)",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <span>
          Page {page} of {totalPages} · {total} results
        </span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            Page size
            <Select
              size="sm"
              value={String(pageSize)}
              onChange={(v) => onPageSizeChange(Number(v))}
              options={[25, 50, 100, 200].map((n) => ({
                value: String(n),
                label: String(n),
              }))}
            />
          </label>
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 6,
              color: "var(--text-primary)",
              padding: "4px 10px",
              fontSize: 12,
              cursor: page <= 1 ? "not-allowed" : "pointer",
              opacity: page <= 1 ? 0.5 : 1,
            }}
          >
            Prev
          </button>
          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 6,
              color: "var(--text-primary)",
              padding: "4px 10px",
              fontSize: 12,
              cursor: page >= totalPages ? "not-allowed" : "pointer",
              opacity: page >= totalPages ? 0.5 : 1,
            }}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
