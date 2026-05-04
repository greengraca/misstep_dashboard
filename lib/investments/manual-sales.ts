// Manual sales — record a sale that happened outside Cardmarket against an
// investment, decrementing or growing the matching lot.
//
// Two distinct ledger deltas, picked via the `wasListed` flag:
//   - wasListed=true  → "I'm pulling this card out of my CM stock". The
//     existing lot already counts the card in qty_opened. Decrement
//     qty_remaining and bump qty_sold. Same shape as consumeSale, just
//     fee-free and reading from a manual id.
//   - wasListed=false → "I sold it without ever listing it on CM". The lot
//     doesn't know about this copy yet. Grow qty_opened AND bump qty_sold;
//     qty_remaining is untouched (the card never sat in stock).
//
// Mirrors consumeSale's write-log-first crash-window invariant: the
// sale_log row goes in BEFORE the lot mutation, so a crash leaves a
// detectable "log without lot delta" rather than the worse "lot drained
// without log" state. If the lot mutation fails (race or guard), the
// sale_log row is rolled back.

import { randomBytes } from "node:crypto";
import { ObjectId, type Db } from "mongodb";
import {
  COL_INVESTMENTS,
  COL_INVESTMENT_LOTS,
  COL_INVESTMENT_SALE_LOG,
} from "./db";
import type { Investment, InvestmentSaleLog } from "./types";

/**
 * Generate the `order_id` for a manual sale. Format: `manual:` followed by
 * 8 hex chars. Doesn't need to be globally unique — the sale_log primary
 * key is `_id` — but uniqueness within an investment is convenient for the
 * UI to disambiguate and for any future "find by manual id" lookup.
 */
export function generateManualSaleId(): string {
  return `manual:${randomBytes(4).toString("hex")}`;
}

export type RecordManualSaleResult =
  | { status: "ok"; sale_log_id: string; lot_id: string }
  | { status: "no-investment" }
  | { status: "frozen" }
  | { status: "cannot-grow-collection-kind" }
  | { status: "insufficient-remaining"; have: number; want: number };

export type DeleteManualSaleResult =
  | { status: "ok" }
  | { status: "not-found" }
  | { status: "not-manual" }
  | { status: "frozen" };

export interface RecordManualSaleParams {
  db: Db;
  investmentId: string;
  cardmarketId: number;
  foil: boolean;
  condition: string;
  language: string;
  qty: number;
  unitPriceEur: number;
  /** false = off-the-books (grow + consume); true = pull from existing CM
   *  listings (consume only). */
  wasListed: boolean;
  date: Date;
  note?: string;
}

