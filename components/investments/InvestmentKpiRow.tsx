import type { InvestmentDetail } from "@/lib/investments/types";

function eur(n: number | null): string {
  if (n == null) return "—";
  return `€${n.toFixed(2)}`;
}

export default function InvestmentKpiRow({ kpis }: { kpis: InvestmentDetail["kpis"] }) {
  const breakEvenPctClamped = Math.min(kpis.break_even_pct, 2);
  return (
    <div className="grid grid-cols-6 gap-3">
      <Kpi label="Cost" value={eur(kpis.cost_eur)} />
      <Kpi label="Expected EV" value={eur(kpis.expected_ev_eur)} />
      <Kpi label="Listed" value={eur(kpis.listed_value_eur)} />
      <Kpi label="Realized" value={eur(kpis.realized_net_eur)} tone={kpis.realized_net_eur >= 0 ? "pos" : "neg"} />
      <Kpi label="P/L blended" value={eur(kpis.net_pl_blended_eur)} tone={kpis.net_pl_blended_eur >= 0 ? "pos" : "neg"} />
      <div className="rounded-lg border p-3 bg-white">
        <div className="text-[10px] uppercase text-gray-500">Break-even</div>
        <div className="mt-1 text-sm font-semibold">
          {(kpis.break_even_pct * 100).toFixed(0)}%
        </div>
        <div className="mt-1 h-2 bg-gray-200 rounded">
          <div
            className={
              "h-2 rounded " +
              (kpis.break_even_pct >= 1 ? "bg-emerald-500" : "bg-indigo-400")
            }
            style={{ width: `${(breakEvenPctClamped / 2) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "pos" | "neg" | "neutral" }) {
  const toneClass =
    tone === "pos" ? "text-emerald-600" : tone === "neg" ? "text-rose-600" : "text-gray-900";
  return (
    <div className="rounded-lg border p-3 bg-white">
      <div className="text-[10px] uppercase text-gray-500">{label}</div>
      <div className={`mt-1 text-sm font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}
