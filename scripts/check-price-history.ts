try {
  process.loadEnvFile(".env");
} catch {
  // .env missing — MONGODB_URI check inside getDb will surface a useful error.
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

  const dateRange = await col
    .aggregate([
      { $group: { _id: null, min: { $min: "$d" }, max: { $max: "$d" } } },
    ])
    .toArray();
  if (dateRange[0]) {
    console.log(`Date range:      ${dateRange[0].min.toISOString()} → ${dateRange[0].max.toISOString()}`);
  }

  const withEur = await col.countDocuments({ e: { $ne: null } });
  const withFoil = await col.countDocuments({ f: { $ne: null } });
  const bothNull = await col.countDocuments({ e: null, f: null });
  console.log(`  e (price_eur) non-null:      ${withEur}`);
  console.log(`  f (price_eur_foil) non-null: ${withFoil}`);
  console.log(`  both null:                   ${bothNull}`);

  console.log("\nSample snapshots:");
  const samples = await col.find({}).limit(5).toArray();
  for (const s of samples) {
    console.log(`  ${JSON.stringify(s)}`);
  }

  // Cross-check: pick one random snapshot and verify it matches the source
  // ev_cards.price_eur for that scryfall_id.
  console.log("\nCross-check against ev_cards:");
  const checkSample = await col.aggregate([{ $sample: { size: 3 } }]).toArray();
  for (const snap of checkSample) {
    const card = await db.collection("dashboard_ev_cards").findOne({ scryfall_id: snap.s });
    if (!card) { console.log(`  ${snap.s} — NO MATCH in ev_cards`); continue; }
    const eMatch = card.price_eur === snap.e ? "✓" : "✗";
    const fMatch = card.price_eur_foil === snap.f ? "✓" : "✗";
    console.log(
      `  ${card.name.padEnd(30)} (${card.set}) ${eMatch} e=${snap.e} vs card.price_eur=${card.price_eur}, ${fMatch} f=${snap.f} vs card.price_eur_foil=${card.price_eur_foil}`
    );
  }

  await (await getClient()).close();
}

main().catch((e) => { console.error(e); process.exit(1); });
