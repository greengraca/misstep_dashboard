"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { Sparkles, Lock, ShoppingBag, Package } from "lucide-react";

interface SalesHistory {
  cost: number;
  created_at: string;
  closed_at: string | null;
  events: { date: string; kind: "sale" | "flip"; amount: number }[];
  daily: { date: string; cumulative: number }[];
  summary: {
    first_event_at: string | null;
    last_event_at: string | null;
    sale_count: number;
    flip_count: number;
  };
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "2-digit" });
}

function daysBetween(aIso: string, bIso: string): number {
  const a = new Date(aIso).getTime();
  const b = new Date(bIso).getTime();
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

interface Marker {
  date: string;     // ISO date
  label: string;
  detail: string;
  icon: React.ReactNode;
  color: string;
}

/** Horizontal life-arc strip for an investment.  Markers (Created /
 *  First sale / Last sale / Closed) are positioned proportionally across
 *  the strip's full width based on their dates within the [created, end]
 *  window.  Below the strip: a compact velocity hint
 *  ("12 sales over 47 days · last sale 3 days ago"). */
export default function InvestmentTimeline({ investmentId }: { investmentId: string }) {
  const { data, isLoading } = useSWR<{ data: SalesHistory }>(
    `/api/investments/${investmentId}/sales-history`,
    fetcher,
    { dedupingInterval: 30_000 }
  );

  if (isLoading || !data?.data) return null;
  const sh = data.data;

  const start = sh.created_at.slice(0, 10);
  // The strip spans created → today (or closed_at, whichever is earlier).
  const endIso = sh.closed_at ?? new Date().toISOString();
  const end = endIso.slice(0, 10);
  const totalSpanDays = Math.max(1, daysBetween(start, end));

  const markers: Marker[] = [];
  markers.push({
    date: start,
    label: "Created",
    detail: formatDate(sh.created_at),
    icon: <Sparkles size={11} />,
    color: "var(--accent)",
  });
  if (sh.summary.first_event_at) {
    markers.push({
      date: sh.summary.first_event_at,
      label: sh.summary.sale_count > 0 ? "First sale" : "First flip",
      detail: formatDate(sh.summary.first_event_at),
      icon: sh.summary.sale_count > 0 ? <ShoppingBag size={11} /> : <Package size={11} />,
      color: "var(--success)",
    });
  }
  if (sh.summary.last_event_at && sh.summary.last_event_at !== sh.summary.first_event_at) {
    markers.push({
      date: sh.summary.last_event_at,
      label: "Last sale",
      detail: formatDate(sh.summary.last_event_at),
      icon: <ShoppingBag size={11} />,
      color: "var(--success)",
    });
  }
  if (sh.closed_at) {
    markers.push({
      date: sh.closed_at.slice(0, 10),
      label: "Closed",
      detail: formatDate(sh.closed_at),
      icon: <Lock size={11} />,
      color: "var(--text-tertiary)",
    });
  }

  function pctForDate(iso: string): number {
    const days = daysBetween(start, iso);
    return Math.min(100, Math.max(0, (days / totalSpanDays) * 100));
  }

  // Velocity hint below the strip — total events over total days, plus
  // last-sale recency. Skip when nothing's happened yet.
  const totalEvents = sh.summary.sale_count + sh.summary.flip_count;
  const eventWindowDays = sh.summary.first_event_at && sh.summary.last_event_at
    ? Math.max(1, daysBetween(sh.summary.first_event_at, sh.summary.last_event_at) + 1)
    : 0;
  const lastSaleDaysAgo = sh.summary.last_event_at
    ? daysBetween(sh.summary.last_event_at, new Date().toISOString().slice(0, 10))
    : null;

  const dormant = lastSaleDaysAgo != null && lastSaleDaysAgo >= 30;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative h-1.5 rounded-full" style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}>
        {/* Active stretch from first event → last event (the period when
            something was happening). */}
        {sh.summary.first_event_at && sh.summary.last_event_at && (
          <div
            className="absolute h-full rounded-full"
            style={{
              left: `${pctForDate(sh.summary.first_event_at)}%`,
              width: `${pctForDate(sh.summary.last_event_at) - pctForDate(sh.summary.first_event_at)}%`,
              background: "var(--success)",
              opacity: 0.4,
              minWidth: 2,
            }}
          />
        )}
        {markers.map((m) => (
          <div
            key={`${m.label}-${m.date}`}
            className="absolute -top-[5px] flex items-center justify-center"
            style={{
              left: `${pctForDate(m.date)}%`,
              transform: "translateX(-50%)",
              width: 14,
              height: 14,
              borderRadius: 7,
              background: m.color,
              color: "var(--bg-page)",
              border: "2px solid var(--bg-page)",
            }}
            title={`${m.label} · ${m.detail}`}
          >
            {m.icon}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 text-[10px] flex-wrap" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
        <div className="flex items-center gap-2 flex-wrap">
          {markers.map((m) => (
            <span
              key={`label-${m.label}-${m.date}`}
              className="inline-flex items-center gap-1"
            >
              <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: 3, background: m.color }} />
              {m.label}: {m.detail}
            </span>
          ))}
        </div>
        {totalEvents > 0 && (
          <div className="flex items-center gap-2">
            <span>
              {totalEvents} event{totalEvents === 1 ? "" : "s"} over {eventWindowDays} day{eventWindowDays === 1 ? "" : "s"}
            </span>
            {lastSaleDaysAgo != null && (
              <>
                <span style={{ opacity: 0.4 }}>·</span>
                <span style={{ color: dormant ? "var(--warning)" : "var(--text-muted)" }}>
                  last {lastSaleDaysAgo === 0 ? "today" : `${lastSaleDaysAgo}d ago`}
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
