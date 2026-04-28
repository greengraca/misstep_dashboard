"use client";

import { useState, useRef, useCallback } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import StatCard from "@/components/dashboard/stat-card";
import { DollarSign, Package, ShoppingCart, TrendingDown, RefreshCw, ChevronDown, ChevronUp, Check, Printer, Loader2 } from "lucide-react";
import type { CmOrder, CmOrderItem, CmSyncLogEntry } from "@/lib/types";

const SENDER_ADDRESS = {
  name: "João Graça",
  street: "Rua Dr. Caldas Lopes 19 R/C DTO",
  city: "2500-189 Caldas da Rainha",
  country: "Portugal",
};

/** Renders a sprite icon from a CM sprite sheet stored locally. */
function SpriteIcon({ src, pos, size = 16, title }: { src: string; pos?: string; size?: number; title?: string }) {
  if (!pos) return null;
  return (
    <span
      title={title}
      style={{
        display: "inline-block",
        width: `${size}px`,
        height: `${size}px`,
        backgroundImage: `url(${src})`,
        backgroundPosition: pos,
        backgroundRepeat: "no-repeat",
        verticalAlign: "middle",
        flexShrink: 0,
      }}
    />
  );
}

function CountryFlag({ pos, country }: { pos?: string; country?: string }) {
  return <SpriteIcon src="/sprites/ssMain.png" pos={pos} title={country} />;
}

function LangFlag({ pos, language }: { pos?: string; language?: string }) {
  return <SpriteIcon src="/sprites/ssMain2.png" pos={pos} title={language} />;
}

const CONDITION_COLORS: Record<string, string> = {
  MT: "#4caf50",  // green
  NM: "#4caf50",  // green
  EX: "#8bc34a",  // yellow-green
  GD: "#ffc107",  // yellow
  LP: "#ff9800",  // orange
  PL: "#f44336",  // red
  PO: "#f44336",  // red
};

function ConditionBadge({ condition }: { condition: string }) {
  const color = CONDITION_COLORS[condition] || "var(--text-muted)";
  return (
    <span
      className="px-1 py-0.5 rounded text-[9px] font-medium"
      style={{
        background: `${color}22`,
        color,
      }}
    >
      {condition}
    </span>
  );
}

function ExpansionIcon({ pos, set }: { pos?: string; set?: string }) {
  if (!pos) return null;
  return (
    <span
      title={set}
      style={{
        display: "inline-block",
        width: "16px",
        height: "16px",
        overflow: "hidden",
        verticalAlign: "middle",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: "21px",
          height: "21px",
          backgroundImage: "url(/sprites/expicons.png)",
          backgroundPosition: pos,
          backgroundRepeat: "no-repeat",
          filter: "invert(1)",
          transform: "scale(0.76)",
          transformOrigin: "top left",
        }}
      />
    </span>
  );
}

const surfaceStyle = {
  background: "var(--surface-gradient)",
  backdropFilter: "var(--surface-blur)",
  border: "1px solid rgba(255,255,255,0.10)",
};

const STATUS_TABS = [
  { key: "shopping_cart", label: "In Shopping Cart" },
  { key: "unpaid", label: "Unpaid" },
  { key: "paid", label: "Paid" },
  { key: "sent", label: "Sent" },
  { key: "arrived", label: "Arrived" },
] as const;

