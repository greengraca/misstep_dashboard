import { withAuthRead } from "@/lib/api-helpers";
import { getStockTotals } from "@/lib/stock";

export const GET = withAuthRead(async () => {
  return await getStockTotals();
}, "stock-summary");
