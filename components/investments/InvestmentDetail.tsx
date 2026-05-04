"use client";

import { useEffect, useRef, useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetcher } from "@/lib/fetcher";
import { ArrowLeft, ChevronDown, Archive, Lock, Trash2, Copy, Check, Plus } from "lucide-react";
import type { InvestmentDetail as Detail } from "@/lib/investments/types";
import ConfirmModal from "@/components/dashboard/confirm-modal";
import { H1 } from "@/components/dashboard/page-shell";
import { StatusPill, type StatusPillTone } from "@/components/dashboard/status-pill";
import InvestmentKpiRow from "./InvestmentKpiRow";
import SealedFlipsSection from "./SealedFlipsSection";
import InvestmentLotsTable from "./InvestmentLotsTable";
import CloseInvestmentModal from "./CloseInvestmentModal";
import UntaggedListingsModal from "./UntaggedListingsModal";
import InvestmentTimeline from "./InvestmentTimeline";
import SalesHistoryChart from "./SalesHistoryChart";
import InvestmentSalesPanel from "./InvestmentSalesPanel";
import ManualSaleModal from "./ManualSaleModal";

const STATUS_TONE: Record<Detail["status"], StatusPillTone> = {
  listing: "accent",
  closed: "success",
  archived: "muted",
};

function sourceLabel(source: Detail["source"]): string {
  if (source.kind === "box") {
    return `${source.box_count}× ${source.set_code.toUpperCase()} · ${source.booster_type} · ${source.packs_per_box} packs × ${source.cards_per_pack} cards`;
  }
  if (source.kind === "product") {
    return `${source.unit_count}× ${source.product_slug}`;
  }
  if (source.kind === "customer_bulk") {
    const acquired = source.acquired_at
      ? ` · acquired ${new Date(source.acquired_at).toLocaleDateString("pt-PT")}`
      : "";
    return `Customer bulk · ~${source.estimated_card_count.toLocaleString()} cards${acquired}`;
  }
  return `Collection · ${source.card_count} cards`;
}

/**
 * Tag-display strip — prominent code with a one-click copy and a live
 * `tagged X / expected Y` count. The user pastes this code into every
 * Cardmarket listing's comment field; the dashboard parses the tag from
 * stock + order-detail scrapes and attributes sales back automatically.
 */
function CodeStrip({ detail, onAuditClick }: { detail: Detail; onAuditClick: () => void }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(detail.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };
  const audit = detail.tag_audit;
  const fullyTagged = audit && audit.expected_lots > 0 && audit.tagged_listings >= audit.expected_lots;
  const hasGap = audit && audit.expected_lots > 0 && audit.tagged_listings < audit.expected_lots;
  return (
    <div
      className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="flex flex-col gap-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
          Provenance code
        </div>
        <div className="flex items-center gap-2">
          <code
            className="px-2 py-1 rounded font-mono text-sm font-semibold"
            style={{ background: "var(--bg-hover)", color: "var(--accent)", letterSpacing: "0.05em" }}
          >
            {detail.code}
          </code>
          <button
            onClick={onCopy}
            title="Copy code"
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors"
            style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent)"; e.currentTarget.style.borderColor = "var(--accent)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.borderColor = "var(--border)"; }}
          >
            {copied ? <Check size={11} /> : <Copy size={11} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <div className="flex-1 text-[11px] leading-relaxed" style={{ color: "var(--text-muted)", minWidth: 200 }}>
        Paste this code into the comment field of every Cardmarket listing for cards in this investment. Tagged listings attribute sales back here automatically.
      </div>
      {audit && (hasGap ? (
        <button
          onClick={onAuditClick}
          className="text-right transition-colors"
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: 0,
          }}
          title="Show which listings are missing the code"
        >
          <div className="text-[11px] font-mono" style={{ color: "var(--warning)" }}>
            {audit.tagged_listings} / {audit.expected_lots} tagged
          </div>
          <div className="text-[10px] underline decoration-dotted underline-offset-2" style={{ color: "var(--text-muted)" }}>
            show missing →
          </div>
        </button>
      ) : (
        <div className="text-right">
          <div
            className="text-[11px] font-mono"
            style={{ color: fullyTagged ? "var(--success)" : "var(--text-muted)" }}
          >
            {audit.tagged_listings} / {audit.expected_lots} tagged
          </div>
          <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
            {fullyTagged ? "all listings tagged" : "no remaining lots"}
          </div>
        </div>
      ))}
    </div>
  );
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
  const [showUntagged, setShowUntagged] = useState(false);
  const [showManualSale, setShowManualSale] = useState(false);
  const [salesRefreshKey, setSalesRefreshKey] = useState(0);
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
            <StatusPill tone={STATUS_TONE[detail.status]}>{detail.status}</StatusPill>
          </div>
          <H1 subtitle={sourceLabel(detail.source)}>{detail.name}</H1>
        </div>
        <div className="flex items-center gap-2">
          {detail.status === "listing" && (
            <button
              onClick={() => setShowManualSale(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                color: "var(--text-secondary)",
              }}
            >
              <Plus size={12} />
              Record manual sale
            </button>
          )}
          <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen((x) => !x)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
            }}
          >
            Actions
            <ChevronDown
              size={12}
              className="transition-transform"
              style={{ transform: menuOpen ? "rotate(180deg)" : "rotate(0)" }}
            />
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
      </div>

      <InvestmentTimeline investmentId={detail.id} />

      <CodeStrip detail={detail} onAuditClick={() => setShowUntagged(true)} />

      <InvestmentKpiRow kpis={detail.kpis} />

      <SalesHistoryChart investmentId={detail.id} />

      <InvestmentLotsTable investmentId={detail.id} />

      <InvestmentSalesPanel investmentId={detail.id} refreshKey={salesRefreshKey} />

      <SealedFlipsSection
        investmentId={detail.id}
        flips={detail.sealed_flips}
        canRecord={
          detail.status !== "archived" &&
          detail.source.kind !== "collection" &&
          detail.source.kind !== "customer_bulk"
        }
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
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={async () => {
          const r = await fetch(`/api/investments/${detail.id}/permanent`, {
            method: "DELETE",
          });
          if (r.ok) router.push("/investments");
        }}
        title="Delete permanently?"
        message={`This removes "${detail.name}" and every row attached to it — opened lots and sale-log entries. There is no Archived tab fallback and no way to undo this. Prefer Archive if you just want it out of the way.`}
        confirmLabel="Delete permanently"
        variant="danger"
      />

      <UntaggedListingsModal
        open={showUntagged}
        investmentId={detail.id}
        code={detail.code}
        onClose={() => setShowUntagged(false)}
      />

      <ManualSaleModal
        open={showManualSale}
        onClose={() => setShowManualSale(false)}
        investmentId={detail.id}
        onSaved={() => {
          // Refresh: KPIs (proceeds, listed value) come from the parent
          // /api/investments/[id]; lot ledger + sales panel + sales chart
          // each have their own SWR key under /api/investments/[id]/...
          // Bump the local refreshKey to force the sales panel to refetch,
          // and globally mutate every key that starts with the investment's
          // API prefix so the lot ledger picks up the new qty too.
          mutate();
          setSalesRefreshKey((k) => k + 1);
          const prefix = `/api/investments/${detail.id}/`;
          globalMutate(
            (key) => typeof key === "string" && key.startsWith(prefix)
          );
        }}
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
          ? "Auditing tagged listings…"
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
