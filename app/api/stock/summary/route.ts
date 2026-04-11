import { withAuthRead } from "@/lib/api-helpers";
import { getStockTotals } from "@/lib/stock";
import { getStockCoverage } from "@/lib/cardmarket";

export const GET = withAuthRead(async () => {
  const [totals, coverage] = await Promise.all([
    getStockTotals(),
    getStockCoverage(),
  ]);
  return { ...totals, coverage };
}, "stock-summary");
