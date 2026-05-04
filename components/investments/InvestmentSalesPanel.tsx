"use client";

import useSWR from "swr";
import { useState } from "react";
import { Receipt, X, ExternalLink } from "lucide-react";
import { fetcher } from "@/lib/fetcher";
import { FoilStar } from "@/components/dashboard/cm-sprite";
import { Panel, H2 } from "@/components/dashboard/page-shell";
import { StatusPill } from "@/components/dashboard/status-pill";
import { Pagination } from "@/components/dashboard/pagination";

interface SaleRow {
  id: string;
  cardmarket_id: number;
  foil: boolean;
  condition: string;
  language: string;
  name: string | null;
  qty: number;
  unit_price_eur: number;
  net_per_unit_eur: number;
  attributed_at: string;
  source: "cardmarket" | "manual";
  order_id: string;
  note: string | null;
}

interface SaleResponse {
  rows: SaleRow[];
  total: number;
  page: number;
  pageSize: number;
}

const formatEur = (n: number | null | undefined) =>
  n != null ? `${n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : "—";

const formatDate = (iso: string) => new Date(iso).toISOString().slice(0, 10);

interface Props {
  investmentId: string;
  /** Bumped when the parent records a new manual sale; forces SWR to revalidate. */
  refreshKey?: number;
}

export default function InvestmentSalesPanel({ investmentId, refreshKey = 0 }: Props) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  const swrKey = `/api/investments/${investmentId}/sale-log?${qs.toString()}&_r=${refreshKey}`;
  const { data, isLoading, mutate } = useSWR<SaleResponse>(swrKey, fetcher, {
    dedupingInterval: 5_000, keepPreviousData: true,
  });
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const [busy, setBusy] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!confirm("Delete this manual sale? The lot will be reversed.")) return;
    setBusy(id);
    try {
      const res = await fetch(`/api/investments/${investmentId}/sale-log/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(body.error || `HTTP ${res.status}`);
        return;
      }
      mutate();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Panel>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <H2 icon={<Receipt size={16} />}>Sales</H2>
          {total > 0 && <StatusPill tone="accent">{total.toLocaleString()}</StatusPill>}
        </div>
      </div>

      {isLoading && rows.length === 0 ? (
        <p className="text-xs py-6 text-center" style={{ color: "var(--text-muted)" }}>Loading sales…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs py-6 text-center" style={{ color: "var(--text-muted)" }}>
          No sales yet. Cardmarket sales appear here automatically when an order moves to paid; record an in-person sale via &quot;Record manual sale&quot; above.
        </p>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="sm:hidden flex flex-col gap-2">
            {rows.map((r) => (
              <div
                key={r.id}
                className="rounded-lg p-3"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="text-sm flex items-center gap-1 min-w-0">
                    <span className="truncate">{r.name ?? `#${r.cardmarket_id}`}</span>
                    {r.foil && <FoilStar />}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <SourcePill row={r} />
                    {r.source === "manual" && (
                      <button
                        onClick={() => handleDelete(r.id)}
                        disabled={busy === r.id}
                        aria-label="Delete manual sale"
                        className="text-[var(--text-muted)] hover:text-[var(--error)] p-1"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                  <span>{r.qty}× {formatEur(r.unit_price_eur)}</span>
                  <span>net {formatEur(r.net_per_unit_eur)}/u</span>
                  <span className="text-right">{formatDate(r.attributed_at)}</span>
                </div>
                {r.note && (
                  <div className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {r.note}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-xs" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
              <thead>
                <tr style={{ color: "var(--text-muted)" }}>
                  <th className="text-left py-2 font-medium">Card</th>
                  <th className="text-center py-2 font-medium">Cond</th>
                  <th className="text-center py-2 font-medium">Lang</th>
                  <th className="text-right py-2 font-medium">Qty</th>
                  <th className="text-right py-2 font-medium">Unit €</th>
                  <th className="text-right py-2 font-medium">Net €/u</th>
                  <th className="text-center py-2 font-medium">Date</th>
                  <th className="text-left py-2 font-medium">Source</th>
                  <th className="py-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    style={{ borderTop: "1px solid var(--border)" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-card-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <td className="py-2">
                      <span className="inline-flex items-center gap-1">
                        <span>{r.name ?? `#${r.cardmarket_id}`}</span>
                        {r.foil && <FoilStar />}
                      </span>
                    </td>
                    <td className="py-2 text-center" style={{ color: "var(--text-muted)" }}>{r.condition}</td>
                    <td className="py-2 text-center text-[10px]" style={{ color: "var(--text-muted)" }}>{r.language}</td>
                    <td className="py-2 text-right" style={{ fontFamily: "var(--font-mono)" }}>{r.qty}</td>
                    <td className="py-2 text-right" style={{ fontFamily: "var(--font-mono)" }}>{formatEur(r.unit_price_eur)}</td>
                    <td className="py-2 text-right" style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{formatEur(r.net_per_unit_eur)}</td>
                    <td className="py-2 text-center text-[11px]" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{formatDate(r.attributed_at)}</td>
                    <td className="py-2"><SourcePill row={r} /></td>
                    <td className="py-2 text-right">
                      {r.source === "manual" && (
                        <button
                          onClick={() => handleDelete(r.id)}
                          disabled={busy === r.id}
                          aria-label="Delete manual sale"
                          className="text-[var(--text-muted)] hover:text-[var(--error)] p-1"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            page={page}
            total={total}
            pageSize={pageSize}
            onChange={setPage}
            onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
            pageSizeOptions={[10, 25, 50, 100]}
          />
        </>
      )}
    </Panel>
  );
}

function SourcePill({ row }: { row: SaleRow }) {
  if (row.source === "manual") {
    return (
      <span
        title={row.note ?? undefined}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]"
        style={{ background: "rgba(168, 162, 158, 0.10)", color: "var(--text-muted)" }}
      >
        Manual
        {row.note && <span className="text-[9px]">·</span>}
      </span>
    );
  }
  return (
    <a
      href={`https://www.cardmarket.com/en/Magic/Orders/${row.order_id}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-[11px]"
      style={{ color: "var(--accent)", textDecoration: "none" }}
    >
      #{row.order_id}
      <ExternalLink size={10} />
    </a>
  );
}
