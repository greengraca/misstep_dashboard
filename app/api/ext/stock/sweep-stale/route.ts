import { NextResponse, type NextRequest } from "next/server";
import { withExtAuth } from "@/lib/api-ext-helpers";
import { getDb } from "@/lib/mongodb";
import { COLLECTION_PREFIX } from "@/lib/constants";

/**
 * POST /api/ext/stock/sweep-stale
 *
 * Called from Seed Mode's coverage panel at the end of a walk-and-sweep
 * session. Deletes dashboard_cm_stock rows for the given CM set that
 * weren't touched (lastSeenAt refreshed) during the walk — those rows
 * exist in our DB but CM no longer has them.
 *
 * Returns 200 with { data: { ok: true, ... } } on a successful sweep,
 * or 200 with { data: { ok: false, reason, ... } } for business errors
 * (incomplete walk, bad input). The ext-side seedApiRequest helper
 * strips non-2xx bodies, so structured errors come back as 200.
 *
 * Safety:
 *   - sum(qty) of rows with lastSeenAt >= walk_started_at for this set
 *     must be >= cm_cards, i.e. everything CM currently shows in the
 *     dropdown was touched during the walk. Otherwise we'd delete rows
 *     that simply weren't visited yet. This is the real safety gate;
 *     there's no separate duration check because a small set can be
 *     walked in seconds.
 */
export const POST = withExtAuth(async (req: NextRequest) => {
  let body: {
    set_name?: unknown;
    walk_started_at?: unknown;
    cm_cards?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const setName = typeof body.set_name === "string" ? body.set_name.trim() : "";
  if (!setName || setName.length > 200) {
    return { data: { ok: false, reason: "bad_input", hint: "set_name required" } };
  }
  const walkStartedAtRaw = typeof body.walk_started_at === "string"
    ? body.walk_started_at : "";
  const walkStartedAt = new Date(walkStartedAtRaw);
  if (Number.isNaN(walkStartedAt.getTime())) {
    return { data: { ok: false, reason: "bad_input", hint: "walk_started_at must be ISO string" } };
  }
  if (!Number.isInteger(body.cm_cards) || (body.cm_cards as number) < 0) {
    return { data: { ok: false, reason: "bad_input", hint: "cm_cards required" } };
  }
  const cmCards = body.cm_cards as number;

  const db = await getDb();
  const col = db.collection(`${COLLECTION_PREFIX}cm_stock`);

  const touchedAgg = await col
    .aggregate<{ cards: number; rows: number }>([
      { $match: { set: setName, lastSeenAt: { $gte: walkStartedAt } } },
      { $group: { _id: null, cards: { $sum: "$qty" }, rows: { $sum: 1 } } },
    ])
    .toArray();
  const touchedCards = touchedAgg[0]?.cards ?? 0;
  const touchedRows = touchedAgg[0]?.rows ?? 0;

  if (touchedCards < cmCards) {
    return {
      data: {
        ok: false,
        reason: "incomplete_walk",
        touched_cards: touchedCards,
        touched_rows: touchedRows,
        cm_cards: cmCards,
        hint: `walked ${touchedCards} of ${cmCards} cards — visit the remaining stock pages and try again`,
      },
    };
  }

  const stale = await col.find(
    { set: setName, lastSeenAt: { $lt: walkStartedAt } },
    { projection: { _id: 1, name: 1, qty: 1 } }
  ).toArray();
  const staleCards = stale.reduce<number>(
    (sum, r) => sum + (typeof r.qty === "number" ? r.qty : 0),
    0
  );

  const del = await col.deleteMany({
    set: setName,
    lastSeenAt: { $lt: walkStartedAt },
  });

  return {
    data: {
      ok: true,
      deleted_rows: del.deletedCount ?? 0,
      deleted_cards: staleCards,
      touched_cards: touchedCards,
      touched_rows: touchedRows,
      cm_cards: cmCards,
      sample_names: stale.slice(0, 5).map((r) => r.name),
    },
  };
}, "stock-sweep-stale");
