import { withExtAuthRead } from "@/lib/api-ext-helpers";
import { getSyncStatus, getLatestBalance, getStockCoverage, getOrderCounts } from "@/lib/cardmarket";

export const GET = withExtAuthRead(async () => {
  const [syncStatus, latestBalance, coverage, orderCounts] = await Promise.all([
    getSyncStatus(),
    getLatestBalance(),
    getStockCoverage(),
    getOrderCounts(),
  ]);

  return {
    data: {
      lastSync: syncStatus.lastSync,
      recentLogs: syncStatus.recentLogs,
      currentBalance: latestBalance?.balance ?? null,
      stockCoverage: coverage,
      orderCounts,
    },
  };
}, "ext-status");
