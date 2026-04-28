import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-helpers";
import { getDb } from "@/lib/mongodb";
import { logActivity } from "@/lib/activity";
import { parseCardmarketIdInput, setCmOverride } from "@/lib/appraiser/cm-overrides";

export const POST = withAuth(async (req, session) => {
  const body = (await req.json()) as {
    set?: unknown;
    collectorNumber?: unknown;
    /** Either a Cardmarket URL with `?idProduct=N` or a bare numeric id. */
    cardmarketIdInput?: unknown;
  };

  const set = typeof body.set === "string" ? body.set.trim().toLowerCase() : "";
  const collectorNumber = typeof body.collectorNumber === "string" ? body.collectorNumber.trim() : "";
  const raw = typeof body.cardmarketIdInput === "string" ? body.cardmarketIdInput : "";

  if (!set || !collectorNumber) {
    return NextResponse.json(
      { error: "set and collectorNumber are required" },
      { status: 400 },
    );
  }

  const cardmarket_id = parseCardmarketIdInput(raw);
  if (cardmarket_id == null) {
    return NextResponse.json(
      { error: "Could not parse a Cardmarket idProduct from input. Paste a CM URL (with ?idProduct=N) or just the number." },
      { status: 400 },
    );
  }

  const db = await getDb();
  const result = await setCmOverride(db, {
    set,
    collectorNumber,
    cardmarket_id,
    userId: session.user?.id ?? "system",
  });

  logActivity(
    "update",
    "appraiser_cm_override",
    `${set}:${collectorNumber}`,
    `Set Cardmarket id ${cardmarket_id} for ${set} #${collectorNumber} (propagated to ${result.matchedAppraiserCards} card${result.matchedAppraiserCards === 1 ? "" : "s"})`,
    session.user?.id ?? "system",
    session.user?.name ?? "unknown",
  );

  return { ok: true, cardmarket_id, matchedAppraiserCards: result.matchedAppraiserCards };
}, "appraiser-cm-override-set");
