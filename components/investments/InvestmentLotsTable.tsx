"use client";

import useSWR from "swr";
import { useEffect, useMemo, useState } from "react";
import { Search, BookOpen, ChevronUp, ChevronDown } from "lucide-react";
import { fetcher } from "@/lib/fetcher";
import { FoilStar } from "@/components/dashboard/cm-sprite";
import { Panel, H2 } from "@/components/dashboard/page-shell";
import { StatusPill } from "@/components/dashboard/status-pill";
import { Pagination } from "@/components/dashboard/pagination";
import Select from "@/components/dashboard/select";
import { buildCardmarketUrl } from "@/lib/cardmarket-url";

type SortField =
  | "name"
  | "qty_opened"
  | "qty_sold"
  | "qty_remaining"
  | "cost_basis_per_unit"
  | "live_price_eur"
  | "rem_value_eur"
  | "proceeds_eur";
type SortDir = "asc" | "desc";

type Lot = {
  id: string;
  cardmarket_id: number;
  foil: boolean;
  condition: string;
  language: string;
  name: string | null;
  set_code: string | null;
  set_name: string | null;
  qty_opened: number;
  qty_sold: number;
  qty_remaining: number;
  cost_basis_per_unit: number | null;
  proceeds_eur: number;
  live_price_eur: number | null;
};

type LotResponse = {
  rows: Lot[];
  total: number;
  totals: {
    qty_opened: number;
    qty_sold: number;
    qty_remaining: number;
    live_value_eur: number;
    proceeds_eur: number;
  };
  page: number;
  pageSize: number;
};

const CONDITION_COLORS: Record<string, string> = {
  MT: "#4caf50",
  NM: "#4caf50",
  EX: "#8bc34a",
  GD: "#ffc107",
  LP: "#ff9800",
  PL: "#f44336",
  PO: "#f44336",
};

function SortHeader({
  label,
  field,
  sort,
  dir,
  onClick,
  align,
}: {
  label: string;
  field: SortField;
  sort: SortField;
  dir: SortDir;
  onClick: (f: SortField) => void;
  align: "left" | "right";
}) {
  const active = sort === field;
  return (
    <th
      className="py-2 font-medium"
      style={{ textAlign: align }}
    >
      <button
        type="button"
        onClick={() => onClick(field)}
        aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
        className="inline-flex items-center gap-1 transition-colors"
        style={{
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: "pointer",
          color: active ? "var(--text-primary)" : "inherit",
          fontSize: "inherit",
          fontWeight: "inherit",
          flexDirection: align === "right" ? "row-reverse" : "row",
        }}
      >
        <span>{label}</span>
        {active && (dir === "asc" ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
      </button>
    </th>
  );
}

function ConditionBadge({ condition }: { condition: string }) {
  const color = CONDITION_COLORS[condition] || "var(--text-muted)";
  return (
    <span
      className="px-1 py-0.5 rounded text-[9px] font-medium"
      style={{ background: `${color}22`, color }}
    >
      {condition}
    </span>
  );
}

const formatEur = (n: number | null | undefined) =>
  n != null ? `${n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : "—";

const formatInt = (n: number) => n.toLocaleString("en-US");

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

function lotCardmarketUrl(lot: Lot): string {
  // Prefer the slug-based URL when we have a set name (resolves directly
  // to the right printing's CM page). Falls back to `Products?idProduct=`
  // — Cardmarket's own product router — when the set is unknown. The
  // *broken* form is `Singles?idProduct=`, which dumps you on the genre
  // index page; never produce that.
  return (
    buildCardmarketUrl(lot.set_name ?? undefined, lot.name ?? "", lot.foil, lot.cardmarket_id) ??
    `https://www.cardmarket.com/en/Magic/Products?idProduct=${lot.cardmarket_id}${lot.foil ? "&isFoil=Y" : ""}`
  );
}

