"use client";
import useSWR, { mutate as globalMutate } from "swr";
import { useState } from "react";
import { fetcher } from "@/lib/fetcher";
import { CheckCircle, XCircle, RefreshCw, Radar, Download, PlusCircle, Pencil, Trash2, Users, Server } from "lucide-react";
import { LATEST_EXT_VERSION } from "@/lib/constants";
import { Panel, H1, H2, H3 } from "@/components/dashboard/page-shell";
import { LinkCard } from "@/components/dashboard/link-card";
import { StatusPill } from "@/components/dashboard/status-pill";
import ConfirmModal from "@/components/dashboard/confirm-modal";

interface EnvVar {
  name: string;
  required: boolean;
  set: boolean;
  masked?: string;
}

interface TeamMember {
  _id: string;
  name: string;
  role: string;
  email?: string;
}

export default function SettingsContent() {
  const { data, isLoading, mutate } = useSWR<{ envVars: EnvVar[]; teamMembers: TeamMember[] }>(
    "/api/settings",
    fetcher
  );

  const envVars = data?.envVars ?? [];
  const teamMembers = data?.teamMembers ?? [];

  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formRole, setFormRole] = useState("member");
  const [formEmail, setFormEmail] = useState("");
  const [addMode, setAddMode] = useState(false);
  const [deletingMember, setDeletingMember] = useState<TeamMember | null>(null);

  function beginAdd() {
    setEditingId(null);
    setFormName("");
    setFormRole("member");
    setFormEmail("");
    setAddMode(true);
  }

  function beginEdit(m: TeamMember) {
    setAddMode(false);
    setEditingId(m._id);
    setFormName(m.name);
    setFormRole(m.role);
    setFormEmail(m.email ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
    setAddMode(false);
  }

  async function saveMember() {
    const payload: Record<string, unknown> = {
      name: formName.trim(),
      role: formRole.trim() || "member",
      email: formEmail.trim() || undefined,
    };
    if (!payload.name) return;
    if (editingId) {
      await fetch("/api/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _id: editingId, ...payload }),
      });
    } else {
      await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
    setEditingId(null);
    setAddMode(false);
    await mutate();
    globalMutate("/api/team");
  }

  function requestDeleteMember(m: TeamMember) {
    setDeletingMember(m);
  }

  async function confirmDeleteMember() {
    const m = deletingMember;
    if (!m) return;
    await fetch("/api/team", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: m._id }),
    });
    setDeletingMember(null);
    await mutate();
    globalMutate("/api/team");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <H1 subtitle="Team, environment variables, and the browser extension">Settings</H1>
        <button
          onClick={() => mutate()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
          style={{
            background: "var(--bg-card)",
            color: "var(--text-secondary)",
            border: "1px solid var(--border)",
            cursor: "pointer",
          }}
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Tools */}
      <section className="flex flex-col gap-3">
        <H3>Tools</H3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <LinkCard
          href="/settings/seed-progress"
          icon={<Radar size={20} />}
          title="Seed Stock Progress"
          description="Team-wide coverage, active leases, and per-member last position."
        />
        <LinkCard
          href="/api/ext/download"
          download
          icon={<Download size={20} />}
          title={`Download Extension (v${LATEST_EXT_VERSION})`}
          description="Unzip over your existing misstep-ext folder, then hit Reload in chrome://extensions."
        />
        </div>
      </section>

      {/* Team Members */}
      <Panel>
        <div className="flex items-center justify-between mb-4">
          <H2 icon={<Users size={16} />}>Team members</H2>
          {!addMode && !editingId && (
            <button
              onClick={beginAdd}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                background: "var(--accent)",
                color: "var(--accent-text)",
                border: "1px solid var(--accent)",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent-hover)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "var(--accent)"; }}
            >
              <PlusCircle size={14} /> Add
            </button>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {isLoading ? (
            [1, 2, 3].map(i => (
              <div key={i} className="skeleton" style={{ height: "56px" }} />
            ))
          ) : teamMembers.length === 0 && !addMode ? (
            <p style={{ color: "var(--text-muted)", fontSize: "14px", margin: 0 }}>
              No team members yet. Click Add to create one.
            </p>
          ) : (
            teamMembers.map((member) => {
              const isEditing = editingId === member._id;
              if (isEditing) {
                return (
                  <TeamMemberForm
                    key={member._id}
                    name={formName}
                    role={formRole}
                    email={formEmail}
                    onNameChange={setFormName}
                    onRoleChange={setFormRole}
                    onEmailChange={setFormEmail}
                    onSave={saveMember}
                    onCancel={cancelEdit}
                  />
                );
              }
              return (
                <div
                  key={member._id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "12px 16px",
                    background: "var(--bg-card)",
                    borderRadius: "var(--radius)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "50%",
                      background: "var(--accent)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--accent-text)",
                      fontWeight: 700,
                      fontSize: "14px",
                      flexShrink: 0,
                    }}
                  >
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className="truncate"
                      style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}
                    >
                      {member.name}
                    </div>
                    {member.email && (
                      <div
                        className="truncate"
                        style={{ fontSize: "12px", color: "var(--text-muted)" }}
                      >
                        {member.email}
                      </div>
                    )}
                  </div>
                  <StatusPill tone="muted">{member.role}</StatusPill>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => beginEdit(member)}
                      className="p-1 rounded-lg"
                      style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
                      aria-label="Edit member"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => requestDeleteMember(member)}
                      className="p-1 rounded-lg"
                      style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
                      aria-label="Remove member"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
          {addMode && (
            <TeamMemberForm
              name={formName}
              role={formRole}
              email={formEmail}
              onNameChange={setFormName}
              onRoleChange={setFormRole}
              onEmailChange={setFormEmail}
              onSave={saveMember}
              onCancel={cancelEdit}
            />
          )}
        </div>
      </Panel>

      {/* Environment Variables */}
      <Panel>
        <H2 icon={<Server size={16} />}>Environment variables</H2>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {isLoading ? (
            [1, 2, 3, 4].map(i => (
              <div key={i} className="skeleton" style={{ height: "44px" }} />
            ))
          ) : envVars.length === 0 ? (
            <p style={{ color: "var(--text-muted)", fontSize: "14px", margin: 0 }}>
              No environment variables tracked.
            </p>
          ) : (
            envVars.map((ev, i) => {
              const missingRequired = ev.required && !ev.set;
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "10px 16px",
                    background: "var(--bg-card)",
                    borderRadius: "var(--radius)",
                    border: `1px solid ${missingRequired ? "var(--error)" : "var(--border)"}`,
                  }}
                >
                  {ev.set ? (
                    <CheckCircle size={16} style={{ color: "var(--success)", flexShrink: 0 }} />
                  ) : (
                    <XCircle size={16} style={{ color: missingRequired ? "var(--error)" : "var(--text-muted)", flexShrink: 0 }} />
                  )}
                  <span
                    className="flex-1 min-w-0 truncate"
                    style={{ fontSize: "13px", fontFamily: "monospace", color: "var(--text-primary)" }}
                  >
                    {ev.name}
                    {ev.required && (
                      <span
                        className="ml-2"
                        style={{
                          fontSize: "10px",
                          fontFamily: "var(--font-mono)",
                          color: "var(--text-muted)",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        required
                      </span>
                    )}
                  </span>
                  <span
                    className="shrink-0"
                    style={{ fontSize: "13px", fontFamily: "monospace", color: "var(--text-muted)" }}
                  >
                    {ev.set ? (ev.masked ?? "••••••••") : "not set"}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </Panel>

      <ConfirmModal
        open={!!deletingMember}
        onClose={() => setDeletingMember(null)}
        onConfirm={confirmDeleteMember}
        title="Remove team member"
        message={deletingMember ? `Remove ${deletingMember.name}? Their finance entries stay attributed to them, but they won't appear in dropdowns going forward.` : ""}
        confirmLabel="Remove"
        variant="danger"
      />

      <footer
        className="text-[11px] mt-4 pt-4 flex items-center justify-center gap-3 flex-wrap"
        style={{ color: "var(--text-muted)", borderTop: "1px solid var(--border)", fontFamily: "var(--font-mono)" }}
      >
        <span>misstep dashboard</span>
        <span style={{ opacity: 0.4 }}>·</span>
        <span>build {process.env.NEXT_PUBLIC_COMMIT_SHA || "dev"}</span>
        <span style={{ opacity: 0.4 }}>·</span>
        <span>ext v{LATEST_EXT_VERSION}</span>
      </footer>
    </div>
  );
}

function TeamMemberForm({
  name,
  role,
  email,
  onNameChange,
  onRoleChange,
  onEmailChange,
  onSave,
  onCancel,
}: {
  name: string;
  role: string;
  email: string;
  onNameChange: (v: string) => void;
  onRoleChange: (v: string) => void;
  onEmailChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const inputStyle = {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    padding: "8px 12px",
    fontSize: "14px",
    color: "var(--text-primary)",
    outline: "none",
  };
  return (
    <div
      style={{
        padding: "12px 16px",
        background: "var(--bg-card)",
        borderRadius: "var(--radius)",
        border: "1px solid var(--accent)",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <input
          type="text"
          placeholder="Name"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          style={inputStyle}
          autoFocus
        />
        <input
          type="text"
          placeholder="Role"
          value={role}
          onChange={(e) => onRoleChange(e.target.value)}
          style={inputStyle}
        />
        <input
          type="email"
          placeholder="Email (optional)"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          style={inputStyle}
        />
      </div>
      <div className="flex items-center gap-2 justify-end">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{
            background: "transparent",
            border: "1px solid var(--border)",
            color: "var(--text-secondary)",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={!name.trim()}
          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
          style={{
            background: name.trim() ? "var(--accent)" : "var(--bg-card)",
            border: "1px solid var(--accent)",
            color: name.trim() ? "var(--accent-text)" : "var(--text-muted)",
            cursor: name.trim() ? "pointer" : "not-allowed",
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}
