"use client";
import useSWR from "swr";
import { useMemo, useState } from "react";
import { fetcher } from "@/lib/fetcher";
import DataTable, { type Column } from "@/components/dashboard/data-table";
import Select from "@/components/dashboard/select";
import { Panel, H1 } from "@/components/dashboard/page-shell";
import { StatusPill, type StatusPillTone } from "@/components/dashboard/status-pill";
import { Plus, Pencil, Trash2, RefreshCw, Eye, HelpCircle } from "lucide-react";

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

function formatDetails(d: ActivityEntry["details"]): React.ReactNode {
  if (typeof d === "string") return d;
  if (d == null) return "";
  if (typeof d === "object") {
    // Render as compact key:value pairs instead of raw JSON.
    const entries = Object.entries(d).slice(0, 6);
    return entries
      .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
      .join(" · ");
  }
  return String(d);
}

const ACTION_META: Record<string, { tone: StatusPillTone; icon: React.ReactNode }> = {
  create:  { tone: "success", icon: <Plus size={11} /> },
  update:  { tone: "info",    icon: <Pencil size={11} /> },
  delete:  { tone: "danger",  icon: <Trash2 size={11} /> },
  sync:    { tone: "accent",  icon: <RefreshCw size={11} /> },
  view:    { tone: "muted",   icon: <Eye size={11} /> },
};

function actionMeta(action: string) {
  return ACTION_META[action.toLowerCase()] ?? { tone: "muted" as StatusPillTone, icon: <HelpCircle size={11} /> };
}

const columns: Column<ActivityEntry>[] = [
  {
    key: "timestamp" as const,
    label: "Timestamp",
    sortable: true,
    render: (e: ActivityEntry) => (
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)" }}>
        {new Date(e.timestamp).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
      </span>
    ),
  },
  { key: "user" as const, label: "User", sortable: true },
  {
    key: "action" as const,
    label: "Action",
    sortable: true,
    render: (e: ActivityEntry) => {
      const meta = actionMeta(e.action);
      return (
        <StatusPill tone={meta.tone}>
          <span className="inline-flex items-center gap-1">
            {meta.icon}
            <span style={{ textTransform: "capitalize" }}>{e.action}</span>
          </span>
        </StatusPill>
      );
    },
  },
  { key: "entity_type" as const, label: "Entity", sortable: true },
  {
    key: "entity_id" as const,
    label: "ID",
    sortable: false,
    render: (e: ActivityEntry) => (
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
        {e.entity_id.slice(-8)}
      </span>
    ),
  },
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
        <div className="flex items-center justify-end gap-2 mb-3 flex-wrap">
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
