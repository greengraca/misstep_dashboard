import { NextResponse } from "next/server";
import { withExtAuth, withExtAuthRead } from "@/lib/api-ext-helpers";
import { getDb } from "@/lib/mongodb";
import { COLLECTION_PREFIX } from "@/lib/constants";

const COL_LEASES = `${COLLECTION_PREFIX}ext_seed_leases`;

// 15 minute lease TTL, refreshed by the HUD every ~2 minutes while the
// user is actively seeding a filter combo.  MongoDB's background TTL
// reaper will also drop expired docs even if a client never calls DELETE.
const LEASE_TTL_MS = 15 * 60 * 1000;

async function ensureTtlIndex() {
  const db = await getDb();
  const col = db.collection(COL_LEASES);
  await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await col.createIndex({ memberName: 1 }, { unique: true });
}

// Returns every lease whose expiresAt is still in the future; callers
// filter / style their own lease client-side by comparing memberName.
export const GET = withExtAuthRead(async () => {
  await ensureTtlIndex();
  const db = await getDb();
  const col = db.collection(COL_LEASES);

  const now = new Date();
  const active = await col
    .find({ expiresAt: { $gt: now } })
    .project({ _id: 0 })
    .toArray();

  return { data: active };
}, "ext-seed-lease-get");

// Claim or heartbeat a lease.  A member only ever owns one lease at a
// time; any existing doc for that member is overwritten with the new
// filter + refreshed expiresAt.
export const POST = withExtAuth(async (req, memberName) => {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const filterHash = typeof body.filterHash === "string" ? body.filterHash : "";
  const filterLabel = typeof body.filterLabel === "string" ? body.filterLabel : "";
  if (!filterHash) {
    return NextResponse.json({ error: "filterHash required" }, { status: 400 });
  }

  await ensureTtlIndex();
  const db = await getDb();
  const col = db.collection(COL_LEASES);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + LEASE_TTL_MS);

  await col.updateOne(
    { memberName },
    {
      $set: {
        memberName,
        filterHash,
        filterLabel,
        claimedAt: now,
        expiresAt,
      },
    },
    { upsert: true }
  );

  return { data: { memberName, filterHash, filterLabel, claimedAt: now, expiresAt } };
}, "ext-seed-lease-post");

// Release the caller's lease (on Seed Mode toggle-off, navigation away,
// or session close).  Best-effort: missing doc is a no-op.
export const DELETE = withExtAuth(async (_req, memberName) => {
  await ensureTtlIndex();
  const db = await getDb();
  const col = db.collection(COL_LEASES);
  await col.deleteOne({ memberName });
  return { data: { released: true } };
}, "ext-seed-lease-delete");
