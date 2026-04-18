try {
  process.loadEnvFile(".env");
} catch {
  // .env missing
}

import { getDb, getClient } from "../lib/mongodb";

async function main() {
  const db = await getDb();
  const stock = db.collection("dashboard_cm_stock");
  const cards = db.collection("dashboard_ev_cards");
  const sets = db.collection("dashboard_ev_sets");

  // Sample some stock rows and check their set format
  const sampleStock = await stock.find({}).limit(10).toArray();
  console.log("== sample stock set values ==");
  for (const s of sampleStock) {
    console.log(`  name="${s.name}"  set="${s.set}"  articleId=${s.articleId ?? "(none)"}  foil=${s.foil}`);
  }

  const distinctStockSets = await stock.distinct("set");
  console.log(`\n== distinct set values in stock: ${distinctStockSets.length} ==`);
  console.log(distinctStockSets.slice(0, 10));

  // How many of those match ev_sets.code vs ev_sets.name?
  const setDocs = await sets.find({ code: { $in: distinctStockSets } }).project({ code: 1, name: 1 }).toArray();
  const matchByCode = setDocs.length;
  const setDocsByName = await sets.find({ name: { $in: distinctStockSets } }).project({ code: 1, name: 1 }).toArray();
  const matchByName = setDocsByName.length;
  console.log(`\n== join strategy test ==`);
  console.log(`  matches ev_sets.code:  ${matchByCode} / ${distinctStockSets.length}`);
  console.log(`  matches ev_sets.name:  ${matchByName} / ${distinctStockSets.length}`);

  // Pick one sample stock row, try to find its ev_cards match
  const sample = sampleStock[0];
  if (sample) {
    console.log(`\n== trying to match "${sample.name}" / "${sample.set}" to ev_cards ==`);
    const byNameSet = await cards.findOne({ name: sample.name, set: sample.set });
    console.log(`  direct name+set:           ${byNameSet ? `HIT (scryfall_id=${byNameSet.scryfall_id}, cardmarket_id=${byNameSet.cardmarket_id})` : "miss"}`);

    // If stock.set is the full CM name, we need to look up the code first
    const setMatch = await sets.findOne({ name: sample.set });
    if (setMatch) {
      const byCode = await cards.findOne({ name: sample.name, set: setMatch.code });
      console.log(`  via ev_sets.name→code:     ${byCode ? `HIT (scryfall_id=${byCode.scryfall_id})` : "miss"}`);
    }
  }

  // Overall coverage: how many distinct (name,set) tuples in stock can we resolve to an ev_cards entry?
  const tuples = await stock.aggregate([
    { $group: { _id: { name: "$name", set: "$set" } } },
    { $limit: 5000 },
  ]).toArray();
  console.log(`\n== coverage on ${tuples.length} distinct (name,set) stock tuples ==`);
  let hitsDirect = 0;
  let hitsViaSetName = 0;
  let misses = 0;
  // Build a set-name → set-code map once
  const allSets = await sets.find({}).project({ code: 1, name: 1 }).toArray();
  const nameToCode = new Map(allSets.map((s) => [s.name, s.code]));
  for (const t of tuples) {
    const { name, set } = t._id;
    const direct = await cards.findOne({ name, set });
    if (direct) { hitsDirect++; continue; }
    const code = nameToCode.get(set);
    if (code) {
      const via = await cards.findOne({ name, set: code });
      if (via) { hitsViaSetName++; continue; }
    }
    misses++;
  }
  console.log(`  direct name+set hits:      ${hitsDirect}`);
  console.log(`  via set-name→code hits:    ${hitsViaSetName}`);
  console.log(`  misses:                    ${misses}`);

  await (await getClient()).close();
}

main().catch((e) => { console.error(e); process.exit(1); });