export default function InvestmentLotsTable({ investmentId }: { investmentId: string }) {
  const [search, setSearch] = useState("");
  const [foil, setFoil] = useState<"all" | "foil" | "nonfoil">("all");
  const [minRemaining, setMinRemaining] = useState<number | "">("");
  const [sort, setSort] = useState<SortField>("qty_remaining");
  const [dir, setDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const debouncedSearch = useDebounced(search, 250);
  const debouncedMinRemaining = useDebounced(minRemaining, 250);

  // Reset to page 1 whenever any filter changes (sort changes can stay
  // on the current page — same set, different order).
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, foil, debouncedMinRemaining]);

  const toggleSort = (key: SortField) => {
    if (sort === key) {
      setDir(dir === "asc" ? "desc" : "asc");
    } else {
      setSort(key);
      // Numeric columns default to desc (biggest first), name to asc (A→Z).
      setDir(key === "name" ? "asc" : "desc");
    }
  };

  const qs = useMemo(() => {
    const sp = new URLSearchParams();
    if (debouncedSearch) sp.set("search", debouncedSearch);
    if (foil === "foil") sp.set("foil", "true");
    if (foil === "nonfoil") sp.set("foil", "false");
    if (typeof debouncedMinRemaining === "number" && debouncedMinRemaining > 0) {
      sp.set("minRemaining", String(debouncedMinRemaining));
    }
    sp.set("sort", sort);
    sp.set("dir", dir);
    sp.set("page", String(page));
    sp.set("pageSize", String(pageSize));
    return sp.toString();
  }, [debouncedSearch, foil, debouncedMinRemaining, sort, dir, page, pageSize]);

  const { data, isLoading } = useSWR<LotResponse>(
    `/api/investments/${investmentId}/lots?${qs}`,
    fetcher,
    { dedupingInterval: 10_000, keepPreviousData: true }
  );
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totals = data?.totals ?? {
    qty_opened: 0,
    qty_sold: 0,
    qty_remaining: 0,
    live_value_eur: 0,
    proceeds_eur: 0,
  };

  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <H2 icon={<BookOpen size={16} />}>Lot ledger</H2>
          {total > 0 && (
            <StatusPill tone="accent">{formatInt(total)}</StatusPill>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div
            className="relative flex items-center"
            style={{ border: "1px solid var(--border)", borderRadius: "8px", background: "var(--bg-card)" }}
          >
            <Search
              size={12}
              style={{ color: "var(--text-muted)", position: "absolute", left: 8 }}
            />
            <input
              placeholder="Search name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="appraiser-field bg-transparent text-xs py-1.5 pl-7 pr-2 w-40 outline-none"
              style={{ color: "var(--text-primary)" }}
            />
          </div>
          <div
            className="flex rounded-lg overflow-hidden text-[11px]"
            style={{ border: "1px solid var(--border)" }}
          >
            {(["all", "nonfoil", "foil"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setFoil(v)}
                className="px-2.5 py-1 font-medium transition-all"
                style={{
                  background: foil === v ? "var(--accent)" : "transparent",
                  color: foil === v ? "var(--accent-text)" : "var(--text-muted)",
                }}
              >
                {v === "all" ? "All" : v === "foil" ? "Foil" : "Non-foil"}
              </button>
            ))}
          </div>
          <input
            type="number"
            min={0}
            placeholder="Min rem."
            value={minRemaining}
            onChange={(e) => {
              const v = e.target.value;
              setMinRemaining(v === "" ? "" : Number(v));
            }}
            className="appraiser-field text-xs py-1.5 px-2 rounded-lg w-20"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
              fontFamily: "var(--font-mono)",
            }}
          />
        </div>
      </div>

      {isLoading && rows.length === 0 ? (
        <p className="text-xs py-6 text-center" style={{ color: "var(--text-muted)" }}>
          Loading lots…
        </p>
      ) : rows.length === 0 ? (
        <p className="text-xs py-6 text-center" style={{ color: "var(--text-muted)" }}>
          {total === 0
            ? "No lots yet. For collection investments these are created at conversion; for box / product investments they grow as you list cards on Cardmarket tagged with this investment's code."
            : "No lots match the current filters."}
        </p>
      ) : (
        <>
          {/* Mobile sort selector — desktop uses sortable column headers. */}
          <div className="sm:hidden flex items-center justify-between gap-2 mb-2 text-[11px]">
            <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
              Sort by
            </span>
            <div className="flex items-center gap-1">
              <Select
                size="sm"
                value={sort}
                onChange={(v) => setSort(v as SortField)}
                options={[
                  { value: "qty_remaining", label: "Remaining" },
                  { value: "qty_opened", label: "Opened" },
                  { value: "qty_sold", label: "Sold" },
                  { value: "name", label: "Card name" },
                  { value: "live_price_eur", label: "Live price" },
                  { value: "rem_value_eur", label: "Rem. value" },
                  { value: "cost_basis_per_unit", label: "Cost/unit" },
                  { value: "proceeds_eur", label: "Proceeds" },
                ]}
              />
              <button
                onClick={() => setDir(dir === "asc" ? "desc" : "asc")}
                className="px-2 py-1.5 rounded transition-colors"
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                }}
                aria-label={dir === "asc" ? "Sort ascending" : "Sort descending"}
                title={dir === "asc" ? "Ascending" : "Descending"}
              >
                {dir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
            </div>
          </div>

          {/* Mobile cards. */}
          <div className="sm:hidden flex flex-col gap-2">
            {rows.map((l) => {
              const remValue =
                l.live_price_eur != null ? l.qty_remaining * l.live_price_eur : null;
              return (
                <div
                  key={l.id}
                  className="rounded-lg p-3"
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <a
                      href={lotCardmarketUrl(l)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sm min-w-0"
                      style={{ color: "var(--accent)", textDecoration: "none" }}
                    >
                      <span className="truncate">{l.name ?? `#${l.cardmarket_id}`}</span>
                      {l.foil && <FoilStar />}
                    </a>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <ConditionBadge condition={l.condition} />
                      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        {l.language}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                        Remaining
                      </div>
                      <div
                        style={{
                          color: l.qty_remaining > 0 ? "var(--text-primary)" : "var(--text-muted)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {l.qty_remaining}
                        <span style={{ color: "var(--text-muted)" }}>
                          {" "}/ {l.qty_opened}
                        </span>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                        Live
                      </div>
                      <div style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                        {formatEur(l.live_price_eur)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                        Rem. val
                      </div>
                      <div style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                        {formatEur(remValue)}
                      </div>
                    </div>
                  </div>
                  {(l.qty_sold > 0 || l.proceeds_eur > 0 || l.cost_basis_per_unit != null) && (
                    <div
                      className="mt-2 pt-2 grid grid-cols-3 gap-2 text-xs"
                      style={{ borderTop: "1px solid var(--border-subtle)" }}
                    >
                      <div>
                        <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                          Sold
                        </div>
                        <div style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                          {l.qty_sold}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                          Cost/unit
                        </div>
                        <div style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                          {formatEur(l.cost_basis_per_unit)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                          Proceeds
                        </div>
                        <div
                          style={{
                            color: l.proceeds_eur > 0 ? "var(--success)" : "var(--text-muted)",
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          {formatEur(l.proceeds_eur)}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {/* Mobile totals card. */}
            <div
              className="rounded-lg p-3"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--accent)",
                borderRadius: "8px",
              }}
            >
              <div className="flex items-center justify-between mb-2 text-xs" style={{ color: "var(--text-muted)" }}>
                <span className="uppercase tracking-wider" style={{ fontFamily: "var(--font-mono)" }}>
                  Totals · {total.toLocaleString()} lots
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                    Opened
                  </div>
                  <div style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                    {formatInt(totals.qty_opened)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                    Sold
                  </div>
                  <div style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                    {formatInt(totals.qty_sold)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                    Remaining
                  </div>
                  <div style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                    {formatInt(totals.qty_remaining)}
                  </div>
                </div>
              </div>
              <div className="mt-2 pt-2 grid grid-cols-2 gap-2 text-xs" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <div>
                  <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                    Rem. value
                  </div>
                  <div style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                    {formatEur(totals.live_value_eur)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                    Proceeds
                  </div>
                  <div style={{ color: totals.proceeds_eur > 0 ? "var(--success)" : "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                    {formatEur(totals.proceeds_eur)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Desktop table. */}
          <div className="hidden sm:block overflow-x-auto">
          <table
            className="w-full text-xs min-w-[780px]"
            style={{ borderCollapse: "separate", borderSpacing: 0 }}
          >
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <SortHeader label="Card"       field="name"                sort={sort} dir={dir} onClick={toggleSort} align="left"  />
                <th className="text-center py-2 font-medium">Cond</th>
                <th className="text-center py-2 font-medium">Lang</th>
                <SortHeader label="Opened"     field="qty_opened"          sort={sort} dir={dir} onClick={toggleSort} align="right" />
                <SortHeader label="Sold"       field="qty_sold"            sort={sort} dir={dir} onClick={toggleSort} align="right" />
                <SortHeader label="Remaining"  field="qty_remaining"       sort={sort} dir={dir} onClick={toggleSort} align="right" />
                <SortHeader label="Cost/unit"  field="cost_basis_per_unit" sort={sort} dir={dir} onClick={toggleSort} align="right" />
                <SortHeader label="Live"       field="live_price_eur"      sort={sort} dir={dir} onClick={toggleSort} align="right" />
                <SortHeader label="Rem. value" field="rem_value_eur"       sort={sort} dir={dir} onClick={toggleSort} align="right" />
                <SortHeader label="Proceeds"   field="proceeds_eur"        sort={sort} dir={dir} onClick={toggleSort} align="right" />
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => {
                const remValue =
                  l.live_price_eur != null ? l.qty_remaining * l.live_price_eur : null;
                return (
                  <tr
                    key={l.id}
                    style={{ borderTop: "1px solid var(--border)" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-card-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <td className="py-2">
                      <a
                        href={lotCardmarketUrl(l)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1"
                        style={{ color: "var(--accent)", textDecoration: "none" }}
                        onMouseEnter={(e) => { e.currentTarget.style.textDecoration = "underline"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.textDecoration = "none"; }}
                      >
                        <span>{l.name ?? `#${l.cardmarket_id}`}</span>
                        {l.foil && <FoilStar />}
                      </a>
                    </td>
                    <td className="py-2 text-center">
                      <ConditionBadge condition={l.condition} />
                    </td>
                    <td
                      className="py-2 text-center"
                      style={{ color: "var(--text-muted)", fontSize: "10px" }}
                    >
                      {l.language}
                    </td>
                    <td
                      className="py-2 text-right"
                      style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}
                    >
                      {l.qty_opened}
                    </td>
                    <td
                      className="py-2 text-right"
                      style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}
                    >
                      {l.qty_sold}
                    </td>
                    <td
                      className="py-2 text-right"
                      style={{
                        color: l.qty_remaining > 0 ? "var(--text-primary)" : "var(--text-muted)",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {l.qty_remaining}
                    </td>
                    <td
                      className="py-2 text-right"
                      style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}
                    >
                      {formatEur(l.cost_basis_per_unit)}
                    </td>
                    <td
                      className="py-2 text-right"
                      style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}
                    >
                      {formatEur(l.live_price_eur)}
                    </td>
                    <td
                      className="py-2 text-right"
                      style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}
                    >
                      {formatEur(remValue)}
                    </td>
                    <td
                      className="py-2 text-right"
                      style={{
                        color: l.proceeds_eur > 0 ? "var(--success)" : "var(--text-muted)",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {formatEur(l.proceeds_eur)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr
                style={{
                  borderTop: "2px solid var(--border)",
                  background: "var(--bg-card)",
                  color: "var(--text-primary)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                <td
                  className="py-2 font-medium uppercase tracking-wider"
                  style={{ color: "var(--text-muted)", fontSize: "10px" }}
                >
                  Totals
                </td>
                <td colSpan={2}></td>
                <td className="py-2 text-right">{formatInt(totals.qty_opened)}</td>
                <td className="py-2 text-right" style={{ color: "var(--text-secondary)" }}>
                  {formatInt(totals.qty_sold)}
                </td>
                <td className="py-2 text-right">{formatInt(totals.qty_remaining)}</td>
                <td></td>
                <td></td>
                <td className="py-2 text-right">{formatEur(totals.live_value_eur)}</td>
                <td
                  className="py-2 text-right"
                  style={{ color: totals.proceeds_eur > 0 ? "var(--success)" : "var(--text-muted)" }}
                >
                  {formatEur(totals.proceeds_eur)}
                </td>
              </tr>
            </tfoot>
          </table>
          </div>

          <Pagination
            page={page}
            total={total}
            pageSize={pageSize}
            onChange={setPage}
            onPageSizeChange={(n) => {
              setPageSize(n);
              setPage(1);
            }}
            pageSizeOptions={[25, 50, 100, 200]}
          />
        </>
      )}
    </Panel>
  );
}
