import { withExtAuthRead } from "@/lib/api-ext-helpers";
import { getSyncStatus, getLatestBalance, getStockCoverage, getOrderCounts, getOrderValuesByStatus } from "@/lib/cardmarket";

export const GET = withExtAuthRead(async () => {
  const [syncStatus, latestBalance, coverage, orderCounts, orderValues] = await Promise.all([
    getSyncStatus(),
    getLatestBalance(),
    getStockCoverage(),
    getOrderCounts(),
    getOrderValuesByStatus(),
  ]);

  return {
    data: {
      lastSync: syncStatus.lastSync,
      recentLogs: syncStatus.recentLogs,
      currentBalance: latestBalance?.balance ?? null,
      stockCoverage: coverage,
      orderCounts,
      orderValues,
    },
  };
}, "ext-status");
