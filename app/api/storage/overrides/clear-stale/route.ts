import { withAuth } from "@/lib/api-helpers";
import { clearStaleOverrides } from "@/lib/storage-db";
import { logActivity } from "@/lib/activity";

export const POST = withAuth(async (_req, session) => {
  const deleted = await clearStaleOverrides();
  logActivity(
    "delete",
    "storage_override",
    "stale-bulk",
    `cleared=${deleted}`,
    "system",
    session.user?.name ?? "unknown"
  );
  return { data: { deleted } };
}, "storage-overrides-clear-stale");
