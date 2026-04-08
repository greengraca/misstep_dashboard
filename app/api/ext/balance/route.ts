import { withExtAuthRead } from "@/lib/api-ext-helpers";
import { getBalanceHistory, getLatestBalance } from "@/lib/cardmarket";

export const GET = withExtAuthRead(async (req) => {
  const days = parseInt(req.nextUrl.searchParams.get("days") || "30");
  const [history, latest] = await Promise.all([
    getBalanceHistory(days),
    getLatestBalance(),
  ]);

  return {
    data: {
      current: latest?.balance ?? null,
      history,
    },
  };
}, "ext-balance");