export async function recordManualSale(
  params: RecordManualSaleParams
): Promise<RecordManualSaleResult> {
  if (!ObjectId.isValid(params.investmentId)) return { status: "no-investment" };
  if (!Number.isFinite(params.qty) || params.qty <= 0) return { status: "no-investment" };
  if (!Number.isFinite(params.unitPriceEur) || params.unitPriceEur < 0) return { status: "no-investment" };

  const invObjId = new ObjectId(params.investmentId);
  const inv = await params.db
    .collection<Investment>(COL_INVESTMENTS)
    .findOne({ _id: invObjId });
  if (!inv) return { status: "no-investment" };
  if (inv.status !== "listing") return { status: "frozen" };
  if (!params.wasListed && inv.source.kind === "collection") {
    return { status: "cannot-grow-collection-kind" };
  }

  const tuple = {
    investment_id: invObjId,
    cardmarket_id: params.cardmarketId,
    foil: params.foil,
    condition: params.condition,
    language: params.language,
  };
  const orderId = generateManualSaleId();
  const netPerUnit = params.unitPriceEur; // no CM fee on hand sales
  const proceedsDelta = params.qty * netPerUnit;

  // Pre-flight for "was listed": refuse before touching anything if the
  // existing lot can't cover qty.
  if (params.wasListed) {
    const existing = await params.db
      .collection(COL_INVESTMENT_LOTS)
      .findOne<{ qty_remaining: number }>(tuple, { projection: { qty_remaining: 1 } });
    if (!existing || existing.qty_remaining < params.qty) {
      return {
        status: "insufficient-remaining",
        have: existing?.qty_remaining ?? 0,
        want: params.qty,
      };
    }
  }

  // Insert sale_log FIRST (mirrors consumeSale: detectable crash state).
  // Use a placeholder lot_id; patched after the lot upsert returns its _id.
  const logInsert = await params.db
    .collection<Omit<InvestmentSaleLog, "_id">>(COL_INVESTMENT_SALE_LOG)
    .insertOne({
      lot_id: new ObjectId(),
      investment_id: invObjId,
      order_id: orderId,
      cardmarket_id: params.cardmarketId,
      foil: params.foil,
      condition: params.condition,
      language: params.language,
      qty: params.qty,
      unit_price_eur: params.unitPriceEur,
      net_per_unit_eur: netPerUnit,
      attributed_at: params.date,
      manual: true,
      grew_lot: !params.wasListed,
      ...(params.note ? { note: params.note } : {}),
    });

  let lotId: ObjectId;

  if (params.wasListed) {
    // Decrement an existing lot. Guarded — refuses to go below qty_remaining=0.
    const updated = await params.db
      .collection(COL_INVESTMENT_LOTS)
      .findOneAndUpdate(
        { ...tuple, qty_remaining: { $gte: params.qty } },
        {
          $inc: {
            qty_sold: params.qty,
            qty_remaining: -params.qty,
            proceeds_eur: proceedsDelta,
          },
        },
        { returnDocument: "after", projection: { _id: 1 } }
      );
    if (!updated) {
      // Race: the lot was drained by another sync between our pre-flight
      // and the guarded $inc. Roll back the log row.
      await params.db
        .collection(COL_INVESTMENT_SALE_LOG)
        .deleteOne({ _id: logInsert.insertedId });
      return { status: "insufficient-remaining", have: 0, want: params.qty };
    }
    lotId = updated._id as ObjectId;
  } else {
    // Off-the-books: grow Opened + Sold + proceeds in one upsert. NO
    // qty_remaining increment — the card was never in stock.
    const result = await params.db
      .collection(COL_INVESTMENT_LOTS)
      .findOneAndUpdate(
        tuple,
        {
          $inc: {
            qty_opened: params.qty,
            qty_sold: params.qty,
            proceeds_eur: proceedsDelta,
          },
          $set: { last_grown_at: new Date() },
          $setOnInsert: {
            qty_remaining: 0,
            cost_basis_per_unit: null,
          },
        },
        { upsert: true, returnDocument: "after", projection: { _id: 1 } }
      );
    if (!result) {
      // Should not happen with upsert: true. Roll back defensively.
      await params.db
        .collection(COL_INVESTMENT_SALE_LOG)
        .deleteOne({ _id: logInsert.insertedId });
      return { status: "no-investment" };
    }
    lotId = result._id as ObjectId;
  }

  // Patch the placeholder lot_id on the sale_log row now that we have it.
  await params.db
    .collection(COL_INVESTMENT_SALE_LOG)
    .updateOne({ _id: logInsert.insertedId }, { $set: { lot_id: lotId } });

  return {
    status: "ok",
    sale_log_id: String(logInsert.insertedId),
    lot_id: String(lotId),
  };
}

export interface DeleteManualSaleParams {
  db: Db;
  investmentId: string;
  saleLogId: string;
}

export async function deleteManualSale(
  params: DeleteManualSaleParams
): Promise<DeleteManualSaleResult> {
  if (!ObjectId.isValid(params.investmentId)) return { status: "not-found" };
  if (!ObjectId.isValid(params.saleLogId)) return { status: "not-found" };
  const invObjId = new ObjectId(params.investmentId);
  const saleObjId = new ObjectId(params.saleLogId);

  const inv = await params.db
    .collection<Investment>(COL_INVESTMENTS)
    .findOne({ _id: invObjId }, { projection: { status: 1 } });
  if (!inv) return { status: "not-found" };
  if (inv.status !== "listing") return { status: "frozen" };

  const sale = await params.db
    .collection<InvestmentSaleLog>(COL_INVESTMENT_SALE_LOG)
    .findOne({ _id: saleObjId, investment_id: invObjId });
  if (!sale) return { status: "not-found" };
  if (!sale.manual) return { status: "not-manual" };

  const proceedsDelta = sale.qty * sale.net_per_unit_eur;

  // Reverse the lot mutation. Two modes:
  //   grew_lot=false  →  reverse a "was listed" sale: +qty_remaining, -qty_sold, -proceeds.
  //   grew_lot=true   →  reverse an "off-the-books" sale: -qty_opened, -qty_sold, -proceeds.
  //                       qty_remaining is NOT touched — recording the sale didn't
  //                       change it (the grow and consume cancelled), so the reversal
  //                       must not change it either.
  const incOps: Record<string, number> = {
    qty_sold: -sale.qty,
    proceeds_eur: -proceedsDelta,
  };
  if (sale.grew_lot) {
    incOps.qty_opened = -sale.qty;
  } else {
    incOps.qty_remaining = sale.qty;
  }

  await params.db
    .collection(COL_INVESTMENT_LOTS)
    .updateOne({ _id: sale.lot_id }, { $inc: incOps });
  await params.db
    .collection(COL_INVESTMENT_SALE_LOG)
    .deleteOne({ _id: saleObjId });

  return { status: "ok" };
}
