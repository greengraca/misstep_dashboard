"use client";

import { useState, useTransition } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { fetcher } from "@/lib/fetcher";
import type { Transaction } from "@/lib/types";
import StatCard from "@/components/dashboard/stat-card";
import DataTable, { type Column } from "@/components/dashboard/data-table";
import Modal from "@/components/dashboard/modal";
import MonthPicker from "@/components/dashboard/month-picker";
import Select from "@/components/dashboard/select";
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
} from "lucide-react";

const TEAM_MEMBERS = ["Graça", "Bezugas", "Mil"];
const CATEGORIES = [
  { value: "shipping", label: "Shipping" },
  { value: "operational", label: "Operational" },
  { value: "direct", label: "Direct Transaction" },
  { value: "other", label: "Other" },
];
const TYPE_OPTIONS = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "withdrawal", label: "Withdrawal" },
];
const PAID_BY_OPTIONS = [
  { value: "", label: "None" },
  ...TEAM_MEMBERS.map((m) => ({ value: m, label: m })),
];

function getCurrentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function todayParts() {
  const d = new Date();
  return {
    day: String(d.getDate()),
    month: String(d.getMonth() + 1),
    year: String(d.getFullYear()),
  };
}

function daysInMonth(month: number, year: number) {
  return new Date(year, month, 0).getDate();
}

function buildDateStr(day: string, month: string, year: string) {
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: new Date(2000, i).toLocaleDateString("en-US", { month: "short" }),
}));

function getYearOptions() {
  const current = new Date().getFullYear();
  return Array.from({ length: 5 }, (_, i) => {
    const y = String(current - i);
    return { value: y, label: y };
  });
}

const inputStyle = {
  background: "var(--bg-card)",
  borderColor: "var(--border)",
  color: "var(--text-primary)",
};

