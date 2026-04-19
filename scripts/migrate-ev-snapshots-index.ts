// Drops the legacy {set_code: 1, date: -1} unique index on dashboard_ev_snapshots
// and replaces it with the compound {set_code: 1, product_slug: 1, date: 1}
// unique index required to host both set and product snapshots in the same
// collection.
//
// Safe to run multiple times — checks existence before dropping/creating.
//
//   npx tsx scripts/migrate-ev-snapshots-index.ts

try { process.loadEnvFile(".env"); } catch {}

import { getDb, getClient } from "../lib/mongodb";

const COL = "dashboard_ev_snapshots";
const LEGACY = "set_code_date_unique";
const NEW = "set_code_product_slug_date_unique";

async function main() {
  const db = await getDb();
  const indexes = await db.collection(COL).listIndexes().toArray();
  const names = new Set(indexes.map((i) => i.name));

  if (names.has(LEGACY)) {
    console.log(`Dropping legacy index: ${LEGACY}`);
    await db.collection(COL).dropIndex(LEGACY);
  } else {
    console.log(`Legacy index ${LEGACY} not present — skipping drop.`);
  }

  if (names.has(NEW)) {
    console.log(`New index ${NEW} already present — skipping create.`);
  } else {
    console.log(`Creating new compound index: ${NEW}`);
    await db
      .collection(COL)
      .createIndex(
        { set_code: 1, product_slug: 1, date: 1 },
        { unique: true, name: NEW }
      );
  }

  const after = await db.collection(COL).listIndexes().toArray();
  console.log(`  ${COL} indexes: ${after.map((i) => i.name).join(", ")}`);
  await (await getClient()).close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
