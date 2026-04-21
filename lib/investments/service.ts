import { ObjectId, type Db } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { COL_PRODUCTS as COL_EV_PRODUCTS } from "@/lib/ev-products";
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
  return investments.map((inv) => ({
    id: String(inv._id),
    name: inv.name,
    status: inv.status,
    created_at: inv.created_at.toISOString(),
    source: inv.source,
    cost_total_eur: inv.cost_total_eur,
    listed_value_eur: 0,  // filled by a downstream helper; cheap 0 for skeleton
    realized_eur: proceedsByInv.get(String(inv._id)) ?? 0,
    sealed_flips_total_eur: inv.sealed_flips.reduce((s, f) => s + f.proceeds_eur, 0),
  }));
}

// Stubs to be filled in later tasks.
export async function recordSealedFlip(): Promise<never> {
  throw new Error("recordSealedFlip: implemented in Task 8");
}
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
