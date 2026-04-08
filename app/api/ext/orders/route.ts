import { withExtAuthRead } from "@/lib/api-ext-helpers";
import { getOrders, getOrderDetail } from "@/lib/cardmarket";

export const GET = withExtAuthRead(async (req) => {
  const params = req.nextUrl.searchParams;
  const orderId = params.get("orderId");

  // Single order detail
  if (orderId) {
    const detail = await getOrderDetail(orderId);
    return { data: detail };
  }

  // Paginated list
  const orders = await getOrders({
    status: params.get("status") || undefined,
    direction: params.get("direction") || undefined,
    page: parseInt(params.get("page") || "1"),
    limit: parseInt(params.get("limit") || "20"),
  });

  return { data: orders };
}, "ext-orders");
