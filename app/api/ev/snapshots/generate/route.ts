import { withAuth } from "@/lib/api-helpers";
import { generateAllSnapshots } from "@/lib/ev";
import { logActivity } from "@/lib/activity";

export const POST = withAuth(async (_req, session) => {
  const result = await generateAllSnapshots();
  logActivity("sync", "ev_snapshots", "all", `Generated ${result.generated} snapshots`, "system", session.user?.name || "unknown");
  return { data: result };
}, "ev-snapshots-generate");
