// scripts/backfill-stock-processed.ts
//
// One-shot backfill: every sale order currently at status >= paid that
// already has matching cm_order_items rows DID get its stock decrement
// run via the legacy code path. Stamp `stockProcessed: true` on those
// orders so the new catch-up branch in processOrderDetail (Bug 1 fix)
// doesn't re-decrement them. Also lets the cancellation handler restock
// only when stockProcessed=true (Bug 2 fix).
//
// Orders that are past paid but have NO items synced (e.g. order
// 1272008791 at the time of the audit, paid via orders-list with detail
// never synced) are LEFT ALONE. Their stock was never decremented;
// stockProcessed stays unset; visiting the detail page once will
// catch-up-decrement and stamp the flag.
//
// Idempotent: safe to re-run. Updates only orders missing the flag.
//
// Usage:
//   Dry-run:  npx tsx scripts/backfill-stock-processed.ts
//   Apply:    npx tsx scripts/backfill-stock-processed.ts --apply

try {
  process.loadEnvFile(".env");
} catch {
  // .env missing — MONGODB_URI check below will fail with a useful error.
}

import { getDb } from "../lib/mongodb";
import { COLLECTION_PREFIX } from "../lib/constants";

const COL_ORDERS = `${COLLECTION_PREFIX}cm_orders`;
const COL_ORDER_ITEMS = `${COLLECTION_PREFIX}cm_order_items`;

async function main() {
  const apply = process.argv.includes("--apply");
  const db = await getDb();
  const orders = db.collection(COL_ORDERS);
  const items = db.collection(COL_ORDER_ITEMS);

  // Past-paid sale orders that don't yet have stockProcessed set.
  const candidates = await orders
    .find<{ orderId: string; status: string; itemCount?: number }>(
      {
        direction: { $in: ["sale", null] },
        status: { $in: ["paid", "sent", "arrived"] },
        stockProcessed: { $ne: true },
      },
      { projection: { orderId: 1, status: 1, itemCount: 1 } }
    )
    .toArray();

  console.log(`Past-paid sale orders missing stockProcessed: ${candidates.length}`);

  // Distinct orderIds that have items in cm_order_items. We use a single
  // distinct() instead of N findOne()s — cheaper and authoritative.
  const allOrderIds = candidates.map((c) => c.orderId);
  const idsWithItems = new Set<string>(
    (await items.distinct("orderId", {
      orderId: { $in: allOrderIds },
    })) as string[]
  );

  const toMark = candidates.filter((c) => idsWithItems.has(c.orderId));
  const skipped = candidates.filter((c) => !idsWithItems.has(c.orderId));

  console.log(`  → with items synced (will mark stockProcessed=true): ${toMark.length}`);
  console.log(`  → no items synced (left alone, will catch up on detail visit): ${skipped.length}`);

  if (skipped.length) {
    console.log(`\nSkipped orderIds (catch-up will fire when their detail page is next synced):`);
    for (const s of skipped.slice(0, 20)) {
      console.log(`  ${s.orderId}  status=${s.status}  itemCount=${s.itemCount ?? "?"}`);
    }
    if (skipped.length > 20) console.log(`  …and ${skipped.length - 20} more`);
  }

  if (!toMark.length) {
    console.log("\nNothing to mark. Done.");
    return;
  }

  if (!apply) {
    console.log(`\nDry run. Pass --apply to set stockProcessed=true on ${toMark.length} order doc(s).`);
    return;
  }

  const result = await orders.updateMany(
    { orderId: { $in: toMark.map((o) => o.orderId) }, stockProcessed: { $ne: true } },
    { $set: { stockProcessed: true } }
  );
  console.log(`\nUpdated ${result.modifiedCount} order doc(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
