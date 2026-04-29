try { process.loadEnvFile(".env"); } catch {}
import { getDb, getClient } from "../lib/mongodb";

async function main() {
  const db = await getDb();
  const cards = db.collection("dashboard_ev_cards");

  // The 6 borderless cards tagged BOTH boosterfun AND startercollection
  const docs = await cards.find({
    set: "fdn",
    treatment: "borderless",
    promo_types: { $all: ["boosterfun", "startercollection"] },
  }).project({
    collector_number: 1, name: 1, rarity: 1, promo_types: 1, frame_effects: 1, finishes: 1, type_line: 1, booster: 1
  }).sort({ collector_number: 1 }).toArray();

  console.log(`\nBorderless cards tagged BOTH boosterfun AND startercollection: ${docs.length}\n`);
  for (const c of docs as any[]) {
    console.log(`  cn=${c.collector_number} ${c.name.padEnd(28)} rarity=${c.rarity}  promo=[${(c.promo_types??[]).join(",")}]  fin=${(c.finishes??[]).join("+")}  booster=${c.booster}`);
  }
  const byRarity: Record<string, number> = {};
  for (const c of docs as any[]) byRarity[c.rarity] = (byRarity[c.rarity] ?? 0) + 1;
  console.log(`\nRarity breakdown: ${JSON.stringify(byRarity)}`);

  // Also: confirm the FULL borderless boosterfun pool (excluding manafoil/jpshowcase/fracturefoil) C/U/R/M
  const full = await cards.find({
    set: "fdn",
    treatment: "borderless",
    promo_types: { $all: ["boosterfun"], $nin: ["manafoil", "japanshowcase", "fracturefoil"] },
  }).project({ collector_number:1, name:1, rarity:1, promo_types:1 }).sort({ collector_number: 1 }).toArray();

  const fullByRarity: Record<string, number> = {};
  for (const c of full as any[]) fullByRarity[c.rarity] = (fullByRarity[c.rarity] ?? 0) + 1;
  console.log(`\nFULL play-booster borderless pool (boosterfun, no manafoil/jp/fracturefoil): ${full.length} cards`);
  console.log(`  by rarity: ${JSON.stringify(fullByRarity)}`);

  // Print the C and U specifically
  const fullC = (full as any[]).filter(c => c.rarity === "common");
  const fullU = (full as any[]).filter(c => c.rarity === "uncommon");
  console.log(`\n  Common (${fullC.length}):`);
  for (const c of fullC) console.log(`    cn=${c.collector_number} ${c.name}  promo=[${(c.promo_types??[]).join(",")}]`);
  console.log(`\n  Uncommon (${fullU.length}):`);
  for (const c of fullU) console.log(`    cn=${c.collector_number} ${c.name}  promo=[${(c.promo_types??[]).join(",")}]`);

  await (await getClient()).close();
}
main().catch(e=>{console.error(e);process.exit(1);});