export default function CardmarketContent() {
  const [activeTab, setActiveTab] = useState<string>("paid");
  const [direction, setDirection] = useState<"sale" | "purchase">("sale");
  const [orderPage, setOrderPage] = useState(1);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const { data: statusData, mutate: mutateStatus } = useSWR("/api/ext/status", fetcher, { refreshInterval: 15000 });
  const { data: balanceData, mutate: mutateBalance } = useSWR("/api/ext/balance?days=30", fetcher, { refreshInterval: 60000 });
  const { data: pipelineData, mutate: mutatePipeline } = useSWR("/api/ext/pipeline?days=30", fetcher, { refreshInterval: 60000 });

  const orderParams = new URLSearchParams({
    status: activeTab,
    direction,
    page: String(orderPage),
    limit: "20",
  });
  const { data: ordersData, mutate: mutateOrders } = useSWR(`/api/ext/orders?${orderParams}`, fetcher, { refreshInterval: 30000 });

  // Fetch detail when an order is expanded
  const { data: detailData } = useSWR(
    expandedOrder ? `/api/ext/orders?orderId=${expandedOrder}` : null,
    fetcher
  );

  const status = statusData?.data;
  const balance = balanceData?.data;
  const orders = ordersData?.data;
  const orderCounts = status?.orderCounts || {};

  const formatEur = (n: number | null | undefined) =>
    n != null ? `${n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : "—";

  const formatAgo = (iso: string | null | undefined) => {
    if (!iso) return "—";
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  function getTabCount(statusKey: string): number {
    const c = orderCounts[statusKey];
    if (!c) return 0;
    return direction === "purchase" ? (c.purchase || 0) : (c.sale || 0);
  }

  function handleTabChange(tab: string) {
    setActiveTab(tab);
    setOrderPage(1);
    setExpandedOrder(null);
  }

  function handleDirectionToggle(d: "sale" | "purchase") {
    setDirection(d);
    setOrderPage(1);
    setExpandedOrder(null);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const togglePrinted = useCallback(async (orderId: string, printed: boolean) => {
    await fetch("/api/ext/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderIds: [orderId], printed }),
    });
    mutateOrders();
  }, [mutateOrders]);

  const toggleAllPrinted = useCallback(async (printed: boolean, ordersList: CmOrder[]) => {
    const ids = ordersList.map((o) => o.orderId);
    if (!ids.length) return;
    await fetch("/api/ext/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderIds: ids, printed }),
    });
    mutateOrders();
  }, [mutateOrders]);

  const printEnvelopes = useCallback((ordersToprint: CmOrder[]) => {
    // Filter to orders that have shipping address data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const withAddress = ordersToprint.filter((o: any) => o.shippingAddress?.name);
    if (!withAddress.length) {
      alert("No orders with shipping address data. Visit the order detail pages on Cardmarket first.");
      return;
    }

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pages = withAddress.map((order: any) => {
      const addr = order.shippingAddress;
      return `
        <div class="envelope-page">
          <div class="sender">
            <div>${SENDER_ADDRESS.name}</div>
            <div>${SENDER_ADDRESS.street}</div>
            <div>${SENDER_ADDRESS.city}</div>
            <div>${SENDER_ADDRESS.country}</div>
          </div>
          <div class="recipient">
            <div>${addr.name}</div>
            ${addr.extra ? `<div>${addr.extra}</div>` : ""}
            <div>${addr.street}</div>
            <div>${addr.city}</div>
            <div>${addr.country}</div>
          </div>
        </div>
      `;
    }).join("");

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Print Envelopes</title>
        <style>
          @page { size: 114mm 162mm; margin: 0; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, Helvetica, sans-serif; }
          .envelope-page {
            width: 114mm;
            height: 162mm;
            position: relative;
            page-break-after: always;
            overflow: hidden;
          }
          .envelope-page:last-child { page-break-after: auto; }
          .sender {
            position: absolute;
            top: 10mm;
            right: 10mm;
            writing-mode: vertical-rl;
            font-size: 13px;
            line-height: 1.8;
            color: #595959;
            white-space: nowrap;
          }
          .recipient {
            position: absolute;
            bottom: 30mm;
            left: 18%;
            writing-mode: vertical-rl;
            font-size: 17px;
            line-height: 1.8;
            color: #000;
            max-height: 90mm; /* in vertical-rl this is the line length — text wraps when exceeded */
            word-break: break-word;
          }
        </style>
      </head>
      <body>${pages}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }, []);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
            Cardmarket
          </h1>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Passive sync via browser extension
          </p>
        </div>
        <button
          onClick={async () => {
            setRefreshing(true);
            await Promise.all([mutateStatus(), mutateOrders(), mutateBalance(), mutatePipeline()]);
            setRefreshing(false);
          }}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: refreshing ? "var(--accent)" : "var(--text-secondary)", cursor: refreshing ? "not-allowed" : "pointer", opacity: refreshing ? 0.8 : 1 }}
        >
          {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {refreshing ? "Refreshing\u2026" : "Refresh"}
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="Balance"
          value={formatEur(status?.currentBalance)}
          subtitle={(() => {
            const ov = status?.orderValues || {};
            const u = ov.unpaid || 0;
            const p = ov.paid || 0;
            const s = status?.trusteeSentValue || 0;
            const t = (status?.currentBalance ?? 0) + u + p + s;
            const r = (n: number) => `€${Math.round(n)}`;
            return (
              <>
                {`U: ${r(u)} \u00B7 P: ${r(p)} \u00B7 S: ${r(s)}`}
                <br className="sm:hidden" />
                <span className="hidden sm:inline">{" \u00B7 "}</span>
                <span style={{ color: "var(--text-secondary)" }}>{`T: ${r(t)}`}</span>
              </>
            );
          })()}
          icon={<DollarSign size={18} style={{ color: "var(--accent)" }} />}
        />
        <StatCard
          title="Stock Tracked"
          value={status?.stockCoverage?.tracked?.toLocaleString() ?? "—"}
          subtitle={status?.stockCoverage?.percentage != null
            ? `${status.stockCoverage.percentage}% of ${status.stockCoverage.total?.toLocaleString()}`
            : undefined}
          icon={<Package size={18} style={{ color: "var(--accent)" }} />}
        />
        <StatCard
          title={activeTab === "shopping_cart" ? "In Cart" : activeTab === "unpaid" ? "Awaiting Payment" : activeTab === "paid" ? "To Ship" : activeTab === "sent" ? "Sent" : "Arrived"}
          value={formatEur(orders?.totalValue ?? null)}
          subtitle={orders?.total != null
            ? activeTab === "sent" && status?.trusteeSentValue
              ? `${orders.total} orders \u00B7 TBPUA: ${formatEur(status.trusteeSentValue)}`
              : `${orders.total} orders`
            : undefined}
          icon={<ShoppingCart size={18} style={{ color: "var(--accent)" }} />}
        />
        <StatCard
          title="Last Sync"
          value={formatAgo(Object.values(status?.lastSync ?? {})[0] as string)}
          subtitle={Object.keys(status?.lastSync ?? {}).length
            ? `${Object.keys(status.lastSync).length} data types`
            : undefined}
          icon={<TrendingDown size={18} style={{ color: "var(--accent)" }} />}
        />
      </div>

      {/* Balance History */}
      {balance?.history?.length > 0 && (
        <div className="p-4 rounded-xl overflow-hidden" style={surfaceStyle}>
          <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>Balance History</h2>
          <div className="flex items-end gap-1 w-full" style={{ height: "80px" }}>
            {balance.history.map((snap: { balance: number; extractedAt: string }, i: number) => {
              const min = Math.min(...balance.history.map((s: { balance: number }) => s.balance));
              const max = Math.max(...balance.history.map((s: { balance: number }) => s.balance));
              const range = max - min || 1;
              const h = ((snap.balance - min) / range) * 60 + 20;
              return (
                <div
                  key={i}
                  className="flex-1 min-w-0 rounded-t"
                  style={{
                    height: `${h}%`,
                    background: "var(--accent)",
                    opacity: 0.6 + (i / balance.history.length) * 0.4,
                  }}
                  title={`${formatEur(snap.balance)} — ${new Date(snap.extractedAt).toLocaleDateString("pt-PT")}`}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Sales Pipeline (U + P + S) */}
      {pipelineData?.data?.history?.length > 0 && (
        <PipelineChart history={pipelineData.data.history} formatEur={formatEur} />
      )}

      {/* Orders */}
      <div className="rounded-xl overflow-hidden" style={surfaceStyle}>
        {/* Direction toggle + Status tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 pb-0">
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Orders</h2>

          {/* Sales / Purchases toggle */}
          <div
            className="flex rounded-lg overflow-hidden text-xs"
            style={{ border: "1px solid var(--border)" }}
          >
            {(["sale", "purchase"] as const).map((d) => (
              <button
                key={d}
                onClick={() => handleDirectionToggle(d)}
                className="px-3 py-1.5 font-medium transition-all"
                style={{
                  background: direction === d ? "var(--accent)" : "transparent",
                  color: direction === d ? "var(--bg-primary)" : "var(--text-muted)",
                }}
              >
                {d === "sale" ? "Sales" : "Purchases"}
              </button>
            ))}
          </div>
        </div>

        {/* Status tabs */}
        <div
          className="flex gap-0 px-4 mt-3 overflow-x-auto"
          style={{ borderBottom: "1px solid var(--border)", scrollbarWidth: "thin" }}
        >
          {STATUS_TABS.map((tab) => {
            const count = getTabCount(tab.key);
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className="px-3 py-2 text-xs font-medium transition-all relative whitespace-nowrap shrink-0"
                style={{
                  color: active ? "var(--accent)" : "var(--text-muted)",
                  borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
                  marginBottom: "-1px",
                }}
              >
                {tab.label}
                {count > 0 && (
                  <span
                    className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px]"
                    style={{
                      background: active ? "rgba(63,206,229,0.2)" : "rgba(255,255,255,0.08)",
                      color: active ? "var(--accent)" : "var(--text-muted)",
                    }}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Print All bar (only on Paid tab with sale direction) */}
        {activeTab === "paid" && direction === "sale" && orders?.orders?.length > 0 && (
          <div className="flex items-center justify-end gap-2 px-4 pt-2">
            <button
              onClick={() => printEnvelopes(orders.orders.filter((o: CmOrder) => !o.printed))}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: "var(--accent)", color: "var(--bg-primary)" }}
            >
              <Printer size={13} /> Print All Envelopes
            </button>
          </div>
        )}

        {/* Order rows */}
        <div className="px-4 pb-4">
          {orders?.orders?.length ? (
            <>
              <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-xs min-w-[680px]" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
                <thead>
                  <tr style={{ color: "var(--text-muted)" }}>
                    <th className="text-center py-2 px-1 font-medium w-6">#</th>
                    {activeTab === "paid" && (
                      <th className="text-center py-2 px-1 font-medium w-6">
                        {(() => {
                          const allPrinted = orders.orders.length > 0 && orders.orders.every((o: CmOrder) => o.printed);
                          return (
                            <button
                              onClick={() => toggleAllPrinted(!allPrinted, orders.orders)}
                              title={allPrinted ? "Unmark all as printed" : "Mark all as printed"}
                              className="w-4 h-4 rounded border-2 flex items-center justify-center transition-colors"
                              style={{
                                borderColor: "#eab308",
                                background: allPrinted ? "#eab308" : "transparent",
                                cursor: "pointer",
                              }}
                            >
                              {allPrinted && (
                                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                                  <path d="M2 6l3 3 5-6" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </button>
                          );
                        })()}
                      </th>
                    )}
                    <th className="text-left py-2 px-2 font-medium">ID</th>
                    <th className="text-left py-2 px-2 font-medium">{direction === "sale" ? "Buyer" : "Seller"}</th>
                    <th className="text-left py-2 px-2 font-medium">Last Name</th>
                    <th className="text-center py-2 px-2 font-medium">Qty.</th>
                    <th className="text-right py-2 px-2 font-medium">Total</th>
                    <th className="text-center py-2 px-1 font-medium">Trustee?</th>
                    <th className="text-right py-2 px-2 font-medium">{STATUS_TABS.find(t => t.key === activeTab)?.label.split(" ").pop() || "Date"}</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.orders.map((order: CmOrder, idx: number) => {
                    const isExpanded = expandedOrder === order.orderId;
                    const detail = isExpanded ? detailData?.data : null;
                    return (
                      <OrderRow
                        key={order.orderId}
                        order={order}
                        rowNum={(orderPage - 1) * 20 + idx + 1}
                        isExpanded={isExpanded}
                        detail={detail}
                        formatEur={formatEur}
                        showPrint={activeTab === "paid"}
                        onToggle={() => setExpandedOrder(isExpanded ? null : order.orderId)}
                        onTogglePrinted={(printed) => togglePrinted(order.orderId, printed)}
                        onPrint={() => printEnvelopes([order])}
                      />
                    );
                  })}
                </tbody>
              </table>
              </div>

              {/* Pagination */}
              {orders.total > 20 && (
                <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    Page {orderPage} of {Math.ceil(orders.total / 20)}
                  </span>
                  <div className="flex gap-2">
                    <button
                      disabled={orderPage <= 1}
                      onClick={() => setOrderPage((p) => p - 1)}
                      className="px-2 py-1 rounded text-xs"
                      style={{
                        background: "var(--bg-card)", border: "1px solid var(--border)",
                        color: "var(--text-primary)", opacity: orderPage <= 1 ? 0.4 : 1,
                      }}
                    >
                      Prev
                    </button>
                    <button
                      disabled={orderPage >= Math.ceil(orders.total / 20)}
                      onClick={() => setOrderPage((p) => p + 1)}
                      className="px-2 py-1 rounded text-xs"
                      style={{
                        background: "var(--bg-card)", border: "1px solid var(--border)",
                        color: "var(--text-primary)", opacity: orderPage >= Math.ceil(orders.total / 20) ? 0.4 : 1,
                      }}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-xs py-6 text-center" style={{ color: "var(--text-muted)" }}>
              No {direction === "sale" ? "sales" : "purchases"} with this status yet.
            </p>
          )}
        </div>
      </div>

      {/* Sync Log */}
      {status?.recentLogs?.length > 0 && (
        <div className="p-4 rounded-xl" style={surfaceStyle}>
          <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>Sync Activity</h2>
          <div className="flex flex-col gap-1">
            {status.recentLogs.slice(0, 10).map((log: CmSyncLogEntry, i: number) => (
              <div key={i} className="py-1.5" style={{ borderBottom: "1px solid var(--border)" }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                      style={{ background: "rgba(63,206,229,0.15)", color: "var(--accent)" }}
                    >
                      {log.dataType}
                    </span>
                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      {log.stats.added > 0 && `+${log.stats.added}`}
                      {log.stats.updated > 0 && ` ~${log.stats.updated}`}
                      {log.stats.skipped > 0 && ` =${log.stats.skipped}`}
                      {(log.stats as Record<string, number>).removed > 0 && ` -${(log.stats as Record<string, number>).removed}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                      {log.submittedBy}
                    </span>
                    <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                      {formatAgo(log.receivedAt)}
                    </span>
                  </div>
                </div>
                {log.details && (
                  <div className="mt-0.5 text-[10px] pl-1" style={{ color: "var(--text-muted)" }}>
                    {log.details}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sales pipeline (Balance + U + P + S) stacked-bar chart ─────────

interface PipelinePoint {
  date: string;
  balance: number;
  unpaid: number;
  paid: number;
  sent: number;       // trustee-sent only
  total: number;      // balance + unpaid + paid + sent
  source: "snapshot" | "reconstructed";
}

// Color order from BOTTOM to TOP of each bar — concrete money first,
// least-certain on top.
const PIPELINE_COLORS = {
  balance: "var(--info)",     // blue — money already in the wallet
  sent: "var(--success)",     // green — trustee holds, almost in
  paid: "var(--accent)",      // cyan — buyer paid, we owe shipping
  unpaid: "var(--warning)",   // amber — buyer hasn't paid yet
} as const;

function PipelineChart({
  history,
  formatEur,
}: {
  history: PipelinePoint[];
  formatEur: (n: number | null | undefined) => string;
}) {
  const max = Math.max(1, ...history.map((p) => p.total));
  const latest = history[history.length - 1];

  function formatDay(ymd: string) {
    const [y, m, d] = ymd.split("-").map(Number);
    return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
  }

  function legendDot(color: string) {
    return (
      <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: color }} />
    );
  }

  return (
    <div className="p-4 rounded-xl overflow-hidden" style={surfaceStyle}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          Sales Pipeline
          <span className="ml-2 text-[10px] font-normal" style={{ color: "var(--text-muted)" }}>
            Balance + U + P + S over the last 30 days
          </span>
        </h2>
        <div className="flex flex-wrap items-center gap-3 text-[10px]" style={{ color: "var(--text-muted)" }}>
          <span className="inline-flex items-center gap-1" title="CM wallet balance">
            {legendDot(PIPELINE_COLORS.balance)} Bal {formatEur(latest?.balance)}
          </span>
          <span className="inline-flex items-center gap-1" title="Unpaid orders">
            {legendDot(PIPELINE_COLORS.unpaid)} U {formatEur(latest?.unpaid)}
          </span>
          <span className="inline-flex items-center gap-1" title="Paid, awaiting shipment">
            {legendDot(PIPELINE_COLORS.paid)} P {formatEur(latest?.paid)}
          </span>
          <span className="inline-flex items-center gap-1" title="Trustee-Sent (money still held by CM trustee)">
            {legendDot(PIPELINE_COLORS.sent)} S {formatEur(latest?.sent)}
          </span>
        </div>
      </div>

      <div className="flex items-end gap-1 w-full" style={{ height: "80px" }}>
        {history.map((p, i) => {
          const totalPct = (p.total / max) * 100;
          const balPct = (p.balance / max) * 100;
          const uPct = (p.unpaid / max) * 100;
          const pPct = (p.paid / max) * 100;
          const sPct = (p.sent / max) * 100;
          const tooltip = [
            formatDay(p.date),
            `Bal: ${formatEur(p.balance)}`,
            `U: ${formatEur(p.unpaid)}`,
            `P: ${formatEur(p.paid)}`,
            `S: ${formatEur(p.sent)}`,
            `Total: ${formatEur(p.total)}`,
            p.source === "snapshot" ? "(snapshot)" : "(reconstructed)",
          ].join(" · ");
          return (
            <div
              key={`${p.date}-${i}`}
              title={tooltip}
              className="flex-1 min-w-0 flex flex-col justify-end"
              style={{ height: "100%", opacity: p.total > 0 ? 0.6 + (i / history.length) * 0.4 : 0.25 }}
            >
              {/* Stack from BOTTOM: balance → sent → paid → unpaid. */}
              <div
                style={{
                  height: `${totalPct}%`,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "flex-end",
                  borderTopLeftRadius: 2,
                  borderTopRightRadius: 2,
                  overflow: "hidden",
                }}
              >
                {uPct > 0 && (
                  <div style={{ flex: uPct, background: PIPELINE_COLORS.unpaid }} />
                )}
                {pPct > 0 && (
                  <div style={{ flex: pPct, background: PIPELINE_COLORS.paid }} />
                )}
                {sPct > 0 && (
                  <div style={{ flex: sPct, background: PIPELINE_COLORS.sent }} />
                )}
                {balPct > 0 && (
                  <div style={{ flex: balPct, background: PIPELINE_COLORS.balance }} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-between mt-1 text-[9px]" style={{ color: "var(--text-muted)" }}>
        <span>{formatDay(history[0].date)}</span>
        <span>{formatDay(history[history.length - 1].date)}</span>
      </div>
    </div>
  );
}

// ── Order Row with expandable detail ────────────────────────────────

function OrderRow({
  order,
  rowNum,
  isExpanded,
  detail,
  formatEur,
  showPrint,
  onToggle,
  onTogglePrinted,
  onPrint,
}: {
  order: CmOrder;
  rowNum: number;
  isExpanded: boolean;
  detail: { order: CmOrder | null; items: CmOrderItem[] } | null;
  formatEur: (n: number | null | undefined) => string;
  showPrint: boolean;
  onToggle: () => void;
  onTogglePrinted: (printed: boolean) => void;
  onPrint: () => void;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fullOrder = detail?.order as any;
  const items = detail?.items || [];

  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer transition-all"
        style={{
          borderBottom: isExpanded ? "none" : "1px solid var(--border)",
          opacity: showPrint && order.printed ? 0.75 : 1,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        <td className="py-2 px-1 text-center" style={{ color: "var(--text-muted)" }}>
          {rowNum}
        </td>
        {showPrint && (
          <td className="py-2 px-1 text-center" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={!!order.printed}
              onChange={(e) => onTogglePrinted(e.target.checked)}
              title={order.printed ? "Printed" : "Not printed"}
              style={{ accentColor: "var(--accent)", cursor: "pointer" }}
            />
          </td>
        )}
        <td className="py-2 px-2" style={{ fontFamily: "var(--font-mono)" }}>
          <span className="inline-flex items-center gap-1.5">
            <a
              href={`https://www.cardmarket.com/en/Magic/Orders/${order.orderId}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{ color: "var(--accent)", textDecoration: "none" }}
              onMouseEnter={(e) => { e.currentTarget.style.textDecoration = "underline"; }}
              onMouseLeave={(e) => { e.currentTarget.style.textDecoration = "none"; }}
            >
              {order.orderId}
            </a>
            <span
              title={(order as unknown as Record<string, unknown>).timeline ? "Detail synced" : "Needs sync — visit order on CM"}
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: (order as unknown as Record<string, unknown>).timeline ? "var(--success)" : "#f44336",
                flexShrink: 0,
              }}
            />
          </span>
        </td>
        <td className="py-2 px-2" style={{ color: "var(--text-primary)" }}>
          <span className="inline-flex items-center gap-1.5">
            <CountryFlag pos={order.countryFlagPos} country={order.country} />
            {order.counterparty}
          </span>
        </td>
        <td className="py-2 px-2" style={{ color: "var(--text-secondary)" }}>
          {order.lastName || ""}
        </td>
        <td className="py-2 px-2 text-center" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
          {order.itemCount}
        </td>
        <td className="py-2 px-2 text-right font-medium" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
          {formatEur(order.totalPrice)}
        </td>
        <td className="py-2 px-1 text-center">
          {order.trustee && <Check size={14} style={{ color: "var(--success)", margin: "0 auto" }} />}
        </td>
        <td className="py-2 px-2 text-right" style={{ color: "var(--text-muted)" }}>
          <span>{order.orderDate}</span>
          {order.orderTime && <span className="ml-1" style={{ color: "var(--text-muted)", opacity: 0.6 }}>{order.orderTime}</span>}
        </td>
      </tr>

      {isExpanded && (
        <tr>
          <td colSpan={showPrint ? 9 : 8} style={{ padding: 0, borderBottom: "1px solid var(--border)" }}>
            <div
              className="px-4 py-3 mx-2 mb-2 rounded-lg"
              style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)" }}
            >
              {items.length > 0 ? (
                <>
                  {/* Shipping & summary */}
                  {fullOrder && (
                    <div className="flex flex-wrap gap-4 mb-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
                      {fullOrder.shippingMethod && (
                        <span>Shipping: <span style={{ color: "var(--text-secondary)" }}>{fullOrder.shippingMethod}</span></span>
                      )}
                      {fullOrder.shippingPrice != null && (
                        <span>Ship cost: <span style={{ color: "var(--text-secondary)" }}>{formatEur(fullOrder.shippingPrice)}</span></span>
                      )}
                      {fullOrder.shippingAddress?.country && (
                        <span>To: <span style={{ color: "var(--text-secondary)" }}>{fullOrder.shippingAddress.name}, {fullOrder.shippingAddress.country}</span></span>
                      )}
                      {showPrint && fullOrder.shippingAddress?.name && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onPrint(); }}
                          className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium"
                          style={{ background: "rgba(63,206,229,0.15)", color: "var(--accent)" }}
                        >
                          <Printer size={10} /> Print Envelope
                        </button>
                      )}
                      {fullOrder.timeline && Object.keys(fullOrder.timeline).length > 0 && (
                        <span>
                          {Object.entries(fullOrder.timeline as Record<string, string>).map(([step, date]) => (
                            <span key={step} className="mr-2">
                              {step}: <span style={{ color: "var(--text-secondary)" }}>{date}</span>
                            </span>
                          ))}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Items table */}
                  <div className="overflow-x-auto">
                  <table className="w-full text-[11px] min-w-[480px]">
                    <thead>
                      <tr style={{ color: "var(--text-muted)" }}>
                        <th className="text-left py-1 font-medium">Card</th>
                        <th className="text-left py-1 font-medium">Set</th>
                        <th className="text-center py-1 font-medium">Cond</th>
                        <th className="text-center py-1 font-medium w-6">Lang</th>
                        <th className="text-right py-1 font-medium">Qty</th>
                        <th className="text-right py-1 font-medium">Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item: CmOrderItem) => (
                        <tr key={item.articleId} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                          <td className="py-1" style={{ color: "var(--text-primary)" }}>
                            {item.name}
                            {item.foil && <span className="ml-1 text-[9px]" style={{ color: "var(--accent)" }}>FOIL</span>}
                          </td>
                          <td className="py-1">
                            <span className="inline-flex items-center gap-1">
                              <ExpansionIcon pos={item.expansionPos} set={item.set} />
                              <span style={{ color: "var(--text-muted)" }}>{item.set}</span>
                            </span>
                          </td>
                          <td className="py-1 text-center">
                            <ConditionBadge condition={item.condition} />
                          </td>
                          <td className="py-1 text-center">
                            <LangFlag pos={item.langPos} language={item.language} />
                          </td>
                          <td className="py-1 text-right" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>{item.qty}</td>
                          <td className="py-1 text-right" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>{formatEur(item.price)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </>
              ) : (
                <p className="text-[11px] text-center py-2" style={{ color: "var(--text-muted)" }}>
                  No item details yet — visit this order on Cardmarket to sync.
                </p>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
