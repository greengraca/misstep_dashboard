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