const labelClass = "block text-xs font-medium uppercase tracking-wider mb-1.5";

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

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [formDay, setFormDay] = useState(todayParts().day);
  const [formMonth, setFormMonth] = useState(todayParts().month);
  const [formYear, setFormYear] = useState(todayParts().year);
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

  function openAdd() {
    setEditingTx(null);
    const t = todayParts();
    setFormDay(t.day);
    setFormMonth(t.month);
    setFormYear(t.year);
    setFormType("expense");
    setFormCategory("shipping");
    setFormDescription("");
    setFormAmount("");
    setFormPaidBy("");
    setModalOpen(true);
  }

  function openEdit(tx: Transaction) {
    setEditingTx(tx);
    const [y, m, d] = tx.date.split("-");
    setFormDay(String(parseInt(d)));
    setFormMonth(String(parseInt(m)));
    setFormYear(y);
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
      date: buildDateStr(formDay, formMonth, formYear),
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

  async function handleDelete(tx: Transaction) {
    if (!confirm(`Delete "${tx.description}"?`)) return;
    await fetch("/api/finance", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: tx._id }),
    });
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
            color: t.type === "income" ? "var(--success)" : t.type === "withdrawal" ? "var(--text-muted)" : "var(--error, #ef4444)",
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
      label: "Reimb.",
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
              <Clock size={16} style={{ color: "var(--warning, #f59e0b)" }} />
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
            onClick={(e) => { e.stopPropagation(); handleDelete(t); }}
            className="p-1 rounded-lg transition-colors"
            style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--error, #ef4444)"; }}
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 style={{ fontSize: "24px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
          Finance
        </h1>
        <div className="flex items-center gap-3">
          <MonthPicker
            value={month}
            onChange={(m) => startTransition(() => setMonth(m))}
            maxMonth={getCurrentMonth()}
          />
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              background: "rgba(251, 191, 36, 0.15)",
              color: "var(--accent)",
              border: "1px solid rgba(251, 191, 36, 0.35)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(251, 191, 36, 0.25)";
              e.currentTarget.style.borderColor = "rgba(251, 191, 36, 0.50)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(251, 191, 36, 0.15)";
              e.currentTarget.style.borderColor = "rgba(251, 191, 36, 0.35)";
            }}
          >
            <PlusCircle size={16} /> Add
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
        <StatCard
          title="Income"
          value={isLoading ? "..." : `€${totalIncome.toFixed(2)}`}
          icon={<TrendingUp size={20} style={{ color: "var(--accent)" }} />}
        />
        <StatCard
          title="Expenses"
          value={isLoading ? "..." : `€${totalExpenses.toFixed(2)}`}
          icon={<TrendingDown size={20} style={{ color: "var(--accent)" }} />}
        />
        <StatCard
          title="Withdrawals"
          value={isLoading ? "..." : `€${totalWithdrawals.toFixed(2)}`}
          icon={<Banknote size={20} style={{ color: "var(--accent)" }} />}
        />
        <StatCard
          title="Net Balance"
          value={isLoading ? "..." : `${netBalance >= 0 ? "" : "-"}€${Math.abs(netBalance).toFixed(2)}`}
          icon={<Wallet size={20} style={{ color: "var(--accent)" }} />}
          active={netBalance > 0}
        />
        <StatCard
          title="Shipping Profit"
          value={isLoading ? "..." : `${shippingProfit >= 0 ? "" : "-"}€${Math.abs(shippingProfit).toFixed(2)}`}
          icon={<Package size={20} style={{ color: "var(--accent)" }} />}
          active={shippingProfit > 0}
        />
        <StatCard
          title="Treasury Account"
          value={isLoading ? "..." : `${treasuryAccount >= 0 ? "" : "-"}€${Math.abs(treasuryAccount).toFixed(2)}`}
          icon={<Landmark size={20} style={{ color: "var(--accent)" }} />}
          active={treasuryAccount > 0}
        />
      </div>

      {/* CM Revenue breakdown */}
      {cmRev && cmRev.orderCount > 0 && (
        <div
          className="p-4 rounded-xl"
          style={{
            background: "var(--surface-gradient)",
            backdropFilter: "var(--surface-blur)",
            border: "var(--surface-border)",
            boxShadow: "var(--surface-shadow)",
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <ShoppingBag size={16} style={{ color: "var(--accent)" }} />
            <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
              Cardmarket Revenue
            </h2>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {cmRev.orderCount} orders
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
            <div>
              <span style={{ color: "var(--text-muted)" }}>Total Sales</span>
              <p className="text-sm font-medium mt-0.5" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                €{cmRev.totalSales.toFixed(2)}
              </p>
            </div>
            <div>
              <span style={{ color: "var(--text-muted)" }}>Gross</span>
              <p className="text-sm font-medium mt-0.5" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                €{cmRev.grossArticleValue.toFixed(2)}
              </p>
            </div>
            <div>
              <span style={{ color: "var(--text-muted)" }}>Fees</span>
              <p className="text-sm font-medium mt-0.5" style={{ color: "var(--error, #ef4444)", fontFamily: "var(--font-mono)" }}>
                -€{(cmRev.sellingFees + cmRev.trusteeFees).toFixed(2)}
              </p>
            </div>
            <div>
              <span style={{ color: "var(--text-muted)" }}>Shipping Costs</span>
              <p className="text-sm font-medium mt-0.5" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                €{cmRev.shippingCosts.toFixed(2)}
              </p>
            </div>
            <div>
              <span style={{ color: "var(--text-muted)" }}>Net Revenue</span>
              <p className="text-sm font-medium mt-0.5" style={{ color: "var(--success)", fontFamily: "var(--font-mono)" }}>
                €{cmRev.netRevenue.toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Transaction table */}
      <div
        style={{
          background: "var(--surface-gradient)",
          backdropFilter: "var(--surface-blur)",
          border: "var(--surface-border)",
          boxShadow: "var(--surface-shadow)",
          borderRadius: "var(--radius)",
          padding: "24px",
        }}
      >
        <h2 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", marginTop: 0, marginBottom: "16px" }}>
          Transactions
        </h2>
        <DataTable
          columns={columns}
          data={transactions}
          keyField="_id"
          defaultSortKey="date"
          defaultSortDir="desc"
          emptyMessage="No transactions this month."
          rowHover
          renderMobileCard={(t) => (
            <div className="flex items-center justify-between p-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{t.description}</p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {new Date(t.date + "T00:00:00").toLocaleDateString("pt-PT")} · {t.category}
                  {t.paid_by && ` · ${t.paid_by}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {t.type === "expense" && t.paid_by && (
                  <button onClick={() => toggleReimburse(t)} style={{ background: "none", border: "none", cursor: "pointer" }}>
                    {t.reimbursed
                      ? <CheckCircle size={14} style={{ color: "var(--success)" }} />
                      : <Clock size={14} style={{ color: "var(--warning, #f59e0b)" }} />
                    }
                  </button>
                )}
                <span
                  className="text-sm font-medium"
                  style={{
                    color: t.type === "income" ? "var(--success)" : "var(--error, #ef4444)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {t.type === "income" ? "+" : "-"}€{Math.abs(t.amount).toFixed(2)}
                </span>
              </div>
            </div>
          )}
        />
      </div>

      {/* Add/Edit modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingTx ? "Edit Transaction" : "Add Transaction"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Date */}
          <div>
            <label className={labelClass} style={{ color: "var(--text-muted)" }}>Date</label>
            <div className="flex gap-2">
              <Select
                value={formDay}
                onChange={setFormDay}
                options={Array.from(
                  { length: daysInMonth(parseInt(formMonth), parseInt(formYear)) },
                  (_, i) => ({ value: String(i + 1), label: String(i + 1) })
                )}
                className="flex-1"
                placeholder="Day"
              />
              <Select
                value={formMonth}
                onChange={(m) => {
                  setFormMonth(m);
                  const maxDay = daysInMonth(parseInt(m), parseInt(formYear));
                  if (parseInt(formDay) > maxDay) setFormDay(String(maxDay));
                }}
                options={MONTH_OPTIONS}
                className="flex-1"
                placeholder="Month"
              />
              <Select
                value={formYear}
                onChange={setFormYear}
                options={getYearOptions()}
                className="flex-1"
                placeholder="Year"
              />
            </div>
          </div>

          {/* Type toggle */}
          <div>
            <label className={labelClass} style={{ color: "var(--text-muted)" }}>Type</label>
            <div className="flex gap-2">
              {TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFormType(opt.value)}
                  className="flex-1 px-3 py-2 rounded-lg border text-sm font-medium capitalize transition-colors"
                  style={{
                    background: formType === opt.value
                      ? opt.value === "expense" ? "var(--error-light, rgba(239,68,68,0.1))"
                        : opt.value === "withdrawal" ? "rgba(251,191,36,0.1)"
                        : "var(--success-light, rgba(34,197,94,0.1))"
                      : "var(--bg-card)",
                    borderColor: formType === opt.value
                      ? opt.value === "expense" ? "var(--error, #ef4444)"
                        : opt.value === "withdrawal" ? "#fbbf24"
                        : "var(--success)"
                      : "var(--border)",
                    color: formType === opt.value
                      ? opt.value === "expense" ? "var(--error, #ef4444)"
                        : opt.value === "withdrawal" ? "#fbbf24"
                        : "var(--success)"
                      : "var(--text-secondary)",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Category (not for withdrawals) */}
          {formType !== "withdrawal" && (
            <div>
              <label className={labelClass} style={{ color: "var(--text-muted)" }}>Category</label>
              <Select
                value={formCategory}
                onChange={setFormCategory}
                options={CATEGORIES}
                className="w-full"
              />
            </div>
          )}

          {/* Description */}
          <div>
            <label className={labelClass} style={{ color: "var(--text-muted)" }}>Description</label>
            <input
              type="text"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              required
              placeholder="e.g. Shipping order #1234"
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none focus:border-[var(--accent)]"
              style={inputStyle}
            />
          </div>

          {/* Amount */}
          <div>
            <label className={labelClass} style={{ color: "var(--text-muted)" }}>Amount (€)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={formAmount}
              onChange={(e) => setFormAmount(e.target.value)}
              required
              placeholder="0.00"
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none focus:border-[var(--accent)]"
              style={inputStyle}
            />
          </div>

          {/* Paid By (expenses only) */}
          {formType === "expense" && (
            <div>
              <label className={labelClass} style={{ color: "var(--text-muted)" }}>Paid By</label>
              <Select
                value={formPaidBy}
                onChange={setFormPaidBy}
                options={PAID_BY_OPTIONS}
                className="w-full"
                placeholder="Select member..."
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="flex-1 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors"
              style={{
                background: "transparent",
                borderColor: "var(--border)",
                color: "var(--text-secondary)",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !formDescription || !formAmount}
              className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              style={{
                background: "rgba(251, 191, 36, 0.15)",
                color: "var(--accent)",
                border: "1px solid rgba(251, 191, 36, 0.35)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(251, 191, 36, 0.25)";
                e.currentTarget.style.borderColor = "rgba(251, 191, 36, 0.50)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(251, 191, 36, 0.15)";
                e.currentTarget.style.borderColor = "rgba(251, 191, 36, 0.35)";
              }}
            >
              {submitting ? "Saving..." : editingTx ? "Update" : "Add"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
