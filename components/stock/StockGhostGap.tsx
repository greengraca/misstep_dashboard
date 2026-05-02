"use client";

import { useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { AlertTriangle, ChevronDown, ChevronUp, Trash2, Loader2 } from "lucide-react";
import { fetcher } from "@/lib/fetcher";
import ConfirmModal from "@/components/dashboard/confirm-modal";

interface GhostCandidate {
  _id: string;
  dedupKey: string;
  name: string;
  set: string;
  qty: number;
  price: number;
  condition: string;
  foil: boolean;
  language: string;
  lastSeenAt?: string;
  source: string;
  articleId?: string;
}

interface GhostResponse {
  data: {
    tracked: number;
    reported: number | null;
    gap: number;
    candidates: GhostCandidate[];
  };
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-PT");
}

/**
 * Shows a compact warning card when the dashboard tracks MORE stock rows
 * than Cardmarket reports in the latest stock_overview snapshot. The
 * delta ("ghost" rows) are the likeliest candidates for stale listings
 * the user delisted from a device the extension wasn't running on.
 *
 * Collapsed by default; click to expand a list of oldest-lastSeenAt
 * candidates, select, and bulk-remove.
 */
export default function StockGhostGap() {
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [removing, setRemoving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data, isLoading, mutate } = useSWR<GhostResponse>(
    "/api/stock/ghosts?limit=200",
    fetcher
  );

  const gap = data?.data.gap ?? 0;
  const tracked = data?.data.tracked ?? 0;
  const reported = data?.data.reported;
  const candidates = data?.data.candidates ?? [];

  // Only render when we have confirmation that dashboard has more than CM.
  // When reported == null (no snapshot yet), stay quiet — we can't know.
  if (isLoading) return null;
  if (reported == null) return null;
  if (gap <= 0) return null;

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === candidates.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(candidates.map((c) => c._id)));
    }
  }

  function requestRemoveSelected() {
    if (!selected.size || removing) return;
    setConfirmOpen(true);
  }

  async function removeSelected() {
    if (!selected.size || removing) return;
    const ids = Array.from(selected);
    setRemoving(true);
    try {
      await fetch("/api/stock/ghosts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      setSelected(new Set());
      await mutate();
      globalMutate("/api/stock/summary");
      globalMutate(
        (key: string) => typeof key === "string" && key.startsWith("/api/stock?"),
        undefined,
        { revalidate: true }
      );
    } finally {
      setRemoving(false);
    }
  }

  const allSelected =
    candidates.length > 0 && selected.size === candidates.length;

  return (
    <div
      style={{
        background: "rgba(251, 191, 36, 0.06)",
        border: "1px solid rgba(251, 191, 36, 0.25)",
        borderRadius: 10,
        marginBottom: 16,
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          padding: "10px 14px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: "var(--text-primary)",
          textAlign: "left",
        }}
      >
        <AlertTriangle size={16} style={{ color: "#fbbf24", flexShrink: 0 }} />
        <span className="min-w-0 flex-1" style={{ fontSize: 13 }}>
          <span style={{ fontWeight: 600 }}>
            {gap} ghost row{gap === 1 ? "" : "s"}
          </span>
          <span style={{ color: "var(--text-muted)", marginLeft: 8 }}>
            Dashboard tracks {tracked.toLocaleString()} · CM reports{" "}
            {reported.toLocaleString()}
          </span>
        </span>
        {expanded ? (
          <ChevronUp size={16} style={{ color: "var(--text-muted)" }} />
        ) : (
          <ChevronDown size={16} style={{ color: "var(--text-muted)" }} />
        )}
      </button>

      {expanded && (
        <div style={{ padding: "0 14px 12px" }}>
          <p
            style={{
              color: "var(--text-muted)",
              fontSize: 12,
              margin: "0 0 10px",
              lineHeight: 1.5,
            }}
          >
            Listings CM no longer reports, sorted oldest-seen first. Most likely
            delisted from a device the extension wasn&apos;t running on. Review
            and remove the ones that are truly gone.
          </p>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 8,
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={toggleAll}
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: 6,
                color: "var(--text-primary)",
                padding: "4px 10px",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {allSelected ? "Deselect all" : "Select all"}
            </button>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {selected.size} of {candidates.length} selected
            </span>
            <button
              type="button"
              onClick={requestRemoveSelected}
              disabled={!selected.size || removing}
              style={{
                background:
                  !selected.size || removing
                    ? "rgba(255,255,255,0.04)"
                    : "rgba(252, 165, 165, 0.12)",
                border:
                  !selected.size || removing
                    ? "1px solid rgba(255,255,255,0.10)"
                    : "1px solid rgba(252, 165, 165, 0.35)",
                borderRadius: 6,
                color:
                  !selected.size || removing
                    ? "var(--text-muted)"
                    : "var(--error, #fca5a5)",
                padding: "4px 10px",
                fontSize: 12,
                cursor:
                  !selected.size || removing ? "not-allowed" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                marginLeft: "auto",
              }}
            >
              {removing ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Trash2 size={12} />
              )}
              Remove selected
            </button>
          </div>

          <div
            style={{
              background: "rgba(0,0,0,0.2)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 8,
              maxHeight: 320,
              overflowY: "auto",
              overflowX: "auto",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 580 }}>
              <thead>
                <tr
                  style={{
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "var(--text-muted)",
                  }}
                >
                  <th style={{ padding: "8px 10px", width: 30 }} />
                  <th style={{ padding: "8px 10px", textAlign: "left" }}>Name</th>
                  <th style={{ padding: "8px 10px", textAlign: "left" }}>Set</th>
                  <th style={{ padding: "8px 10px", textAlign: "center" }}>Cond</th>
                  <th style={{ padding: "8px 10px", textAlign: "center" }}>Foil</th>
                  <th style={{ padding: "8px 10px", textAlign: "right" }}>Qty</th>
                  <th style={{ padding: "8px 10px", textAlign: "right" }}>Price</th>
                  <th style={{ padding: "8px 10px", textAlign: "right" }}>Last seen</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => {
                  const isSelected = selected.has(c._id);
                  return (
                    <tr
                      key={c._id}
                      onClick={() => toggleOne(c._id)}
                      style={{
                        cursor: "pointer",
                        background: isSelected
                          ? "rgba(252, 165, 165, 0.08)"
                          : "transparent",
                        borderTop: "1px solid rgba(255,255,255,0.04)",
                        fontSize: 12,
                      }}
                    >
                      <td style={{ padding: "6px 10px", textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleOne(c._id)}
                          onClick={(e) => e.stopPropagation()}
                          style={{ accentColor: "#fbbf24", cursor: "pointer" }}
                        />
                      </td>
                      <td
                        style={{
                          padding: "6px 10px",
                          color: "var(--text-primary)",
                        }}
                      >
                        {c.name}
                      </td>
                      <td
                        style={{
                          padding: "6px 10px",
                          color: "var(--text-muted)",
                        }}
                      >
                        {c.set}
                      </td>
                      <td
                        style={{
                          padding: "6px 10px",
                          textAlign: "center",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {c.condition}
                      </td>
                      <td
                        style={{
                          padding: "6px 10px",
                          textAlign: "center",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {c.foil ? "Yes" : "No"}
                      </td>
                      <td
                        style={{
                          padding: "6px 10px",
                          textAlign: "right",
                          color: "var(--text-secondary)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {c.qty}
                      </td>
                      <td
                        style={{
                          padding: "6px 10px",
                          textAlign: "right",
                          color: "var(--text-primary)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        €{c.price.toFixed(2)}
                      </td>
                      <td
                        style={{
                          padding: "6px 10px",
                          textAlign: "right",
                          color: "var(--text-muted)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {formatDate(c.lastSeenAt)}
                      </td>
                    </tr>
                  );
                })}
                {candidates.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      style={{
                        padding: "16px",
                        textAlign: "center",
                        color: "var(--text-muted)",
                        fontSize: 12,
                      }}
                    >
                      No candidates loaded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={removeSelected}
        title="Remove ghost rows"
        message={`Remove ${selected.size} ghost row${selected.size === 1 ? "" : "s"}? This deletes them from the dashboard. They'll come back if Cardmarket still reports them on the next sync.`}
        confirmLabel="Remove"
        variant="danger"
      />
    </div>
  );
}
