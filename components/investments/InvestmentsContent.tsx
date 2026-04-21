"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { TrendingUp, Plus } from "lucide-react";
import CreateInvestmentModal from "./CreateInvestmentModal";
import type { InvestmentListItem, InvestmentStatus } from "@/lib/investments/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function eur(n: number): string {
  return `€${n.toFixed(2)}`;
}

function sourceLabel(src: InvestmentListItem["source"]): string {
  if (src.kind === "box") return `${src.box_count}× ${src.set_code} (${src.booster_type})`;
  return `${src.unit_count}× ${src.product_slug} (product)`;
}

type TabKey = "baseline_captured" | "listing" | "closed" | "archived" | "all";

export default function InvestmentsContent() {
  const [tab, setTab] = useState<TabKey>("listing");
  const [showCreate, setShowCreate] = useState(false);
  const { data, mutate, isLoading } = useSWR<{ investments: InvestmentListItem[] }>(
    tab === "all" ? "/api/investments" : `/api/investments?status=${tab}`,
    fetcher,
    { dedupingInterval: 30_000 }
  );
  const rows = data?.investments ?? [];

  const totalCost = rows.reduce((s, r) => s + r.cost_total_eur, 0);
  const totalNet = rows.reduce(
    (s, r) => s + r.realized_eur + r.sealed_flips_total_eur - r.cost_total_eur,
    0
  );

  const tabLabel: Record<TabKey, string> = {
    baseline_captured: "Pending baseline",
    listing: "Listing",
    closed: "Closed",
    archived: "Archived",
    all: "All",
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <TrendingUp className="h-6 w-6" /> Investments
          </h1>
          <p className="text-sm text-gray-500">Sealed purchases + their attributed singles</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" /> New Investment
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Total deployed" value={eur(totalCost)} />
        <StatCard
          label="Net realized (so far)"
          value={eur(totalNet)}
          tone={totalNet >= 0 ? "positive" : "negative"}
        />
      </div>

      <div className="flex gap-2 border-b">
        {(["baseline_captured", "listing", "closed", "archived", "all"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              "px-3 py-2 text-sm " +
              (tab === t
                ? "border-b-2 border-indigo-600 text-indigo-600"
                : "text-gray-500 hover:text-gray-700")
            }
          >
            {tabLabel[t]}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-gray-500">No investments in this tab.</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-gray-500 border-b">
              <th className="py-2">Status</th>
              <th>Name</th>
              <th>Source</th>
              <th className="text-right">Cost</th>
              <th className="text-right">Listed</th>
              <th className="text-right">Realized</th>
              <th>Break-even</th>
              <th className="text-right">Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const realized = r.realized_eur + r.sealed_flips_total_eur;
              const breakEvenPct =
                r.cost_total_eur > 0 ? Math.min(realized / r.cost_total_eur, 2) : 0;
              return (
                <tr key={r.id} className="border-b hover:bg-gray-50">
                  <td className="py-2">
                    <span className={statusPillClass(r.status)}>{statusLabel(r.status)}</span>
                  </td>
                  <td>
                    <Link className="text-indigo-600 hover:underline" href={`/investments/${r.id}`}>
                      {r.name}
                    </Link>
                  </td>
                  <td className="text-gray-600">{sourceLabel(r.source)}</td>
                  <td className="text-right">{eur(r.cost_total_eur)}</td>
                  <td className="text-right">{eur(r.listed_value_eur)}</td>
                  <td className="text-right">{eur(realized)}</td>
                  <td>
                    <div className="h-2 bg-gray-200 rounded w-32">
                      <div
                        className={
                          "h-2 rounded " +
                          (breakEvenPct >= 1 ? "bg-emerald-500" : "bg-indigo-400")
                        }
                        style={{ width: `${Math.min(breakEvenPct, 1) * 100}%` }}
                      />
                    </div>
                  </td>
                  <td className="text-right text-gray-500">
                    {new Date(r.created_at).toLocaleDateString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {showCreate && (
        <CreateInvestmentModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            mutate();
          }}
        />
      )}
    </div>
  );
}

function statusLabel(s: InvestmentStatus): string {
  if (s === "baseline_captured") return "pending baseline";
  return s;
}

function statusPillClass(s: InvestmentStatus): string {
  const base = "inline-block rounded-full px-2 py-0.5 text-xs font-medium";
  if (s === "listing") return `${base} bg-indigo-100 text-indigo-700`;
  if (s === "baseline_captured") return `${base} bg-amber-100 text-amber-700`;
  if (s === "closed") return `${base} bg-emerald-100 text-emerald-700`;
  return `${base} bg-gray-100 text-gray-600`;
}

function StatCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative" | "neutral";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-600"
      : tone === "negative"
        ? "text-rose-600"
        : "text-gray-900";
  return (
    <div className="rounded-lg border p-4 bg-white">
      <div className="text-xs uppercase text-gray-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}
