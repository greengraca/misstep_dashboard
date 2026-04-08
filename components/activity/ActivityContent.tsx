"use client";
import useSWR from "swr";
import { useState } from "react";
import { fetcher } from "@/lib/fetcher";
import DataTable, { type Column } from "@/components/dashboard/data-table";
import Select from "@/components/dashboard/select";

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
      new Date(e.timestamp).toLocaleString("pt-PT"),
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

export default function ActivityContent() {
  const [entityFilter, setEntityFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");

  const params = new URLSearchParams();
  if (entityFilter) params.set("entity_type", entityFilter);
  if (actionFilter) params.set("action", actionFilter);

  const { data } = useSWR<{ data: ActivityEntry[]; entityTypes: string[]; actions: string[] }>(
    `/api/activity?${params.toString()}`,
    fetcher
  );

  const entries = data?.data ?? [];
  const entityTypes = data?.entityTypes ?? [];
  const actions = data?.actions ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <h1 style={{ fontSize: "24px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        Activity
      </h1>

      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
        <Select
          value={entityFilter}
          onChange={setEntityFilter}
          options={[
            { value: "", label: "All Entity Types" },
            ...entityTypes.map((et) => ({ value: et, label: et })),
          ]}
          size="sm"
        />
        <Select
          value={actionFilter}
          onChange={setActionFilter}
          options={[
            { value: "", label: "All Actions" },
            ...actions.map((a) => ({ value: a, label: a })),
          ]}
          size="sm"
        />
        {(entityFilter || actionFilter) && (
          <button
            onClick={() => { setEntityFilter(""); setActionFilter(""); }}
            className="px-3 py-1 rounded-lg border text-xs font-medium transition-colors"
            style={{
              background: "transparent",
              borderColor: "var(--border)",
              color: "var(--text-muted)",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
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
