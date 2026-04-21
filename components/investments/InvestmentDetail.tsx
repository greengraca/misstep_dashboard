"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { fetcher } from "@/lib/fetcher";
import { ArrowLeft, MoreHorizontal, Archive, Lock } from "lucide-react";
import type { InvestmentDetail as Detail } from "@/lib/investments/types";
import ConfirmModal from "@/components/dashboard/confirm-modal";
import InvestmentKpiRow from "./InvestmentKpiRow";
import BaselineBanner from "./BaselineBanner";
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
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
    return (
      <p className="text-sm py-10 text-center" style={{ color: "var(--text-muted)" }}>
        Loading investment…
      </p>
    );
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
        {detail.status !== "archived" && (
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
                className="absolute right-0 mt-1 py-1 rounded-lg shadow-lg z-20 min-w-[180px]"
                style={{
                  background: "rgba(15, 20, 25, 0.98)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  boxShadow: "0 12px 40px rgba(0, 0, 0, 0.5)",
                  animation: "menuSlideIn 0.15s ease-out",
                }}
              >
                {detail.status !== "closed" && (
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
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setShowArchive(true);
                  }}
                  className="flex items-center gap-2 w-full text-left px-3 py-2 text-xs transition-colors"
                  style={{ color: "var(--error)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--error-light)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <Archive size={13} /> Archive
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <BaselineBanner detail={detail} />

      <InvestmentKpiRow kpis={detail.kpis} />

      <SealedFlipsSection
        investmentId={detail.id}
        flips={detail.sealed_flips}
        canRecord={detail.status !== "archived"}
        onChanged={() => mutate()}
      />

      <InvestmentLotsTable investmentId={detail.id} />

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
    </div>
  );
}
