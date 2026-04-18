// scripts/stock-dedup.ts
//
// Audit + clean up duplicate stock rows. Two kinds of duplicates are
// checked:
//
//   1. HARD duplicates — same `dedupKey`. Shouldn't exist when the unique
//      index is present, but we report anyway as a sanity check.
//
//   2. SOFT duplicates — different `dedupKey` but identical visual fields
//      (name, set, condition, foil, language, qty, price). Happens when
//      the same listing was inserted once via stock_page
//      (dedupKey = name|qty|price|cond|foil|set) and once via product_page
//      (dedupKey = article:{articleId}) because the "claim" step in
//      processProductStock didn't find the stock_page row at the time.
//
// For soft dups, survivor picking prefers rows with articleId set
// (product_page is more authoritative), then most recent lastSeenAt.
//
// Usage:
//   Dry-run:  npx tsx scripts/stock-dedup.ts
//   Apply:    npx tsx scripts/stock-dedup.ts --apply

try {
  process.loadEnvFile(".env");
} catch {
  // .env missing — MONGODB_URI check below will fail with a useful error.
}

import { getDb } from "../lib/mongodb";
import { COLLECTION_PREFIX } from "../lib/constants";
import type { ObjectId } from "mongodb";

const COL_STOCK = `${COLLECTION_PREFIX}cm_stock`;

interface DupRow {
  _id: ObjectId;
  dedupKey: string;
  name: string;
  set: string;
  qty: number;
  price: number;
  condition: string;
  foil: boolean;
  language: string;
  source: string;
  articleId?: string;
  lastSeenAt?: string;
  firstSeenAt?: string;
}

interface DupGroup {
  _id: string; // dedupKey
  count: number;
  docs: DupRow[];
}

async function listIndexes() {
  const db = await getDb();
  const col = db.collection(COL_STOCK);
  const idx = await col.indexes();
  return idx;
}

async function findHardDuplicates(): Promise<DupGroup[]> {
  const db = await getDb();
  const col = db.collection(COL_STOCK);
  const pipeline = [
    {
      $group: {
        _id: "$dedupKey",
        count: { $sum: 1 },
        docs: { $push: "$$ROOT" },
      },
    },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
  ];
  return (await col.aggregate(pipeline).toArray()) as unknown as DupGroup[];
}

/**
 * Soft duplicates: rows that look identical to the user (same visual
 * fields) but have different dedupKeys. Happens when one row came from
 * stock_page and another from product_page.
 */
async function findSoftDuplicates(): Promise<DupGroup[]> {
  const db = await getDb();
  const col = db.collection(COL_STOCK);
  const pipeline = [
    {
      $group: {
        _id: {
          name: "$name",
          set: "$set",
          condition: "$condition",
          foil: "$foil",
          language: "$language",
          qty: "$qty",
          price: "$price",
        },
        count: { $sum: 1 },
        docs: { $push: "$$ROOT" },
      },
    },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
  ];
  const raw = await col.aggregate(pipeline).toArray();
  // Stringify group key so it matches DupGroup shape.
  return raw.map((r) => ({
    _id: JSON.stringify(r._id),
    count: r.count,
    docs: r.docs,
  })) as DupGroup[];
}

/**
 * Pick the survivor from a soft-duplicate group.
 * Priority (highest-to-lowest):
 *   1. Has articleId (product_page is authoritative)
 *   2. Most recent lastSeenAt
 *   3. Highest _id (insertion order as tiebreak)
 */
function pickSurvivor(docs: DupRow[]): DupRow {
  const sorted = [...docs].sort((a, b) => {
    const aHasArticle = a.articleId ? 1 : 0;
    const bHasArticle = b.articleId ? 1 : 0;
    if (aHasArticle !== bHasArticle) return bHasArticle - aHasArticle;
    const la = a.lastSeenAt || "";
    const lb = b.lastSeenAt || "";
    if (la !== lb) return la > lb ? -1 : 1;
    return a._id.toString() > b._id.toString() ? -1 : 1;
  });
  return sorted[0];
}

