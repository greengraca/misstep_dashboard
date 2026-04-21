import { ObjectId, type Db } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { COL_PRODUCTS as COL_EV_PRODUCTS, latestPlayEvBySet } from "@/lib/ev-products";
import {
  COL_INVESTMENTS,
  COL_INVESTMENT_BASELINE,
  COL_INVESTMENT_LOTS,
  ensureInvestmentIndexes,
} from "./db";
import { computeExpectedOpenCardCount } from "./math";
import type {
  CreateInvestmentBody,
  Investment,
  InvestmentListItem,
  InvestmentSource,
  UpdateInvestmentBody,
} from "./types";
import type { EvProduct } from "@/lib/types";

/** Sum of EvProduct.cards[*].count — total cards in one unit of the product. */
async function cardsPerProductUnit(db: Db, slug: string): Promise<number> {
  const p = await db.collection<EvProduct>(COL_EV_PRODUCTS).findOne({ slug });
  if (!p) return 0;
  return p.cards.reduce((sum, c) => sum + c.count, 0);
}

async function recomputeExpectedOpenCardCount(
  db: Db,
  investment: Investment
): Promise<number> {
  if (investment.source.kind === "product") {
    const perUnit = await cardsPerProductUnit(db, investment.source.product_slug);
    return computeExpectedOpenCardCount(investment, { cardsPerProductUnit: perUnit });
  }
  return computeExpectedOpenCardCount(investment);
}

export async function createInvestment(params: {
  body: CreateInvestmentBody;
  userId: string;
}): Promise<Investment> {
  await ensureInvestmentIndexes();
  const db = await getDb();
  const now = new Date();
  // Compute expected_open_card_count up front.
  const stub: Investment = {
    _id: new ObjectId(),
    name: params.body.name.trim(),
    created_at: now,
    created_by: params.userId,
    status: "baseline_captured",
    cost_total_eur: params.body.cost_total_eur,
    cost_notes: params.body.cost_notes?.trim() || undefined,
    source: params.body.source,
    cm_set_names: await defaultCmSetNames(db, params.body.source),
    sealed_flips: [],
    expected_open_card_count: 0,
  };
  stub.expected_open_card_count = await recomputeExpectedOpenCardCount(db, stub);
  await db.collection<Investment>(COL_INVESTMENTS).insertOne(stub);
  return stub;
}

/** Resolve default CM set-name variants for an investment's source.
 *  Looks up dashboard_ev_sets for box-kind; uses EvProduct's parent_set_code for product-kind. */
async function defaultCmSetNames(db: Db, source: InvestmentSource): Promise<string[]> {
  if (source.kind === "box") {
    const set = await db
      .collection("dashboard_ev_sets")
      .findOne({ code: source.set_code }, { projection: { name: 1 } });
    return set?.name ? [set.name as string] : [];
  }
  const p = await db
    .collection<EvProduct>(COL_EV_PRODUCTS)
    .findOne({ slug: source.product_slug }, { projection: { parent_set_code: 1 } });
  if (!p?.parent_set_code) return [];
  const set = await db
    .collection("dashboard_ev_sets")
    .findOne({ code: p.parent_set_code }, { projection: { name: 1 } });
  return set?.name ? [set.name as string] : [];
}

export async function getInvestment(id: string): Promise<Investment | null> {
  await ensureInvestmentIndexes();
  if (!ObjectId.isValid(id)) return null;
  const db = await getDb();
  return db
    .collection<Investment>(COL_INVESTMENTS)
    .findOne({ _id: new ObjectId(id) });
}

export async function listInvestments(params: {
  status?: Investment["status"];
}): Promise<Investment[]> {
  await ensureInvestmentIndexes();
  const db = await getDb();
  const filter: Record<string, unknown> = {};
  if (params.status) filter.status = params.status;
  return db
    .collection<Investment>(COL_INVESTMENTS)
    .find(filter)
    .sort({ created_at: -1 })
    .toArray();
}

