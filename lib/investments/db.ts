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
    await db.collection(COL_INVESTMENT_BASELINE).createIndex(
      { investment_id: 1, cardmarket_id: 1, foil: 1, condition: 1 },
      { unique: true, name: "baseline_unique" }
    );
    await db.collection(COL_INVESTMENT_LOTS).createIndex(
      { investment_id: 1, cardmarket_id: 1, foil: 1, condition: 1 },
      { unique: true, name: "lot_unique" }
    );
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
