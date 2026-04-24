import { NextResponse } from "next/server";
import { withExtAuthRead } from "@/lib/api-ext-helpers";
import { getDb } from "@/lib/mongodb";
import { COLLECTION_PREFIX } from "@/lib/constants";

const COL_STOCK = `${COLLECTION_PREFIX}cm_stock`;

// If more than this many new dedupKeys arrived since the caller's cursor,
// signal truncation and let the client re-hydrate the full bloom.  Prevents
// unbounded payloads if a seeder comes back online after a long offline gap.
const DELTA_MAX_KEYS = 5000;

export const GET = withExtAuthRead(async (req) => {
  const sinceParam = req.nextUrl.searchParams.get("since");
  if (!sinceParam) {
    return NextResponse.json(
      { error: "since query param (ISO timestamp) is required" },
      { status: 400 }
    );
  }

  const sinceDate = new Date(sinceParam);
  if (Number.isNaN(sinceDate.getTime())) {
    return NextResponse.json(
      { error: "since must be a valid ISO timestamp" },
      { status: 400 }
    );
  }
  // firstSeenAt is stored as an ISO string (see upsertStockListings —
  // `const now = new Date().toISOString()`).  Comparing a string field
  // against a JS Date via \$gt never matches under Mongo's BSON type
  // ordering (Date > String), which made this endpoint silently always
  // return zero new keys. Compare string-to-string — ISO-8601 UTC
  // strings are lexicographically sortable.
  const since = sinceDate.toISOString();

  const db = await getDb();
  const col = db.collection(COL_STOCK);

  // Fetch one extra doc to detect truncation without a second count query.
  const docs = await col
    .find(
      { firstSeenAt: { $gt: since } },
      { projection: { dedupKey: 1, _id: 0 } }
    )
    .limit(DELTA_MAX_KEYS + 1)
    .toArray();

  const totalServerStock = await col.countDocuments({});

  const truncated = docs.length > DELTA_MAX_KEYS;
  const keys = docs
    .slice(0, DELTA_MAX_KEYS)
    .map((d) => d.dedupKey as string | undefined)
    .filter((k): k is string => typeof k === "string" && k.length > 0);

  return {
    data: {
      asOf: new Date().toISOString(),
      keys,
      totalServerStock,
      ...(truncated ? { truncated: true } : {}),
    },
  };
}, "ext-stock-keys-delta");
