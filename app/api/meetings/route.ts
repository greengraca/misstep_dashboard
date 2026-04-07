import { withAuth, withAuthRead } from "@/lib/api-helpers";
import { getAll, create, update, remove } from "@/lib/meetings";

export const GET = withAuthRead(async () => {
  const data = await getAll();
  return { data };
}, "meetings-list");

export const POST = withAuth(async (request, session) => {
  const body = await request.json();
  const result = await create(body, session.user?.name || "unknown");
  return { data: result };
}, "meetings-create");

export const PATCH = withAuth(async (request, session) => {
  const body = await request.json();
  const result = await update(body._id, body, session.user?.name || "unknown");
  return { data: result };
}, "meetings-update");

export const DELETE = withAuth(async (request) => {
  const { id } = await request.json();
  await remove(id);
  return { data: { success: true } };
}, "meetings-delete");
