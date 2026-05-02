"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import StatCard from "@/components/dashboard/stat-card";
import Select from "@/components/dashboard/select";
import { H2, Note } from "@/components/dashboard/page-shell";
import { AlertTriangle, Coins, Globe, Layers, Package, ShoppingBag, Trophy, Truck } from "lucide-react";

// Pipeline colours, matched to CardmarketContent's PIPELINE_COLORS.
const STATUS_PIP: Record<"paid" | "sent" | "arrived", string> = {
  paid: "var(--accent)",   // cyan — buyer paid, awaiting ship
  sent: "var(--success)",  // green — trustee holds / in transit
  arrived: "var(--info)",  // blue — money landed
};

type ByStatusBucket = {
  packages: number;
  cards: number;
  articleGross: number;
  articleNet: number;
  shippingIncome: number;
  avgArticleNetPerCard: number;
};

type SalesEconomics = {
  rangeLabel: string;
  windowStart: string | null;
  windowEnd: string | null;
  daysInWindow: number;
  packages: number;
  cards: number;
  avgCardsPerPackage: number;
  avgPackagesPerDay: number;
  avgCardsPerDay: number;
  detailSyncedPct: number;
  ordersMissingDetail: number;
  ordersUnsynced: number;
  ordersPartial: number;
  ordersUnknownMethod: number;
  totalReceived: number;
  articleGross: number;
  shippingIncome: number;
  trusteeArticleGross: number;
  sellingFee: number;
  trusteeFee: number;
  articleNet: number;
  shippingExpense: number;
  shippingProfit: number;
  avgArticleGrossPerCard: number;
  avgArticleNetPerCard: number;
  avgShipIncomePerPackage: number;
  avgShipProfitPerPackage: number;
  avgShipProfitPerCard: number;
  fullPerCardNet: number;
  byStatus: { paid: ByStatusBucket; sent: ByStatusBucket; arrived: ByStatusBucket };
  byShippingMethod: {
    method: string;
    packages: number;
    cards: number;
    shippingIncome: number;
    avgPerPackage: number;
  }[];
  byCountry: {
    country: string;
    packages: number;
    cards: number;
    grossReceived: number;
    avgGrossPerPackage: number;
  }[];
  records: {
    largest: { orderId: string; total: number; cards: number; country?: string; date?: string } | null;
    mostCards: { orderId: string; total: number; cards: number; country?: string; date?: string } | null;
    smallest: { orderId: string; total: number; cards: number; country?: string; date?: string } | null;
  };
};

type RangePreset =
  | "lifetime"
  | "thisMonth"
  | "lastMonth"
  | "last30"
  | "last90"
  | "last365";

const RANGE_OPTIONS: { value: RangePreset; label: string }[] = [
  { value: "lifetime", label: "Lifetime" },
  { value: "thisMonth", label: "This month" },
  { value: "lastMonth", label: "Last month" },
  { value: "last30", label: "Last 30 days" },
  { value: "last90", label: "Last 90 days" },
  { value: "last365", label: "Last 12 months" },
];

