"use client";
import Link from "next/link";
import useSWR, { mutate as globalMutate } from "swr";
import { useState } from "react";
import { fetcher } from "@/lib/fetcher";
import { CheckCircle, XCircle, RefreshCw, ChevronRight, Radar, Download, PlusCircle, Pencil, Trash2 } from "lucide-react";
import { LATEST_EXT_VERSION } from "@/lib/constants";

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

const panelClass = "p-4 sm:p-6";
const panelStyle = {
  background: "var(--surface-gradient)",
  backdropFilter: "var(--surface-blur)",
  border: "var(--surface-border)",
  boxShadow: "var(--surface-shadow)",
  borderRadius: "var(--radius)",
};

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

  async function deleteMember(m: TeamMember) {
    if (!confirm(`Remove ${m.name}?`)) return;
    await fetch("/api/team", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: m._id }),
    });
    await mutate();
    globalMutate("/api/team");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 style={{ fontSize: "24px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
          Settings
        </h1>
        <button
          onClick={() => mutate()}
          style={{
            background: "var(--bg-card)",
            color: "var(--text-secondary)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: "8px 14px",
            fontSize: "14px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {/* Seed Stock progress link */}
      <Link
        href="/settings/seed-progress"
        className={panelClass}
        style={{
          ...panelStyle,
          display: "flex",
          alignItems: "center",
          gap: "16px",
          textDecoration: "none",
          color: "inherit",
          cursor: "pointer",
        }}
      >
        <div
          style={{
            width: "40px",
            height: "40px",
            borderRadius: "10px",
            background: "rgba(63,206,229,0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--accent, #3fcee5)",
          }}
        >
          <Radar size={20} />
        </div>
        <div className="min-w-0" style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "15px" }}>
            Seed Stock Progress
          </div>
          <div style={{ color: "var(--text-muted)", fontSize: "13px" }}>
            Team-wide coverage, active leases, and per-member last position.
          </div>
        </div>
        <ChevronRight size={18} style={{ color: "var(--text-muted)" }} />
      </Link>

      {/* Extension download (plain <a>, not next/link — must trigger a real download, not client-side navigation) */}
      <a
        href="/api/ext/download"
        download
        className={panelClass}
        style={{
          ...panelStyle,
          display: "flex",
          alignItems: "center",
          gap: "16px",
          textDecoration: "none",
          color: "inherit",
          cursor: "pointer",
        }}
      >
        <div
          style={{
            width: "40px",
            height: "40px",
            borderRadius: "10px",
            background: "rgba(63,206,229,0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--accent, #3fcee5)",
          }}
        >
          <Download size={20} />
        </div>
        <div className="min-w-0" style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "15px" }}>
            Download Extension (v{LATEST_EXT_VERSION})
          </div>
          <div style={{ color: "var(--text-muted)", fontSize: "13px" }}>
            Unzip over your existing misstep-ext folder, then hit Reload in chrome://extensions.
          </div>
        </div>
        <ChevronRight size={18} style={{ color: "var(--text-muted)" }} />
      </a>

      {/* Team Members */}
      <div className={panelClass} style={panelStyle}>
        <div className="flex items-center justify-between mb-4">
          <h2 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
            Team Members
          </h2>
          {!addMode && !editingId && (
            <button
              onClick={beginAdd}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{
                background: "rgba(251, 191, 36, 0.15)",
                color: "var(--accent)",
                border: "1px solid rgba(251, 191, 36, 0.35)",
                cursor: "pointer",
              }}
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
                  <span
                    style={{
                      fontSize: "12px",
                      color: "var(--text-muted)",
                      background: "var(--bg-page, var(--bg-card))",
                      padding: "2px 8px",
                      borderRadius: "999px",
                      border: "1px solid var(--border)",
                    }}
                  >
                    {member.role}
                  </span>
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
                      onClick={() => deleteMember(member)}
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
      </div>

      {/* Environment Variables */}
      <div className={panelClass} style={panelStyle}>
        <h2 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", marginTop: 0, marginBottom: "16px" }}>
          Environment Variables
        </h2>
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
                    border: `1px solid ${missingRequired ? "var(--danger, #ef4444)" : "var(--border)"}`,
                  }}
                >
                  {ev.set ? (
                    <CheckCircle size={16} style={{ color: "var(--success)", flexShrink: 0 }} />
                  ) : (
                    <XCircle size={16} style={{ color: missingRequired ? "var(--danger, #ef4444)" : "var(--text-muted)", flexShrink: 0 }} />
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
      </div>
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
          className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
          style={{
            background: "rgba(251, 191, 36, 0.15)",
            border: "1px solid rgba(251, 191, 36, 0.35)",
            color: "var(--accent)",
            cursor: name.trim() ? "pointer" : "not-allowed",
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}
