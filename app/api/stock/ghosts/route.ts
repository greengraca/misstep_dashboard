import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { withAuth, withAuthRead } from "@/lib/api-helpers";
import { getDb } from "@/lib/mongodb";
import { COLLECTION_PREFIX } from "@/lib/constants";
import { logActivity } from "@/lib/activity";

const COL_STOCK = `${COLLECTION_PREFIX}cm_stock`;
const COL_SNAPSHOTS = `${COLLECTION_PREFIX}cm_stock_snapshots`;

/**
 * Coverage-gap ghosts: stock rows we track that Cardmarket no longer
 * reports. Computed as `tracked - reported` using the latest stock_overview
 * snapshot. The candidates are the oldest-lastSeenAt rows up to `limit`,
 * capped by the actual gap size when it's smaller.
 */
export const GET = withAuthRead(async (req) => {
  const limit = Math.min(
    500,
    Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 100))
  );
  const db = await getDb();

  const [tracked, latestSnapshot] = await Promise.all([
    db.collection(COL_STOCK).countDocuments(),
    db.collection(COL_SNAPSHOTS).findOne({}, { sort: { extractedAt: -1 } }),
  ]);

  const reported = (latestSnapshot?.totalListings as number) || null;
  const gap = reported != null ? Math.max(0, tracked - reported) : 0;

  // Candidates: oldest-lastSeenAt first. Cap to the smaller of gap and limit,
  // but always show at least a few when gap is small so the user sees context.
  const candidateLimit = gap > 0 ? Math.min(limit, Math.max(gap, 10)) : 0;
  const candidates = candidateLimit
    ? await db
        .collection(COL_STOCK)
        .find({})
        .sort({ lastSeenAt: 1 })
        .limit(candidateLimit)
        .project({ dedupKey: 1, name: 1, set: 1, qty: 1, price: 1, condition: 1, foil: 1, language: 1, lastSeenAt: 1, source: 1, articleId: 1 })
        .toArray()
    : [];

  return {
    data: {
      tracked,
      reported,
      gap,
      candidates: candidates.map((c) => ({
        _id: c._id.toString(),
        dedupKey: c.dedupKey,
        name: c.name,
        set: c.set,
        qty: c.qty,
        price: c.price,
        condition: c.condition,
        foil: c.foil,
        language: c.language,
        lastSeenAt: c.lastSeenAt,
        source: c.source,
        articleId: c.articleId,
      })),
    },
  };
}, "stock-ghosts-get");

/**
 * Bulk-delete stock rows flagged as ghosts. Body: `{ ids: string[] }`.
 * No deep validation — user is auth'd and explicitly asked to remove.
 */
export const DELETE = withAuth(async (request, session) => {
  const body = await request.json();
  const ids = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === "string") : [];
  if (!ids.length) {
    return NextResponse.json({ error: "ids required" }, { status: 400 });
  }
  const objectIds: ObjectId[] = [];
  for (const id of ids) {
    try {
      objectIds.push(new ObjectId(id));
    } catch {
      // skip malformed ids
    }
  }
  if (!objectIds.length) {
    return NextResponse.json({ error: "no valid ids" }, { status: 400 });
  }
  const db = await getDb();
  const result = await db
    .collection(COL_STOCK)
    .deleteMany({ _id: { $in: objectIds } });
  const actor = session.user?.name || "unknown";
  logActivity(
    "delete",
    "stock_ghost",
    String(result.deletedCount),
    `Removed ${result.deletedCount} ghost stock rows`,
    "system",
    actor
  );
  return { data: { removed: result.deletedCount } };
}, "stock-ghosts-delete");
