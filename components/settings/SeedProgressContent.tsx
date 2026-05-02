"use client";

import Link from "next/link";
import useSWR from "swr";
import { ArrowLeft, RefreshCw, Activity, Layers, Radar } from "lucide-react";
import { fetcher } from "@/lib/fetcher";
import { Panel, H1, H2 } from "@/components/dashboard/page-shell";
import { StatusPill } from "@/components/dashboard/status-pill";
import { MetricRow } from "@/components/dashboard/metric-row";

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
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Link
            href="/settings"
            className="inline-flex items-center gap-1 mb-2 text-xs transition-colors"
            style={{ color: "var(--text-muted)", textDecoration: "none" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
          >
            <ArrowLeft size={12} /> Settings
          </Link>
          <H1 subtitle="Team-wide coverage, active leases, and per-member position">
            Seed Stock Progress
          </H1>
        </div>
        <button
          onClick={refreshAll}
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

      {/* Integrity */}
      <Panel>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <H2 icon={<Radar size={16} />}>Coverage</H2>
          {integrityData?.snapshotAt && (
            <StatusPill tone="muted">CM snapshot · {formatDate(integrityData.snapshotAt)}</StatusPill>
          )}
        </div>
        {integrityLoading ? (
          <div className="skeleton" style={{ height: "72px" }} />
        ) : !integrityData ? (
          <p style={{ color: "var(--text-muted)", fontSize: "14px", margin: 0 }}>
            Integrity unavailable.
          </p>
        ) : (
          <MetricRow
            items={[
              { label: "Captured", value: integrityData.serverTotal.toLocaleString() },
              { label: "CM reported", value: integrityData.cmReported === null ? "—" : integrityData.cmReported.toLocaleString(), tone: "muted" },
              {
                label: "Gap",
                value: integrityData.gap === null ? "—" : integrityData.gap.toLocaleString(),
                tone: integrityData.gap === null ? "muted" : integrityData.gap === 0 ? "success" : "danger",
              },
              {
                label: "Coverage",
                value: integrityData.coveragePct === null ? "—" : integrityData.coveragePct.toFixed(2) + "%",
                tone: integrityData.coveragePct != null && integrityData.coveragePct >= 95 ? "success" : "default",
              },
            ]}
          />
        )}
      </Panel>

      {/* Active leases */}
      <Panel>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <H2 icon={<Activity size={16} />}>Active leases</H2>
          <StatusPill tone="muted">{leaseList.length}</StatusPill>
        </div>
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
                className="flex flex-col sm:grid sm:items-center gap-1 sm:gap-3 px-3 sm:px-4 py-2.5"
                style={{
                  gridTemplateColumns: "140px 1fr 110px",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                }}
              >
                <div className="flex items-center justify-between sm:block">
                  <span style={{ fontWeight: 600, color: "var(--accent)" }}>
                    {l.memberName}
                  </span>
                  <span
                    className="sm:hidden"
                    style={{ fontSize: "11px", color: "var(--text-muted)" }}
                  >
                    expires {timeAgo(l.expiresAt).replace(" ago", "")}
                  </span>
                </div>
                <span
                  className="min-w-0 truncate"
                  style={{
                    fontFamily: "monospace",
                    fontSize: "12px",
                    color: "var(--text-secondary)",
                  }}
                  title={l.filterHash}
                >
                  {l.filterLabel || l.filterHash || "(no filter)"}
                </span>
                <span
                  className="hidden sm:block text-right"
                  style={{ fontSize: "11px", color: "var(--text-muted)" }}
                >
                  expires {timeAgo(l.expiresAt).replace(" ago", "")}
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* Per-member progress */}
      <Panel>
        <H2 icon={<Layers size={16} />}>Last position per member</H2>
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
                className="flex flex-col sm:grid sm:items-center gap-1 sm:gap-3 px-3 sm:px-4 py-2.5"
                style={{
                  gridTemplateColumns: "140px 1fr 70px 100px",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                }}
              >
                <div className="flex items-center justify-between sm:block">
                  <span style={{ fontWeight: 600, color: "var(--accent)" }}>
                    {p.memberName}
                  </span>
                  <span
                    className="sm:hidden"
                    style={{ fontSize: "11px", color: "var(--text-muted)" }}
                  >
                    {timeAgo(p.updatedAt)}
                  </span>
                </div>
                <a
                  href={`https://www.cardmarket.com${p.lastFilterUrl}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 truncate"
                  style={{
                    fontFamily: "monospace",
                    fontSize: "12px",
                    color: "var(--text-secondary)",
                    textDecoration: "none",
                  }}
                  title={p.lastFilterUrl}
                >
                  {p.lastFilterLabel || p.lastFilterUrl}
                </a>
                <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                  page {p.lastPage}
                </span>
                <span
                  className="hidden sm:block text-right"
                  style={{ fontSize: "11px", color: "var(--text-muted)" }}
                >
                  {timeAgo(p.updatedAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
