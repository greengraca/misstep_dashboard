"use client";

import useSWR from "swr";
import { useState } from "react";
import { Search, BookOpen } from "lucide-react";
import { fetcher } from "@/lib/fetcher";
import { FoilStar } from "@/components/dashboard/cm-sprite";
import { Panel, H2 } from "@/components/dashboard/page-shell";
import { StatusPill } from "@/components/dashboard/status-pill";

type Lot = {
  id: string;
  cardmarket_id: number;
  foil: boolean;
  condition: string;
  language: string;
  name: string | null;
  set_code: string | null;
  qty_opened: number;
  qty_sold: number;
  qty_remaining: number;
  cost_basis_per_unit: number | null;
  proceeds_eur: number;
  live_price_eur: number | null;
};

const CONDITION_COLORS: Record<string, string> = {
  MT: "#4caf50",
  NM: "#4caf50",
  EX: "#8bc34a",
  GD: "#ffc107",
  LP: "#ff9800",
  PL: "#f44336",
  PO: "#f44336",
};

function ConditionBadge({ condition }: { condition: string }) {
  const color = CONDITION_COLORS[condition] || "var(--text-muted)";
  return (
    <span
      className="px-1 py-0.5 rounded text-[9px] font-medium"
      style={{ background: `${color}22`, color }}
    >
      {condition}
    </span>
  );
}

