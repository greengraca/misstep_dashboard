"use client";

import { ChevronDown, ChevronUp, MessageSquare, PenLine } from "lucide-react";
import type { StockListingWithTrend, StockSortField } from "@/lib/stock-types";
import Select from "@/components/dashboard/select";
import CardHoverPreview from "./CardHoverPreview";
import { FoilStar, LanguageFlag } from "@/components/dashboard/cm-sprite";
import { buildCardmarketUrl } from "@/lib/cardmarket-url";

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
  rows: StockListingWithTrend[];
  sort: StockSortField;
  dir: "asc" | "desc";
  onSortChange: (sort: StockSortField, dir: "asc" | "desc") => void;
  loading: boolean;
  error: string | null;
  total: number;
  totalQty?: number | null;
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
  render: (row: StockListingWithTrend, setMap?: SetMap) => React.ReactNode;
}

function CardmarketLink({ row }: { row: StockListingWithTrend }) {
  // When the extension has captured productId (v1.7.1+), deep-link to the
  // exact printing via idProduct=…. Older rows without productId fall through
  // to the set+name slug builder.
  const href = buildCardmarketUrl(row.set, row.name, row.foil, row.productId) ?? "#";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="transition-colors no-underline hover:underline hover:text-[var(--accent)]"
        style={{ color: "var(--text-primary)" }}
        title="Open on Cardmarket"
      >
        {row.name}
      </a>
      {row.signed && (
        <span
          title={row.comment || "Signed"}
          style={{ display: "inline-flex", color: "var(--accent)" }}
          aria-label={row.comment || "Signed"}
        >
          <PenLine size={12} />
        </span>
      )}
      {!row.signed && row.comment && (
        <span
          title={row.comment}
          style={{ display: "inline-flex", color: "var(--text-muted)" }}
          aria-label={row.comment}
        >
          <MessageSquare size={12} />
        </span>
      )}
    </span>
  );
}

function OverpricedCell({ pct }: { pct: number | null }) {
  if (pct == null) return <span style={{ color: "var(--text-muted)" }}>—</span>;
  const color =
    pct >= 0.2
      ? "var(--danger, #f87171)"
      : pct <= -0.2
        ? "var(--success, #4ade80)"
        : "var(--text-secondary)";
  const sign = pct > 0 ? "+" : "";
  return <span style={{ color }}>{`${sign}${(pct * 100).toFixed(0)}%`}</span>;
}

const columns: Column[] = [
  { key: "name", label: "Name", render: (r) => <CardmarketLink row={r} /> },
  {
    key: "set",
    label: "Set",
    render: (r, setMap) => <SetCell setName={r.set} meta={setMap?.[r.set]} />,
  },
  { key: "condition", label: "Cond", render: (r) => r.condition },
  {
    key: "foil",
    label: "Foil",
    align: "left",
    render: (r) =>
      r.foil ? (
        <FoilStar size={16} />
      ) : (
        <span style={{ color: "var(--text-muted)" }}>—</span>
      ),
  },
  {
    key: "language",
    label: "Lang",
    render: (r) => <LanguageFlag language={r.language} size={16} />,
  },
  { key: "qty", label: "Qty", align: "right", render: (r) => r.qty },
  {
    key: "price",
    label: "Price",
    align: "right",
    render: (r) => `€${r.price.toFixed(2)}`,
  },
  {
    // Not independently sortable — clicking falls back to overpriced_pct so
    // the user gets a useful "sort by how off-trend this row is" experience.
    key: "overpriced_pct",
    label: "Trend",
    align: "right",
    render: (r) => {
      if (r.trend_eur == null) {
        if (r.trend_ambiguous) {
          return (
            <span
              style={{ color: "var(--text-muted)", cursor: "help" }}
              title="Multiple art variants — visit this card in Cardmarket with the extension to identify which one you have."
            >
              ?
            </span>
          );
        }
        return <span style={{ color: "var(--text-muted)" }}>—</span>;
      }
      const src = r.trend_source === "cm_ext" ? "ext" : "scryfall";
      const when = r.trend_updated_at
        ? new Date(r.trend_updated_at).toLocaleDateString()
        : "?";
      const ascSuffix = r.trend_ascending ? " · from > trend (rising / thin supply)" : "";
      return (
        <span title={`${src} · ${when}${ascSuffix}`}>
          €{r.trend_eur.toFixed(2)}
          {r.trend_source === "cm_ext" && (
            <span
              style={{
                marginLeft: 4,
                fontSize: r.trend_ascending ? 10 : 9,
                color: "var(--accent)",
                verticalAlign: "top",
              }}
            >
              {r.trend_ascending ? "↑" : "•"}
            </span>
          )}
        </span>
      );
    },
  },
  {
    key: "overpriced_pct",
    label: "Δ vs trend",
    align: "right",
    render: (r) => <OverpricedCell pct={r.overpriced_pct} />,
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
  totalQty,
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
                    key={col.label}
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
                    key={col.label}
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
          Page {page} of {totalPages} · {total.toLocaleString()} listing{total === 1 ? "" : "s"}
          {typeof totalQty === "number" && totalQty > 0 && (
            <>
              {" · "}
              <span style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                {totalQty.toLocaleString()}
              </span>{" "}
              card{totalQty === 1 ? "" : "s"}
            </>
          )}
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
