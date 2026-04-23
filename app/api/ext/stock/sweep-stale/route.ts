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
  const walkStartedAtDate = new Date(walkStartedAtRaw);
  if (Number.isNaN(walkStartedAtDate.getTime())) {
    return { data: { ok: false, reason: "bad_input", hint: "walk_started_at must be ISO string" } };
  }
  // lastSeenAt is stored as an ISO string in dashboard_cm_stock (see
  // upsertStockListings in lib/cardmarket.ts — `const now = new
  // Date().toISOString()`). Comparing a string-typed field against a
  // Date in Mongo never matches because of BSON type ordering, so we
  // must compare string-to-string. ISO-8601 UTC strings are
  // lexicographically sortable.
  //
  // Back the threshold off by 30s to absorb client/server clock skew:
  // the walk's started_at is stamped by the user's browser clock, but
  // lastSeenAt is stamped by the server when /api/ext/sync runs. Even
  // a 2-3 second skew would drop legitimate touches.
  const CLOCK_SKEW_MS = 30_000;
  const walkStartedAt = new Date(
    walkStartedAtDate.getTime() - CLOCK_SKEW_MS
  ).toISOString();
  if (!Number.isInteger(body.cm_cards) || (body.cm_cards as number) < 0) {
    return { data: { ok: false, reason: "bad_input", hint: "cm_cards required" } };
  }
  const cmCards = body.cm_cards as number;

  const db = await getDb();
  const col = db.collection(`${COLLECTION_PREFIX}cm_stock`);

  // Overall set stats for debugging "0 touched" reports. If the set is
  // empty in our DB the user has a different problem (the dropdown
  // name doesn't match any rows' `set` field) and the hint should say
  // so, not "incomplete walk".
  const setTotalsAgg = await col
    .aggregate<{ cards: number; rows: number; max_last_seen: string | null }>([
      { $match: { set: setName } },
      {
        $group: {
          _id: null,
          cards: { $sum: "$qty" },
          rows: { $sum: 1 },
          max_last_seen: { $max: "$lastSeenAt" },
        },
      },
    ])
    .toArray();
  const setTotals = setTotalsAgg[0] ?? { cards: 0, rows: 0, max_last_seen: null };

  const touchedAgg = await col
    .aggregate<{ cards: number; rows: number }>([
      { $match: { set: setName, lastSeenAt: { $gte: walkStartedAt } } },
      { $group: { _id: null, cards: { $sum: "$qty" }, rows: { $sum: 1 } } },
    ])
    .toArray();
  const touchedCards = touchedAgg[0]?.cards ?? 0;
  const touchedRows = touchedAgg[0]?.rows ?? 0;

  if (setTotals.rows === 0) {
    return {
      data: {
        ok: false,
        reason: "no_rows_for_set",
        hint: `no dashboard_cm_stock rows have set='${setName}' — the dropdown name may not match the DB's set field`,
      },
    };
  }

  if (touchedCards < cmCards) {
    return {
      data: {
        ok: false,
        reason: "incomplete_walk",
        touched_cards: touchedCards,
        touched_rows: touchedRows,
        cm_cards: cmCards,
        set_total_cards: setTotals.cards,
        set_total_rows: setTotals.rows,
        last_seen_max: setTotals.max_last_seen,
        walk_started_at_effective: walkStartedAt,
        hint: `walked ${touchedCards} of ${cmCards} cards — walk the remaining stock pages and try again (set has ${setTotals.rows} rows / ${setTotals.cards} cards total; most recent sync: ${setTotals.max_last_seen || "never"})`,
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
