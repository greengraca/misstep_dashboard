"use client";
import useSWR from "swr";
import { useState } from "react";
import { fetcher } from "@/lib/fetcher";
import StatCard from "@/components/dashboard/stat-card";
import DataTable, { type Column } from "@/components/dashboard/data-table";
import Modal from "@/components/dashboard/modal";
import { MessageCircle, CalendarCheck, Users, PlusCircle, ChevronDown, ChevronRight } from "lucide-react";

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
    <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
          Meetings
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
          <PlusCircle size={16} /> Schedule
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
        <StatCard title="Total Meetings" value={isLoading ? "..." : meetings.length} icon={<MessageCircle size={20} />} />
        <StatCard title="This Month" value={isLoading ? "..." : thisMonth} icon={<CalendarCheck size={20} />} active />
        <StatCard title="Attendees" value={isLoading ? "..." : totalAttendees} icon={<Users size={20} />} />
      </div>

      <DataTable
        columns={columns}
        data={meetings}
        keyField="_id"
        defaultSortKey="date"
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Schedule Meeting">
        <p style={{ color: "var(--text-secondary)" }}>Meeting form — customize this for your domain.</p>
      </Modal>
    </div>
  );
}