async function main() {
  const apply = process.argv.includes("--apply");
  const db = await getDb();
  const col = db.collection(COL_STOCK);

  console.log("\n— Indexes on cm_stock —");
  const indexes = await listIndexes();
  for (const idx of indexes) {
    const unique = idx.unique ? " [unique]" : "";
    console.log(`  ${idx.name}: ${JSON.stringify(idx.key)}${unique}`);
  }
  const hasUniqueDedupKey = indexes.some(
    (i) => i.unique && i.key && (i.key as Record<string, unknown>).dedupKey
  );
  console.log(`  → unique dedupKey index present: ${hasUniqueDedupKey}`);

  console.log("\n— Scanning for HARD duplicates (same dedupKey) —");
  const hardGroups = await findHardDuplicates();
  if (!hardGroups.length) {
    console.log("  None.");
  } else {
    const totalHard = hardGroups.reduce((s, g) => s + g.count, 0);
    console.log(
      `  ${hardGroups.length} groups covering ${totalHard} rows — unique index missing or broken`
    );
    for (const g of hardGroups.slice(0, 10)) {
      const sample = g.docs[0];
      console.log(
        `  ${g.count}× ${sample.name} · ${sample.set} · ${sample.condition} · qty ${sample.qty} · €${sample.price}  [${g._id}]`
      );
    }
  }

  console.log("\n— Scanning for SOFT duplicates (different dedupKey, identical fields) —");
  const softGroups = await findSoftDuplicates();
  if (!softGroups.length) {
    console.log("  None.");
  } else {
    const totalSoft = softGroups.reduce((s, g) => s + g.count, 0);
    const wouldDeleteSoft = softGroups.reduce((s, g) => s + g.count - 1, 0);
    console.log(
      `  ${softGroups.length} groups covering ${totalSoft} rows — would delete ${wouldDeleteSoft} to leave ${softGroups.length} survivors`
    );
    console.log("\n  Top 15 offenders:");
    for (const g of softGroups.slice(0, 15)) {
      const sample = g.docs[0];
      const articleIds = g.docs
        .map((d) => d.articleId || "—")
        .join(", ");
      const sources = Array.from(new Set(g.docs.map((d) => d.source))).join("+");
      console.log(
        `  ${g.count}× ${sample.name} · ${sample.set} · ${sample.condition} · ${sample.foil ? "foil" : "non-foil"} · ${sample.language} · qty ${sample.qty} · €${sample.price}`
      );
      console.log(`         sources=${sources}  articleIds=[${articleIds}]`);
    }
  }

  if (!hardGroups.length && !softGroups.length) {
    console.log("\nNothing to clean.");
    return;
  }

  if (!apply) {
    console.log(
      "\nDry run. Pass --apply to delete duplicate rows (hard + soft, keeping one survivor each)."
    );
    return;
  }

  console.log("\n— Applying cleanup —");
  let deleted = 0;
  for (const g of [...hardGroups, ...softGroups]) {
    const survivor = pickSurvivor(g.docs);
    const toDelete = g.docs.filter(
      (d) => d._id.toString() !== survivor._id.toString()
    );
    if (!toDelete.length) continue;
    const res = await col.deleteMany({
      _id: { $in: toDelete.map((d) => d._id) },
    });
    deleted += res.deletedCount || 0;
  }
  console.log(`  Deleted ${deleted} rows`);

  if (hardGroups.length) {
    console.log("\n— Re-creating unique dedupKey index —");
    try {
      await col.createIndex({ dedupKey: 1 }, { unique: true, name: "dedupKey_1" });
      console.log("  + dedupKey_1 (unique) confirmed");
    } catch (err) {
      console.log(`  ! failed: ${(err as Error).message}`);
    }
  }

  console.log("\nDone.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
