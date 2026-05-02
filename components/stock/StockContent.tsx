"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Package, Coins, ListOrdered, Layers } from "lucide-react";
import type { StockListingWithTrend, StockSortField } from "@/lib/stock-types";
import { STOCK_SORT_FIELDS } from "@/lib/stock-types";
import StockFilters, {
  emptyStockFilters,
  type StockFilterState,
} from "./StockFilters";
import StockTable, { type SetMap } from "./StockTable";
import StockChart from "./StockChart";
import StockGhostGap from "./StockGhostGap";
import StatCard from "@/components/dashboard/stat-card";
import { H1 } from "@/components/dashboard/page-shell";
import { StatusPill } from "@/components/dashboard/status-pill";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface SummaryResponse {
  totalQty: number;
  totalValue: number;
  totalListings: number;
  distinctNameSet: number;
  coverage: {
    tracked: number;
    total: number | null;
    percentage: number | null;
  };
}

interface SearchResponse {
  rows: StockListingWithTrend[];
  total: number;
  totalQty: number;
  totalValue: number;
  distinctNameSet: number;
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

function resolveMinQty(filters: StockFilterState): number | null {
  const explicit = filters.minQty.trim()
    ? Number(filters.minQty.trim())
    : null;
  const floor = filters.hasStock ? 1 : null;
  if (explicit != null && Number.isFinite(explicit) && floor != null) {
    return Math.max(explicit, floor);
  }
  if (explicit != null && Number.isFinite(explicit)) return explicit;
  return floor;
}

function hasAnyFilter(filters: StockFilterState): boolean {
  const base: StockFilterState = { ...emptyStockFilters, hasStock: filters.hasStock };
  const k: (keyof StockFilterState)[] = [
    "name",
    "set",
    "condition",
    "foil",
    "signed",
    "language",
    "minPrice",
    "maxPrice",
    "minQty",
    "minOverpricedPct",
  ];
  return k.some((key) => filters[key] !== base[key]);
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
  if (filters.signed) sp.set("signed", filters.signed);
  if (filters.language.trim()) sp.set("language", filters.language.trim());
  if (filters.minPrice.trim()) sp.set("minPrice", filters.minPrice.trim());
  if (filters.maxPrice.trim()) sp.set("maxPrice", filters.maxPrice.trim());
  const minQty = resolveMinQty(filters);
  if (minQty != null) sp.set("minQty", String(minQty));
  if (filters.minOverpricedPct.trim()) {
    sp.set("minOverpricedPct", filters.minOverpricedPct.trim());
  }
  sp.set("sort", sort);
  sp.set("dir", dir);
  sp.set("page", String(page));
  sp.set("pageSize", String(pageSize));
  return sp.toString();
}

function parseStateFromUrl(sp: URLSearchParams): {
  filters: StockFilterState;
  sort: StockSortField;
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
} {
  const filters: StockFilterState = {
    name: sp.get("name") ?? "",
    set: sp.get("set") ?? "",
    condition:
      (sp.get("condition") as StockFilterState["condition"]) ?? "",
    foil: (sp.get("foil") as StockFilterState["foil"]) ?? "",
    signed: (sp.get("signed") as StockFilterState["signed"]) ?? "",
    language: sp.get("language") ?? "",
    minPrice: sp.get("minPrice") ?? "",
    maxPrice: sp.get("maxPrice") ?? "",
    minQty: sp.get("minQty") ?? "",
    minOverpricedPct: sp.get("minOverpricedPct") ?? "",
    hasStock: sp.get("hasStock") !== "0",
  };
  const sortRaw = sp.get("sort") ?? "lastSeenAt";
  const sort = (STOCK_SORT_FIELDS as readonly string[]).includes(sortRaw)
    ? (sortRaw as StockSortField)
    : "lastSeenAt";
  const dirRaw = sp.get("dir");
  const dir: "asc" | "desc" = dirRaw === "asc" ? "asc" : "desc";
  const pageNum = Number(sp.get("page") ?? "1");
  const page = Number.isFinite(pageNum) && pageNum > 0 ? Math.floor(pageNum) : 1;
  const pageSizeNum = Number(sp.get("pageSize") ?? "50");
  const pageSize =
    Number.isFinite(pageSizeNum) && pageSizeNum > 0
      ? Math.min(200, Math.floor(pageSizeNum))
      : 50;
  return { filters, sort, dir, page, pageSize };
}

function stateToUrl(
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
  if (filters.signed) sp.set("signed", filters.signed);
  if (filters.language.trim()) sp.set("language", filters.language.trim());
  if (filters.minPrice.trim()) sp.set("minPrice", filters.minPrice.trim());
  if (filters.maxPrice.trim()) sp.set("maxPrice", filters.maxPrice.trim());
  if (filters.minQty.trim()) sp.set("minQty", filters.minQty.trim());
  if (filters.minOverpricedPct.trim()) {
    sp.set("minOverpricedPct", filters.minOverpricedPct.trim());
  }
  if (!filters.hasStock) sp.set("hasStock", "0");
  if (sort !== "lastSeenAt") sp.set("sort", sort);
  if (dir !== "desc") sp.set("dir", dir);
  if (page !== 1) sp.set("page", String(page));
  if (pageSize !== 50) sp.set("pageSize", String(pageSize));
  return sp.toString();
}

export default function StockContent() {
  const router = useRouter();
  const pathname = usePathname();
  const urlParams = useSearchParams();

  const initial = useMemo(
    () => parseStateFromUrl(urlParams),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const [filters, setFilters] = useState<StockFilterState>(initial.filters);
  const [sort, setSort] = useState<StockSortField>(initial.sort);
  const [dir, setDir] = useState<"asc" | "desc">(initial.dir);
  const [page, setPage] = useState(initial.page);
  const [pageSize, setPageSize] = useState(initial.pageSize);

  const debouncedFilters = useDebounced(filters, 300);

  useEffect(() => {
    setPage(1);
  }, [debouncedFilters]);

  const query = useMemo(
    () => buildQuery(debouncedFilters, sort, dir, page, pageSize),
    [debouncedFilters, sort, dir, page, pageSize]
  );

  useEffect(() => {
    const qs = stateToUrl(debouncedFilters, sort, dir, page, pageSize);
    const nextUrl = qs ? `${pathname}?${qs}` : pathname;
    router.replace(nextUrl, { scroll: false });
  }, [debouncedFilters, sort, dir, page, pageSize, pathname, router]);

  const { data: summary } = useSWR<SummaryResponse>("/api/stock/summary", fetcher, {
    dedupingInterval: 60_000,
  });

  const { data: setsData } = useSWR<{ sets: SetMap }>(
    "/api/stock/sets",
    fetcher,
    { dedupingInterval: 60 * 60 * 1000 }
  );

  const { data: languagesData } = useSWR<{ languages: string[] }>(
    "/api/stock/languages",
    fetcher,
    { dedupingInterval: 60 * 60 * 1000 }
  );

  const { data: search, isLoading } = useSWR<SearchResponse>(
    `/api/stock?${query}`,
    fetcher
  );

  const filtered = hasAnyFilter(debouncedFilters);
  const displayQty = filtered ? search?.totalQty : summary?.totalQty;
  const displayValue = filtered ? search?.totalValue : summary?.totalValue;
  const displayListings = filtered ? search?.total : summary?.totalListings;
  const displayUnique = filtered
    ? search?.distinctNameSet
    : summary?.distinctNameSet;

  const coverageSubtitle = (() => {
    const c = summary?.coverage;
    if (!c || filtered) return undefined;
    if (c.total == null) return `${c.tracked.toLocaleString()} tracked`;
    const pct = c.percentage != null ? `${c.percentage}%` : "—";
    return `${c.tracked.toLocaleString()} of ${c.total.toLocaleString()} tracked (${pct})`;
  })();

  const statCards: { label: string; value: string; subtitle: string | undefined; icon: React.ReactNode }[] = [
    {
      label: "Total Stock",
      value: displayQty != null ? displaySimple(displayQty) : "—",
      subtitle: coverageSubtitle,
      icon: <Package size={18} style={{ color: "var(--accent)" }} />,
    },
    {
      label: "Value",
      value: displayValue != null ? `€${displayValue.toFixed(2)}` : "—",
      subtitle: undefined,
      icon: <Coins size={18} style={{ color: "var(--accent)" }} />,
    },
    {
      label: "Listings",
      value: displayListings != null ? displaySimple(displayListings) : "—",
      subtitle: undefined,
      icon: <ListOrdered size={18} style={{ color: "var(--accent)" }} />,
    },
    {
      label: "Unique cards",
      value: displayUnique != null ? displaySimple(displayUnique) : "—",
      subtitle: undefined,
      icon: <Layers size={18} style={{ color: "var(--accent)" }} />,
    },
  ];

  const sortedSetNames = useMemo(() => {
    if (!setsData?.sets) return [] as string[];
    return Object.keys(setsData.sets).sort((a, b) => a.localeCompare(b));
  }, [setsData]);

  const onClear = useCallback(() => {
    setFilters(emptyStockFilters);
    setSort("lastSeenAt");
    setDir("desc");
    setPage(1);
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <H1 subtitle="Live Cardmarket inventory and trend prices">Stock</H1>
        {filtered && <StatusPill tone="accent">Filtered</StatusPill>}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map((c) => (
          <StatCard
            key={c.label}
            title={c.label}
            value={c.value}
            subtitle={c.subtitle}
            icon={c.icon}
          />
        ))}
      </div>

      <StockGhostGap />

      <StockChart />

      <StockFilters
        value={filters}
        onChange={setFilters}
        onClear={onClear}
        setNames={sortedSetNames}
        setMap={setsData?.sets}
        languages={languagesData?.languages ?? []}
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
        totalQty={search?.totalQty ?? null}
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

function displaySimple(n: number): string {
  return n.toLocaleString();
}
