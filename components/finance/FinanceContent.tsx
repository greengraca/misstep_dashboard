"use client";
import useSWR from "swr";
import { useState } from "react";
import { fetcher } from "@/lib/fetcher";
import StatCard from "@/components/dashboard/stat-card";
import DataTable, { type Column } from "@/components/dashboard/data-table";
import Modal from "@/components/dashboard/modal";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Wallet, TrendingUp, TrendingDown, PlusCircle } from "lucide-react";

interface Transaction {
  _id: string;
  date: string;
  description: string;
  type: "income" | "expense";
  amount: number;
  category: string;
  [key: string]: unknown;
}

const columns: Column<Transaction>[] = [
  {
    key: "date" as const,
    label: "Date",
    sortable: true,
    render: (t: Transaction) => new Date(t.date).toLocaleDateString(),
  },
  { key: "description" as const, label: "Description", sortable: true },
  {
    key: "type" as const,
    label: "Type",
    sortable: true,
    render: (t: Transaction) => (
      <span
        style={{
          color: t.type === "income" ? "var(--success)" : "var(--danger, #ef4444)",
          fontSize: "13px",
          fontWeight: 500,
          textTransform: "capitalize",
        }}
      >
        {t.type}
      </span>
    ),
  },
  {
    key: "amount" as const,
    label: "Amount",
    sortable: true,
    render: (t: Transaction) => (
      <span style={{ color: t.type === "income" ? "var(--success)" : "var(--danger, #ef4444)" }}>
        {t.type === "income" ? "+" : "-"}${Math.abs(t.amount).toFixed(2)}
      </span>
    ),
  },
  { key: "category" as const, label: "Category", sortable: true },
];

export default function FinanceContent() {
  const { data, isLoading } = useSWR<{ data: Transaction[]; monthly: { month: string; income: number; expenses: number }[] }>(
    "/api/finance",
    fetcher
  );
  const [modalOpen, setModalOpen] = useState(false);
  const transactions = data?.data ?? [];
  const monthly = data?.monthly ?? [];

  const totalIncome = transactions.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const totalExpenses = transactions.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const netBalance = totalIncome - totalExpenses;

  return (
    <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
          Finance
        </h1>
        <button
          onClick={() => setModalOpen(true)}
          style={{
            background: "var(--accent)",
            color: "var(--accent-text)",
            border: "none",
            borderRadius: "var(--radius)",
            padding: "8px 16px",
            fontSize: "14px",
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <PlusCircle size={16} /> Add Transaction
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
        <StatCard
          title="Total Income"
          value={isLoading ? "..." : `$${totalIncome.toFixed(2)}`}
          icon={<TrendingUp size={20} />}
          active
        />
        <StatCard
          title="Total Expenses"
          value={isLoading ? "..." : `$${totalExpenses.toFixed(2)}`}
          icon={<TrendingDown size={20} />}
        />
        <StatCard
          title="Net Balance"
          value={isLoading ? "..." : `$${netBalance.toFixed(2)}`}
          icon={<Wallet size={20} />}
        />
      </div>

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
          Monthly Breakdown
        </h2>
        {monthly.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>No data yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthly} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fill: "var(--text-muted)", fontSize: 12 }} />
              <YAxis tick={{ fill: "var(--text-muted)", fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  color: "var(--text-primary)",
                }}
              />
              <Bar dataKey="income" fill="var(--success)" name="Income" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expenses" fill="var(--danger, #ef4444)" name="Expenses" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <DataTable
        columns={columns}
        data={transactions}
        keyField="_id"
        defaultSortKey="date"
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Transaction">
        <p style={{ color: "var(--text-secondary)" }}>Transaction form — customize this for your domain.</p>
      </Modal>
    </div>
  );
}
