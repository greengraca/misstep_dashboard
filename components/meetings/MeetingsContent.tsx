"use client";
import useSWR from "swr";
import { useState } from "react";
import { fetcher } from "@/lib/fetcher";
import StatCard from "@/components/dashboard/stat-card";
import DataTable, { type Column } from "@/components/dashboard/data-table";
import Modal from "@/components/dashboard/modal";
import { Panel, H1, H2 } from "@/components/dashboard/page-shell";
import { MessageCircle, CalendarCheck, Users, PlusCircle, ChevronDown, ChevronRight, Calendar } from "lucide-react";

interface Meeting {
  _id: string;
  title: string;
  date: string;
  attendees: string[];
  notes?: string;
  [key: string]: unknown;
}

export default function MeetingsContent() {
  const { data, isLoading } = useSWR<{ data: Meeting[] }>("/api/meetings", fetcher);
  const [modalOpen, setModalOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const meetings = data?.data ?? [];

  const today = new Date();
  const thisMonth = meetings.filter(m => {
    const d = new Date(m.date);
    return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
  }).length;
  const totalAttendees = meetings.reduce((s, m) => s + (m.attendees?.length ?? 0), 0);

  const columns: Column<Meeting>[] = [
    {
      key: "date" as const,
      label: "Date",
      sortable: true,
      render: (m: Meeting) => new Date(m.date).toLocaleDateString(),
    },
    { key: "title" as const, label: "Title", sortable: true },
    {
      key: "attendees" as const,
      label: "Attendees",
      sortable: false,
      render: (m: Meeting) => (
        <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>
          {m.attendees?.length ?? 0} attendee{(m.attendees?.length ?? 0) !== 1 ? "s" : ""}
        </span>
      ),
    },
    {
      key: "notes" as const,
      label: "Notes",
      sortable: false,
      render: (m: Meeting) => (
        <div>
          <button
            onClick={() => setExpandedId(expandedId === m._id ? null : m._id)}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--accent)",
              cursor: "pointer",
              fontSize: "13px",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              padding: 0,
            }}
          >
            {expandedId === m._id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {m.notes ? "Show notes" : "No notes"}
          </button>
          {expandedId === m._id && m.notes && (
            <div
              style={{
                marginTop: "8px",
                padding: "10px",
                background: "var(--bg-card)",
                borderRadius: "var(--radius)",
                fontSize: "13px",
                color: "var(--text-secondary)",
                maxWidth: "320px",
                whiteSpace: "pre-wrap",
              }}
            >
              {m.notes}
            </div>
          )}
        </div>
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <H1 subtitle="Schedule, attendees, and meeting notes">Meetings</H1>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all"
          style={{
            background: "var(--accent)",
            color: "var(--accent-text)",
            border: "1px solid var(--accent)",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent-hover)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "var(--accent)"; }}
        >
          <PlusCircle size={16} /> Schedule
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
        <StatCard title="Total Meetings" value={isLoading ? "..." : meetings.length} icon={<MessageCircle size={20} style={{ color: "var(--accent)" }} />} />
        <StatCard title="This Month" value={isLoading ? "..." : thisMonth} icon={<CalendarCheck size={20} style={{ color: "var(--accent)" }} />} active />
        <StatCard title="Attendees" value={isLoading ? "..." : totalAttendees} icon={<Users size={20} style={{ color: "var(--accent)" }} />} />
      </div>

      <Panel>
        <H2 icon={<Calendar size={16} />}>Recent meetings</H2>
        <DataTable
        columns={columns}
        data={meetings}
        keyField="_id"
        defaultSortKey="date"
        renderMobileCard={(m) => {
          const isOpen = expandedId === m._id;
          return (
            <div
              className="p-3"
              style={{ borderBottom: "1px solid var(--border-subtle)" }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p
                    className="text-sm font-medium truncate"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {m.title}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {new Date(m.date).toLocaleDateString()} ·{" "}
                    {m.attendees?.length ?? 0} attendee
                    {(m.attendees?.length ?? 0) !== 1 ? "s" : ""}
                  </p>
                </div>
                {m.notes && (
                  <button
                    onClick={() => setExpandedId(isOpen ? null : m._id)}
                    className="shrink-0"
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--accent)",
                      cursor: "pointer",
                      fontSize: 12,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: 4,
                    }}
                  >
                    {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    Notes
                  </button>
                )}
              </div>
              {isOpen && m.notes && (
                <div
                  className="mt-2 p-2.5 text-xs whitespace-pre-wrap"
                  style={{
                    background: "var(--bg-card)",
                    borderRadius: "var(--radius)",
                    color: "var(--text-secondary)",
                  }}
                >
                  {m.notes}
                </div>
              )}
            </div>
          );
        }}
        />
      </Panel>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Schedule Meeting">
        <p style={{ color: "var(--text-secondary)" }}>Meeting form — customize this for your domain.</p>
      </Modal>
    </div>
  );
}
