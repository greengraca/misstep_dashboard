"use client";

import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/dashboard/modal";
import { StatusPill } from "@/components/dashboard/status-pill";
import { Note } from "@/components/dashboard/page-shell";
import { Printer, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { CmOrder } from "@/lib/types";

// Same shape printEnvelopes already filters on. Typed loosely because
// CmOrder doesn't formally include shippingAddress (it's hydrated only
// when the order detail has been scraped).
type OrderWithMaybeAddress = CmOrder & {
  shippingAddress?: {
    name?: string;
    extra?: string | null;
    street?: string;
    city?: string;
    country?: string;
  };
};

interface Props {
  open: boolean;
  /** Candidate orders the user clicked to print (includes ones with no
   *  address — we surface them separately so the user knows what's
   *  excluded and can go fetch them on Cardmarket). */
  orders: OrderWithMaybeAddress[];
  onClose: () => void;
  /** Fires when the user confirms — receives the orders that survived
   *  per-row skip toggles AND have a shipping address. The parent's
   *  existing printEnvelopes() handler calls into the actual window.print
   *  flow. */
  onConfirm: (orders: OrderWithMaybeAddress[]) => void;
}

export default function PrintEnvelopesModal({ open, orders, onClose, onConfirm }: Props) {
  // Per-order skip state. Reset whenever the modal opens with a new list.
  // Already-printed orders are skipped by default — re-printing is a
  // deliberate opt-in, not the default behavior.
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (open) {
      const initialSkipped = new Set(
        orders.filter((o) => o.printed).map((o) => o.orderId)
      );
      setSkipped(initialSkipped);
    }
  }, [open, orders]);

  const withAddress = useMemo(
    () => orders.filter((o) => o.shippingAddress?.name),
    [orders]
  );
  const withoutAddress = useMemo(
    () => orders.filter((o) => !o.shippingAddress?.name),
    [orders]
  );
  const alreadyPrintedCount = useMemo(
    () => withAddress.filter((o) => o.printed).length,
    [withAddress]
  );

  function toggleSkip(orderId: string) {
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }

  const willPrint = withAddress.filter((o) => !skipped.has(o.orderId));

  return (
    <Modal open={open} onClose={onClose} title="Print envelopes" maxWidth="max-w-2xl">
      <div className="flex flex-col gap-4">
        {/* Summary strip */}
        <div className="flex items-center gap-2 flex-wrap">
          <StatusPill tone="accent">
            <Printer size={11} className="inline mr-1 -mt-px" />
            {willPrint.length} of {orders.length} will print
          </StatusPill>
          {alreadyPrintedCount > 0 && (
            <StatusPill tone="success">
              {alreadyPrintedCount} already printed
            </StatusPill>
          )}
          {skipped.size > 0 && (
            <StatusPill tone="muted">{skipped.size} skipped</StatusPill>
          )}
          {withoutAddress.length > 0 && (
            <StatusPill tone="warning">{withoutAddress.length} no address</StatusPill>
          )}
        </div>

        {/* Skipped-no-address explainer */}
        {withoutAddress.length > 0 && (
          <Note tone="warn" icon={<AlertTriangle size={14} />} title={`${withoutAddress.length} order${withoutAddress.length === 1 ? "" : "s"} excluded — no shipping address yet`}>
            Visit each excluded order&apos;s detail page on Cardmarket so the
            extension scrapes the address, then re-open this dialog.
          </Note>
        )}

        {/* Address-bearing orders — togglable. Already-printed orders are
            visually marked AND skipped by default; re-printing is opt-in. */}
        {withAddress.length > 0 && (
          <div className="flex flex-col" style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
            {withAddress.map((o, i) => {
              const skip = skipped.has(o.orderId);
              const wasPrinted = !!o.printed;
              const addr = o.shippingAddress!;
              return (
                <label
                  key={o.orderId}
                  className="flex items-start gap-3 px-3 py-2 transition-colors cursor-pointer"
                  style={{
                    background: skip ? "transparent" : "var(--bg-card-hover)",
                    borderTop: i === 0 ? "none" : "1px solid var(--border-subtle)",
                    opacity: skip ? 0.55 : 1,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!skip}
                    onChange={() => toggleSkip(o.orderId)}
                    className="mt-1"
                    style={{ accentColor: "var(--accent)", cursor: "pointer" }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-sm" style={{ color: "var(--text-primary)" }}>
                        {addr.name}
                      </span>
                      <span className="text-[11px]" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                        #{o.orderId}
                      </span>
                      {wasPrinted && (
                        <span
                          className="inline-flex items-center gap-1 text-[10px]"
                          style={{ color: "var(--success)", fontFamily: "var(--font-mono)" }}
                          title="This envelope was already printed. Toggle to opt back in if you need a re-print."
                        >
                          <CheckCircle2 size={11} />
                          already printed
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>
                      {addr.extra ? `${addr.extra} · ` : ""}
                      {addr.street}
                      {addr.city ? ` · ${addr.city}` : ""}
                      {addr.country ? ` · ${addr.country}` : ""}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        )}

        {/* Footer actions */}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={willPrint.length === 0}
            onClick={() => onConfirm(willPrint)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background: willPrint.length === 0 ? "var(--bg-card)" : "var(--accent)",
              color: willPrint.length === 0 ? "var(--text-muted)" : "var(--accent-text)",
              border: "1px solid var(--accent)",
              opacity: willPrint.length === 0 ? 0.6 : 1,
              cursor: willPrint.length === 0 ? "not-allowed" : "pointer",
            }}
          >
            <Printer size={14} />
            Print {willPrint.length} envelope{willPrint.length === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
