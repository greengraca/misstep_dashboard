"use client";

import { useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";

export interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  sortValue?: (row: T) => string | number;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyField: string;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  rowHover?: boolean;
  defaultSortKey?: string | null;
  defaultSortDir?: "asc" | "desc";
  renderMobileCard?: (row: T) => React.ReactNode;
  bare?: boolean;
}

export default function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  keyField,
  emptyMessage = "No data",
  onRowClick,
  rowHover,
  defaultSortKey = null,
  defaultSortDir = "asc",
  renderMobileCard,
  bare,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(defaultSortKey);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(defaultSortDir);

  const sorted = sortKey
    ? [...data].sort((a, b) => {
        const col = columns.find((c) => c.key === sortKey);
        const aVal = col?.sortValue ? col.sortValue(a) : a[sortKey];
        const bVal = col?.sortValue ? col.sortValue(b) : b[sortKey];
        if (aVal == null || bVal == null) return 0;
        const cmp =
          typeof aVal === "number" && typeof bVal === "number"
            ? aVal - bVal
            : String(aVal).localeCompare(String(bVal));
        return sortDir === "asc" ? cmp : -cmp;
      })
    : data;

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir((prev) => prev === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  if (data.length === 0) {
    return (
      <div
        className="text-center py-12 text-sm"
        style={{ color: "var(--text-muted)" }}
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <>
      {/* Mobile card view */}
      {renderMobileCard && (
        <div className="sm:hidden">
          {sorted.map((row) => (
            <div
              key={String(row[keyField])}
              className={`mobile-card ${onRowClick ? "cursor-pointer active:bg-[var(--bg-hover)]" : ""}`}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {renderMobileCard(row)}
            </div>
          ))}
        </div>
      )}

      {/* Desktop table view */}
      <div
        className={`overflow-hidden ${bare ? "" : "rounded-[var(--radius)]"} ${renderMobileCard ? "hidden sm:block" : ""}`}
        style={{
          background: "rgba(255, 255, 255, 0.015)",
          border: bare ? undefined : "1px solid var(--border)",
        }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`px-4 py-3 text-left ${
                      col.sortable ? "cursor-pointer select-none" : ""
                    } ${col.className || ""}`}
                    style={{
                      color: "var(--text-muted)",
                      fontFamily: "var(--font-mono)",
                      fontSize: "11px",
                      fontWeight: 600,
                      textTransform: "uppercase" as const,
                      letterSpacing: "0.05em",
                    }}
                    onClick={col.sortable ? () => handleSort(col.key) : undefined}
                  >
                    <div className={`flex items-center gap-1 ${
                      col.className?.includes("text-center") ? "justify-center" :
                      col.className?.includes("text-right") ? "justify-end" : ""
                    }`}>
                      {col.label}
                      {col.sortable && sortKey === col.key && (
                        sortDir === "asc" ? (
                          <ChevronUp className="w-3 h-3" />
                        ) : (
                          <ChevronDown className="w-3 h-3" />
                        )
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, rowIndex) => (
                <tr
                  key={String(row[keyField])}
                  className={`transition-colors ${
                    onRowClick
                      ? "cursor-pointer hover:bg-[var(--bg-hover)]"
                      : rowHover
                        ? "hover:bg-[var(--bg-hover)]"
                        : ""
                  }`}
                  style={{
                    borderBottom:
                      rowIndex < sorted.length - 1
                        ? "1px solid var(--border-subtle)"
                        : "none",
                    contentVisibility: "auto",
                    containIntrinsicSize: "0 45px",
                  }}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-3 ${col.className || ""}`}
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {col.render
                        ? col.render(row)
                        : String(row[col.key] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
