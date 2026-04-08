import { withExtAuthRead } from "@/lib/api-ext-helpers";
import { withAuth } from "@/lib/api-helpers";
import { getOrders, getOrderDetail, markOrdersPrinted } from "@/lib/cardmarket";

export const GET = withExtAuthRead(async (req) => {
  const params = req.nextUrl.searchParams;
  const orderId = params.get("orderId");

  if (orderId) {
    const detail = await getOrderDetail(orderId);
    return { data: detail };
  }

  const orders = await getOrders({
    status: params.get("status") || undefined,
    direction: params.get("direction") || undefined,
    page: parseInt(params.get("page") || "1"),
    limit: parseInt(params.get("limit") || "20"),
  });

  return { data: orders };
}, "ext-orders");

export const PATCH = withAuth(async (req) => {
  const { orderIds, printed } = await req.json();
  if (!orderIds?.length) return { error: "orderIds required" };
  await markOrdersPrinted(orderIds, printed ?? true);
  return { data: { success: true } };
}, "ext-orders-patch");
