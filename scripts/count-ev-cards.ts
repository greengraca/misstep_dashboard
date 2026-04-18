try {
  process.loadEnvFile(".env");
} catch {
  // .env missing — MONGODB_URI check below will fail with a useful error.
}

import { getDb, getClient } from "../lib/mongodb";

const BOOSTER_SET_TYPES = ["expansion", "masters", "draft_innovation", "core", "funny"];
const MIN_RELEASE_YEAR = 2020;

async function main() {
  const db = await getDb();
  const cards = db.collection("dashboard_ev_cards");
  const sets = db.collection("dashboard_ev_sets");

  const totalCards = await cards.countDocuments({});
  const totalSets = await sets.countDocuments({});

  const filteredSets = await sets
    .find({
      set_type: { $in: BOOSTER_SET_TYPES },
      released_at: { $gte: `${MIN_RELEASE_YEAR}-01-01` },
      $or: [{ digital: { $ne: true } }, { digital: { $exists: false } }],
    })
    .project({ code: 1 })
    .toArray();

  const filteredSetCodes = filteredSets.map((s) => s.code);
  const cardsInFilteredSets = await cards.countDocuments({ set: { $in: filteredSetCodes } });

  const withCardmarketId = await cards.countDocuments({ cardmarket_id: { $ne: null } });
  const withCmPrices = await cards.countDocuments({ cm_prices: { $exists: true } });
  const withCmPricesNonfoil = await cards.countDocuments({ "cm_prices.nonfoil": { $exists: true } });
  const withCmPricesFoil = await cards.countDocuments({ "cm_prices.foil": { $exists: true } });

  console.log("== dashboard_ev_sets ==");
  console.log(`  total sets:                      ${totalSets}`);
  console.log(`  sets matching EV UI filter:      ${filteredSets.length} (booster types, released >= ${MIN_RELEASE_YEAR}-01-01, non-digital)`);
  console.log();
  console.log("== dashboard_ev_cards ==");
  console.log(`  total cards in DB:               ${totalCards}`);
  console.log(`  cards in EV-filtered sets:       ${cardsInFilteredSets}`);
  console.log(`  cards with cardmarket_id:        ${withCardmarketId}`);
  console.log(`  cards with any cm_prices:        ${withCmPrices}`);
  console.log(`    - with cm_prices.nonfoil:      ${withCmPricesNonfoil}`);
  console.log(`    - with cm_prices.foil:         ${withCmPricesFoil}`);

  const sample = await cards.findOne({ "cm_prices.nonfoil": { $exists: true } });
  if (sample) {
    console.log();
    console.log("== sample card with cm_prices ==");
    console.log(JSON.stringify(sample, null, 2));
  }

  console.log();
  console.log("== storage stats ==");
  const stats = await db.command({ collStats: "dashboard_ev_cards" });
  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(2)} MB`;
  console.log(`  count:            ${stats.count}`);
  console.log(`  size (uncompressed documents):  ${mb(stats.size)}`);
  console.log(`  storageSize (on-disk, compressed): ${mb(stats.storageSize)}`);
  console.log(`  totalIndexSize:   ${mb(stats.totalIndexSize)}`);
  console.log(`  avgObjSize:       ${stats.avgObjSize} bytes`);
  console.log(`  totalSize:        ${mb(stats.totalSize ?? stats.storageSize + stats.totalIndexSize)}`);

  const dbStats = await db.command({ dbStats: 1, scale: 1 });
  console.log();
  console.log("== database totals ==");
  console.log(`  collections:      ${dbStats.collections}`);
  console.log(`  dataSize:         ${mb(dbStats.dataSize)}`);
  console.log(`  storageSize:      ${mb(dbStats.storageSize)}`);
  console.log(`  indexSize:        ${mb(dbStats.indexSize)}`);
  console.log(`  totalSize:        ${mb(dbStats.totalSize ?? dbStats.storageSize + dbStats.indexSize)}`);

  console.log();
  console.log("== per-collection breakdown (sorted by on-disk total) ==");
  const colls = await db.listCollections({}, { nameOnly: true }).toArray();
  const rows: Array<{ name: string; count: number; dataSize: number; storageSize: number; indexSize: number; total: number; avg: number }> = [];
  for (const c of colls) {
    try {
      const s = await db.command({ collStats: c.name });
      rows.push({
        name: c.name,
        count: s.count,
        dataSize: s.size,
        storageSize: s.storageSize,
        indexSize: s.totalIndexSize,
        total: s.storageSize + s.totalIndexSize,
        avg: s.avgObjSize || 0,
      });
    } catch {
      // skip views / system colls
    }
  }
  rows.sort((a, b) => b.total - a.total);
  const pad = (s: string, n: number) => s.padEnd(n);
  console.log(pad("collection", 42) + pad("count", 10) + pad("data", 12) + pad("storage", 12) + pad("indexes", 12) + pad("total", 12) + "avg");
  for (const r of rows) {
    console.log(
      pad(r.name, 42) +
        pad(String(r.count), 10) +
        pad(mb(r.dataSize), 12) +
        pad(mb(r.storageSize), 12) +
        pad(mb(r.indexSize), 12) +
        pad(mb(r.total), 12) +
        `${r.avg}B`
    );
  }

  await (await getClient()).close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
