import { ObjectId, type Db } from "mongodb";
import {
  COL_INVESTMENTS,
  COL_INVESTMENT_BASELINE,
  COL_INVESTMENT_LOTS,
  COL_INVESTMENT_SALE_LOG,
} from "./db";
import { COL_PRODUCTS as COL_EV_PRODUCTS } from "@/lib/ev-products";
import { computeAttributable } from "./math";
import type { EvProduct } from "@/lib/types";
import type { Investment } from "./types";

/** Return the cardmarket_ids that belong to an EvProduct's fixed pool. */
async function productCardmarketIds(db: Db, slug: string): Promise<Set<number>> {
  const p = await db.collection<EvProduct>(COL_EV_PRODUCTS).findOne({ slug });
  if (!p) return new Set();
  const scryfallIds = p.cards.map((c) => c.scryfall_id);
  const cards = await db
    .collection("dashboard_ev_cards")
    .find({ scryfall_id: { $in: scryfallIds } })
    .project<{ cardmarket_id: number | null }>({ cardmarket_id: 1 })
    .toArray();
  return new Set(cards.map((c) => c.cardmarket_id).filter((x): x is number => x != null));
}

async function findCandidateInvestments(params: {
  db: Db;
  cardmarketId: number;
  cardSetCode: string | null;
  cmSetName?: string;
}): Promise<Investment[]> {
  const { db, cardmarketId, cardSetCode, cmSetName } = params;
  const orFilters: Record<string, unknown>[] = [];
  if (cardSetCode) orFilters.push({ "source.kind": "box", "source.set_code": cardSetCode });
  if (cmSetName) orFilters.push({ cm_set_names: cmSetName });
  const boxAndNameCandidates =
    orFilters.length > 0
      ? await db
          .collection<Investment>(COL_INVESTMENTS)
          .find({ status: "listing", $or: orFilters })
          .sort({ created_at: 1 })
          .toArray()
      : [];

  // Product-kind: find all listing product investments, filter by cardmarket_id set.
  const productCandidates = await db
    .collection<Investment>(COL_INVESTMENTS)
    .find({ status: "listing", "source.kind": "product" })
    .sort({ created_at: 1 })
    .toArray();
  const productMatches: Investment[] = [];
  for (const inv of productCandidates) {
    if (inv.source.kind !== "product") continue;
    const cmIds = await productCardmarketIds(db, inv.source.product_slug);
    if (cmIds.has(cardmarketId)) productMatches.push(inv);
  }

  const all = [...boxAndNameCandidates, ...productMatches];
  const seen = new Set<string>();
  const deduped: Investment[] = [];
  for (const inv of all) {
    const key = String(inv._id);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(inv);
  }
  deduped.sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
  return deduped;
}

async function currentStockQty(
  db: Db,
  cardmarketId: number,
  foil: boolean,
  condition: string,
  language: string
): Promise<number> {
  const agg = await db
    .collection("dashboard_cm_stock")
    .aggregate<{ total: number }>([
      { $match: { productId: cardmarketId, foil, condition, language } },
      { $group: { _id: null, total: { $sum: "$qty" } } },
    ])
    .next();
  return agg?.total ?? 0;
}

/**
 * Attribute a qty increase to the oldest-matching listing investment, FIFO,
 * bounded by (current_stock - baseline - lot_already_opened) and by the
 * investment's remaining budget.
 *
 * CONCURRENCY: Calls to this function for overlapping tuples are NOT
 * synchronized. Two sync batches firing on the same {cardmarket_id, foil,
 * condition, language} tuple can each read qty_opened=N and each $inc by M,
 * resulting in qty_opened=N+2M when the true delta was M. In practice, the
 * extension's /api/ext/sync POSTs are short-lived and two batches touching
 * the same lot at the same millisecond are unlikely, so this is a deferred
 * concern — revisit with a guarded findOneAndUpdate if lot growth ever
 * visibly drifts from observed stock deltas.
 */
