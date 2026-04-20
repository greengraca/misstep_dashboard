import { NextRequest, NextResponse } from "next/server";
import { withAuth, withAuthRead } from "@/lib/api-helpers";
import { getDb } from "@/lib/mongodb";
import { logActivity } from "@/lib/activity";
import {
  COL_APPRAISER_COLLECTIONS,
  COL_APPRAISER_CARDS,
  type AppraiserCollection,
  type AppraiserCollectionDoc,
} from "@/lib/appraiser/types";

export const GET = withAuthRead(async (_req: NextRequest) => {
  const db = await getDb();
  const collections = await db
    .collection<AppraiserCollectionDoc>(COL_APPRAISER_COLLECTIONS)
    .find({})
    .sort({ updatedAt: -1 })
    .toArray();

  if (collections.length === 0) return { collections: [] };

  const ids = collections.map((c) => c._id);
  const agg = await db
    .collection(COL_APPRAISER_CARDS)
    .aggregate([
      { $match: { collectionId: { $in: ids } } },
      {
        $group: {
          _id: "$collectionId",
          cardCount: { $sum: "$qty" },
          totalTrend: { $sum: { $multiply: [{ $ifNull: ["$trendPrice", 0] }, "$qty"] } },
          totalFrom: { $sum: { $multiply: [{ $ifNull: ["$fromPrice", 0] }, "$qty"] } },
        },
      },
    ])
    .toArray();

  const statsById = new Map<string, { cardCount: number; totalTrend: number; totalFrom: number }>();
  for (const a of agg) {
    statsById.set(String(a._id), {
      cardCount: (a.cardCount as number) ?? 0,
      totalTrend: (a.totalTrend as number) ?? 0,
      totalFrom: (a.totalFrom as number) ?? 0,
    });
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
    { name },
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
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    } satisfies AppraiserCollection,
  };
}, "appraiser-collections-create");
