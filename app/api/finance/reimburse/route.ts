import { withAuth } from "@/lib/api-helpers";
import { reimburse, unreimburse } from "@/lib/finance";

export const POST = withAuth(async (request, session) => {
  const { id, reimbursed } = await request.json();
  if (!id || typeof reimbursed !== "boolean") {
    return Response.json({ error: "id and reimbursed (boolean) required" }, { status: 400 });
  }
  const userName = session.user?.name || "unknown";
  if (reimbursed) {
    await reimburse(id, userName);
  } else {
    await unreimburse(id, userName);
  }
  return { data: { success: true } };
}, "finance-reimburse");