export async function maybeGrowLot(params: {
  db: Db;
  cardmarketId: number;
  foil: boolean;
  condition: string;
  language: string;
  qtyDelta: number;
  cmSetName?: string;
  cardSetCode: string | null;
}): Promise<void> {
  if (params.qtyDelta <= 0) return;
  const candidates = await findCandidateInvestments({
    db: params.db,
    cardmarketId: params.cardmarketId,
    cardSetCode: params.cardSetCode,
    cmSetName: params.cmSetName,
  });
  if (candidates.length === 0) return;
  const stockQty = await currentStockQty(
    params.db,
    params.cardmarketId,
    params.foil,
    params.condition,
    params.language
  );
  let remainingDelta = params.qtyDelta;

  for (const inv of candidates) {
    if (remainingDelta <= 0) break;
    const baselineDoc = await params.db
      .collection(COL_INVESTMENT_BASELINE)
      .findOne<{ qty_baseline: number }>({
        investment_id: inv._id,
        cardmarket_id: params.cardmarketId,
        foil: params.foil,
        condition: params.condition,
        language: params.language,
      });
    const baseline = baselineDoc?.qty_baseline ?? 0;
    const lotDoc = await params.db
      .collection(COL_INVESTMENT_LOTS)
      .findOne<{ qty_opened: number; qty_sold: number }>({
        investment_id: inv._id,
        cardmarket_id: params.cardmarketId,
        foil: params.foil,
        condition: params.condition,
        language: params.language,
      });
    const lotAlreadyOpened = lotDoc?.qty_opened ?? 0;
    const attributable = computeAttributable({
      currentStockQty: stockQty,
      baselineQty: baseline,
      lotAlreadyOpened,
    });
    if (attributable <= 0) continue;

    const budgetAgg = await params.db
      .collection(COL_INVESTMENT_LOTS)
      .aggregate<{ total: number }>([
        { $match: { investment_id: inv._id } },
        { $group: { _id: null, total: { $sum: "$qty_opened" } } },
      ])
      .next();
    const totalSoFar = budgetAgg?.total ?? 0;
    const budgetRemaining = inv.expected_open_card_count - totalSoFar;
    if (budgetRemaining <= 0) continue;

    const growBy = Math.min(remainingDelta, attributable, budgetRemaining);
    const now = new Date();
    await params.db.collection(COL_INVESTMENT_LOTS).updateOne(
      {
        investment_id: inv._id,
        cardmarket_id: params.cardmarketId,
        foil: params.foil,
        condition: params.condition,
        language: params.language,
      },
      {
        $inc: { qty_opened: growBy, qty_remaining: growBy },
        $set: { last_grown_at: now },
        $setOnInsert: {
          investment_id: inv._id,
          cardmarket_id: params.cardmarketId,
          foil: params.foil,
          condition: params.condition,
          language: params.language,
          qty_sold: 0,
          proceeds_eur: 0,
          cost_basis_per_unit: null,
        },
      },
      { upsert: true }
    );
    remainingDelta -= growBy;
  }
}

