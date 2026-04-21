import type { InvestmentDetail } from "@/lib/investments/types";

export default function BaselineBanner({ detail }: { detail: InvestmentDetail }) {
  if (detail.status !== "baseline_captured" || !detail.baseline_progress) return null;
  const { captured_cardmarket_ids: cap, target_cardmarket_ids: tot } = detail.baseline_progress;
  const pct = tot > 0 ? (cap / tot) * 100 : 0;
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="font-medium text-amber-900">Baseline capture in progress</div>
        <div className="text-amber-800">
          {cap} / {tot} cards ({pct.toFixed(0)}%)
        </div>
      </div>
      <div className="h-2 bg-amber-200 rounded">
        <div className="h-2 rounded bg-amber-600" style={{ width: `${pct}%` }} />
      </div>
      <div className="text-xs text-amber-800">
        Open the Misstep extension and select this investment to capture stock
        for each card in the set. Lot attribution begins once baseline is marked complete.
      </div>
    </div>
  );
}
