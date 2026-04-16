import { withAuthRead } from "@/lib/api-helpers";
import { getAllTimeTreasury } from "@/lib/finance";
import {
  getLatestBalance,
  getOrderValuesByStatus,
  getOrderCounts,
  getTrusteeSentValue,
} from "@/lib/cardmarket";

export const GET = withAuthRead(async () => {
  const [treasury, balance, orderValues, orderCounts, trusteeSent] = await Promise.all([
    getAllTimeTreasury(),
    getLatestBalance(),
    getOrderValuesByStatus(),
    getOrderCounts(),
    getTrusteeSentValue(),
  ]);

  const activeSalesValue =
    (orderValues.unpaid ?? 0) + (orderValues.paid ?? 0) + trusteeSent;
  const ordersToShip = orderCounts.paid?.sale ?? 0;

  return {
    data: {
      cmBalance: balance?.balance ?? 0,
      activeSalesValue,
      treasury,
      ordersToShip,
    },
  };
}, "home-stats");