export async function consumeSale(params: {
  db: Db;
  cardmarketId: number;
  foil: boolean;
  condition: string;
  language: string;
  qtySold: number;
  unitPriceEur: number;
  trustee: boolean;
  orderId: string;
  articleId?: string;
}): Promise<void> {
  if (params.qtySold <= 0) return;
  const feeRate = 0.05 + (params.trustee ? 0.01 : 0);
  const netPerUnit = params.unitPriceEur * (1 - feeRate);

  // Fetch matching lots, join to investment.created_at for FIFO.
  // Include both "listing" (growing) and "closed" (frozen) investments.
  const joined = await params.db
    .collection(COL_INVESTMENT_LOTS)
    .aggregate<{
      _id: ObjectId;
      investment_id: ObjectId;
      qty_remaining: number;
      qty_sold: number;
      proceeds_eur: number;
      inv_created_at: Date;
      inv_status: string;
    }>([
      {
        $match: {
          cardmarket_id: params.cardmarketId,
          foil: params.foil,
          condition: params.condition,
          language: params.language,
          qty_remaining: { $gt: 0 },
        },
      },
      {
        $lookup: {
          from: COL_INVESTMENTS,
          localField: "investment_id",
          foreignField: "_id",
          as: "inv",
        },
      },
      { $unwind: "$inv" },
      {
        $match: {
          "inv.status": { $in: ["listing", "closed"] },
        },
      },
      {
        $project: {
          _id: 1,
          investment_id: 1,
          qty_remaining: 1,
          qty_sold: 1,
          proceeds_eur: 1,
          inv_created_at: "$inv.created_at",
          inv_status: "$inv.status",
        },
      },
      { $sort: { inv_created_at: 1 } },
    ])
    .toArray();

  let remaining = params.qtySold;
  for (const lot of joined) {
    if (remaining <= 0) break;
    const take = Math.min(lot.qty_remaining, remaining);

    // Insert the audit log FIRST so a crash after the log insert but before
    // the lot update leaves a detectable "log without matching lot delta" state,
    // rather than the worse "lot drained without audit log" state.
    const logInsert = await params.db.collection(COL_INVESTMENT_SALE_LOG).insertOne({
      lot_id: lot._id,
      investment_id: lot.investment_id,
      order_id: params.orderId,
      article_id: params.articleId,
      cardmarket_id: params.cardmarketId,
      foil: params.foil,
      condition: params.condition,
      language: params.language,
      qty: take,
      unit_price_eur: params.unitPriceEur,
      net_per_unit_eur: netPerUnit,
      attributed_at: new Date(),
    });

    // Guarded update: refuses to go negative. If another consumer drained this lot
    // between our aggregate and this write, we roll back the log insert and break.
    const updated = await params.db
      .collection(COL_INVESTMENT_LOTS)
      .findOneAndUpdate(
        { _id: lot._id, qty_remaining: { $gte: take } },
        {
          $inc: {
            qty_sold: take,
            qty_remaining: -take,
            proceeds_eur: take * netPerUnit,
          },
        },
        { returnDocument: "after" }
      );
    if (!updated) {
      // Another consumer drained this lot. Roll back the log insert and skip.
      await params.db
        .collection(COL_INVESTMENT_SALE_LOG)
        .deleteOne({ _id: logInsert.insertedId });
      continue;
    }

    remaining -= take;
  }
}

/**
 * Reverse a sale by undoing each sale_log row for the given order_id:
 * decrement qty_sold, increment qty_remaining, decrement proceeds_eur.
 *
 * CONCURRENCY / PARTIAL FAILURE: The reversal loop + deleteMany is not
 * atomic. If the process crashes mid-loop, some lots will be reversed and
 * sale_log rows remain. A retry of reverseSale would re-reverse those lots
 * (double refund). Cancelling the same order twice is rare in practice, but
 * if you observe stale sale_log rows after a failed cancellation, clean up
 * manually:
 *   db.dashboard_investment_sale_log.deleteMany({ order_id: "X" })
 * Or extend this fn with a `reversed_at` marker per row for exact-once
 * reversal if the issue becomes recurrent.
 */
export async function reverseSale(params: {
  db: Db;
  orderId: string;
}): Promise<void> {
  const rows = await params.db
    .collection(COL_INVESTMENT_SALE_LOG)
    .find<{
      _id: ObjectId;
      lot_id: ObjectId;
      qty: number;
      net_per_unit_eur: number;
    }>({ order_id: params.orderId })
    .toArray();
  for (const row of rows) {
    await params.db.collection(COL_INVESTMENT_LOTS).updateOne(
      { _id: row.lot_id },
      {
        $inc: {
          qty_sold: -row.qty,
          qty_remaining: row.qty,
          proceeds_eur: -row.qty * row.net_per_unit_eur,
        },
      }
    );
  }
  if (rows.length > 0) {
    await params.db
      .collection(COL_INVESTMENT_SALE_LOG)
      .deleteMany({ order_id: params.orderId });
  }
}
