// Re-attribute already-paid CM sales whose listing comment carries an
// MS-XXXX investment tag but never made it through `consumeSale`.
//
// Why this exists: extension v1.22.0 used the wrong DOM selectors on the
// CM order-detail page (`.product-comments .fst-italic`, which exists on
// the stock listing but NOT on the order detail). Every order item came
// out with `comment: null`, so consumeSale's `parseInvestmentTag` always
// returned null and bailed silently. v1.22.1 reads `data-comment` from
// the row directly, which is what CM exposes on the order page.
//
// What this does: scans `dashboard_cm_order_items` for any row whose
// `comment` parses to MS-XXXX, finds the matching investment + lot
// tuple, and runs the same sale_log + lot decrement that consumeSale
// would have. Idempotent: skips items that already have a sale_log
// entry for (investment_id, order_id, article_id).
//
// Usage:
//   npx tsx scripts/backfill-tagged-sales.ts             # dry run
//   npx tsx scripts/backfill-tagged-sales.ts --apply
//   npx tsx scripts/backfill-tagged-sales.ts --order=1273057131 --apply

try {
  process.loadEnvFile(".env");
} catch {
  // .env missing
}

import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import { getDb, getClient } from "../lib/mongodb";
import { parseInvestmentTag } from "../lib/investments/codes";

interface OrderItemDoc {
  _id: ObjectId;
  orderId: string;
  articleId?: string;
  productId?: string | number;
  name: string;
  set: string;
  condition: string;
  language?: string;
  foil?: boolean;
  qty: number;
  price: number;
  comment?: string | null;
}

interface OrderDoc {
  orderId: string;
  status?: string;
  trustee?: boolean;
  stockProcessed?: boolean;
}

async function attributeOne(
  db: Db,
  apply: boolean,
  item: OrderItemDoc,
  code: string
): Promise<{ status: string; detail?: string }> {
  const productIdNum = typeof item.productId === "number" ? item.productId : Number(item.productId);
  if (!Number.isFinite(productIdNum) || productIdNum <= 0) {
    return { status: "skip-no-product-id" };
  }

  const inv = await db
    .collection("dashboard_investments")
    .findOne({ code, status: { $in: ["listing", "closed"] } });
  if (!inv) return { status: "skip-no-investment", detail: code };

  const order = await db
    .collection<OrderDoc>("dashboard_cm_orders")
    .findOne({ orderId: item.orderId }, { projection: { trustee: 1, status: 1 } });
  if (!order) return { status: "skip-no-order" };

  // Mirror consumeSale's idempotence: refuse to insert if a sale_log row
  // already exists for this (investment, order, article). articleId is
  // the natural per-listing key; fall back to (investment, order, cm_id,
  // tuple) when absent so very old items still match.
  const dupFilter: Record<string, unknown> = {
    investment_id: inv._id,
    order_id: item.orderId,
  };
  if (item.articleId) dupFilter.article_id = item.articleId;
  else {
    dupFilter.cardmarket_id = productIdNum;
    dupFilter.foil = !!item.foil;
    dupFilter.condition = item.condition;
    dupFilter.language = item.language || "English";
  }
  const existing = await db.collection("dashboard_investment_sale_log").findOne(dupFilter);
  if (existing) return { status: "skip-already-attributed" };

  const lot = await db
    .collection("dashboard_investment_lots")
    .findOne<{ _id: ObjectId; qty_remaining: number; qty_sold: number; qty_opened: number }>({
      investment_id: inv._id,
      cardmarket_id: productIdNum,
      foil: !!item.foil,
      condition: item.condition,
      language: item.language || "English",
    });
  if (!lot) return { status: "skip-no-lot" };

  const qtySold = Number(item.qty) || 1;
  const take = Math.min(lot.qty_remaining, qtySold);
  if (take <= 0) return { status: "skip-no-remaining-qty" };

  const trustee = !!order.trustee;
  const feeRate = 0.05 + (trustee ? 0.01 : 0);
  const unitPrice = Number(item.price) || 0;
  const netPerUnit = unitPrice * (1 - feeRate);

  if (apply) {
    const logInsert = await db.collection("dashboard_investment_sale_log").insertOne({
      lot_id: lot._id,
      investment_id: inv._id,
      order_id: item.orderId,
      article_id: item.articleId,
      cardmarket_id: productIdNum,
      foil: !!item.foil,
      condition: item.condition,
      language: item.language || "English",
      qty: take,
      unit_price_eur: unitPrice,
      net_per_unit_eur: netPerUnit,
      attributed_at: new Date(),
    });
    const updated = await db
      .collection("dashboard_investment_lots")
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
      await db
        .collection("dashboard_investment_sale_log")
        .deleteOne({ _id: logInsert.insertedId });
      return { status: "fail-lot-update-race" };
    }
  }

  return {
    status: apply ? "attributed" : "would-attribute",
    detail: `qty=${take} unit=${unitPrice.toFixed(2)} net/u=${netPerUnit.toFixed(4)}`,
  };
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const orderArg = process.argv
    .find((a) => a.startsWith("--order="))
    ?.slice("--order=".length);

  const db = await getDb();

  const filter: Record<string, unknown> = { comment: { $regex: "MS-[0-9A-Fa-f]{4}", $options: "i" } };
  if (orderArg) filter.orderId = orderArg;

  const items = await db
    .collection<OrderItemDoc>("dashboard_cm_order_items")
    .find(filter)
    .toArray();

  console.log(`Mode: ${apply ? "APPLY" : "DRY RUN"}${orderArg ? ` (order=${orderArg})` : ""}`);
  console.log(`Order items with parseable MS-XXXX comment: ${items.length}\n`);

  const tally: Record<string, number> = {};
  for (const item of items) {
    const code = parseInvestmentTag(item.comment);
    if (!code) continue;
    const r = await attributeOne(db, apply, item, code);
    tally[r.status] = (tally[r.status] ?? 0) + 1;
    const detail = r.detail ? ` [${r.detail}]` : "";
    console.log(
      `  ${r.status.padEnd(26)}  ${code}  order=${item.orderId}  art=${item.articleId ?? "—"}  ${item.name}${detail}`
    );
  }

  console.log(`\n══════ SUMMARY ══════`);
  for (const [k, v] of Object.entries(tally)) console.log(`  ${k.padEnd(26)} ${v}`);
  if (!apply) console.log(`\nDry run only. Re-run with --apply to write.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    const c = await getClient();
    await c.close();
  });