const formatEur = (n: number | null | undefined) =>
  n != null ? `${n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : "—";

export default function InvestmentLotsTable({ investmentId }: { investmentId: string }) {
  const [search, setSearch] = useState("");
  const [foil, setFoil] = useState<"all" | "foil" | "nonfoil">("all");
  const [minRemaining, setMinRemaining] = useState<number | "">("");

  const qs = new URLSearchParams();
  if (search) qs.set("search", search);
  if (foil === "foil") qs.set("foil", "true");
  if (foil === "nonfoil") qs.set("foil", "false");
  if (typeof minRemaining === "number" && minRemaining > 0)
    qs.set("minRemaining", String(minRemaining));

  const { data, isLoading } = useSWR<{ lots: Lot[] }>(
    `/api/investments/${investmentId}/lots?${qs.toString()}`,
    fetcher,
    { dedupingInterval: 10_000 }
  );
  const lots = data?.lots ?? [];

  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <H2 icon={<BookOpen size={16} />}>Lot ledger</H2>
          {lots.length > 0 && (
            <StatusPill tone="accent">{lots.length}</StatusPill>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div
            className="relative flex items-center"
            style={{ border: "1px solid var(--border)", borderRadius: "8px", background: "var(--bg-card)" }}
          >
            <Search
              size={12}
              style={{ color: "var(--text-muted)", position: "absolute", left: 8 }}
            />
            <input
              placeholder="Search name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="appraiser-field bg-transparent text-xs py-1.5 pl-7 pr-2 w-40 outline-none"
              style={{ color: "var(--text-primary)" }}
            />
          </div>
          <div
            className="flex rounded-lg overflow-hidden text-[11px]"
            style={{ border: "1px solid var(--border)" }}
          >
            {(["all", "nonfoil", "foil"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setFoil(v)}
                className="px-2.5 py-1 font-medium transition-all"
                style={{
                  background: foil === v ? "var(--accent)" : "transparent",
                  color: foil === v ? "var(--accent-text)" : "var(--text-muted)",
                }}
              >
                {v === "all" ? "All" : v === "foil" ? "Foil" : "Non-foil"}
              </button>
            ))}
          </div>
          <input
            type="number"
            min={0}
            placeholder="Min rem."
            value={minRemaining}
            onChange={(e) => {
              const v = e.target.value;
              setMinRemaining(v === "" ? "" : Number(v));
            }}
            className="appraiser-field text-xs py-1.5 px-2 rounded-lg w-20"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
              fontFamily: "var(--font-mono)",
            }}
          />
        </div>
      </div>

      {isLoading ? (
        <p className="text-xs py-6 text-center" style={{ color: "var(--text-muted)" }}>
          Loading lots…
        </p>
      ) : lots.length === 0 ? (
        <p className="text-xs py-6 text-center" style={{ color: "var(--text-muted)" }}>
          No lots yet. For collection investments these are created at conversion;
          for box / product investments they grow as you list cards on Cardmarket
          tagged with this investment&apos;s code.
        </p>
      ) : (
        <>
          {/* Mobile cards. */}
          <div className="sm:hidden flex flex-col gap-2">
            {lots.map((l) => {
              const remValue =
                l.live_price_eur != null ? l.qty_remaining * l.live_price_eur : null;
              return (
                <div
                  key={l.id}
                  className="rounded-lg p-3"
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <a
                      href={`https://www.cardmarket.com/en/Magic/Products/Singles?idProduct=${l.cardmarket_id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sm min-w-0"
                      style={{ color: "var(--accent)", textDecoration: "none" }}
                    >
                      <span className="truncate">{l.name ?? `#${l.cardmarket_id}`}</span>
                      {l.foil && <FoilStar />}
                    </a>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <ConditionBadge condition={l.condition} />
                      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        {l.language}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                        Remaining
                      </div>
                      <div
                        style={{
                          color: l.qty_remaining > 0 ? "var(--text-primary)" : "var(--text-muted)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {l.qty_remaining}
                        <span style={{ color: "var(--text-muted)" }}>
                          {" "}/ {l.qty_opened}
                        </span>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                        Live
                      </div>
                      <div style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                        {formatEur(l.live_price_eur)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                        Rem. val
                      </div>
                      <div style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                        {formatEur(remValue)}
                      </div>
                    </div>
                  </div>
                  {(l.qty_sold > 0 || l.proceeds_eur > 0 || l.cost_basis_per_unit != null) && (
                    <div
                      className="mt-2 pt-2 grid grid-cols-3 gap-2 text-xs"
                      style={{ borderTop: "1px solid var(--border-subtle)" }}
                    >
                      <div>
                        <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                          Sold
                        </div>
                        <div style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                          {l.qty_sold}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                          Cost/unit
                        </div>
                        <div style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                          {formatEur(l.cost_basis_per_unit)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                          Proceeds
                        </div>
                        <div
                          style={{
                            color: l.proceeds_eur > 0 ? "var(--success)" : "var(--text-muted)",
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          {formatEur(l.proceeds_eur)}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop table. */}
          <div className="hidden sm:block overflow-x-auto">
          <table
            className="w-full text-xs min-w-[780px]"
            style={{ borderCollapse: "separate", borderSpacing: 0 }}
          >
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <th className="text-left py-2 font-medium">Card</th>
                <th className="text-center py-2 font-medium">Cond</th>
                <th className="text-center py-2 font-medium">Lang</th>
                <th className="text-right py-2 font-medium">Opened</th>
                <th className="text-right py-2 font-medium">Sold</th>
                <th className="text-right py-2 font-medium">Remaining</th>
                <th className="text-right py-2 font-medium">Cost/unit</th>
                <th className="text-right py-2 font-medium">Live</th>
                <th className="text-right py-2 font-medium">Rem. value</th>
                <th className="text-right py-2 font-medium">Proceeds</th>
              </tr>
            </thead>
            <tbody>
              {lots.map((l) => {
                const remValue =
                  l.live_price_eur != null ? l.qty_remaining * l.live_price_eur : null;
                return (
                  <tr
                    key={l.id}
                    style={{ borderTop: "1px solid var(--border)" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-card-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <td className="py-2">
                      <a
                        href={`https://www.cardmarket.com/en/Magic/Products/Singles?idProduct=${l.cardmarket_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1"
                        style={{ color: "var(--accent)", textDecoration: "none" }}
                        onMouseEnter={(e) => { e.currentTarget.style.textDecoration = "underline"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.textDecoration = "none"; }}
                      >
                        <span>{l.name ?? `#${l.cardmarket_id}`}</span>
                        {l.foil && <FoilStar />}
                      </a>
                    </td>
                    <td className="py-2 text-center">
                      <ConditionBadge condition={l.condition} />
                    </td>
                    <td
                      className="py-2 text-center"
                      style={{ color: "var(--text-muted)", fontSize: "10px" }}
                    >
                      {l.language}
                    </td>
                    <td
                      className="py-2 text-right"
                      style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}
                    >
                      {l.qty_opened}
                    </td>
                    <td
                      className="py-2 text-right"
                      style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}
                    >
                      {l.qty_sold}
                    </td>
                    <td
                      className="py-2 text-right"
                      style={{
                        color: l.qty_remaining > 0 ? "var(--text-primary)" : "var(--text-muted)",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {l.qty_remaining}
                    </td>
                    <td
                      className="py-2 text-right"
                      style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}
                    >
                      {formatEur(l.cost_basis_per_unit)}
                    </td>
                    <td
                      className="py-2 text-right"
                      style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}
                    >
                      {formatEur(l.live_price_eur)}
                    </td>
                    <td
                      className="py-2 text-right"
                      style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}
                    >
                      {formatEur(remValue)}
                    </td>
                    <td
                      className="py-2 text-right"
                      style={{
                        color: l.proceeds_eur > 0 ? "var(--success)" : "var(--text-muted)",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {formatEur(l.proceeds_eur)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </>
      )}
    </Panel>
  );
}
