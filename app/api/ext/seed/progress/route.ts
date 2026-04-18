import { NextResponse } from "next/server";
import { withExtAuth, withExtAuthRead } from "@/lib/api-ext-helpers";
import { getDb } from "@/lib/mongodb";
import { COLLECTION_PREFIX } from "@/lib/constants";

const COL_PROGRESS = `${COLLECTION_PREFIX}ext_seed_progress`;

export const GET = withExtAuthRead(async (_req, identity) => {
  const db = await getDb();
  const col = db.collection(COL_PROGRESS);

  // Extension path: scope to caller's own progress. Identity comes from the
  // token's member name, not the trivially-spoofable x-member-name header.
  // Dashboard path: return everyone so a future admin view can render.
  if (identity.memberName) {
    const doc = await col.findOne({ memberName: identity.memberName });
    return { data: doc || null };
  }

  const all = await col.find({}).sort({ updatedAt: -1 }).toArray();
  return { data: all };
}, "ext-seed-progress-get");

export const POST = withExtAuth(async (req, memberName) => {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const lastFilterUrl = typeof body.lastFilterUrl === "string" ? body.lastFilterUrl : "";
  const lastFilterLabel = typeof body.lastFilterLabel === "string" ? body.lastFilterLabel : "";
  const lastPage =
    typeof body.lastPage === "number" && Number.isFinite(body.lastPage)
      ? Math.max(1, Math.floor(body.lastPage))
      : 1;

  if (!lastFilterUrl) {
    return NextResponse.json({ error: "lastFilterUrl required" }, { status: 400 });
  }

  const db = await getDb();
  const col = db.collection(COL_PROGRESS);

  const now = new Date();
  await col.updateOne(
    { memberName },
    {
      $set: {
        memberName,
        lastFilterUrl,
        lastFilterLabel,
        lastPage,
        updatedAt: now,
      },
    },
    { upsert: true }
  );

  return { data: { memberName, lastFilterUrl, lastFilterLabel, lastPage, updatedAt: now } };
}, "ext-seed-progress-post");
