import { NextRequest, NextResponse } from "next/server";
import { withAuth, withAuthRead } from "@/lib/api-helpers";
import { getDb } from "@/lib/mongodb";
import { logActivity } from "@/lib/activity";
import {
  COL_APPRAISER_COLLECTIONS,
  COL_APPRAISER_CARDS,
  type AppraiserCardDoc,
  type AppraiserCollection,
  type AppraiserCollectionDoc,
} from "@/lib/appraiser/types";
import { hydrateAppraiserCards, computeCollectionTotals } from "@/lib/appraiser/ev-join";

export const GET = withAuthRead(async (_req: NextRequest) => {
  const db = await getDb();
  const collections = await db
    .collection<AppraiserCollectionDoc>(COL_APPRAISER_COLLECTIONS)
    .find({})
    .sort({ updatedAt: -1 })
    .toArray();

  if (collections.length === 0) return { collections: [] };

  const ids = collections.map((c) => c._id);
  // Fetch every card across every collection once, hydrate prices from
  // dashboard_ev_cards in a single batch, then bucket + total in memory.
  // Works for the expected scale (small number of collections, a few hundred
  // cards each). If this ever grows, swap for a $lookup aggregation.
  const allCardDocs = await db
    .collection<AppraiserCardDoc>(COL_APPRAISER_CARDS)
    .find({ collectionId: { $in: ids } })
    .toArray();
  const hydrated = await hydrateAppraiserCards(db, allCardDocs);

  const statsById = new Map<string, { cardCount: number; totalTrend: number; totalFrom: number }>();
  const cardsByCollection = new Map<string, typeof hydrated>();
  for (const c of hydrated) {
    const key = c.collectionId;
    const bucket = cardsByCollection.get(key);
    if (bucket) bucket.push(c);
    else cardsByCollection.set(key, [c]);
  }
  for (const [key, bucket] of cardsByCollection) {
    statsById.set(key, computeCollectionTotals(bucket));
  }

  const payload: AppraiserCollection[] = collections.map((c) => {
    const stats = statsById.get(String(c._id)) ?? { cardCount: 0, totalTrend: 0, totalFrom: 0 };
    return {
      _id: String(c._id),
      name: c.name,
      notes: c.notes ?? "",
      cardCount: stats.cardCount,
      totalTrend: stats.totalTrend,
      totalFrom: stats.totalFrom,
      bulkExcludeEnabled: c.bulkExcludeEnabled ?? false,
      bulkThreshold: c.bulkThreshold ?? 1,
      bulkRate: c.bulkRate ?? 0,
      undercutEnabled: c.undercutEnabled ?? false,
      undercutPercent: c.undercutPercent ?? 20,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    };
  });

  return { collections: payload };
}, "appraiser-collections-list");

export const POST = withAuth(async (req: NextRequest, session) => {
  const body = (await req.json()) as { name?: unknown; notes?: unknown };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const notes = typeof body.notes === "string" ? body.notes : "";
  const now = new Date();

  const db = await getDb();
  const result = await db
    .collection<Omit<AppraiserCollectionDoc, "_id">>(COL_APPRAISER_COLLECTIONS)
    .insertOne({
      name,
      notes,
      createdAt: now,
      updatedAt: now,
    });

  logActivity(
    "create",
    "appraiser_collection",
    String(result.insertedId),
    `Created appraiser collection "${name}"`,
    session.user?.id ?? "system",
    session.user?.name ?? "unknown",
  );

  return {
    collection: {
      _id: String(result.insertedId),
      name,
      notes,
      cardCount: 0,
      totalTrend: 0,
      totalFrom: 0,
      bulkExcludeEnabled: false,
      bulkThreshold: 1,
      bulkRate: 0,
      undercutEnabled: false,
      undercutPercent: 20,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    } satisfies AppraiserCollection,
  };
}, "appraiser-collections-create");
