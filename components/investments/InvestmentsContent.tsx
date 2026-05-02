"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { TrendingUp, Plus, Package, Boxes, Briefcase, ChevronDown, ChevronUp } from "lucide-react";

function SortableHeader({
  label, sortKey, align, current, dir, onClick, className,
}: {
  label: string;
  sortKey: SortKey;
  align: "left" | "right";
  current: SortKey;
  dir: "asc" | "desc";
  onClick: (k: SortKey) => void;
  className?: string;
}) {
  const active = current === sortKey;
  return (
    <th
      onClick={() => onClick(sortKey)}
      className={`py-2 px-2 font-medium select-none cursor-pointer transition-colors ${align === "right" ? "text-right" : "text-left"} ${className ?? ""}`}
      style={{ color: active ? "var(--accent)" : "var(--text-muted)" }}
    >
      <span className={`inline-flex items-center gap-1 ${align === "right" ? "justify-end" : ""}`}>
        {label}
        {active && (dir === "asc" ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
      </span>
    </th>
  );
}
import StatCard from "@/components/dashboard/stat-card";
import CreateInvestmentModal from "./CreateInvestmentModal";
import { Panel, H1, H2 } from "@/components/dashboard/page-shell";
import { StatusPill } from "@/components/dashboard/status-pill";
import { SetSymbol } from "@/components/dashboard/set-symbol";
import { Wallet, Layers } from "lucide-react";
import type { InvestmentListItem, InvestmentStatus } from "@/lib/investments/types";
import type { EvProduct } from "@/lib/types";

const formatEur = (n: number | null | undefined) =>
  n != null ? `${n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : "—";

interface SourceCellProps {
  src: InvestmentListItem["source"];
  productMap: Map<string, EvProduct>;
}

/** Visual rendering of an investment source. Box → set icon + set code chip
 *  + booster-type pill. Product → product image (when known) + product name.
 *  Customer bulk → wallet icon + card count. Collection → layers icon + card
 *  count. */
function SourceCell({ src, productMap }: SourceCellProps) {
  if (src.kind === "box") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <SetSymbol code={src.set_code} size={14} />
        <span style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
          {src.box_count}× {src.set_code.toUpperCase()}
        </span>
        <StatusPill tone="muted">{src.booster_type}</StatusPill>
      </span>
    );
  }
  if (src.kind === "product") {
    const product = productMap.get(src.product_slug);
    return (
      <span className="inline-flex items-center gap-2 min-w-0">
        {product?.image_uri ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image_uri}
            alt={product.name}
            style={{ height: 22, width: "auto", objectFit: "contain", flexShrink: 0 }}
          />
        ) : (
          <span style={{ width: 14, flexShrink: 0 }} />
        )}
        <span className="min-w-0">
          <span style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
            {src.unit_count}×
          </span>{" "}
          <span className="truncate" style={{ color: "var(--text-secondary)" }}>
            {product?.name ?? src.product_slug}
          </span>
        </span>
      </span>
    );
  }
  if (src.kind === "customer_bulk") {
    return (
      <span className="inline-flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
        <Wallet size={13} />
        <span>Customer bulk · ~{src.estimated_card_count.toLocaleString()} cards</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
      <Layers size={13} />
      <span>Collection · {src.card_count} cards</span>
    </span>
  );
}

const STATUS_TABS: { key: InvestmentStatus | "all"; label: string }[] = [
  { key: "listing", label: "Listing" },
  { key: "closed", label: "Closed" },
  { key: "archived", label: "Archived" },
  { key: "all", label: "All" },
];

function statusBadge(status: InvestmentStatus) {
  const map: Record<InvestmentStatus, { bg: string; color: string; label: string }> = {
    listing: { bg: "rgba(63,206,229,0.15)", color: "var(--accent)", label: "listing" },
    closed: { bg: "rgba(52, 211, 153, 0.12)", color: "var(--success)", label: "closed" },
    archived: { bg: "rgba(255,255,255,0.06)", color: "var(--text-muted)", label: "archived" },
  };
  const s = map[status];
  return (
    <span
      className="px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap"
      style={{ background: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}

type SortKey = "name" | "cost" | "listed" | "realized" | "breakeven" | "created";

export default function InvestmentsContent() {
  const router = useRouter();
  const [tab, setTab] = useState<InvestmentStatus | "all">("listing");
  const [showCreate, setShowCreate] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("created");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  // Fetch all investments once. Filter/count client-side — volume is low (tens).
  const { data, mutate, isLoading } = useSWR<{ investments: InvestmentListItem[] }>(
    "/api/investments",
    fetcher,
    { dedupingInterval: 30_000 }
  );
  const allRows = data?.investments ?? [];

  // Resolve product slugs → product docs (for the source-column thumbnails
  // + names). Fetched once per session, deduped via SWR.
  const { data: productsData } = useSWR<{ data: EvProduct[] }>(
    "/api/ev/products",
    fetcher,
    { dedupingInterval: 60 * 60 * 1000 }
  );
  const productMap = useMemo(() => {
    const map = new Map<string, EvProduct>();
    for (const p of productsData?.data ?? []) map.set(p.slug, p);
    return map;
  }, [productsData]);

  const countsByStatus = useMemo(() => {
    const counts: Record<InvestmentStatus, number> = {
      listing: 0,
      closed: 0,
      archived: 0,
    };
    for (const r of allRows) counts[r.status] += 1;
    return counts;
  }, [allRows]);

  const rows = useMemo(() => {
    const filtered = tab === "all" ? allRows : allRows.filter((r) => r.status === tab);
    const sorted = [...filtered].sort((a, b) => {
      const ar = a.realized_eur + a.sealed_flips_total_eur;
      const br = b.realized_eur + b.sealed_flips_total_eur;
      const cmp = (() => {
        switch (sortKey) {
          case "name": return a.name.localeCompare(b.name);
          case "cost": return a.cost_total_eur - b.cost_total_eur;
          case "listed": return a.listed_value_eur - b.listed_value_eur;
          case "realized": return ar - br;
          case "breakeven": {
            const aRatio = a.cost_total_eur > 0 ? ar / a.cost_total_eur : 0;
            const bRatio = b.cost_total_eur > 0 ? br / b.cost_total_eur : 0;
            return aRatio - bRatio;
          }
          case "created":
          default:
            return a.created_at.localeCompare(b.created_at);
        }
      })();
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [allRows, tab, sortKey, sortDir]);

  const { deployed, realized, listed, plBlended } = useMemo(() => {
    let deployed = 0, realized = 0, listed = 0;
    for (const r of allRows) {
      if (r.status === "archived") continue;
      deployed += r.cost_total_eur;
      realized += r.realized_eur + r.sealed_flips_total_eur;
      listed += r.listed_value_eur;
    }
    return { deployed, realized, listed, plBlended: realized + listed - deployed };
  }, [allRows]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <H1 subtitle="Sealed purchases and their attributed singles">Investments</H1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all"
          style={{
            background: "var(--accent)",
            color: "var(--accent-text)",
            border: "1px solid var(--accent)",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent-hover)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "var(--accent)"; }}
        >
          <Plus size={16} /> New investment
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="Deployed"
          value={formatEur(deployed)}
          subtitle={(() => {
            const active = countsByStatus.listing + countsByStatus.closed;
            return active ? `${active} investment${active === 1 ? "" : "s"}` : undefined;
          })()}
          icon={<Boxes size={18} style={{ color: "var(--text-tertiary)" }} />}
          tone="muted"
        />
        <StatCard
          title="Listed value"
          value={formatEur(listed)}
          subtitle="Current stock × live price"
          icon={<Package size={18} style={{ color: "var(--accent)" }} />}
        />
        <StatCard
          title="Realized net"
          value={formatEur(realized)}
          subtitle="Sold + sealed flips"
          icon={<TrendingUp size={18} style={{ color: "var(--success)" }} />}
          tone="success"
        />
        <StatCard
          title="P/L blended"
          value={formatEur(plBlended)}
          subtitle={plBlended >= 0 ? "Above cost" : "Below cost"}
          icon={
            <TrendingUp
              size={18}
              style={{ color: plBlended >= 0 ? "var(--success)" : "var(--error)" }}
            />
          }
          tone={plBlended >= 0 ? "success" : "danger"}
        />
      </div>

      <Panel>
        <H2 icon={<Briefcase size={16} />}>Portfolio</H2>
        <div
          className="flex gap-0 overflow-x-auto overflow-y-hidden"
          style={{ borderBottom: "1px solid var(--border)", scrollbarWidth: "thin" }}
        >
          {STATUS_TABS.map((t) => {
            const active = tab === t.key;
            const count =
              t.key === "all"
                ? allRows.length
                : countsByStatus[t.key];
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="px-3 py-2 text-xs font-medium transition-all whitespace-nowrap shrink-0"
                style={{
                  color: active ? "var(--accent)" : "var(--text-muted)",
                  borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
                  marginBottom: "-1px",
                }}
              >
                {t.label}
                {count > 0 && (
                  <span
                    className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px]"
                    style={{
                      background: active ? "rgba(63,206,229,0.2)" : "rgba(255,255,255,0.08)",
                      color: active ? "var(--accent)" : "var(--text-muted)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="pt-2">
          {isLoading ? (
            <p className="text-xs py-6 text-center" style={{ color: "var(--text-muted)" }}>
              Loading…
            </p>
          ) : rows.length === 0 ? (
            <p className="text-xs py-6 text-center" style={{ color: "var(--text-muted)" }}>
              {tab === "listing" ? "No active investments." : "Nothing here yet."}
            </p>
          ) : (
            <>
              {/* Mobile: card list. */}
              <div className="sm:hidden flex flex-col gap-2">
                {rows.map((r) => {
                  const totalRealized = r.realized_eur + r.sealed_flips_total_eur;
                  const ratio = r.cost_total_eur > 0 ? totalRealized / r.cost_total_eur : 0;
                  const past = ratio >= 1;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => router.push(`/investments/${r.id}`)}
                      className="text-left rounded-lg p-3 transition-colors"
                      style={{
                        background: "var(--bg-card)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            {statusBadge(r.status)}
                            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                              {new Date(r.created_at).toLocaleDateString("pt-PT")}
                            </span>
                          </div>
                          <div
                            className="text-sm font-medium truncate"
                            style={{ color: "var(--accent)" }}
                          >
                            {r.name}
                          </div>
                        </div>
                      </div>
                      <div className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>
                        <SourceCell src={r.source} productMap={productMap} />
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-3" style={{ color: "var(--text-muted)" }}>
                          <span>
                            cost{" "}
                            <span style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                              {formatEur(r.cost_total_eur)}
                            </span>
                          </span>
                          <span>
                            real.{" "}
                            <span
                              style={{
                                color: past ? "var(--success)" : "var(--text-secondary)",
                                fontFamily: "var(--font-mono)",
                              }}
                            >
                              {formatEur(totalRealized)}
                            </span>
                          </span>
                        </div>
                        <span
                          className="text-[11px]"
                          style={{
                            color: past ? "var(--success)" : "var(--accent)",
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          {Math.round(ratio * 100)}%
                        </span>
                      </div>
                      <div
                        className="mt-2 h-1.5 rounded-full overflow-hidden"
                        style={{ background: "rgba(255,255,255,0.06)" }}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(Math.min(Math.max(ratio, 0), 2) / 2) * 100}%`,
                            background: past ? "var(--success)" : "var(--accent)",
                          }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Desktop: table. */}
              <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-xs min-w-[720px]" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
                <thead>
                  <tr style={{ color: "var(--text-muted)" }}>
                    <th className="text-left py-2 px-2 font-medium">Status</th>
                    <SortableHeader label="Name" sortKey="name" align="left" current={sortKey} dir={sortDir} onClick={toggleSort} />
                    <th className="text-left py-2 px-2 font-medium">Source</th>
                    <SortableHeader label="Cost" sortKey="cost" align="right" current={sortKey} dir={sortDir} onClick={toggleSort} />
                    <SortableHeader label="Listed" sortKey="listed" align="right" current={sortKey} dir={sortDir} onClick={toggleSort} />
                    <SortableHeader label="Realized" sortKey="realized" align="right" current={sortKey} dir={sortDir} onClick={toggleSort} />
                    <SortableHeader label="Break-even" sortKey="breakeven" align="left" current={sortKey} dir={sortDir} onClick={toggleSort} className="w-40" />
                    <SortableHeader label="Created" sortKey="created" align="right" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const totalRealized = r.realized_eur + r.sealed_flips_total_eur;
                    const ratio = r.cost_total_eur > 0 ? totalRealized / r.cost_total_eur : 0;
                    const clamped = Math.min(Math.max(ratio, 0), 2);
                    const past = ratio >= 1;
                    return (
                      <tr
                        key={r.id}
                        className="transition-all cursor-pointer"
                        style={{ borderBottom: "1px solid var(--border)" }}
                        onClick={() => router.push(`/investments/${r.id}`)}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-card-hover)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                      >
                        <td className="py-2 px-2">{statusBadge(r.status)}</td>
                        <td className="py-2 px-2" style={{ color: "var(--accent)" }}>
                          {r.name}
                        </td>
                        <td className="py-2 px-2 text-xs">
                          <SourceCell src={r.source} productMap={productMap} />
                        </td>
                        <td className="py-2 px-2 text-right" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                          {formatEur(r.cost_total_eur)}
                        </td>
                        <td className="py-2 px-2 text-right" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                          {formatEur(r.listed_value_eur)}
                        </td>
                        <td
                          className="py-2 px-2 text-right"
                          style={{
                            color: past ? "var(--success)" : "var(--text-secondary)",
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          {formatEur(totalRealized)}
                        </td>
                        <td className="py-2 px-2">
                          <div className="flex items-center gap-2">
                            <div
                              className="flex-1 h-1.5 rounded-full overflow-hidden"
                              style={{ background: "rgba(255,255,255,0.06)", maxWidth: "120px" }}
                            >
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${(clamped / 2) * 100}%`,
                                  background: past ? "var(--success)" : "var(--accent)",
                                }}
                              />
                            </div>
                            <span
                              className="text-[10px] tabular-nums"
                              style={{
                                color: past ? "var(--success)" : "var(--text-muted)",
                                minWidth: "32px",
                                fontFamily: "var(--font-mono)",
                              }}
                            >
                              {Math.round(ratio * 100)}%
                            </span>
                          </div>
                        </td>
                        <td className="py-2 px-2 text-right" style={{ color: "var(--text-muted)" }}>
                          {new Date(r.created_at).toLocaleDateString("pt-PT")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </>
          )}
        </div>
      </Panel>

      <CreateInvestmentModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => {
          setShowCreate(false);
          setTab("listing");
          mutate();
        }}
      />
    </div>
  );
}