export async function updateInvestment(params: {
  id: string;
  body: UpdateInvestmentBody;
}): Promise<Investment | null> {
  await ensureInvestmentIndexes();
  if (!ObjectId.isValid(params.id)) return null;
  const db = await getDb();
  const $set: Record<string, unknown> = {};
  if (params.body.name !== undefined) $set.name = params.body.name.trim();
  if (params.body.cost_total_eur !== undefined)
    $set.cost_total_eur = params.body.cost_total_eur;
  if (params.body.cost_notes !== undefined)
    $set.cost_notes = params.body.cost_notes.trim() || undefined;
  if (params.body.cm_set_names !== undefined) $set.cm_set_names = params.body.cm_set_names;
  if (Object.keys($set).length === 0) return getInvestment(params.id);
  const res = await db
    .collection<Investment>(COL_INVESTMENTS)
    .findOneAndUpdate(
      { _id: new ObjectId(params.id) },
      { $set },
      { returnDocument: "after" }
    );
  return res ?? null;
}

export async function archiveInvestment(id: string): Promise<boolean> {
  await ensureInvestmentIndexes();
  if (!ObjectId.isValid(id)) return false;
  const db = await getDb();
  const res = await db
    .collection<Investment>(COL_INVESTMENTS)
    .updateOne({ _id: new ObjectId(id) }, { $set: { status: "archived" } });
  return res.matchedCount > 0;
}

/** Summary aggregates for list view: total listed value + realized per investment. */
export async function listInvestmentSummaries(params: {
  status?: Investment["status"];
}): Promise<InvestmentListItem[]> {
  await ensureInvestmentIndexes();
  const db = await getDb();
  const investments = await listInvestments(params);
  const ids = investments.map((i) => i._id);
  const lots = await db
    .collection(COL_INVESTMENT_LOTS)
    .aggregate<{ _id: ObjectId; proceeds: number }>([
      { $match: { investment_id: { $in: ids } } },
      { $group: { _id: "$investment_id", proceeds: { $sum: "$proceeds_eur" } } },
    ])
    .toArray();
  const proceedsByInv = new Map<string, number>();
  for (const row of lots) proceedsByInv.set(String(row._id), row.proceeds);
  return Promise.all(
    investments.map(async (inv) => ({
      id: String(inv._id),
      name: inv.name,
      status: inv.status,
      created_at: inv.created_at.toISOString(),
      source: inv.source,
      cost_total_eur: inv.cost_total_eur,
      listed_value_eur: await computeListedValue(inv._id),
      realized_eur: proceedsByInv.get(String(inv._id)) ?? 0,
      sealed_flips_total_eur: inv.sealed_flips.reduce((s, f) => s + f.proceeds_eur, 0),
    }))
  );
}

/** Sum of stock.price * stock.qty across rows matching open lots for this investment. */
export async function computeListedValue(investmentId: ObjectId): Promise<number> {
  const db = await getDb();
  const lots = await db
    .collection(COL_INVESTMENT_LOTS)
    .find({ investment_id: investmentId, qty_remaining: { $gt: 0 } })
    .project<{ cardmarket_id: number; foil: boolean; condition: string }>({
      cardmarket_id: 1,
      foil: 1,
      condition: 1,
    })
    .toArray();
  if (lots.length === 0) return 0;
  const cursor = db.collection("dashboard_cm_stock").aggregate<{ total: number }>([
    {
      $match: {
        $or: lots.map((l) => ({
          productId: l.cardmarket_id,
          foil: l.foil,
          condition: l.condition,
        })),
      },
    },
    { $group: { _id: null, total: { $sum: { $multiply: ["$qty", "$price"] } } } },
  ]);
  const row = await cursor.next();
  return row?.total ?? 0;
}

export async function computeBaselineProgress(investmentId: ObjectId): Promise<{
  captured_cardmarket_ids: number;
  target_cardmarket_ids: number;
}> {
  const db = await getDb();
  const captured = await db
    .collection(COL_INVESTMENT_BASELINE)
    .distinct("cardmarket_id", { investment_id: investmentId });
  // Target count is determined by the source; temporary stub returns captured count as target
  // until Task 9 fills this in.
  return { captured_cardmarket_ids: captured.length, target_cardmarket_ids: captured.length };
}

