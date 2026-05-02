"use client";
import useSWR from "swr";
import { useState } from "react";
import { fetcher } from "@/lib/fetcher";
import DataTable, { type Column } from "@/components/dashboard/data-table";
import Select from "@/components/dashboard/select";
import { Panel, H1, H2 } from "@/components/dashboard/page-shell";
import { Activity as ActivityIcon } from "lucide-react";

interface ActivityEntry {
  _id: string;
  timestamp: string;
  user: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: string | Record<string, unknown>;
  [key: string]: unknown;
}

function formatDetails(d: ActivityEntry["details"]): string {
  if (typeof d === "string") return d;
  if (d == null) return "";
  try { return JSON.stringify(d); } catch { return String(d); }
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
      <span style={{ color: "var(--text-muted)", fontSize: "13px" }}>{formatDetails(e.details)}</span>
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
      <H1 subtitle="Audit log of every action across the dashboard">Activity</H1>

      <Panel>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <H2 icon={<ActivityIcon size={16} />}>Recent activity</H2>
          <div className="flex items-center gap-2 flex-wrap">
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
        </div>

        <DataTable
        columns={columns}
        data={entries}
        keyField="_id"
        defaultSortKey="timestamp"
        renderMobileCard={(e) => (
          <div
            className="p-3"
            style={{ borderBottom: "1px solid var(--border-subtle)" }}
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <span
                className="text-sm font-medium truncate"
                style={{ color: "var(--text-primary)" }}
              >
                <span style={{ textTransform: "capitalize" }}>{e.action}</span>{" "}
                <span style={{ color: "var(--text-muted)" }}>{e.entity_type}</span>
              </span>
              <span
                className="shrink-0 text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                {new Date(e.timestamp).toLocaleString("pt-PT", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <p
              className="text-xs break-words"
              style={{ color: "var(--text-muted)", margin: 0 }}
            >
              {e.user} · {formatDetails(e.details)}
            </p>
          </div>
        )}
        />
      </Panel>
    </div>
  );
}
