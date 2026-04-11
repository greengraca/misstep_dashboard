"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Package, Coins, ListOrdered } from "lucide-react";
import type { CmStockListing } from "@/lib/types";
import type { StockSortField } from "@/lib/stock-types";
import StockFilters, {
  emptyStockFilters,
  type StockFilterState,
} from "./StockFilters";
import StockTable, { type SetMap } from "./StockTable";
import StockChart from "./StockChart";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface SummaryResponse {
  totalQty: number;
  totalValue: number;
  distinctListings: number;
  coverage: {
    tracked: number;
    total: number | null;
    percentage: number | null;
  };
}

interface SearchResponse {
  rows: CmStockListing[];
  total: number;
  page: number;
  pageSize: number;
  error?: string;
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

function buildQuery(
  filters: StockFilterState,
  sort: StockSortField,
  dir: "asc" | "desc",
  page: number,
  pageSize: number
): string {
  const sp = new URLSearchParams();
  if (filters.name.trim()) sp.set("name", filters.name.trim());
  if (filters.set.trim()) sp.set("set", filters.set.trim());
  if (filters.condition) sp.set("condition", filters.condition);
  if (filters.foil) sp.set("foil", filters.foil);
  if (filters.language.trim()) sp.set("language", filters.language.trim());
  if (filters.minPrice.trim()) sp.set("minPrice", filters.minPrice.trim());
  if (filters.maxPrice.trim()) sp.set("maxPrice", filters.maxPrice.trim());
  if (filters.minQty.trim()) sp.set("minQty", filters.minQty.trim());
  sp.set("sort", sort);
  sp.set("dir", dir);
  sp.set("page", String(page));
  sp.set("pageSize", String(pageSize));
  return sp.toString();
}

export default function StockContent() {
  const [filters, setFilters] = useState<StockFilterState>(emptyStockFilters);
  const [sort, setSort] = useState<StockSortField>("lastSeenAt");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const debouncedFilters = useDebounced(filters, 300);

  // Reset to page 1 whenever filters change (but not on pagination changes).
  useEffect(() => {
    setPage(1);
  }, [debouncedFilters]);

  const query = useMemo(
    () => buildQuery(debouncedFilters, sort, dir, page, pageSize),
    [debouncedFilters, sort, dir, page, pageSize]
  );

  const { data: summary } = useSWR<SummaryResponse>("/api/stock/summary", fetcher, {
    dedupingInterval: 60_000,
  });

  const { data: setsData } = useSWR<{ sets: SetMap }>(
    "/api/stock/sets",
    fetcher,
    { dedupingInterval: 60 * 60 * 1000 }
  );

  const { data: search, isLoading } = useSWR<SearchResponse>(
    `/api/stock?${query}`,
    fetcher
  );

  const coverageSubtitle = (() => {
    const c = summary?.coverage;
    if (!c) return undefined;
    if (c.total == null) return `${c.tracked.toLocaleString()} tracked`;
    const pct = c.percentage != null ? `${c.percentage}%` : "—";
    return `${c.tracked.toLocaleString()} of ${c.total.toLocaleString()} tracked (${pct})`;
  })();

  const statCards = [
    {
      label: "Total Stock",
      value: summary ? summary.totalQty.toLocaleString() : "—",
      subtitle: coverageSubtitle,
      icon: <Package size={18} />,
    },
    {
      label: "Value",
      value: summary ? `€${summary.totalValue.toFixed(2)}` : "—",
      subtitle: undefined as string | undefined,
      icon: <Coins size={18} />,
    },
    {
      label: "Listings",
      value: summary ? summary.distinctListings.toLocaleString() : "—",
      subtitle: undefined as string | undefined,
      icon: <ListOrdered size={18} />,
    },
  ];

  return (
    <div style={{ padding: "20px 24px", maxWidth: 1400, margin: "0 auto" }}>
      <h1
        style={{
          fontSize: 22,
          fontWeight: 600,
          color: "var(--text-primary)",
          margin: "0 0 16px",
        }}
      >
        Stock
      </h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 12,
          marginBottom: 16,
        }}
      >
        {statCards.map((c) => (
          <div
            key={c.label}
            style={{
              background: "var(--surface-gradient)",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 10,
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: "var(--text-muted)",
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {c.icon}
              {c.label}
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 600,
                color: "var(--text-primary)",
              }}
            >
              {c.value}
            </div>
            {c.subtitle && (
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                {c.subtitle}
              </div>
            )}
          </div>
        ))}
      </div>

      <StockChart />

      <StockFilters
        value={filters}
        onChange={setFilters}
        onClear={() => setFilters(emptyStockFilters)}
      />

      <StockTable
        rows={search?.rows || []}
        sort={sort}
        dir={dir}
        onSortChange={(s, d) => {
          setSort(s);
          setDir(d);
        }}
        loading={isLoading}
        error={search?.error || null}
        total={search?.total || 0}
        page={page}
        pageSize={pageSize}
        setMap={setsData?.sets}
        onPageChange={setPage}
        onPageSizeChange={(n) => {
          setPageSize(n);
          setPage(1);
        }}
      />
    </div>
  );
}
