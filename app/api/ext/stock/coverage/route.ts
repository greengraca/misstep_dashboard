import { NextResponse, type NextRequest } from "next/server";
import { withExtAuth } from "@/lib/api-ext-helpers";
import { getDb } from "@/lib/mongodb";

interface CoverageItem {
  name: string;
  /** CARDS (sum qty) Cardmarket claims for this expansion. Read from the
   *  idExpansion <select> dropdown on /Stock/Offers/Singles. */
  cards: number;
}

/**
 * POST /api/ext/stock/coverage
 *
 * Given the CM dropdown's per-expansion card counts, return how many of
 * those cards dashboard_cm_stock already has for each. Drives the seed
 * mode Coverage panel — tells the user which expansions have gaps and
 * how big each gap is.
 *
 * Stale expansions (in dashboard stock but not in the CM dropdown) are
 * also returned so the user can clean them up.
 */
export const POST = withExtAuth(async (req: NextRequest) => {
  let body: { expansions?: unknown };
  try {
    body = (await req.json()) as { expansions?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const raw = body.expansions;
  if (!Array.isArray(raw)) {
    return NextResponse.json(
      { error: "expansions must be an array" },
      { status: 400 }
    );
  }
  if (raw.length > 1000) {
    return NextResponse.json({ error: "too many expansions" }, { status: 400 });
  }
  const cmExpansions: CoverageItem[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const o = e as Record<string, unknown>;
    if (typeof o.name !== "string" || o.name.length === 0 || o.name.length > 200) {
      continue;
    }
    if (!Number.isInteger(o.cards) || (o.cards as number) < 0) continue;
    cmExpansions.push({ name: o.name, cards: o.cards as number });
  }

  const db = await getDb();
  // One aggregate over all cm_stock — group by set name, sum qty (cards)
  // and count docs (listings). An order of magnitude cheaper than
  // querying per expansion name separately.
  const stockGroups = await db
    .collection("dashboard_cm_stock")
    .aggregate<{ _id: string; cards: number; rows: number }>([
      { $group: { _id: "$set", cards: { $sum: "$qty" }, rows: { $sum: 1 } } },
    ])
    .toArray();
  const stockMap = new Map<string, { cards: number; rows: number }>();
  for (const s of stockGroups) {
    if (typeof s._id === "string" && s._id.length > 0) {
      stockMap.set(s._id, { cards: s.cards ?? 0, rows: s.rows ?? 0 });
    }
  }

  const expansions: Array<{
    name: string;
    cm_cards: number;
    db_cards: number;
    db_rows: number;
    /** db_cards - cm_cards. Positive → stale (cleanup targets).
     *  Negative → gap (walker target). 0 → complete. */
    delta: number;
    complete: boolean;
  }> = [];
  const seen = new Set<string>();
  for (const e of cmExpansions) {
    seen.add(e.name);
    const stock = stockMap.get(e.name) ?? { cards: 0, rows: 0 };
    expansions.push({
      name: e.name,
      cm_cards: e.cards,
      db_cards: stock.cards,
      db_rows: stock.rows,
      delta: stock.cards - e.cards,
      complete: stock.cards === e.cards,
    });
  }
  // Stale: expansions sitting in dashboard stock that CM doesn't report.
  // Skip empty-name sets (pre-v1.7.1 rows with no set label) — can't
  // render them usefully under a blank heading.
  for (const [name, stock] of stockMap.entries()) {
    if (seen.has(name)) continue;
    if (stock.cards === 0) continue;
    expansions.push({
      name,
      cm_cards: 0,
      db_cards: stock.cards,
      db_rows: stock.rows,
      delta: stock.cards,
      complete: false,
    });
  }

  const totals = {
    cm_cards: 0,
    db_cards: 0,
    db_rows: 0,
    done: 0,
    pending: 0,
    stale: 0,
    total: expansions.length,
  };
  for (const e of expansions) {
    totals.cm_cards += e.cm_cards;
    totals.db_cards += e.db_cards;
    totals.db_rows += e.db_rows;
    if (e.complete) totals.done++;
    else if (e.delta > 0) totals.stale++;
    else totals.pending++;
  }

  return { data: { expansions, totals } };
}, "stock-coverage");
