"use client";

import Link from "next/link";
import useSWR from "swr";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { fetcher } from "@/lib/fetcher";

interface Integrity {
  serverTotal: number;
  cmReported: number | null;
  gap: number | null;
  coveragePct: number | null;
  snapshotAt: string | null;
}

interface Progress {
  memberName: string;
  lastFilterUrl: string;
  lastFilterLabel: string;
  lastPage: number;
  updatedAt: string;
}

interface Lease {
  memberName: string;
  filterHash: string;
  filterLabel: string;
  claimedAt: string;
  expiresAt: string;
}

const panelStyle = {
  background: "var(--surface-gradient)",
  backdropFilter: "var(--surface-blur)",
  border: "var(--surface-border)",
  boxShadow: "var(--surface-shadow)",
  borderRadius: "var(--radius)",
  padding: "24px",
};

const statStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: "4px",
  padding: "16px",
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function SeedProgressContent() {
  const {
    data: integrity,
    isLoading: integrityLoading,
    mutate: mutateIntegrity,
  } = useSWR<{ data: Integrity }>("/api/ext/stock/integrity", fetcher, {
    refreshInterval: 30_000,
  });

  const {
    data: progress,
    isLoading: progressLoading,
    mutate: mutateProgress,
  } = useSWR<{ data: Progress[] }>("/api/ext/seed/progress", fetcher, {
    refreshInterval: 30_000,
  });

  const {
    data: leases,
    isLoading: leasesLoading,
    mutate: mutateLeases,
  } = useSWR<{ data: Lease[] }>("/api/ext/seed/lease", fetcher, {
    refreshInterval: 15_000,
  });

  const integrityData = integrity?.data;
  const progressList = Array.isArray(progress?.data) ? progress!.data : [];
  const leaseList = Array.isArray(leases?.data) ? leases!.data : [];

  const refreshAll = () => {
    mutateIntegrity();
    mutateProgress();
    mutateLeases();
  };

  return (
    <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Link
            href="/settings"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              color: "var(--text-secondary)",
              textDecoration: "none",
              fontSize: "13px",
            }}
          >
            <ArrowLeft size={14} /> Settings
          </Link>
          <h1 style={{ fontSize: "24px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
            Seed Stock Progress
          </h1>
        </div>
        <button
          onClick={refreshAll}
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

      {/* Integrity */}
      <div style={panelStyle}>
        <h2
          style={{
            fontSize: "16px",
            fontWeight: 600,
            color: "var(--text-primary)",
            marginTop: 0,
            marginBottom: "16px",
          }}
        >
          Coverage
        </h2>
        {integrityLoading ? (
          <div className="skeleton" style={{ height: "72px" }} />
        ) : !integrityData ? (
          <p style={{ color: "var(--text-muted)", fontSize: "14px", margin: 0 }}>
            Integrity unavailable.
          </p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: "12px",
            }}
          >
            <div style={statStyle}>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase" }}>
                Captured
              </span>
              <span style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-primary)" }}>
                {integrityData.serverTotal.toLocaleString()}
              </span>
            </div>
            <div style={statStyle}>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase" }}>
                CM reported
              </span>
              <span style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-primary)" }}>
                {integrityData.cmReported === null ? "—" : integrityData.cmReported.toLocaleString()}
              </span>
              <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                {formatDate(integrityData.snapshotAt)}
              </span>
            </div>
            <div style={statStyle}>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase" }}>
                Gap
              </span>
              <span
                style={{
                  fontSize: "22px",
                  fontWeight: 700,
                  color:
                    integrityData.gap === null
                      ? "var(--text-muted)"
                      : integrityData.gap === 0
                        ? "var(--success, #4caf50)"
                        : "var(--danger, #e94560)",
                }}
              >
                {integrityData.gap === null ? "—" : integrityData.gap.toLocaleString()}
              </span>
            </div>
            <div style={statStyle}>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase" }}>
                Coverage
              </span>
              <span style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-primary)" }}>
                {integrityData.coveragePct === null
                  ? "—"
                  : integrityData.coveragePct.toFixed(2) + "%"}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Active leases */}
      <div style={panelStyle}>
        <h2
          style={{
            fontSize: "16px",
            fontWeight: 600,
            color: "var(--text-primary)",
            marginTop: 0,
            marginBottom: "16px",
          }}
        >
          Active leases ({leaseList.length})
        </h2>
        {leasesLoading ? (
          <div className="skeleton" style={{ height: "60px" }} />
        ) : !leaseList.length ? (
          <p style={{ color: "var(--text-muted)", fontSize: "14px", margin: 0 }}>
            No members are currently seeding.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {leaseList.map((l) => (
              <div
                key={l.memberName}
                style={{
                  display: "grid",
                  gridTemplateColumns: "140px 1fr 100px",
                  gap: "12px",
                  alignItems: "center",
                  padding: "10px 14px",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                }}
              >
                <span style={{ fontWeight: 600, color: "var(--accent, #3fcee5)" }}>
                  {l.memberName}
                </span>
                <span
                  style={{
                    fontFamily: "monospace",
                    fontSize: "12px",
                    color: "var(--text-secondary)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={l.filterHash}
                >
                  {l.filterLabel || l.filterHash || "(no filter)"}
                </span>
                <span style={{ fontSize: "11px", color: "var(--text-muted)", textAlign: "right" }}>
                  expires {timeAgo(l.expiresAt).replace(" ago", "")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Per-member progress */}
      <div style={panelStyle}>
        <h2
          style={{
            fontSize: "16px",
            fontWeight: 600,
            color: "var(--text-primary)",
            marginTop: 0,
            marginBottom: "16px",
          }}
        >
          Last position per member
        </h2>
        {progressLoading ? (
          <div className="skeleton" style={{ height: "60px" }} />
        ) : !progressList.length ? (
          <p style={{ color: "var(--text-muted)", fontSize: "14px", margin: 0 }}>
            No progress recorded yet.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {progressList.map((p) => (
              <div
                key={p.memberName}
                style={{
                  display: "grid",
                  gridTemplateColumns: "140px 1fr 70px 100px",
                  gap: "12px",
                  alignItems: "center",
                  padding: "10px 14px",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                }}
              >
                <span style={{ fontWeight: 600, color: "var(--accent, #3fcee5)" }}>
                  {p.memberName}
                </span>
                <a
                  href={`https://www.cardmarket.com${p.lastFilterUrl}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontFamily: "monospace",
                    fontSize: "12px",
                    color: "var(--text-secondary)",
                    textDecoration: "none",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={p.lastFilterUrl}
                >
                  {p.lastFilterLabel || p.lastFilterUrl}
                </a>
                <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                  page {p.lastPage}
                </span>
                <span style={{ fontSize: "11px", color: "var(--text-muted)", textAlign: "right" }}>
                  {timeAgo(p.updatedAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
