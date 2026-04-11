import { withAuth } from "@/lib/api-helpers";
import { refreshAllScryfall } from "@/lib/ev";
import { logActivity } from "@/lib/activity";
import type { DashboardSession } from "@/lib/types";

export const POST = withAuth(async (_req, session) => {
  const s = session as DashboardSession;
  const result = await refreshAllScryfall();

  logActivity(
    "sync",
    "ev_card",
    "all",
    `sets=${result.setsUpserted} cards=${result.cardsUpserted} durationMs=${result.durationMs}`,
    s.user.id,
    s.user.name ?? "unknown"
  );

  return result;
}, "ev-sync-all");
