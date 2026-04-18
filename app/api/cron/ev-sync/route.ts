import { NextRequest, NextResponse } from "next/server";
import { refreshAllScryfall } from "@/lib/ev";
import { logActivity } from "@/lib/activity";
import { logApiError } from "@/lib/error-log";

// Vercel Cron authenticates by sending Authorization: Bearer ${CRON_SECRET}.
// The env var is set in Vercel project settings. Rejecting any other caller
// keeps this endpoint cron-only.
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await refreshAllScryfall();
    logActivity(
      "sync",
      "ev_cards",
      "all",
      `cron sets=${result.setsUpserted} cards=${result.cardsProcessed} snapshots=${result.priceSnapshotsWritten} durationMs=${result.durationMs}`,
      "system",
      "cron"
    );
    return NextResponse.json({ data: result });
  } catch (err) {
    console.error("cron/ev-sync error:", err);
    logApiError("cron/ev-sync", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
