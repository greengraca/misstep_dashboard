import { withExtAuthRead } from "@/lib/api-ext-helpers";
import { getCmRevenueForMonth } from "@/lib/cardmarket";

export const GET = withExtAuthRead(async (req) => {
  const month = req.nextUrl.searchParams.get("month");
  if (!month) return { error: "month parameter required (YYYY-MM)" };
  const data = await getCmRevenueForMonth(month);
  return { data };
}, "ext-revenue");
