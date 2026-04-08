import { withExtAuthRead } from "@/lib/api-ext-helpers";
import { getSyncStatus, getLatestBalance, getStockCoverage } from "@/lib/cardmarket";

export const GET = withExtAuthRead(async () => {
  const [syncStatus, latestBalance, coverage] = await Promise.all([
    getSyncStatus(),
    getLatestBalance(),
    getStockCoverage(),
  ]);

  return {
    data: {
      lastSync: syncStatus.lastSync,
      recentLogs: syncStatus.recentLogs,
      currentBalance: latestBalance?.balance ?? null,
      stockCoverage: coverage,
    },
  };
}, "ext-status");
