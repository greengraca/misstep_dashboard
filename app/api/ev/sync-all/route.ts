import { withAuth } from "@/lib/api-helpers";
import { refreshAllScryfall } from "@/lib/ev";
import { logActivity } from "@/lib/activity";

export const POST = withAuth(async (_req, session) => {
  const result = await refreshAllScryfall();

  logActivity(
    "sync",
    "ev_cards",
    "all",
    `sets=${result.setsUpserted} cards=${result.cardsProcessed} durationMs=${result.durationMs}`,
    "system",
    session.user?.name ?? "unknown"
  );

  return { data: result };
}, "ev-sync-all");
