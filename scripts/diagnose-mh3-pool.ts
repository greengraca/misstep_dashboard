// Diagnose what's currently in MH3's resolved pool — proves whether the new
// VIRTUAL_POOLS code path affects MH3 (it shouldn't: mh3 isn't registered).
// Run on the same DB your localhost is using.
//
//   npx tsx scripts/diagnose-mh3-pool.ts
//
// Expected: mh3 cards count + m3c + spg counts identical to what production
// would return. If localhost shows a different pool size than production,
// the DB itself diverged (separate Mongo, or a sync ran) — not my code.

try {
  process.loadEnvFile(".env");
} catch {
  // MONGODB_URI must be exported manually then.
}

import { getClient, getDb } from "../lib/mongodb";
import { getCardsForSet, collectExtraSetCodes, getConfig, getDefaultPlayBoosterConfig } from "../lib/ev";
import { effectivePriceWithFallback } from "../lib/ev-prices";

async function main(): Promise<void> {
  const db = await getDb();

  // Raw counts — independent of getCardsForSet, just to see what's in the DB.
  const rawMh3 = await db.collection("dashboard_ev_cards").countDocuments({ set: "mh3" });
  const rawM3c = await db.collection("dashboard_ev_cards").countDocuments({ set: "m3c" });
  const rawSpg = await db.collection("dashboard_ev_cards").countDocuments({ set: "spg" });
  const rawPlst = await db.collection("dashboard_ev_cards").countDocuments({ set: "plst" });
  const rawMb2List = await db.collection("dashboard_ev_cards").countDocuments({ set: "mb2-list" });

  console.log("=== Raw counts in dashboard_ev_cards ===");
  console.log(`  set: "mh3"      : ${rawMh3}`);
  console.log(`  set: "m3c"      : ${rawM3c}`);
  console.log(`  set: "spg"      : ${rawSpg}`);
  console.log(`  set: "plst"     : ${rawPlst}`);
  console.log(`  set: "mb2-list" : ${rawMb2List}    (should be 0 after migration)`);

  // What getCardsForSet returns for mh3 + extras (this is what the calc sees).
  const { cards: mh3Cards, total: mh3Total } = await getCardsForSet("mh3", { boosterOnly: false, limit: 10000 });
  const config = await getConfig("mh3");
  if (!config) {
    console.log("\nNo saved config for mh3 — calc would fall back to defaults.");
    return;
  }
  const tentative = config;
  const extraCodes = new Set<string>();
  if (tentative.play_booster) for (const c of collectExtraSetCodes(tentative.play_booster, "mh3")) extraCodes.add(c);
  if (tentative.collector_booster) for (const c of collectExtraSetCodes(tentative.collector_booster, "mh3")) extraCodes.add(c);

  console.log(`\n=== getCardsForSet pool composition ===`);
  console.log(`  mh3 cards returned : ${mh3Cards.length} (total ${mh3Total})`);
  console.log(`  Extra set codes from config : ${[...extraCodes].join(", ") || "(none)"}`);

  let totalPool = mh3Cards.length;
  for (const code of extraCodes) {
    const { total } = await getCardsForSet(code, { boosterOnly: false, limit: 10000 });
    console.log(`  ${code} cards : ${total}`);
    totalPool += total;
  }
  console.log(`  TOTAL pool size for calc : ${totalPool}`);

  // Top 20 highest-price MH3 cards as the calc sees them — useful for spotting
  // a price spike that could explain a €475 → €699 EV jump.
  const sample = [...mh3Cards].sort((a, b) => {
    const pa = Math.max(effectivePriceWithFallback(a, false), effectivePriceWithFallback(a, true));
    const pb = Math.max(effectivePriceWithFallback(b, false), effectivePriceWithFallback(b, true));
    return pb - pa;
  }).slice(0, 20);

  console.log(`\n=== Top 20 highest-priced MH3 cards (current effective price) ===`);
  for (const c of sample) {
    const pn = effectivePriceWithFallback(c, false);
    const pf = effectivePriceWithFallback(c, true);
    console.log(`  cn=${c.collector_number.padEnd(5)} ${c.name.padEnd(40)} eur=${pn.toFixed(2).padStart(8)}  eur_foil=${pf.toFixed(2).padStart(8)}  rarity=${c.rarity}`);
  }

  // Suppress unused-var warning if anyone toggles getDefaultPlayBoosterConfig in.
  void getDefaultPlayBoosterConfig;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await (await getClient()).close();
  });
