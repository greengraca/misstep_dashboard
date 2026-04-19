// Applies the indexes declared in lib/ev.ts#ensureIndexes against the live
// DB. Useful after adding new indexes to that list without needing a full
// refreshAllScryfall run.
//
//   npx tsx scripts/apply-ev-indexes.ts

try { process.loadEnvFile(".env"); } catch {}

import { getDb, getClient } from "../lib/mongodb";

async function main() {
  const db = await getDb();
  await Promise.all([
    db.collection("dashboard_ev_sets").createIndex({ name: 1 }, { name: "name" }),
    db.collection("dashboard_ev_cards").createIndex({ set: 1, name: 1 }, { name: "set_name" }),
  ]);
  console.log("Indexes ensured on dashboard_ev_sets, dashboard_ev_cards");
  for (const c of ["dashboard_ev_sets", "dashboard_ev_cards"]) {
    const idxs = await db.collection(c).listIndexes().toArray();
    console.log(`  ${c}: ${idxs.map((i) => i.name).join(", ")}`);
  }
  await (await getClient()).close();
}

main().catch((e) => { console.error(e); process.exit(1); });
