// One-shot: applies the current TTL_DAYS from lib/ev-price-history.ts to
// the existing index. Safe to re-run.
//
//   npx tsx scripts/apply-price-history-ttl.ts

try {
  process.loadEnvFile(".env");
} catch {
  // .env missing — MONGODB_URI check inside getDb will surface a useful error.
}

import { getDb, getClient } from "../lib/mongodb";
import { ensureIndexes, COL_PRICE_HISTORY } from "../lib/ev-price-history";

async function main() {
  const db = await getDb();
  await ensureIndexes(db);
  const col = db.collection(COL_PRICE_HISTORY);
  const indexes = await col.listIndexes().toArray();
  console.log(`Indexes on ${COL_PRICE_HISTORY}:`);
  for (const i of indexes) {
    const ttl = i.expireAfterSeconds != null ? ` expireAfter=${i.expireAfterSeconds}s (${(i.expireAfterSeconds / 86400).toFixed(0)}d)` : "";
    console.log(`  ${i.name}  keys=${JSON.stringify(i.key)}${ttl}`);
  }
  await (await getClient()).close();
}

main().catch((e) => { console.error(e); process.exit(1); });
