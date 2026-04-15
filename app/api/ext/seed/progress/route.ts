import { NextResponse } from "next/server";
import { withExtAuth, withExtAuthRead } from "@/lib/api-ext-helpers";
import { getDb } from "@/lib/mongodb";
import { COLLECTION_PREFIX } from "@/lib/constants";

const COL_PROGRESS = `${COLLECTION_PREFIX}ext_seed_progress`;

export const GET = withExtAuthRead(async (req) => {
  const memberName = req.headers.get("x-member-name") || "";
  const db = await getDb();
  const col = db.collection(COL_PROGRESS);

  // Scope query to the caller's memberName when provided (extension path);
  // if a dashboard session hits this with no header we return the full
  // list so a future admin view can render everyone's state.
  if (memberName) {
    const doc = await col.findOne({ memberName });
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
