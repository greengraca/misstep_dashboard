try {
  process.loadEnvFile(".env");
} catch {
  // .env missing
}

import { getDb, getClient } from "../lib/mongodb";
import { COL_PRICE_HISTORY } from "../lib/ev-price-history";

async function main() {
  const db = await getDb();
  const col = db.collection(COL_PRICE_HISTORY);

  const total = await col.countDocuments({});
  console.log(`Total snapshots: ${total}`);

  const distinctCards = await col.distinct("s");
  console.log(`Distinct cards with at least one snapshot: ${distinctCards.length}`);

  // Per-date counts
  const byDate = await col
    .aggregate([
      { $group: { _id: "$d", n: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ])
    .toArray();
  console.log("\nSnapshots per sync:");
  for (const row of byDate) {
    console.log(`  ${row._id.toISOString()}   ${row.n} inserts`);
  }

  // Cards with more than one snapshot (i.e. changed between syncs)
  const changed = await col
    .aggregate([
      { $group: { _id: "$s", n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
      { $limit: 20 },
    ])
    .toArray();
  console.log(`\nCards with >1 snapshot (sampled 20):`);
  for (const c of changed.slice(0, 10)) {
    const snaps = await col.find({ s: c._id }).sort({ d: 1 }).toArray();
    const card = await db.collection("dashboard_ev_cards").findOne({ scryfall_id: c._id });
    console.log(`  ${(card?.name ?? "?").padEnd(32)} (${card?.set ?? "?"})`);
    for (const s of snaps) {
      console.log(`    ${s.d.toISOString()}  e=${s.e}  f=${s.f}`);
    }
  }

  await (await getClient()).close();
}

main().catch((e) => { console.error(e); process.exit(1); });
