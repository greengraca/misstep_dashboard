import { withAuthParams } from "@/lib/api-helpers";
import { syncCards } from "@/lib/ev";
import { logActivity } from "@/lib/activity";

export const POST = withAuthParams<{ code: string }>(async (_req, session, params) => {
  const result = await syncCards(params.code);
  logActivity("sync", "ev_cards", params.code, `Synced ${result.total} cards`, "system", session.user?.name || "unknown");
  return { data: result };
}, "ev-set-sync");
