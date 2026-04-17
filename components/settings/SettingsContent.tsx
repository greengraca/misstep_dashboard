"use client";
import Link from "next/link";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { Settings, CheckCircle, XCircle, RefreshCw, ChevronRight, Radar, Download } from "lucide-react";
import { LATEST_EXT_VERSION } from "@/lib/constants";

interface EnvVar {
  name: string;
  set: boolean;
  masked?: string;
}

interface TeamMember {
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
        <h2 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", marginTop: 0, marginBottom: "16px" }}>
          Team Members
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {isLoading ? (
            [1, 2, 3].map(i => (
              <div key={i} className="skeleton" style={{ height: "56px" }} />
            ))
          ) : teamMembers.length === 0 ? (
            <p style={{ color: "var(--text-muted)", fontSize: "14px", margin: 0 }}>
              No team members configured. Add members via the auth provider.
            </p>
          ) : (
            teamMembers.map((member, i) => (
              <div
                key={i}
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
              </div>
            ))
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
            envVars.map((ev, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "10px 16px",
                  background: "var(--bg-card)",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--border)",
                }}
              >
                {ev.set ? (
                  <CheckCircle size={16} style={{ color: "var(--success)", flexShrink: 0 }} />
                ) : (
                  <XCircle size={16} style={{ color: "var(--danger, #ef4444)", flexShrink: 0 }} />
                )}
                <span
                  className="flex-1 min-w-0 truncate"
                  style={{ fontSize: "13px", fontFamily: "monospace", color: "var(--text-primary)" }}
                >
                  {ev.name}
                </span>
                <span
                  className="shrink-0"
                  style={{ fontSize: "13px", fontFamily: "monospace", color: "var(--text-muted)" }}
                >
                  {ev.set ? (ev.masked ?? "••••••••") : "not set"}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
