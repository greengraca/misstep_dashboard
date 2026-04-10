/**
 * One-shot script: writes a single enriched stock snapshot using the
 * current state of dashboard_cm_stock. Run once after deploying the
 * stock tab so the chart has a data point on day one.
 *
 * Run with: `npx tsx scripts/backfill-stock-snapshot.ts`
 * (or via a temporary invocation from `npm run dev` server code if tsx
 * isn't installed — see the README section "Backfill" if added).
 */
import { getDb } from "@/lib/mongodb";
import { COLLECTION_PREFIX } from "@/lib/constants";
import { computeStockCounts } from "@/lib/stock";

async function main() {
  const db = await getDb();
  const col = db.collection(`${COLLECTION_PREFIX}cm_stock_snapshots`);
  const counts = await computeStockCounts();
  const now = new Date().toISOString();

  const doc = {
    totalListings: counts.totalListings,
    totalQty: counts.totalQty,
    totalValue: counts.totalValue,
    distinctNameSet: counts.distinctNameSet,
    extractedAt: now,
    submittedBy: "backfill",
  };

  await col.insertOne(doc);
  console.log("Inserted backfill snapshot:", doc);
  process.exit(0);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
