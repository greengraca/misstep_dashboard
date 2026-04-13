/**
 * One-shot script: sets direction="sale" on all orders where direction
 * is null, empty, or missing. Safe to re-run (idempotent).
 *
 * Run with: `npx tsx scripts/backfill-order-direction.ts`
 */
import { getDb } from "@/lib/mongodb";
import { COLLECTION_PREFIX } from "@/lib/constants";

async function main() {
  const db = await getDb();
  const col = db.collection(`${COLLECTION_PREFIX}cm_orders`);

  const result = await col.updateMany(
    { $or: [{ direction: null }, { direction: "" }, { direction: { $exists: false } }] },
    { $set: { direction: "sale" } }
  );

  console.log(`Backfilled ${result.modifiedCount} orders with direction="sale"`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
