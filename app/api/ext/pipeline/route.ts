import { withExtAuthRead } from "@/lib/api-ext-helpers";
import { getPipelineHistory } from "@/lib/cardmarket";

export const GET = withExtAuthRead(async (req) => {
  const days = parseInt(req.nextUrl.searchParams.get("days") || "30");
  const safeDays = Math.min(Math.max(days, 1), 365);
  const data = await getPipelineHistory(safeDays);
  return { data };
}, "ext-pipeline");
