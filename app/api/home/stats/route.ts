import { withAuthRead } from "@/lib/api-helpers";
import { getDb } from "@/lib/mongodb";

export const GET = withAuthRead(async () => {
  const db = await getDb();

  const activityCount = await db
    .collection("dashboard_activity_log")
    .countDocuments({
      timestamp: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    });

  return {
    data: {
      totalRecords: 0,
      activeUsers: 0,
      recentActivity: activityCount,
      growth: 0,
      growthTrend: 0,
    },
  };
}, "home-stats");
