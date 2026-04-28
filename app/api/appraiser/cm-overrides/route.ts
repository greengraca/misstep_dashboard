import { NextResponse } from "next/server";
import { withAuth, withAuthRead } from "@/lib/api-helpers";
import { getDb } from "@/lib/mongodb";
import { logActivity } from "@/lib/activity";
import {
  COL_APPRAISER_CARDS,
  COL_APPRAISER_CM_OVERRIDES,
  parseCardmarketIdInput,
  setCmOverride,
  type CardmarketIdOverrideDoc,
} from "@/lib/appraiser/cm-overrides";

interface OverrideListEntry {
  set: string;
  collectorNumber: string;
  cardmarket_id: number;
  updatedAt: string;
  /** A representative appraiser card matching this override, for display. */
  sampleName: string | null;
  sampleSetName: string | null;
  sampleImageUrl: string | null;
  sampleFoil: boolean | null;
  /** How many appraiser cards across all collections currently use this override. */
  usageCount: number;
}

export const GET = withAuthRead(async () => {
  const db = await getDb();
  const overrides = await db
    .collection<CardmarketIdOverrideDoc>(COL_APPRAISER_CM_OVERRIDES)
    .find({}, { projection: { _id: 0 } })
    .sort({ updatedAt: -1 })
    .toArray();

  // Per-override: pull one sample card for display + total usage count.
  // Done in parallel; for hundreds of overrides we'd switch to an aggregation
  // pipeline, but the user's collection of overrides is expected to stay small.
  const entries: OverrideListEntry[] = await Promise.all(
    overrides.map(async (o) => {
      const filter = { set: o.set, collectorNumber: o.collectorNumber };
      const [sample, usageCount] = await Promise.all([
        db.collection(COL_APPRAISER_CARDS).findOne(filter, {
          projection: { _id: 0, name: 1, setName: 1, imageUrl: 1, foil: 1 },
        }),
        db.collection(COL_APPRAISER_CARDS).countDocuments(filter),
      ]);
      return {
        set: o.set,
        collectorNumber: o.collectorNumber,
        cardmarket_id: o.cardmarket_id,
        updatedAt: o.updatedAt instanceof Date ? o.updatedAt.toISOString() : String(o.updatedAt),
        sampleName: (sample as { name?: string } | null)?.name ?? null,
        sampleSetName: (sample as { setName?: string } | null)?.setName ?? null,
        sampleImageUrl: (sample as { imageUrl?: string } | null)?.imageUrl ?? null,
        sampleFoil: (sample as { foil?: boolean } | null)?.foil ?? null,
        usageCount,
      };
    }),
  );

  return { overrides: entries };
}, "appraiser-cm-overrides-list");

export const DELETE = withAuth(async (req, session) => {
  const body = (await req.json()) as { set?: unknown; collectorNumber?: unknown };
  const set = typeof body.set === "string" ? body.set.trim().toLowerCase() : "";
  const collectorNumber = typeof body.collectorNumber === "string" ? body.collectorNumber.trim() : "";
  if (!set || !collectorNumber) {
    return NextResponse.json({ error: "set and collectorNumber are required" }, { status: 400 });
  }

  const db = await getDb();
  const result = await db
    .collection<CardmarketIdOverrideDoc>(COL_APPRAISER_CM_OVERRIDES)
    .deleteOne({ set, collectorNumber });

  if (result.deletedCount === 0) {
    return NextResponse.json({ error: "Override not found" }, { status: 404 });
  }

  // Note: existing appraiser docs that took on this override's cardmarket_id
  // KEEP it. Removing the override only stops it from auto-applying to future
  // imports of the same printing. To revert a specific card, use the per-card
  // PUT endpoint. This avoids accidentally clobbering deliberate manual
  // edits when an override is cleaned up.
  logActivity(
    "delete",
    "appraiser_cm_override",
    `${set}:${collectorNumber}`,
    `Removed Cardmarket id override for ${set} #${collectorNumber}`,
    session.user?.id ?? "system",
    session.user?.name ?? "unknown",
  );

  return { ok: true };
}, "appraiser-cm-override-delete");

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
