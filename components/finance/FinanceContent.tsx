"use client";

import { useMemo, useState, useTransition } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { fetcher } from "@/lib/fetcher";
import type { Transaction } from "@/lib/types";
import StatCard from "@/components/dashboard/stat-card";
import DataTable, { type Column } from "@/components/dashboard/data-table";
import Modal from "@/components/dashboard/modal";
import MonthPicker from "@/components/dashboard/month-picker";
import Select from "@/components/dashboard/select";
import ConfirmModal from "@/components/dashboard/confirm-modal";
import { Panel, H1, H2, Field } from "@/components/dashboard/page-shell";
import { StatusPill } from "@/components/dashboard/status-pill";
import { KindCard } from "@/components/dashboard/kind-card";
import { MetricRow } from "@/components/dashboard/metric-row";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Banknote,
  ShoppingBag,
  Package,
  Landmark,
  PlusCircle,
  Clock,
  CheckCircle,
  Pencil,
  Trash2,
  Receipt,
  ArrowDownRight,
  PieChart as PieChartIcon,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartTooltip } from "recharts";

const CATEGORIES = [
  { value: "shipping", label: "Shipping" },
  { value: "operational", label: "Operational" },
  { value: "direct", label: "Direct Transaction" },
  { value: "other", label: "Other" },
];
function getCurrentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Decrements a 'YYYY-MM' string by one calendar month. */
function previousMonth(month: string): string {
  const [yStr, mStr] = month.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return month;
  const prevDate = new Date(Date.UTC(y, m - 2, 1));
  const py = prevDate.getUTCFullYear();
  const pm = String(prevDate.getUTCMonth() + 1).padStart(2, "0");
  return `${py}-${pm}`;
}

function monthShortLabel(month: string): string {
  const [yStr, mStr] = month.split("-");
  const d = new Date(Date.UTC(Number(yStr), Number(mStr) - 1, 1));
  return d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
}

/** Period-over-period delta as a percent change. Returns null when the
 *  previous value is 0 (delta would be infinite / undefined). */
