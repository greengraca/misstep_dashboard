import { getDb } from "@/lib/mongodb";
import { COLLECTION_PREFIX } from "@/lib/constants";

export const COL_INVESTMENTS = `${COLLECTION_PREFIX}investments`;
export const COL_INVESTMENT_BASELINE = `${COLLECTION_PREFIX}investment_baseline`;
export const COL_INVESTMENT_LOTS = `${COLLECTION_PREFIX}investment_lots`;
export const COL_INVESTMENT_SALE_LOG = `${COLLECTION_PREFIX}investment_sale_log`;

let indexesEnsured = false;

export async function ensureInvestmentIndexes(): Promise<void> {
  if (indexesEnsured) return;
  try {
    const db = await getDb();
    await db.collection(COL_INVESTMENTS).createIndex(
      { status: 1, created_at: -1 },
      { name: "status_createdAt" }
    );
    await db.collection(COL_INVESTMENTS).createIndex(
      { "source.set_code": 1, status: 1 },
      { name: "sourceSetCode_status" }
    );
    // Baseline v2 → v3 migration: unique key changes from the 5-field
    // tuple to (investment_id, article_id). A single baseline row can now
    // exist per Cardmarket article_id, so the same card at different prices
    // gets one row per price bucket. Drop the old index if present; ignore
    // errors so fresh DBs and already-migrated DBs both no-op safely.
    try {
      await db.collection(COL_INVESTMENT_BASELINE).dropIndex("baseline_unique_v2");
    } catch {
      /* index didn't exist — fine */
    }
    try {
      await db.collection(COL_INVESTMENT_BASELINE).dropIndex("baseline_unique");
    } catch {
      /* ancient v1 index from before the 5-field rename — fine */
    }
    await db.collection(COL_INVESTMENT_BASELINE).createIndex(
      { investment_id: 1, article_id: 1 },
      { unique: true, name: "baseline_v3_unique" }
    );
    // Attribution joins: maybeGrowLot aggregates baseline rows by the
    // stock tuple (multiple article_ids can share a tuple when priced in
    // different buckets). This secondary index covers that lookup.
    await db.collection(COL_INVESTMENT_BASELINE).createIndex(
      { investment_id: 1, cardmarket_id: 1, foil: 1, condition: 1, language: 1 },
      { name: "baseline_attrib_idx" }
    );
    await db.collection(COL_INVESTMENT_LOTS).createIndex(
      { investment_id: 1, cardmarket_id: 1, foil: 1, condition: 1, language: 1 },
      { unique: true, name: "lot_unique_v2" }
    );
    // Secondary index on (cardmarket_id, foil, condition) WITHOUT language.
    // Retained for debugging/reporting queries that want "all lots for this CM card
    // regardless of language". The production code path in consumeSale uses the
    // full tuple via lot_unique_v2.
    await db.collection(COL_INVESTMENT_LOTS).createIndex(
      { cardmarket_id: 1, foil: 1, condition: 1 },
      { name: "lot_by_card" }
    );
    await db.collection(COL_INVESTMENT_SALE_LOG).createIndex(
      { order_id: 1 },
      { name: "salelog_order_id" }
    );
    await db.collection(COL_INVESTMENT_SALE_LOG).createIndex(
      { lot_id: 1, attributed_at: -1 },
      { name: "salelog_lot_time" }
    );
    indexesEnsured = true;
  } catch {
    indexesEnsured = true;
  }
}
