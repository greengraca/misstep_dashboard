"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import Modal from "@/components/dashboard/modal";
import { StatusPill } from "@/components/dashboard/status-pill";
import { FoilStar } from "@/components/dashboard/cm-sprite";
import { ExternalLink, Copy, Check, AlertCircle } from "lucide-react";

interface UntaggedRow {
  lot_id: string;
  cardmarket_id: number;
  name: string | null;
  set: string | null;
  condition: string;
  language: string;
  foil: boolean;
  qty_remaining: number;
  qty_listed: number;
  current_comment: string | null;
  cm_url: string;
}

interface Props {
  open: boolean;
  investmentId: string;
  /** The investment's code (MS-XXXX). Shown for one-click copy and rendered
   *  inline in the row hint so the user knows what to paste. */
  code: string;
  onClose: () => void;
}

export default function UntaggedListingsModal({ open, investmentId, code, onClose }: Props) {
  const { data, isLoading } = useSWR<{ code: string | null; rows: UntaggedRow[] }>(
    open ? `/api/investments/${investmentId}/untagged-listings` : null,
    fetcher
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  const rows = data?.rows ?? [];
  const neverListed = rows.filter((r) => r.qty_listed === 0);
  const wronglyTagged = rows.filter((r) => r.qty_listed > 0);

  return (
    <Modal open={open} onClose={onClose} title="Untagged listings" maxWidth="max-w-3xl">
      <div className="flex flex-col gap-4">
        {/* Code reminder strip — the user needs the code in their clipboard
            to fix any of these listings, so we make it the first action. */}
        <div
          className="flex items-center gap-3 px-3 py-2 rounded-lg flex-wrap"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
          <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
            Paste this in each listing's comment field on Cardmarket:
          </span>
          <button
            onClick={copyCode}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-sm font-mono font-semibold transition-colors"
            style={{
              background: "var(--bg-hover)",
              color: "var(--accent)",
              border: "1px solid var(--accent-border)",
              letterSpacing: "0.05em",
              cursor: "pointer",
            }}
            title="Copy code"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {code}
          </button>
        </div>

        {isLoading ? (
          <div className="text-center text-sm py-6" style={{ color: "var(--text-muted)" }}>
            Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm" style={{ color: "var(--success)" }}>
            <Check size={16} />
            All remaining lots have a tagged listing on Cardmarket.
          </div>
        ) : (
          <>
            {neverListed.length > 0 && (
              <Section
                title="Not yet listed on Cardmarket"
                tone="warning"
                hint="These lots have remaining stock but no matching listing on CM. Either you haven't created the listing yet, or the listing's productId/condition/language/foil doesn't match this lot."
                rows={neverListed}
                code={code}
              />
            )}
            {wronglyTagged.length > 0 && (
              <Section
                title="Listings missing the code"
                tone="danger"
                hint="A matching listing exists on CM, but its comment doesn't carry this investment's code. Open the listing, paste the code into the comment field, save."
                rows={wronglyTagged}
                code={code}
              />
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

function Section({
  title,
  tone,
  hint,
  rows,
  code,
}: {
  title: string;
  tone: "warning" | "danger";
  hint: string;
  rows: UntaggedRow[];
  code: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2 flex-wrap">
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {title}
        </h3>
        <StatusPill tone={tone}>{rows.length}</StatusPill>
      </div>
      <p className="text-[11px] flex items-start gap-1.5" style={{ color: "var(--text-muted)", lineHeight: 1.5 }}>
        <AlertCircle size={11} style={{ color: tone === "danger" ? "var(--error)" : "var(--warning)", marginTop: 2, flexShrink: 0 }} />
        {hint}
      </p>
      <div className="flex flex-col" style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
        {rows.map((r, i) => (
          <a
            key={r.lot_id}
            href={r.cm_url}
            target="_blank"
            rel="noopener noreferrer"
            className="grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_auto_auto_auto] items-center gap-2 sm:gap-3 px-3 py-2 transition-colors"
            style={{
              background: "transparent",
              borderTop: i === 0 ? "none" : "1px solid var(--border-subtle)",
              textDecoration: "none",
              color: "inherit",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-card-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            title={r.current_comment ? `Current comment: ${r.current_comment}` : undefined}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-sm" style={{ color: "var(--text-primary)" }}>
                <span className="truncate">{r.name ?? `#${r.cardmarket_id}`}</span>
                {r.foil && <FoilStar size={11} />}
              </div>
              <div className="text-[11px] truncate" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                {r.set?.toUpperCase() ?? "—"} · {r.condition} · {r.language}
                {r.current_comment && (
                  <span style={{ color: "var(--text-secondary)" }}>
                    {" · current comment: "}
                    <span style={{ color: "var(--warning)" }}>&quot;{r.current_comment}&quot;</span>
                  </span>
                )}
              </div>
            </div>
            <span
              className="text-[11px]"
              style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
              title="Quantity in this lot (your remaining stock)"
            >
              {r.qty_remaining}× lot
            </span>
            <span
              className="text-[11px] hidden sm:inline"
              style={{
                color: r.qty_listed === 0 ? "var(--warning)" : "var(--text-secondary)",
                fontFamily: "var(--font-mono)",
              }}
              title="Quantity currently listed on Cardmarket matching this lot"
            >
              {r.qty_listed === 0 ? "not listed" : `${r.qty_listed}× CM`}
            </span>
            <ExternalLink size={12} style={{ color: "var(--text-muted)" }} />
          </a>
        ))}
      </div>
      <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
        Click a row to open the Cardmarket product page · code <span style={{ color: "var(--accent)", fontFamily: "var(--font-mono)" }}>{code}</span> already in your clipboard
      </p>
    </div>
  );
}
