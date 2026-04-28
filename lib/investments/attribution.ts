// Tag-based investment attribution.
//
// The model: every investment has a unique `code` (`MS-XXXX`). The user
// pastes that code into the comment field of every Cardmarket listing
// associated with the investment. The extension scrapes those comments
// from stock rows and from order-detail line items. The dashboard
// extracts the code via parseInvestmentTag and routes growth / sale
// events to the matching investment exactly.
//
// Untagged listings and untagged sales DO NOT attribute to anything.
// The previous baseline / FIFO machinery has been removed — accuracy
// now depends entirely on the user remembering to tag listings, with
// the investment detail UI surfacing untagged stock so they can fix it.

import { ObjectId, type Db } from "mongodb";
import {
  COL_INVESTMENTS,
  COL_INVESTMENT_LOTS,
  COL_INVESTMENT_SALE_LOG,
} from "./db";
import { parseInvestmentTag } from "./codes";
import type { Investment } from "./types";

async function findInvestmentByCode(db: Db, code: string): Promise<Investment | null> {
  return db
    .collection<Investment>(COL_INVESTMENTS)
    .findOne({ code, status: { $in: ["listing", "closed"] } });
}

/**
 * Idempotently set lot.qty_opened to reflect a tagged stock listing.
 *
 * Call sites: stock + product-stock sync after persisting the listing
 * row. `comment` is the listing's comment field as scraped by the
 * extension. If it doesn't contain a valid `MS-XXXX` tag, this is a
 * no-op.
 *
 * Behaviour:
 *   - For collection-kind investments (lots pre-created at conversion):
 *     no-op when the lot already exists. Only logs the unexpected case
 *     of a tagged listing that doesn't match any pre-existing lot.
 *   - For box / product investments (lots grow lazily): upserts the lot
 *     with qty_opened = qty (or grows it if more rows of the same tuple
 *     arrive — see the upsert math below).
 */
export async function maybeGrowLot(params: {
  db: Db;
  cardmarketId: number;
  foil: boolean;
  condition: string;
  language: string;
  qtyDelta: number;
  /** Comment text scraped from the stock listing — parsed for `MS-XXXX`. */
  comment?: string | null;
  /** @deprecated kept for call-site compatibility — no longer used. */
  cmSetName?: string;
  /** @deprecated kept for call-site compatibility — no longer used. */
  cardSetCode?: string | null;
}): Promise<void> {
  if (params.qtyDelta <= 0) return;
  const code = parseInvestmentTag(params.comment);
  if (!code) return;
  const inv = await findInvestmentByCode(params.db, code);
  if (!inv) return;

  // Pre-created lots (collection-kind) already have qty_opened set from
  // the source collection. We don't mutate them — the user already told
  // us the qty at conversion. If a listing's qty exceeds the pre-created
  // qty_opened, that's a discrepancy we surface in the audit UI rather
  // than silently growing.
  const existing = await params.db
    .collection(COL_INVESTMENT_LOTS)
    .findOne<{ _id: ObjectId; qty_opened: number; qty_sold: number }>({
      investment_id: inv._id,
      cardmarket_id: params.cardmarketId,
      foil: params.foil,
      condition: params.condition,
      language: params.language,
    });
  if (existing && inv.source.kind === "collection") return;

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
      $inc: { qty_opened: params.qtyDelta, qty_remaining: params.qtyDelta },
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
}

/**
 * Attribute a sale to its tagged investment. Untagged sales are skipped
 * (no fall-through to FIFO). Tagged sales target the lot for that
 * investment + tuple; if the lot doesn't exist or has insufficient
 * remaining qty, the excess is dropped on the floor (and visible in the
 * detail-page audit as "more sold than tagged").
 */
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
  /** Comment text from the order item — parsed for `MS-XXXX`. */
  comment?: string | null;
}): Promise<void> {
  if (params.qtySold <= 0) return;
  const code = parseInvestmentTag(params.comment);
  if (!code) return;
  const inv = await findInvestmentByCode(params.db, code);
  if (!inv) return;

  const feeRate = 0.05 + (params.trustee ? 0.01 : 0);
  const netPerUnit = params.unitPriceEur * (1 - feeRate);

  const lot = await params.db
    .collection(COL_INVESTMENT_LOTS)
    .findOne<{ _id: ObjectId; qty_remaining: number }>({
      investment_id: inv._id,
      cardmarket_id: params.cardmarketId,
      foil: params.foil,
      condition: params.condition,
      language: params.language,
    });
  if (!lot) return;
  const take = Math.min(lot.qty_remaining, params.qtySold);
  if (take <= 0) return;

  // Insert the audit log FIRST so a crash before the lot update leaves a
  // detectable "log without matching lot delta" state, rather than the
  // worse "lot drained without audit log" state.
  const logInsert = await params.db.collection(COL_INVESTMENT_SALE_LOG).insertOne({
    lot_id: lot._id,
    investment_id: inv._id,
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

  // Guarded update: refuses to go negative.
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
    await params.db
      .collection(COL_INVESTMENT_SALE_LOG)
      .deleteOne({ _id: logInsert.insertedId });
  }
}

/**
 * Reverse a sale by undoing each sale_log row for the given order_id:
 * decrement qty_sold, increment qty_remaining, decrement proceeds_eur.
 * Unchanged from the baseline-era version — operates purely on
 * sale_log + lot rows that the tag-based consumeSale wrote.
 *
 * CONCURRENCY / PARTIAL FAILURE: The reversal loop + deleteMany is not
 * atomic. If the process crashes mid-loop, some lots will be reversed
 * and sale_log rows remain. A retry of reverseSale would re-reverse
 * those lots (double refund). Cancelling the same order twice is rare
 * in practice; if you see stale sale_log rows after a failed
 * cancellation, clean up manually:
 *   db.dashboard_investment_sale_log.deleteMany({ order_id: "X" })
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
