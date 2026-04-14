import { withExtAuthRead } from "@/lib/api-ext-helpers";
import { getSyncStatus, getLatestBalance, getStockCoverage, getOrderCounts, getOrderValuesByStatus, getTrusteeSentValue } from "@/lib/cardmarket";

export const GET = withExtAuthRead(async () => {
  const [syncStatus, latestBalance, coverage, orderCounts, orderValues, trusteeSentValue] = await Promise.all([
    getSyncStatus(),
    getLatestBalance(),
    getStockCoverage(),
    getOrderCounts(),
    getOrderValuesByStatus(),
    getTrusteeSentValue(),
  ]);

  return {
    data: {
      lastSync: syncStatus.lastSync,
      recentLogs: syncStatus.recentLogs,
      currentBalance: latestBalance?.balance ?? null,
      stockCoverage: coverage,
      orderCounts,
      orderValues,
      trusteeSentValue,
    },
  };
}, "ext-status");