function pctDelta(curr: number, prev: number): number | null {
  if (!Number.isFinite(prev) || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

function isoToday(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

const fieldStyle: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  color: "var(--text-primary)",
};

export default function FinanceContent() {
  const [month, setMonth] = useState(getCurrentMonth);
  const [, startTransition] = useTransition();
  const swrKey = `/api/finance?month=${month}`;
  const { data, isLoading, mutate } = useSWR<{ data: Transaction[] }>(swrKey, fetcher);
  const transactions = data?.data ?? [];

  // CM Revenue for this month
  const { data: cmRevData } = useSWR<{ data: { orderCount: number; totalSales: number; grossArticleValue: number; sellingFees: number; trusteeFees: number; shippingCosts: number; netRevenue: number } }>(
    `/api/ext/revenue?month=${month}`, fetcher
  );
  const cmRev = cmRevData?.data;

  // Previous month — fetched in parallel so each StatCard can render
  // ↑/↓ % vs the prior month. Same data shapes; same SWR config.
  const prevMonth = previousMonth(month);
  const prevLabel = monthShortLabel(prevMonth);
  const { data: prevTxData } = useSWR<{ data: Transaction[] }>(`/api/finance?month=${prevMonth}`, fetcher);
  const prevTransactions = prevTxData?.data ?? [];
  const { data: prevCmRevData } = useSWR<{ data: { orderCount: number; totalSales: number; grossArticleValue: number; sellingFees: number; trusteeFees: number; shippingCosts: number; netRevenue: number } }>(
    `/api/ext/revenue?month=${prevMonth}`, fetcher
  );
  const prevCmRev = prevCmRevData?.data;

  // Team members (dynamic, sourced from DB so renames / additions flow through
  // without a code edit). Falls back to [] while loading — the Paid By select
  // just shows only "None" until the fetch lands.
  const { data: teamData } = useSWR<{ data: Array<{ _id: string; name: string }> }>(
    "/api/team",
    fetcher
  );
  const teamMembers = teamData?.data ?? [];
  const paidByOptions = [
    { value: "", label: "None" },
    ...teamMembers.map((m) => ({ value: m.name, label: m.name })),
  ];

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingTx, setDeletingTx] = useState<Transaction | null>(null);

  // Form state
  const [formDate, setFormDate] = useState(isoToday());
  const [formType, setFormType] = useState("expense");
  const [formCategory, setFormCategory] = useState("shipping");
  const [formDescription, setFormDescription] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formPaidBy, setFormPaidBy] = useState("");

  // Stats (withdrawals excluded from net balance, CM revenue included in income)
  const manualIncome = transactions
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + t.amount, 0);
  const cmIncome = cmRev?.netRevenue ?? 0;
  const totalIncome = manualIncome + cmIncome;
  const totalExpenses = transactions
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + t.amount, 0);
  const totalWithdrawals = transactions
    .filter((t) => t.type === "withdrawal")
    .reduce((s, t) => s + t.amount, 0);

  // Shipping Profit: CM shipping collected - actual shipping expenses
  const cmShippingCollected = cmRev?.shippingCosts ?? 0;
  const shippingExpenses = transactions
    .filter((t) => t.type === "expense" && t.category === "shipping")
    .reduce((s, t) => s + t.amount, 0);
  const shippingProfit = cmShippingCollected - shippingExpenses;

  const netBalance = totalIncome - totalExpenses + shippingProfit;

  // Treasury Account: Withdrawals - Checked Reimbursements + Direct Income - Direct Expenses
  const checkedReimbursements = transactions
    .filter((t) => t.type === "expense" && t.reimbursed)
    .reduce((s, t) => s + t.amount, 0);
  const directIncome = transactions
    .filter((t) => t.type === "income" && t.category === "direct")
    .reduce((s, t) => s + t.amount, 0);
  const directExpenses = transactions
    .filter((t) => t.type === "expense" && t.category === "direct")
    .reduce((s, t) => s + t.amount, 0);
  const treasuryAccount = totalWithdrawals - checkedReimbursements + directIncome - directExpenses;

  // Category breakdown for the Expenses panel — group expense rows by
  // category, sorted desc by total. Skip when no expenses this month.
  const expensesByCategory = useMemo(() => {
    const buckets = new Map<string, number>();
    for (const t of transactions) {
      if (t.type !== "expense") continue;
      const k = t.category || "other";
      buckets.set(k, (buckets.get(k) ?? 0) + t.amount);
    }
    return Array.from(buckets.entries())
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);
  }, [transactions]);

  // Previous-month aggregates — same formulas, computed once and used for
  // each StatCard's delta. Treasury and Net Balance are running-status
  // metrics derived from this-month flows; comparing them month-over-month
  // is meaningful but only when the previous month had any activity.
  const prevManualIncome = prevTransactions.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const prevCmIncome = prevCmRev?.netRevenue ?? 0;
  const prevTotalIncome = prevManualIncome + prevCmIncome;
  const prevTotalExpenses = prevTransactions.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const prevTotalWithdrawals = prevTransactions.filter((t) => t.type === "withdrawal").reduce((s, t) => s + t.amount, 0);
  const prevShippingExpenses = prevTransactions.filter((t) => t.type === "expense" && t.category === "shipping").reduce((s, t) => s + t.amount, 0);
  const prevShippingProfit = (prevCmRev?.shippingCosts ?? 0) - prevShippingExpenses;
  const prevNetBalance = prevTotalIncome - prevTotalExpenses + prevShippingProfit;
  const prevCheckedReimbursements = prevTransactions.filter((t) => t.type === "expense" && t.reimbursed).reduce((s, t) => s + t.amount, 0);
  const prevDirectIncome = prevTransactions.filter((t) => t.type === "income" && t.category === "direct").reduce((s, t) => s + t.amount, 0);
  const prevDirectExpenses = prevTransactions.filter((t) => t.type === "expense" && t.category === "direct").reduce((s, t) => s + t.amount, 0);
  const prevTreasury = prevTotalWithdrawals - prevCheckedReimbursements + prevDirectIncome - prevDirectExpenses;

  // Build delta props once per card — null skips the chip when the prior
  // month had zero of that metric (no meaningful baseline).
  const deltaIncome    = pctDelta(totalIncome,    prevTotalIncome);
  const deltaExpenses  = pctDelta(totalExpenses,  prevTotalExpenses);
  const deltaWithdraw  = pctDelta(totalWithdrawals, prevTotalWithdrawals);
  const deltaShipProf  = pctDelta(shippingProfit, prevShippingProfit);
  const deltaTreasury  = pctDelta(treasuryAccount, prevTreasury);
  const deltaNet       = pctDelta(netBalance,     prevNetBalance);
  const deltaLabel     = `vs ${prevLabel}`;

  function openAdd() {
    setEditingTx(null);
    setFormDate(isoToday());
    setFormType("expense");
    setFormCategory("shipping");
    setFormDescription("");
    setFormAmount("");
    setFormPaidBy("");
    setModalOpen(true);
  }

  function openEdit(tx: Transaction) {
    setEditingTx(tx);
    setFormDate(tx.date);
    setFormType(tx.type);
    setFormCategory(tx.category);
    setFormDescription(tx.description);
    setFormAmount(String(tx.amount));
    setFormPaidBy(tx.paid_by || "");
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);

    const payload = {
      date: formDate,
      type: formType,
      category: formType === "withdrawal" ? "withdrawal" : formCategory,
      description: formDescription,
      amount: parseFloat(formAmount),
      paid_by: formType === "expense" && formPaidBy ? formPaidBy : null,
    };

    try {
      if (editingTx) {
        await fetch("/api/finance", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ _id: editingTx._id, ...payload }),
        });
      } else {
        await fetch("/api/finance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      mutate();
      globalMutate("/api/finance/pending-reimbursements");
      setModalOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  function requestDelete(tx: Transaction) {
    setDeletingTx(tx);
  }

  async function confirmDelete() {
    const tx = deletingTx;
    if (!tx) return;
    await fetch("/api/finance", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: tx._id }),
    });
    setDeletingTx(null);
    mutate();
    globalMutate("/api/finance/pending-reimbursements");
  }

  async function toggleReimburse(tx: Transaction) {
    const next = !tx.reimbursed;
    await fetch("/api/finance/reimburse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: tx._id, reimbursed: next }),
    });
    mutate();
    globalMutate("/api/finance/pending-reimbursements");
  }

  const columns: Column<Transaction>[] = [
    {
      key: "date",
      label: "Date",
      sortable: true,
      render: (t) => new Date(t.date + "T00:00:00").toLocaleDateString("pt-PT"),
    },
    { key: "description", label: "Description", sortable: true },
    {
      key: "category",
      label: "Category",
      sortable: true,
      render: (t) => (
        <span style={{ textTransform: "capitalize" }}>{t.category}</span>
      ),
    },
    {
      key: "paid_by",
      label: "Paid By",
      sortable: true,
      render: (t) => (
        <span style={{ color: t.paid_by ? "var(--text-primary)" : "var(--text-muted)" }}>
          {t.paid_by || "—"}
        </span>
      ),
    },
    {
      key: "amount",
      label: "Amount",
      sortable: true,
      className: "text-right",
      render: (t) => (
        <span
          style={{
            color: t.type === "income" ? "var(--success)" : t.type === "withdrawal" ? "var(--text-muted)" : "var(--error)",
            fontFamily: "var(--font-mono)",
            fontWeight: 500,
          }}
        >
          {t.type === "income" ? "+" : "-"}€{Math.abs(t.amount).toFixed(2)}
        </span>
      ),
    },
    {
      key: "reimbursed",
      label: "Reimbursed",
      className: "text-center",
      render: (t) => {
        if (t.type !== "expense" || !t.paid_by) return null;
        return (
          <button
            onClick={(e) => { e.stopPropagation(); toggleReimburse(t); }}
            className="p-1 rounded-lg transition-colors"
            style={{ background: "transparent", border: "none", cursor: "pointer" }}
            title={t.reimbursed ? "Mark as not reimbursed" : "Mark as reimbursed"}
          >
            {t.reimbursed ? (
              <CheckCircle size={16} style={{ color: "var(--success)" }} />
            ) : (
              <Clock size={16} style={{ color: "var(--warning)" }} />
            )}
          </button>
        );
      },
    },
    {
      key: "_actions",
      label: "",
      render: (t) => (
        <div className="flex items-center gap-1 justify-end">
          <button
            onClick={(e) => { e.stopPropagation(); openEdit(t); }}
            className="p-1 rounded-lg transition-colors"
            style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); requestDelete(t); }}
            className="p-1 rounded-lg transition-colors"
            style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--error)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <H1 subtitle="Income, expenses, and reimbursements">Finance</H1>
        <div className="flex items-center gap-3">
          <MonthPicker
            value={month}
            onChange={(m) => startTransition(() => setMonth(m))}
            maxMonth={getCurrentMonth()}
          />
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background: "var(--accent)",
              color: "var(--accent-text)",
              border: "1px solid var(--accent)",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "var(--accent)"; }}
          >
            <PlusCircle size={16} /> Add transaction
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <StatCard
          title="Income"
          value={isLoading ? "..." : `€${totalIncome.toFixed(2)}`}
          icon={<TrendingUp size={20} style={{ color: "var(--success)" }} />}
          tone="success"
          tooltip="Manual income + Cardmarket net revenue"
          delta={deltaIncome != null ? { value: deltaIncome, label: deltaLabel } : undefined}
        />
        <StatCard
          title="Expenses"
          value={isLoading ? "..." : `€${totalExpenses.toFixed(2)}`}
          icon={<TrendingDown size={20} style={{ color: "var(--error)" }} />}
          tone="danger"
          tooltip="All expenses: shipping, operational, direct, and other"
          /* For expenses, lower = better, so we flip the sign on the delta
             so the user sees ↓ N% as success (they spent less). */
          delta={deltaExpenses != null ? { value: -deltaExpenses, label: deltaLabel } : undefined}
        />
        <StatCard
          title="Withdrawals"
          value={isLoading ? "..." : `€${totalWithdrawals.toFixed(2)}`}
          icon={<Banknote size={20} style={{ color: "var(--text-tertiary)" }} />}
          tone="muted"
          tooltip="Money withdrawn from Cardmarket balance"
          delta={deltaWithdraw != null ? { value: deltaWithdraw, label: deltaLabel } : undefined}
        />
        <StatCard
          title="Shipping Profit"
          value={isLoading ? "..." : `${shippingProfit >= 0 ? "" : "-"}€${Math.abs(shippingProfit).toFixed(2)}`}
          icon={<Package size={20} style={{ color: shippingProfit >= 0 ? "var(--success)" : "var(--error)" }} />}
          tone={shippingProfit >= 0 ? "success" : "danger"}
          tooltip="Cardmarket shipping collected minus actual postage costs"
          delta={deltaShipProf != null ? { value: deltaShipProf, label: deltaLabel } : undefined}
        />
        <StatCard
          title="Treasury Account"
          value={isLoading ? "..." : `${treasuryAccount >= 0 ? "" : "-"}€${Math.abs(treasuryAccount).toFixed(2)}`}
          icon={<Landmark size={20} style={{ color: "var(--text-tertiary)" }} />}
          tone="muted"
          tooltip="Withdrawals - Reimbursements paid + Direct Transactions net"
          delta={deltaTreasury != null ? { value: deltaTreasury, label: deltaLabel } : undefined}
        />
        <StatCard
          title="Net Balance"
          value={isLoading ? "..." : `${netBalance >= 0 ? "" : "-"}€${Math.abs(netBalance).toFixed(2)}`}
          icon={<Wallet size={20} style={{ color: netBalance >= 0 ? "var(--success)" : "var(--error)" }} />}
          tone={netBalance >= 0 ? "success" : "danger"}
          tooltip={isLoading ? "Income - Expenses + Shipping Profit" : `€${totalIncome.toFixed(2)} − €${totalExpenses.toFixed(2)} + €${shippingProfit.toFixed(2)} = €${netBalance.toFixed(2)}`}
          delta={deltaNet != null ? { value: deltaNet, label: deltaLabel } : undefined}
        />
      </div>

      {/* Expense category breakdown */}
      {expensesByCategory.length > 0 && (
        <Panel>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <H2 icon={<PieChartIcon size={16} />}>Where Expenses went</H2>
            <StatusPill tone="muted">€{totalExpenses.toFixed(2)} total</StatusPill>
          </div>
          <ExpenseBreakdownChart items={expensesByCategory} total={totalExpenses} />
        </Panel>
      )}

      {/* CM Revenue breakdown */}
      {cmRev && cmRev.orderCount > 0 && (
        <Panel>
          <div className="flex items-center justify-between mb-3">
            <H2 icon={<ShoppingBag size={16} />}>Cardmarket Revenue</H2>
            <StatusPill tone="muted">{cmRev.orderCount} orders</StatusPill>
          </div>
          <MetricRow
            items={[
              { label: "Total Sales", value: `€${cmRev.totalSales.toFixed(2)}` },
              { label: "Gross",       value: `€${cmRev.grossArticleValue.toFixed(2)}` },
              { label: "Fees",        value: `-€${(cmRev.sellingFees + cmRev.trusteeFees).toFixed(2)}`, tone: "danger" },
              { label: "Shipping",    value: `€${cmRev.shippingCosts.toFixed(2)}`, tone: "muted" },
              { label: "Net Revenue", value: `€${cmRev.netRevenue.toFixed(2)}`, tone: "success" },
            ]}
          />
        </Panel>
      )}

      {/* Transaction table */}
      <Panel>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <H2 icon={<Receipt size={16} />}>Transactions</H2>
          {transactions.length > 0 && (
            <div className="flex items-center gap-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
              <span>
                {transactions.length} transaction{transactions.length === 1 ? "" : "s"}
              </span>
              <span style={{ opacity: 0.4 }}>·</span>
              <span style={{ color: "var(--success)", fontFamily: "var(--font-mono)" }} title="Manual income only (CM revenue is in the Income card above)">
                +€{manualIncome.toFixed(2)} in
              </span>
              <span style={{ color: "var(--error)", fontFamily: "var(--font-mono)" }}>
                −€{totalExpenses.toFixed(2)} out
              </span>
              {totalWithdrawals > 0 && (
                <span style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }} title="Money pulled to your own account">
                  −€{totalWithdrawals.toFixed(2)} withdrawn
                </span>
              )}
            </div>
          )}
        </div>
        <DataTable
          columns={columns}
          data={transactions}
          keyField="_id"
          defaultSortKey="date"
          defaultSortDir="desc"
          emptyMessage="No transactions this month."
          rowHover
          renderMobileCard={(t) => (
            <div
              className="flex items-center justify-between gap-2 p-3"
              style={{ borderBottom: "1px solid var(--border-subtle)" }}
            >
              <div className="flex-1 min-w-0">
                <p
                  className="text-sm font-medium truncate"
                  style={{ color: "var(--text-primary)" }}
                >
                  {t.description}
                </p>
                <p
                  className="text-xs truncate"
                  style={{ color: "var(--text-muted)" }}
                >
                  {new Date(t.date + "T00:00:00").toLocaleDateString("pt-PT")} · {t.category}
                  {t.paid_by && ` · ${t.paid_by}`}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {t.type === "expense" && t.paid_by && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleReimburse(t);
                    }}
                    style={{ background: "none", border: "none", cursor: "pointer" }}
                  >
                    {t.reimbursed ? (
                      <CheckCircle size={14} style={{ color: "var(--success)" }} />
                    ) : (
                      <Clock size={14} style={{ color: "var(--warning)" }} />
                    )}
                  </button>
                )}
                <span
                  className="text-sm font-medium"
                  style={{
                    color: t.type === "income" ? "var(--success)" : "var(--error)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {t.type === "income" ? "+" : "-"}€{Math.abs(t.amount).toFixed(2)}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openEdit(t);
                  }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
                  aria-label="Edit"
                >
                  <Pencil size={14} />
                </button>
              </div>
            </div>
          )}
        />
      </Panel>

      {/* Add/Edit modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingTx ? "Edit transaction" : "Add transaction"}
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {/* Kind picker */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <KindCard
              active={formType === "expense"}
              onClick={() => setFormType("expense")}
              tone="danger"
              icon={<ArrowDownRight size={22} style={{ color: formType === "expense" ? "var(--error)" : "var(--text-secondary)" }} />}
              title="Expense"
              description="Money out — shipping, supplies, fees, or anything you paid for."
            />
            <KindCard
              active={formType === "income"}
              onClick={() => setFormType("income")}
              tone="success"
              icon={<TrendingUp size={22} style={{ color: formType === "income" ? "var(--success)" : "var(--text-secondary)" }} />}
              title="Income"
              description="Manual income — direct sales, refunds, or anything not coming from Cardmarket."
            />
            <KindCard
              active={formType === "withdrawal"}
              onClick={() => setFormType("withdrawal")}
              tone="neutral"
              icon={<Banknote size={22} style={{ color: formType === "withdrawal" ? "var(--text-primary)" : "var(--text-secondary)" }} />}
              title="Withdrawal"
              description="Money pulled out of the Cardmarket balance into your own account."
            />
          </div>

          {/* Form body */}
          <div className="flex flex-col gap-3 animate-[fadeIn_0.2s_ease]">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date">
                <input
                  type="date"
                  required
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="appraiser-field w-full px-3 py-2 rounded-lg text-sm"
                  style={{ ...fieldStyle, fontFamily: "var(--font-mono)" }}
                />
              </Field>
              <Field label="Amount (€)">
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  placeholder="0.00"
                  className="appraiser-field w-full px-3 py-2 rounded-lg text-sm"
                  style={{ ...fieldStyle, fontFamily: "var(--font-mono)" }}
                />
              </Field>
            </div>

            {formType !== "withdrawal" && (
              <Field label="Category">
                <Select
                  value={formCategory}
                  onChange={setFormCategory}
                  options={CATEGORIES}
                  className="w-full"
                />
              </Field>
            )}

            <Field label="Description">
              <input
                type="text"
                required
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="e.g. Shipping order #1234"
                className="appraiser-field w-full px-3 py-2 rounded-lg text-sm"
                style={fieldStyle}
              />
            </Field>

            {formType === "expense" && (
              <Field label="Paid by" hint="Set this if a team member fronted the cost — used for reimbursements.">
                <Select
                  value={formPaidBy}
                  onChange={setFormPaidBy}
                  options={paidByOptions}
                  className="w-full"
                  placeholder="Select member..."
                />
              </Field>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !formDescription || !formAmount}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                background: submitting || !formDescription || !formAmount ? "var(--bg-card)" : "var(--accent)",
                color: submitting || !formDescription || !formAmount ? "var(--text-muted)" : "var(--accent-text)",
                border: "1px solid var(--accent)",
                opacity: submitting || !formDescription || !formAmount ? 0.6 : 1,
                cursor: submitting || !formDescription || !formAmount ? "not-allowed" : "pointer",
              }}
            >
              {submitting ? "Saving…" : editingTx ? "Update transaction" : "Add transaction"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!deletingTx}
        onClose={() => setDeletingTx(null)}
        onConfirm={confirmDelete}
        title="Delete transaction"
        message={deletingTx ? `Delete "${deletingTx.description}"? This cannot be undone.` : ""}
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}