/** Expected EV for display. Best-effort; returns null if unavailable. */
export async function computeExpectedEv(investment: Investment): Promise<number | null> {
  const db = await getDb();
  if (investment.source.kind === "box") {
    const map = await latestPlayEvBySet([investment.source.set_code]);
    const perPackEv = map[investment.source.set_code];
    if (perPackEv == null) return null;
    return perPackEv * investment.source.packs_per_box * investment.source.box_count;
  }
  // product-kind: read latest snapshot from dashboard_ev_snapshots
  const snap = await db
    .collection("dashboard_ev_snapshots")
    .find({ product_slug: investment.source.product_slug })
    .sort({ date: -1 })
    .limit(1)
    .next();
  const evPerUnit =
    (snap?.ev_net_opened as number | null) ??
    (snap?.ev_net_sealed as number | null) ??
    (snap?.ev_net_cards_only as number | null) ??
    null;
  if (evPerUnit == null) return null;
  return evPerUnit * investment.source.unit_count;
}

export async function buildInvestmentDetail(
  inv: Investment
): Promise<import("./types").InvestmentDetail> {
  const listed = await computeListedValue(inv._id);
  const expected = await computeExpectedEv(inv);
  const proceedsAgg = await (await getDb())
    .collection(COL_INVESTMENT_LOTS)
    .aggregate<{ total: number }>([
      { $match: { investment_id: inv._id } },
      { $group: { _id: null, total: { $sum: "$proceeds_eur" } } },
    ])
    .next();
  const lotProceeds = proceedsAgg?.total ?? 0;
  const sealedProceeds = inv.sealed_flips.reduce((s, f) => s + f.proceeds_eur, 0);
  const realized = lotProceeds + sealedProceeds;
  const baseline =
    inv.status === "baseline_captured"
      ? await computeBaselineProgress(inv._id)
      : undefined;
  return {
    id: String(inv._id),
    name: inv.name,
    status: inv.status,
    created_at: inv.created_at.toISOString(),
    created_by: inv.created_by,
    cost_total_eur: inv.cost_total_eur,
    cost_notes: inv.cost_notes,
    source: inv.source,
    cm_set_names: inv.cm_set_names,
    sealed_flips: inv.sealed_flips,
    expected_open_card_count: inv.expected_open_card_count,
    baseline_completed_at: inv.baseline_completed_at?.toISOString(),
    closed_at: inv.closed_at?.toISOString(),
    kpis: {
      cost_eur: inv.cost_total_eur,
      expected_ev_eur: expected,
      listed_value_eur: listed,
      realized_net_eur: realized,
      net_pl_blended_eur: realized + listed - inv.cost_total_eur,
      break_even_pct: inv.cost_total_eur > 0 ? realized / inv.cost_total_eur : 0,
    },
    baseline_progress: baseline,
  };
}

export async function recordSealedFlip(params: {
  id: string;
  body: import("./types").SealedFlipBody;
}): Promise<Investment | null> {
  await ensureInvestmentIndexes();
  if (!ObjectId.isValid(params.id)) return null;
  const db = await getDb();
  const inv = await db
    .collection<Investment>(COL_INVESTMENTS)
    .findOne({ _id: new ObjectId(params.id) });
  if (!inv) return null;

  const flip = {
    recorded_at: new Date(),
    unit_count: params.body.unit_count,
    proceeds_eur: params.body.proceeds_eur,
    note: params.body.note?.trim() || undefined,
  };
  const nextFlips = [...inv.sealed_flips, flip];
  const nextInv: Investment = { ...inv, sealed_flips: nextFlips };
  const nextExpected = await recomputeExpectedOpenCardCount(db, nextInv);

  const res = await db
    .collection<Investment>(COL_INVESTMENTS)
    .findOneAndUpdate(
      { _id: new ObjectId(params.id) },
      {
        $push: { sealed_flips: flip },
        $set: { expected_open_card_count: nextExpected },
      },
      { returnDocument: "after" }
    );
  return res ?? null;
}

// Stubs to be filled in later tasks.
export async function closeInvestment(): Promise<never> {
  throw new Error("closeInvestment: implemented in Task 9");
}
export async function getBaselineTargets(): Promise<never> {
  throw new Error("getBaselineTargets: implemented in Task 12");
}
export async function upsertBaselineBatch(): Promise<never> {
  throw new Error("upsertBaselineBatch: implemented in Task 13");
}
export async function markBaselineComplete(): Promise<never> {
  throw new Error("markBaselineComplete: implemented in Task 14");
}
export async function adjustLot(): Promise<never> {
  throw new Error("adjustLot: implemented in Task 11");
}
export async function listLots(): Promise<never> {
  throw new Error("listLots: implemented in Task 10");
}
