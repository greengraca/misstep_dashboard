"use client";
import useSWR from "swr";
import { useState } from "react";
import { fetcher } from "@/lib/fetcher";
import DataTable, { type Column } from "@/components/dashboard/data-table";

interface ActivityEntry {
  _id: string;
  timestamp: string;
  user: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: string;
  [key: string]: unknown;
}

const columns: Column<ActivityEntry>[] = [
  {
    key: "timestamp" as const,
    label: "Timestamp",
    sortable: true,
    render: (e: ActivityEntry) =>
      new Date(e.timestamp).toLocaleString(),
  },
  { key: "user" as const, label: "User", sortable: true },
  {
    key: "action" as const,
    label: "Action",
    sortable: true,
    render: (e: ActivityEntry) => (
      <span style={{ textTransform: "capitalize", fontSize: "13px" }}>{e.action}</span>
    ),
  },
  { key: "entity_type" as const, label: "Entity Type", sortable: true },
  { key: "entity_id" as const, label: "Entity ID", sortable: false },
  {
    key: "details" as const,
    label: "Details",
    sortable: false,
    render: (e: ActivityEntry) => (
      <span style={{ color: "var(--text-muted)", fontSize: "13px" }}>{e.details}</span>
    ),
  },
];

const selectStyle = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  padding: "6px 12px",
  color: "var(--text-primary)",
  fontSize: "14px",
  outline: "none",
  cursor: "pointer",
};

export default function ActivityContent() {
  const [entityFilter, setEntityFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");

  const params = new URLSearchParams();
  if (entityFilter) params.set("entity_type", entityFilter);
  if (actionFilter) params.set("action", actionFilter);

  const { data, isLoading } = useSWR<{ data: ActivityEntry[]; entityTypes: string[]; actions: string[] }>(
    `/api/activity?${params.toString()}`,
    fetcher
  );

  const entries = data?.data ?? [];
  const entityTypes = data?.entityTypes ?? [];
  const actions = data?.actions ?? [];

  return (
    <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "24px" }}>
      <h1 style={{ fontSize: "24px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        Activity
      </h1>

      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
        <select
          value={entityFilter}
          onChange={e => setEntityFilter(e.target.value)}
          style={selectStyle}
        >
          <option value="">All Entity Types</option>
          {entityTypes.map(et => (
            <option key={et} value={et}>{et}</option>
          ))}
        </select>
        <select
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value)}
          style={selectStyle}
        >
          <option value="">All Actions</option>
          {actions.map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        {(entityFilter || actionFilter) && (
          <button
            onClick={() => { setEntityFilter(""); setActionFilter(""); }}
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "6px 12px",
              color: "var(--text-muted)",
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={entries}
        keyField="_id"
        defaultSortKey="timestamp"
      />
    </div>
  );
}
