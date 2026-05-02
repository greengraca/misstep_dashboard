"use client";
import useSWR from "swr";
import { useMemo, useState } from "react";
import Link from "next/link";
import { fetcher } from "@/lib/fetcher";
import Select from "@/components/dashboard/select";
import { Panel, H1 } from "@/components/dashboard/page-shell";
import { StatusPill, type StatusPillTone } from "@/components/dashboard/status-pill";
import { Plus, Pencil, Trash2, RefreshCw, Eye, HelpCircle, ExternalLink } from "lucide-react";

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
  if (typeof d === "object") {
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

/** Map an audit-log entity to a dashboard URL when one exists. Returns null
 *  when the entity has no detail surface (e.g. one-off sync events). */
function entityHref(type: string, id: string): string | null {
  const t = type.toLowerCase();
  if (t === "investment") return `/investments/${id}`;
  if (t === "ev_product" || t === "product") return `/ev/product/${id}`;
  if (t === "ev_set" || t === "set") return `/ev?view=sets&set=${id}`;
  if (t === "transaction" || t === "expense" || t === "income") return `/finance`;
  if (t === "team_member" || t === "member") return `/settings`;
  return null;
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(iso) === dayKey(today.toISOString())) return "Today";
  if (dayKey(iso) === dayKey(yesterday.toISOString())) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

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

  // Group entries by day, preserving sort order within each day.
  const grouped = useMemo(() => {
    const sorted = [...entries].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    const groups: { key: string; label: string; rows: ActivityEntry[] }[] = [];
    for (const e of sorted) {
      const k = dayKey(e.timestamp);
      const last = groups[groups.length - 1];
      if (last && last.key === k) {
        last.rows.push(e);
      } else {
        groups.push({ key: k, label: dayLabel(e.timestamp), rows: [e] });
      }
    }
    return groups;
  }, [entries]);

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

        {entries.length === 0 ? (
          <p className="text-xs py-6 text-center" style={{ color: "var(--text-muted)" }}>
            No activity matches the current filters.
          </p>
        ) : (
          <div className="flex flex-col">
            {grouped.map((g) => (
              <section key={g.key}>
                <div
                  className="sticky top-0 z-10 -mx-4 sm:-mx-6 px-4 sm:px-6 py-1.5 mt-3 first:mt-0"
                  style={{
                    background: "var(--bg-page)",
                    borderTop: "1px solid var(--border)",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <span
                    className="text-[10px] uppercase tracking-wider font-semibold"
                    style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
                  >
                    {g.label}
                  </span>
                </div>
                <div className="flex flex-col">
                  {g.rows.map((e) => {
                    const meta = actionMeta(e.action);
                    const href = entityHref(e.entity_type, e.entity_id);
                    const time = new Date(e.timestamp).toLocaleTimeString("pt-PT", {
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                    const inner = (
                      <div
                        className="grid grid-cols-[auto_auto_auto_1fr_auto] items-center gap-3 py-2 px-2 transition-colors"
                        style={{ borderBottom: "1px solid var(--border-subtle)" }}
                        onMouseEnter={(ev) => { ev.currentTarget.style.background = "var(--bg-card-hover)"; }}
                        onMouseLeave={(ev) => { ev.currentTarget.style.background = "transparent"; }}
                      >
                        <span
                          className="text-[11px]"
                          style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
                        >
                          {time}
                        </span>
                        <StatusPill tone={meta.tone}>
                          <span className="inline-flex items-center gap-1">
                            {meta.icon}
                            <span style={{ textTransform: "capitalize" }}>{e.action}</span>
                          </span>
                        </StatusPill>
                        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                          {e.entity_type}
                        </span>
                        <span className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                          {e.user} · {formatDetails(e.details)}
                        </span>
                        {href ? (
                          <ExternalLink size={12} style={{ color: "var(--text-muted)" }} />
                        ) : (
                          <span style={{ width: 12 }} />
                        )}
                      </div>
                    );
                    return href ? (
                      <Link key={e._id} href={href} style={{ textDecoration: "none", color: "inherit" }}>
                        {inner}
                      </Link>
                    ) : (
                      <div key={e._id}>{inner}</div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
