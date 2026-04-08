import { withAuth, withAuthRead } from "@/lib/api-helpers";
import { getTransactions, create, update, remove } from "@/lib/finance";

export const GET = withAuthRead(async (req) => {
  const month = req.nextUrl.searchParams.get("month");
  if (!month) return Response.json({ error: "month parameter required" }, { status: 400 });
  const data = await getTransactions(month);
  return { data };
}, "finance-list");

export const POST = withAuth(async (request, session) => {
  const body = await request.json();
  const result = await create(body, session.user?.name || "unknown");
  return { data: result };
}, "finance-create");

export const PATCH = withAuth(async (request, session) => {
  const body = await request.json();
  await update(body._id, body, session.user?.name || "unknown");
  return { data: { success: true } };
}, "finance-update");

export const DELETE = withAuth(async (request, session) => {
  const { id } = await request.json();
  await remove(id, session.user?.name || "unknown");
  return { data: { success: true } };
}, "finance-delete");
