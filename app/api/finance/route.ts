import { withAuth, withAuthRead } from "@/lib/api-helpers";
import { getAll, create, update, remove } from "@/lib/finance";

export const GET = withAuthRead(async () => {
  const { data, monthly } = await getAll();
  return { data, monthly };
}, "finance-list");

export const POST = withAuth(async (request, session) => {
  const body = await request.json();
  const result = await create(body, session.user?.name || "unknown");
  return { data: result };
}, "finance-create");

export const PATCH = withAuth(async (request, session) => {
  const body = await request.json();
  const result = await update(body._id, body, session.user?.name || "unknown");
  return { data: result };
}, "finance-update");

export const DELETE = withAuth(async (request) => {
  const { id } = await request.json();
  await remove(id);
  return { data: { success: true } };
}, "finance-delete");