function isoDay(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function buildRangeQuery(preset: RangePreset): string {
  const today = new Date();
  if (preset === "lifetime") return "range=lifetime";
  if (preset === "thisMonth") {
    const ym = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`;
    return `range=month&month=${ym}`;
  }
  if (preset === "lastMonth") {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
    const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    return `range=month&month=${ym}`;
  }
  const days = preset === "last30" ? 30 : preset === "last90" ? 90 : 365;
  const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - (days - 1)));
  return `range=custom&from=${isoDay(from)}&to=${isoDay(today)}`;
}

const formatEur = (n: number | null | undefined, digits = 2) =>
  n != null
    ? `${n.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits })} €`
    : "—";

// Per-card values: 3 decimals (€0.651). Per-package + totals: 2 decimals.
const eurCard = (n: number | null | undefined) => formatEur(n, 3);
const eurPkg = (n: number | null | undefined) => formatEur(n, 2);

// Compact ISO "YYYY-MM-DD" → "Apr 6" / "May 2, 2026" depending on context.
function shortDate(iso: string | null, withYear = false): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

// Render a humane, one-line description of the current window.
//  • lifetime     → "Lifetime · 27 days · since Apr 6"
//  • single day   → "May 1, 2026 · 1 day"
//  • month        → "Apr 2026 · 30 days"
//  • generic      → "Apr 3 → May 2 · 30 days"
function rangeSubtitle(preset: RangePreset, e: Pick<SalesEconomics, "windowStart" | "windowEnd" | "daysInWindow">): string {
  const { windowStart, windowEnd, daysInWindow } = e;
  if (!windowStart || !windowEnd) return "no orders in window";
  const dayLabel = `${daysInWindow} day${daysInWindow === 1 ? "" : "s"}`;
  if (preset === "lifetime") return `Lifetime · ${dayLabel} · since ${shortDate(windowStart)}`;
  if (windowStart === windowEnd) return `${shortDate(windowStart, true)} · 1 day`;
  if (preset === "thisMonth" || preset === "lastMonth") {
    const d = new Date(`${windowStart}T00:00:00Z`);
    const monthLabel = d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
    return `${monthLabel} · ${dayLabel}`;
  }
  return `${shortDate(windowStart)} → ${shortDate(windowEnd, true)} · ${dayLabel}`;
}

export default function SalesEconomicsPanel() {
  const [range, setRange] = useState<RangePreset>("lifetime");
  const query = useMemo(() => buildRangeQuery(range), [range]);
  const { data, isLoading } = useSWR<{ data: SalesEconomics }>(
    `/api/ext/sales-economics?${query}`,
    fetcher
  );
  const e = data?.data;

  const subtitleRange = e ? rangeSubtitle(range, e) : "loading…";

  // Free-standing section: H2 + range selector + child surfaces (StatCards,
  // breakdowns, records). No outer Panel — each internal piece is already a
  // card surface and double-wrapping makes them read as flat grey
  // (nested-cards anti-pattern).
  return (
    <div className="flex flex-col gap-4">
      {/* Header + range selector */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <H2 icon={<Coins size={16} />}>Sales economics</H2>
          <p className="text-[11px] -mt-2" style={{ color: "var(--text-muted)" }}>
            Paid + sent + arrived sales · {subtitleRange}
          </p>
        </div>
        <Select
          size="sm"
          value={range}
          onChange={(v) => setRange(v as RangePreset)}
          options={RANGE_OPTIONS}
          className="min-w-[140px]"
        />
      </div>

      {!e || isLoading ? (
        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
          Loading…
        </div>
      ) : e.packages === 0 ? (
        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
          No paid/sent/arrived sales in this window.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Data-quality banner — replaces the old footnote. Shows up
              only when something is off, scaled by severity. */}
          {(e.ordersUnsynced > 0 || e.ordersPartial > 0) && (
            <DataQualityBanner
              unsynced={e.ordersUnsynced}
              partial={e.ordersPartial}
              unknownMethod={e.ordersUnknownMethod}
              packages={e.packages}
            />
          )}

          {/* Headline KPI grid — totals folded into subtitles, summary
              strip removed. Each KPI tells a complete story by itself. */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              title="Packages"
              value={e.packages.toLocaleString()}
              subtitle={`${e.avgPackagesPerDay.toFixed(1)} / day · ${e.avgCardsPerPackage} cards/pkg`}
              tooltip={`${e.daysInWindow} day${e.daysInWindow === 1 ? "" : "s"} in window. Per-day rate uses elapsed days.`}
              icon={<Package size={18} style={{ color: "var(--accent)" }} />}
            />
            <StatCard
              title="Cards Sold"
              value={e.cards.toLocaleString()}
              subtitle={`${e.avgCardsPerDay.toFixed(1)} / day · ${eurPkg(e.totalReceived)} received`}
              tooltip={`Article ${eurPkg(e.articleGross)} + shipping ${eurPkg(e.shippingIncome)} = ${eurPkg(e.totalReceived)} received from buyers.`}
              icon={<ShoppingBag size={18} style={{ color: "var(--accent)" }} />}
            />
            <StatCard
              title="ASP / card (net)"
              value={eurCard(e.avgArticleNetPerCard)}
              subtitle={`+ ${eurCard(e.avgShipProfitPerCard)} ship → ${eurCard(e.fullPerCardNet)} / card`}
              tooltip={`Article ${eurPkg(e.articleNet)} net of CM 5% selling fee (${eurPkg(e.sellingFee)}) + 1% trustee fee (${eurPkg(e.trusteeFee)}), divided by ${e.cards.toLocaleString()} cards.`}
              icon={<Coins size={18} style={{ color: "var(--accent)" }} />}
            />
            <StatCard
              title="Ship profit / pkg"
              value={eurPkg(e.avgShipProfitPerPackage)}
              subtitle={`${eurPkg(e.shippingProfit)} total · ${eurPkg(e.shippingIncome)} in − ${eurPkg(e.shippingExpense)} cost`}
              tooltip="Shipping fees collected from buyers minus real shipping expenses logged in finance, divided by packages."
              icon={<Truck size={18} style={{ color: "var(--accent)" }} />}
            />
          </div>

          {/* By status — capitalised + colour pip. Bar value = pkgs to
              communicate which status holds the most volume. */}
          <BreakdownTable
            title="By status"
            icon={<Layers size={13} />}
            count={`${e.packages.toLocaleString()} pkgs total`}
            cols={["Status", "Pkgs", "Cards", "Article gross", "Article net", "Shipping", "Net / card"]}
            rows={(["paid", "sent", "arrived"] as const).map((st) => {
              const b = e.byStatus[st];
              return {
                bar: b.packages,
                cells: [
                  <StatusCell key={st} status={st} />,
                  b.packages.toLocaleString(),
                  b.cards.toLocaleString(),
                  eurPkg(b.articleGross),
                  eurPkg(b.articleNet),
                  eurPkg(b.shippingIncome),
                  eurCard(b.avgArticleNetPerCard),
                ],
              };
            })}
          />

          {/* Method + country side-by-side on wide screens to stop the
              vertical scroll piling up. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <BreakdownTable
              title="By shipping method"
              icon={<Truck size={13} />}
              count={`${e.byShippingMethod.filter((m) => m.method !== "(unknown)").length} methods`}
              cols={["Method", "Pkgs", "Cards", "Ship income", "Avg / pkg"]}
              rows={e.byShippingMethod
                .filter((m) => m.method !== "(unknown)")
                .slice(0, 6)
                .map((m) => ({
                  bar: m.packages,
                  muted: m.packages < 5,
                  cells: [
                    <MethodCell key={m.method} method={m.method} n={m.packages} />,
                    m.packages.toLocaleString(),
                    m.cards.toLocaleString(),
                    eurPkg(m.shippingIncome),
                    eurPkg(m.avgPerPackage),
                  ],
                }))}
            />

            <BreakdownTable
              title="By country"
              icon={<Globe size={13} />}
              count={`${e.byCountry.length} countries · top 10`}
              cols={["Country", "Pkgs", "Cards", "Gross", "Avg / pkg"]}
              rows={e.byCountry.slice(0, 10).map((c) => ({
                bar: c.packages,
                muted: c.packages < 5,
                cells: [
                  <MethodCell key={c.country} method={c.country} n={c.packages} />,
                  c.packages.toLocaleString(),
                  c.cards.toLocaleString(),
                  eurPkg(c.grossReceived),
                  eurPkg(c.avgGrossPerPackage),
                ],
              }))}
            />
          </div>

          {/* Records — trophy cards, click-through to the CM order page. */}
          {(e.records.largest || e.records.mostCards || e.records.smallest) && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Trophy size={13} style={{ color: "var(--accent)" }} />
                <h3
                  className="text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Highlights
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {e.records.largest && (
                  <RecordCard label="Largest order" rec={e.records.largest} accent="var(--accent)" />
                )}
                {e.records.mostCards && (
                  <RecordCard label="Most cards" rec={e.records.mostCards} accent="var(--success)" />
                )}
                {e.records.smallest && (
                  <RecordCard label="Smallest order" rec={e.records.smallest} accent="var(--info)" />
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Top-of-panel banner that surfaces sync gaps the same way the order-row
// indicator does: red for fully unsynced, yellow for partial. Replaces the
// old "X orders missing detail" footnote — the May "thin data" case stops
// being silent.
function DataQualityBanner({
  unsynced, partial, unknownMethod, packages,
}: {
  unsynced: number; partial: number; unknownMethod: number; packages: number;
}) {
  const tone: "warn" | "danger" = unsynced / Math.max(packages, 1) > 0.3 ? "danger" : "warn";
  const parts: string[] = [];
  if (unsynced > 0) parts.push(`${unsynced} need re-sync`);
  if (partial > 0) parts.push(`${partial} partial`);
  if (unknownMethod > 0 && unknownMethod !== unsynced) parts.push(`${unknownMethod} missing shipping method`);
  return (
    <Note tone={tone} icon={<AlertTriangle size={14} />} title={`Data quality: ${parts.join(" · ")}`}>
      Numbers below treat missing fields as zero, so cards / shipping totals are slightly low. Visit
      the affected orders on Cardmarket to refresh.
    </Note>
  );
}

// Status cell: "Paid" / "Sent" / "Arrived" with the pipeline colour pip.
function StatusCell({ status }: { status: "paid" | "sent" | "arrived" }) {
  const label = status[0].toUpperCase() + status.slice(1);
  return (
    <span className="inline-flex items-center gap-2">
      <span
        style={{
          width: 8, height: 8, borderRadius: "50%",
          background: STATUS_PIP[status], display: "inline-block",
        }}
      />
      {label}
    </span>
  );
}

// Generic first-column cell for breakdown tables. Appends a dim "n=X"
// badge when the row has fewer than 5 packages — keeps the user from
// over-interpreting tiny samples (e.g. Registered Parcel n=3 → €38/pkg).
function MethodCell({ method, n }: { method: string; n: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {method}
      {n < 5 && (
        <span
          className="px-1 py-0.5 rounded text-[9px]"
          style={{
            background: "rgba(255,255,255,0.06)",
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono)",
          }}
          title={`Small sample (n=${n}) — average is anecdotal`}
        >
          n={n}
        </span>
      )}
    </span>
  );
}

// Sectional breakdown table.
//
// Visual model: each row's BACKGROUND is a horizontal bar whose width
// is proportional to that row's `bar` value vs the table's max. So the
// row itself communicates relative scale at a glance — Portugal's row
// fills 100% of the width because it leads, Belgium's row fills ~14%.
// Numbers and labels float on top.
//
// The container is a flat-but-distinct card so the three breakdowns
// don't look like one undifferentiated wall of text.
function BreakdownTable({
  title, icon, count, cols, rows,
}: {
  title: string;
  icon?: React.ReactNode;
  count?: string;
  cols: string[];
  rows: { cells: React.ReactNode[]; bar: number; muted?: boolean }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.bar));
  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {/* Section header */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.015)" }}
      >
        <div className="flex items-center gap-2">
          {icon && <span style={{ color: "var(--accent)", display: "inline-flex" }}>{icon}</span>}
          <h3
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-secondary)" }}
          >
            {title}
          </h3>
        </div>
        {count && (
          <span className="text-[10px]" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
            {count}
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[480px]" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr style={{ color: "var(--text-muted)" }}>
              {cols.map((c, i) => (
                <th
                  key={c}
                  className={`py-1.5 px-3 font-medium text-[10px] uppercase tracking-wider ${i === 0 ? "text-left" : "text-right"}`}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const pct = (row.bar / max) * 100;
              return (
                <tr
                  key={i}
                  style={{
                    color: row.muted ? "var(--text-muted)" : "var(--text-secondary)",
                    // Two-stop linear gradient = a hard-edged bar fill behind
                    // the row content. accent-light is already a low-alpha
                    // tint so it reads as decoration, not focus.
                    background: `linear-gradient(90deg, var(--accent-light) 0%, var(--accent-light) ${pct}%, transparent ${pct}%, transparent 100%)`,
                    transition: "background 120ms ease",
                  }}
                >
                  {row.cells.map((cell, j) => (
                    <td
                      key={j}
                      className={`py-2 px-3 ${j === 0 ? "text-left" : "text-right"}`}
                      style={{
                        fontFamily: j === 0 ? undefined : "var(--font-mono)",
                        color: j === 0 && !row.muted ? "var(--text-primary)" : undefined,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Record card — a single "highlight" chip elevated to its own card.
// Hierarchy: BIG monospace value, label as a small uppercase tag,
// supporting metadata in muted text. Hover pulls the accent border in
// and lifts slightly; the orderId is a click-through to the CM tab.
function RecordCard({
  label, rec, accent,
}: {
  label: string;
  rec: { orderId: string; total: number; cards: number; country?: string; date?: string };
  accent: string;
}) {
  return (
    <a
      href={`https://www.cardmarket.com/en/Magic/Orders/${rec.orderId}`}
      target="_blank"
      rel="noopener noreferrer"
      className="block p-3 rounded-lg transition-all hover:-translate-y-0.5"
      style={{
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.08)",
        textDecoration: "none",
      }}
      onMouseEnter={(ev) => {
        ev.currentTarget.style.borderColor = accent;
        ev.currentTarget.style.background = "rgba(255,255,255,0.04)";
      }}
      onMouseLeave={(ev) => {
        ev.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
        ev.currentTarget.style.background = "rgba(255,255,255,0.025)";
      }}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span
          style={{ width: 4, height: 4, borderRadius: "50%", background: accent, display: "inline-block" }}
        />
        <span
          className="text-[9px] uppercase tracking-wider"
          style={{ color: "var(--text-muted)", fontWeight: 600 }}
        >
          {label}
        </span>
      </div>
      <div
        className="text-base font-bold"
        style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}
      >
        {formatEur(rec.total)}
      </div>
      <div className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
        {rec.cards} card{rec.cards === 1 ? "" : "s"}
        {rec.country ? ` · ${rec.country}` : ""}
      </div>
      <div className="text-[10px] mt-1" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
        #{rec.orderId}{rec.date ? ` · ${rec.date}` : ""}
      </div>
    </a>
  );
}
