import { NextResponse, type NextRequest } from "next/server";
import {
  withExtAuthReadParams,
  withExtAuthParams,
} from "@/lib/api-ext-helpers";
import { getDb } from "@/lib/mongodb";

const COL_EV_SETS = "dashboard_ev_sets";

type Params = { code: string };

/**
 * GET — dual-auth. Returns { cm_expansion_id: number | null } for the set.
 * Used by the extension popup to build the /Stock/Offers/Singles?idExpansion
 * deep-link, and by the dashboard UI to show "not yet mapped" when null.
 */
export const GET = withExtAuthReadParams<Params>(
  async (_req, _identity, { code }) => {
    const db = await getDb();
    const set = await db
      .collection(COL_EV_SETS)
      .findOne<{ cm_expansion_id?: number | null }>(
        { code: code.toLowerCase() },
        { projection: { cm_expansion_id: 1 } }
      );
    if (!set) return NextResponse.json({ error: "set not found" }, { status: 404 });
    return { cm_expansion_id: set.cm_expansion_id ?? null };
  },
  "ev-sets-cm-expansion-get"
);

/**
 * POST — ext-auth. Body: { cm_expansion_id: number }.
 * Upserts the mapping on the set doc. Accepts only positive integers.
 * Idempotent: re-posting the same id is a no-op.
 */
export const POST = withExtAuthParams<Params>(
  async (req: NextRequest, _memberName, { code }) => {
    let body: { cm_expansion_id?: unknown };
    try {
      body = (await req.json()) as { cm_expansion_id?: unknown };
    } catch {
      return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
    }
    const id = body.cm_expansion_id;
    if (!Number.isInteger(id) || (id as number) <= 0) {
      return NextResponse.json(
        { error: "cm_expansion_id must be a positive integer" },
        { status: 400 }
      );
    }
    const db = await getDb();
    const res = await db
      .collection(COL_EV_SETS)
      .updateOne(
        { code: code.toLowerCase() },
        { $set: { cm_expansion_id: id as number } }
      );
    if (res.matchedCount === 0) {
      return NextResponse.json({ error: "set not found" }, { status: 404 });
    }
    return { ok: true, cm_expansion_id: id };
  },
  "ev-sets-cm-expansion-post"
);
