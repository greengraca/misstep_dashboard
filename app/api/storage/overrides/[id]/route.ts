import { withAuthParams } from "@/lib/api-helpers";
import { deleteOverride } from "@/lib/storage-db";
import { logActivity } from "@/lib/activity";

export const DELETE = withAuthParams<{ id: string }>(async (_req, session, params) => {
  const ok = await deleteOverride(params.id);
  if (!ok) return Response.json({ error: "Not found" }, { status: 404 });
  logActivity(
    "delete",
    "storage_override",
    params.id,
    "deleted",
    "system",
    session.user?.name ?? "unknown"
  );
  return { data: { ok: true } };
}, "storage-override-delete");
