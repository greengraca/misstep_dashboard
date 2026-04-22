"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetcher } from "@/lib/fetcher";
import { ArrowLeft, MoreHorizontal, Archive, Lock, Trash2, Undo2 } from "lucide-react";
import type { InvestmentDetail as Detail } from "@/lib/investments/types";
import ConfirmModal from "@/components/dashboard/confirm-modal";
import InvestmentKpiRow from "./InvestmentKpiRow";
import BaselineBanner from "./BaselineBanner";
import InvestmentBaselineSummary from "./InvestmentBaselineSummary";
import SealedFlipsSection from "./SealedFlipsSection";
import InvestmentLotsTable from "./InvestmentLotsTable";
import CloseInvestmentModal from "./CloseInvestmentModal";

function StatusPill({ status }: { status: Detail["status"] }) {
  const map: Record<Detail["status"], { bg: string; color: string; label: string }> = {
    baseline_captured: {
      bg: "rgba(251, 191, 36, 0.12)",
      color: "var(--warning)",
      label: "pending baseline",
    },
    listing: { bg: "rgba(63,206,229,0.15)", color: "var(--accent)", label: "listing" },
    closed: { bg: "rgba(52, 211, 153, 0.12)", color: "var(--success)", label: "closed" },
    archived: { bg: "rgba(255,255,255,0.06)", color: "var(--text-muted)", label: "archived" },
  };
  const s = map[status];
  return (
    <span
      className="px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap"
      style={{ background: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}

function sourceLabel(source: Detail["source"]): string {
  if (source.kind === "box") {
    return `${source.box_count}× ${source.set_code.toUpperCase()} · ${source.booster_type} · ${source.packs_per_box} packs × ${source.cards_per_pack} cards`;
  }
  return `${source.unit_count}× ${source.product_slug}`;
}

export default function InvestmentDetail({ id }: { id: string }) {
  const { data, mutate, isLoading } = useSWR<{ investment: Detail }>(
    `/api/investments/${id}`,
    fetcher,
    { dedupingInterval: 15_000, refreshInterval: 30_000 }
  );
  const detail = data?.investment;
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showReopen, setShowReopen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  if (isLoading) {
    return <InvestmentDetailSkeleton />;
  }
  if (!detail) {
    return (
      <div className="flex flex-col items-center gap-3 py-10">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Investment not found.
        </p>
        <Link
          href="/investments"
          className="text-xs"
          style={{ color: "var(--accent)" }}
        >
          ← Back to investments
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Link
              href="/investments"
              className="p-1 rounded transition-colors"
              style={{ color: "var(--text-muted)" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; e.currentTarget.style.background = "var(--bg-hover)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "transparent"; }}
            >
              <ArrowLeft size={14} />
            </Link>
            <StatusPill status={detail.status} />
          </div>
          <h1 className="text-xl font-bold truncate" style={{ color: "var(--text-primary)" }}>
            {detail.name}
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            {sourceLabel(detail.source)}
          </p>
        </div>
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen((x) => !x)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
            }}
          >
            <MoreHorizontal size={14} /> Actions
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 mt-1 py-1 rounded-lg shadow-lg z-20 min-w-[200px]"
              style={{
                background: "rgba(15, 20, 25, 0.98)",
                border: "1px solid rgba(255,255,255,0.10)",
                boxShadow: "0 12px 40px rgba(0, 0, 0, 0.5)",
                animation: "menuSlideIn 0.15s ease-out",
              }}
            >
              {detail.status === "listing" && (
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setShowReopen(true);
                  }}
                  className="flex items-center gap-2 w-full text-left px-3 py-2 text-xs transition-colors"
                  style={{ color: "var(--text-secondary)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text-primary)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-secondary)"; }}
                >
                  <Undo2 size={13} /> Reopen baseline capture
                </button>
              )}
              {detail.status !== "closed" && detail.status !== "archived" && (
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setShowClose(true);
                  }}
                  className="flex items-center gap-2 w-full text-left px-3 py-2 text-xs transition-colors"
                  style={{ color: "var(--text-secondary)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text-primary)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-secondary)"; }}
                >
                  <Lock size={13} /> Close investment
                </button>
              )}
              {detail.status !== "archived" && (
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setShowArchive(true);
                  }}
                  className="flex items-center gap-2 w-full text-left px-3 py-2 text-xs transition-colors"
                  style={{ color: "var(--warning)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(251, 191, 36, 0.08)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <Archive size={13} /> Archive
                </button>
              )}
              <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setShowDelete(true);
                }}
                className="flex items-center gap-2 w-full text-left px-3 py-2 text-xs transition-colors"
                style={{ color: "var(--error)" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--error-light)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <Trash2 size={13} /> Delete permanently
              </button>
            </div>
          )}
        </div>
      </div>

      <BaselineBanner detail={detail} />

      {detail.baseline_totals && (
        <InvestmentBaselineSummary totals={detail.baseline_totals} />
      )}

      <InvestmentKpiRow kpis={detail.kpis} />

      <InvestmentLotsTable investmentId={detail.id} />

      <SealedFlipsSection
        investmentId={detail.id}
        flips={detail.sealed_flips}
        canRecord={detail.status !== "archived"}
        onChanged={() => mutate()}
      />

      <CloseInvestmentModal
        open={showClose}
        detail={detail}
        onClose={() => setShowClose(false)}
        onClosed={() => {
          setShowClose(false);
          mutate();
        }}
      />

      <ConfirmModal
        open={showArchive}
        onClose={() => setShowArchive(false)}
        onConfirm={async () => {
          await fetch(`/api/investments/${detail.id}`, { method: "DELETE" });
          mutate();
        }}
        title="Archive investment?"
        message="Archived investments are hidden from the default lists. Lots are preserved for history. You can still see this investment in the Archived tab."
        confirmLabel="Archive"
        variant="danger"
      />

      <ConfirmModal
        open={showReopen}
        onClose={() => setShowReopen(false)}
        onConfirm={async () => {
          const r = await fetch(`/api/investments/${detail.id}/baseline/reopen`, {
            method: "POST",
          });
          if (r.ok) mutate();
        }}
        title="Reopen baseline capture?"
        message="Flips status from listing back to baseline_captured so you can re-walk the expansion in the extension. Existing baseline rows, lots, and sealed flips stay intact — the next mark-complete picks up from the current state."
        confirmLabel="Reopen"
      />

      <ConfirmModal
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={async () => {
          const r = await fetch(`/api/investments/${detail.id}/permanent`, {
            method: "DELETE",
          });
          if (r.ok) router.push("/investments");
        }}
        title="Delete permanently?"
        message={`This removes "${detail.name}" and every row attached to it — baseline captures, opened lots, and sale-log entries. There is no Archived tab fallback and no way to undo this. Prefer Archive if you just want it out of the way.`}
        confirmLabel="Delete permanently"
        variant="danger"
      />
    </div>
  );
}

