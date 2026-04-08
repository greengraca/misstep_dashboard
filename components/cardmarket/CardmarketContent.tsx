"use client";

import { useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import StatCard from "@/components/dashboard/stat-card";
import { DollarSign, Package, ShoppingCart, TrendingDown, RefreshCw } from "lucide-react";
import type { CmOrder, CmSyncLogEntry } from "@/lib/types";

const inputStyle = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  color: "var(--text-primary)",
  padding: "6px 10px",
  borderRadius: "var(--radius)",
  fontSize: "13px",
};

export default function CardmarketContent() {
  const [orderFilter, setOrderFilter] = useState<string>("");
  const [orderDirection, setOrderDirection] = useState<string>("");
  const [orderPage, setOrderPage] = useState(1);

  const { data: statusData, mutate: mutateStatus } = useSWR("/api/ext/status", fetcher, { refreshInterval: 30000 });
  const { data: balanceData } = useSWR("/api/ext/balance?days=30", fetcher, { refreshInterval: 60000 });

  const orderParams = new URLSearchParams();
  if (orderFilter) orderParams.set("status", orderFilter);
  if (orderDirection) orderParams.set("direction", orderDirection);
  orderParams.set("page", String(orderPage));
  orderParams.set("limit", "15");
  const { data: ordersData } = useSWR(`/api/ext/orders?${orderParams}`, fetcher, { refreshInterval: 60000 });

  const status = statusData?.data;
  const balance = balanceData?.data;
  const orders = ordersData?.data;

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

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
            Cardmarket
          </h1>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Passive sync via browser extension
          </p>
        </div>
        <button
          onClick={() => mutateStatus()}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="Balance"
          value={formatEur(status?.currentBalance)}
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
          title="Orders Synced"
          value={orders?.total?.toLocaleString() ?? "—"}
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
        <div
          className="p-4 rounded-xl"
          style={{ background: "var(--surface-gradient)", backdropFilter: "var(--surface-blur)", border: "1px solid rgba(255,255,255,0.10)" }}
        >
          <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>Balance History</h2>
          <div className="flex items-end gap-1" style={{ height: "80px" }}>
            {balance.history.map((snap: { balance: number; extractedAt: string }, i: number) => {
              const min = Math.min(...balance.history.map((s: { balance: number }) => s.balance));
              const max = Math.max(...balance.history.map((s: { balance: number }) => s.balance));
              const range = max - min || 1;
              const h = ((snap.balance - min) / range) * 60 + 20;
              return (
                <div
                  key={i}
                  className="flex-1 rounded-t"
                  style={{
                    height: `${h}%`,
                    background: "var(--accent)",
                    opacity: 0.6 + (i / balance.history.length) * 0.4,
                    minWidth: "2px",
                  }}
                  title={`${formatEur(snap.balance)} — ${new Date(snap.extractedAt).toLocaleDateString("pt-PT")}`}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Orders */}
      <div
        className="p-4 rounded-xl"
        style={{ background: "var(--surface-gradient)", backdropFilter: "var(--surface-blur)", border: "1px solid rgba(255,255,255,0.10)" }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Orders</h2>
          <div className="flex gap-2">
            <select
              value={orderDirection}
              onChange={(e) => { setOrderDirection(e.target.value); setOrderPage(1); }}
              style={inputStyle}
            >
              <option value="">All directions</option>
              <option value="sale">Sales</option>
              <option value="purchase">Purchases</option>
            </select>
            <select
              value={orderFilter}
              onChange={(e) => { setOrderFilter(e.target.value); setOrderPage(1); }}
              style={inputStyle}
            >
              <option value="">All statuses</option>
              <option value="shopping_cart">Shopping Cart</option>
              <option value="unpaid">Unpaid</option>
              <option value="paid">Paid</option>
              <option value="sent">Sent</option>
              <option value="arrived">Arrived</option>
            </select>
          </div>
        </div>

        {orders?.orders?.length ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
                <thead>
                  <tr style={{ color: "var(--text-muted)" }}>
                    <th className="text-left py-2 px-2 font-medium">Order ID</th>
                    <th className="text-left py-2 px-2 font-medium">Counterparty</th>
                    <th className="text-left py-2 px-2 font-medium">Status</th>
                    <th className="text-right py-2 px-2 font-medium">Items</th>
                    <th className="text-right py-2 px-2 font-medium">Total</th>
                    <th className="text-right py-2 px-2 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.orders.map((order: CmOrder) => (
                    <tr
                      key={order.orderId}
                      style={{ borderBottom: "1px solid var(--border)" }}
                    >
                      <td className="py-2 px-2" style={{ color: "var(--accent)", fontFamily: "var(--font-mono)" }}>
                        {order.orderId}
                      </td>
                      <td className="py-2 px-2" style={{ color: "var(--text-primary)" }}>
                        {order.counterparty}
                        {order.country && (
                          <span className="ml-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
                            ({order.country})
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2">
                        <span
                          className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                          style={{
                            background: order.status === "arrived" ? "rgba(76,175,80,0.2)" :
                                       order.status === "sent" ? "rgba(63,206,229,0.2)" :
                                       order.status === "paid" ? "rgba(255,193,7,0.2)" :
                                       "rgba(255,255,255,0.08)",
                            color: order.status === "arrived" ? "var(--success)" :
                                   order.status === "sent" ? "var(--accent)" :
                                   order.status === "paid" ? "#FFC107" :
                                   "var(--text-muted)",
                          }}
                        >
                          {order.status}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                        {order.itemCount}
                      </td>
                      <td className="py-2 px-2 text-right font-medium" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                        {formatEur(order.totalPrice)}
                      </td>
                      <td className="py-2 px-2 text-right" style={{ color: "var(--text-muted)" }}>
                        {order.orderDate}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {orders.total > 15 && (
              <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Page {orderPage} of {Math.ceil(orders.total / 15)}
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={orderPage <= 1}
                    onClick={() => setOrderPage((p) => p - 1)}
                    className="px-2 py-1 rounded text-xs"
                    style={{ ...inputStyle, opacity: orderPage <= 1 ? 0.4 : 1 }}
                  >
                    Prev
                  </button>
                  <button
                    disabled={orderPage >= Math.ceil(orders.total / 15)}
                    onClick={() => setOrderPage((p) => p + 1)}
                    className="px-2 py-1 rounded text-xs"
                    style={{ ...inputStyle, opacity: orderPage >= Math.ceil(orders.total / 15) ? 0.4 : 1 }}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-xs py-4 text-center" style={{ color: "var(--text-muted)" }}>
            No orders synced yet. Install the extension and browse Cardmarket.
          </p>
        )}
      </div>

      {/* Sync Log */}
      {status?.recentLogs?.length > 0 && (
        <div
          className="p-4 rounded-xl"
          style={{ background: "var(--surface-gradient)", backdropFilter: "var(--surface-blur)", border: "1px solid rgba(255,255,255,0.10)" }}
        >
          <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>Sync Activity</h2>
          <div className="flex flex-col gap-1">
            {status.recentLogs.slice(0, 10).map((log: CmSyncLogEntry, i: number) => (
              <div key={i} className="flex items-center justify-between py-1.5" style={{ borderBottom: "1px solid var(--border)" }}>
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
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