// Stable category color map. Same colors regardless of which categories
// are present this month so a returning user gets visual consistency.
const CATEGORY_COLOR: Record<string, string> = {
  shipping:    "var(--accent)",
  operational: "var(--warning)",
  direct:      "var(--info)",
  other:       "var(--text-tertiary)",
  withdrawal:  "var(--text-muted)",
};

function categoryColor(c: string): string {
  return CATEGORY_COLOR[c] ?? "var(--text-tertiary)";
}

function categoryLabel(c: string): string {
  return c.charAt(0).toUpperCase() + c.slice(1);
}

interface ExpenseTooltipPayload {
  payload: { category: string; total: number };
}

function ExpenseChartTooltip({ active, payload, total }: {
  active?: boolean;
  payload?: ExpenseTooltipPayload[];
  total: number;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const pct = total > 0 ? (p.total / total) * 100 : 0;
  return (
    <div
      style={{
        background: "rgba(15, 20, 25, 0.95)",
        border: "1px solid rgba(255,255,255,0.15)",
        borderRadius: 8,
        padding: "8px 10px",
        fontSize: 11,
        color: "var(--text-primary)",
        boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
      }}
    >
      <div style={{ color: categoryColor(p.category), fontWeight: 600, marginBottom: 2 }}>
        {categoryLabel(p.category)}
      </div>
      <div style={{ fontFamily: "var(--font-mono)" }}>
        €{p.total.toFixed(2)} · {pct.toFixed(1)}%
      </div>
    </div>
  );
}

function ExpenseBreakdownChart({
  items,
  total,
}: {
  items: { category: string; total: number }[];
  total: number;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-4 items-center">
      <div style={{ width: "100%", height: 180 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={items}
              dataKey="total"
              nameKey="category"
              cx="50%"
              cy="50%"
              innerRadius={48}
              outerRadius={80}
              paddingAngle={2}
              isAnimationActive={false}
            >
              {items.map((it) => (
                <Cell key={it.category} fill={categoryColor(it.category)} stroke="var(--bg-page)" strokeWidth={2} />
              ))}
            </Pie>
            <RechartTooltip content={<ExpenseChartTooltip total={total} />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-col gap-1.5">
        {items.map((it) => {
          const pct = total > 0 ? (it.total / total) * 100 : 0;
          return (
            <div key={it.category} className="flex items-center gap-2 text-sm">
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: categoryColor(it.category),
                  flexShrink: 0,
                }}
              />
              <span style={{ color: "var(--text-primary)", flex: 1, minWidth: 0 }}>
                {categoryLabel(it.category)}
              </span>
              <span style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 13 }}>
                €{it.total.toFixed(2)}
              </span>
              <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 11, minWidth: 42, textAlign: "right" }}>
                {pct.toFixed(0)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