/**
 * Skeleton shown while /api/investments/[id] is fetching. First render shows
 * the full page skeleton immediately. The hint text below rotates as time
 * passes so the user knows the work hasn't stalled — baseline-target + listed-
 * value + expected-EV aggregates can take a couple of seconds combined on
 * first hit after the Vercel function cold-starts.
 */
function InvestmentDetailSkeleton() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 500);
    return () => clearInterval(t);
  }, []);
  const hint =
    elapsed < 3
      ? "Loading investment…"
      : elapsed < 7
        ? "Building lot summary…"
        : elapsed < 15
          ? "Computing baseline progress…"
          : "Still working — first load after a deploy can take a bit.";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3">
        <div className="w-5 h-5 skeleton rounded" />
        <div className="flex-1 space-y-2">
          <div className="w-20 h-3 skeleton rounded" />
          <div className="w-72 h-6 skeleton rounded" />
          <div className="w-56 h-3 skeleton rounded" />
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-[108px] rounded-xl p-4 space-y-3"
            style={{
              background: "var(--surface-gradient)",
              backdropFilter: "var(--surface-blur)",
              border: "1px solid rgba(255,255,255,0.10)",
            }}
          >
            <div className="w-16 h-2.5 skeleton rounded" />
            <div className="w-20 h-6 skeleton rounded" />
          </div>
        ))}
      </div>
      <div
        className="rounded-xl p-4 space-y-3"
        style={{
          background: "var(--surface-gradient)",
          backdropFilter: "var(--surface-blur)",
          border: "1px solid rgba(255,255,255,0.10)",
        }}
      >
        <div className="w-32 h-4 skeleton rounded" />
        <div className="w-64 h-3 skeleton rounded" />
      </div>
      <p
        className="text-xs text-center"
        style={{ color: "var(--text-muted)" }}
      >
        {hint}
      </p>
    </div>
  );
}
