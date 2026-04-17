"use client";
import useSWR from "swr";
import { useState } from "react";
import { fetcher } from "@/lib/fetcher";
import StatCard from "@/components/dashboard/stat-card";
import DataTable, { type Column } from "@/components/dashboard/data-table";
import Modal from "@/components/dashboard/modal";
import { CheckSquare, Clock, CheckCheck, PlusCircle } from "lucide-react";

type TaskStatus = "todo" | "in-progress" | "done";
type TaskPriority = "high" | "medium" | "low";

interface Task {
  _id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee?: string;
  dueDate?: string;
  [key: string]: unknown;
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  "todo": "To Do",
  "in-progress": "In Progress",
  "done": "Done",
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  "todo": "var(--text-muted)",
  "in-progress": "var(--warning, #f59e0b)",
  "done": "var(--success)",
};

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  "high": "var(--danger, #ef4444)",
  "medium": "var(--warning, #f59e0b)",
  "low": "var(--success)",
};

const STATUS_FILTERS: { label: string; value: TaskStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "To Do", value: "todo" },
  { label: "In Progress", value: "in-progress" },
  { label: "Done", value: "done" },
];

const columns: Column<Task>[] = [
  { key: "title" as const, label: "Title", sortable: true },
  {
    key: "status" as const,
    label: "Status",
    sortable: true,
    render: (t: Task) => (
      <span style={{ color: STATUS_COLORS[t.status], fontSize: "13px", fontWeight: 500 }}>
        {STATUS_LABELS[t.status]}
      </span>
    ),
  },
  {
    key: "priority" as const,
    label: "Priority",
    sortable: true,
    render: (t: Task) => (
      <span
        style={{
          color: PRIORITY_COLORS[t.priority],
          fontSize: "12px",
          fontWeight: 600,
          textTransform: "capitalize",
          background: `${PRIORITY_COLORS[t.priority]}22`,
          padding: "2px 8px",
          borderRadius: "999px",
        }}
      >
        {t.priority}
      </span>
    ),
  },
  {
    key: "assignee" as const,
    label: "Assignee",
    sortable: true,
    render: (t: Task) => (
      <span style={{ color: "var(--text-muted)", fontSize: "13px" }}>{t.assignee ?? "—"}</span>
    ),
  },
  {
    key: "dueDate" as const,
    label: "Due Date",
    sortable: true,
    render: (t: Task) =>
      t.dueDate ? new Date(t.dueDate).toLocaleDateString() : "—",
  },
];

export default function TasksContent() {
  const { data, isLoading } = useSWR<{ data: Task[] }>("/api/tasks", fetcher);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [modalOpen, setModalOpen] = useState(false);
  const tasks = data?.data ?? [];

  const filtered = statusFilter === "all" ? tasks : tasks.filter(t => t.status === statusFilter);
  const inProgress = tasks.filter(t => t.status === "in-progress").length;
  const completed = tasks.filter(t => t.status === "done").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 style={{ fontSize: "24px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
          Tasks
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
          <PlusCircle size={16} /> Add Task
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
        <StatCard title="Total Tasks" value={isLoading ? "..." : tasks.length} icon={<CheckSquare size={20} />} />
        <StatCard title="In Progress" value={isLoading ? "..." : inProgress} icon={<Clock size={20} />} active />
        <StatCard title="Completed" value={isLoading ? "..." : completed} icon={<CheckCheck size={20} />} />
      </div>

      {/* Status filter pills */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {STATUS_FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            style={{
              background: statusFilter === f.value ? "var(--accent)" : "var(--bg-card)",
              color: statusFilter === f.value ? "var(--accent-text)" : "var(--text-secondary)",
              border: `1px solid ${statusFilter === f.value ? "var(--accent)" : "var(--border)"}`,
              borderRadius: "999px",
              padding: "6px 16px",
              fontSize: "13px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        keyField="_id"
        defaultSortKey="dueDate"
        renderMobileCard={(t) => (
          <div
            className="p-3"
            style={{ borderBottom: "1px solid var(--border-subtle)" }}
          >
            <div className="flex items-start justify-between gap-2">
              <p
                className="text-sm font-medium min-w-0 break-words"
                style={{ color: "var(--text-primary)" }}
              >
                {t.title}
              </p>
              <span
                className="shrink-0 text-xs font-semibold capitalize"
                style={{
                  color: PRIORITY_COLORS[t.priority],
                  background: `${PRIORITY_COLORS[t.priority]}22`,
                  padding: "2px 8px",
                  borderRadius: 999,
                }}
              >
                {t.priority}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2 flex-wrap text-xs">
              <span style={{ color: STATUS_COLORS[t.status], fontWeight: 500 }}>
                {STATUS_LABELS[t.status]}
              </span>
              <span style={{ color: "rgba(255,255,255,0.15)" }}>·</span>
              <span style={{ color: "var(--text-muted)" }}>
                {t.assignee ?? "—"}
              </span>
              {t.dueDate && (
                <>
                  <span style={{ color: "rgba(255,255,255,0.15)" }}>·</span>
                  <span style={{ color: "var(--text-muted)" }}>
                    {new Date(t.dueDate).toLocaleDateString()}
                  </span>
                </>
              )}
            </div>
          </div>
        )}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Task">
        <p style={{ color: "var(--text-secondary)" }}>Task form — customize this for your domain.</p>
      </Modal>
    </div>
  );
}
