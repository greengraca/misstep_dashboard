try { process.loadEnvFile(".env"); } catch {}
import { getDb, getClient } from "../lib/mongodb";

async function main() {
  const db = await getDb();
  const cards = db.collection("dashboard_ev_cards");

  // setextension
  const se = await cards.find({ set: "fdn", promo_types: "setextension" })
    .project({ collector_number:1, name:1, rarity:1, treatment:1, type_line:1, promo_types:1, frame_effects:1, finishes:1 })
    .sort({ collector_number: 1 })
    .toArray();
  console.log(`\n=== setextension (${se.length}) ===`);
  for (const c of se as any[]) {
    console.log(`  cn=${c.collector_number} ${c.name} rarity=${c.rarity} trt=${c.treatment} type=${c.type_line} promo=${(c.promo_types??[]).join(",")} fe=${(c.frame_effects??[]).join(",")} fin=${(c.finishes??[]).join("+")}`);
  }

  // Mainline with booster=true (correct definition)
  const main = await cards.find({ set: "fdn", booster: true, treatment: "normal" })
    .project({ collector_number:1, name:1, rarity:1, type_line:1, promo_types:1 })
    .toArray();
  const cnInt = (c:any)=>parseInt(c.collector_number,10);
  const sorted = main.sort((a:any,b:any)=>cnInt(a)-cnInt(b));
  console.log(`\n=== Mainline (booster=true, treatment=normal): ${main.length} ===`);
  const isBL = (c:any) => /Basic Land/.test(c.type_line ?? "");
  console.log(`  basic lands among them: ${main.filter((c:any)=>isBL(c)).length}`);
  const nonBL = main.filter((c:any)=>!isBL(c));
  console.log(`  non-basics: ${nonBL.length}`);
  const r = (rar:string)=>nonBL.filter((c:any)=>c.rarity===rar).length;
  console.log(`  C: ${r("common")}, U: ${r("uncommon")}, R: ${r("rare")}, M: ${r("mythic")}`);
  // CN distribution
  const cnsNonBL = nonBL.map((c:any)=>cnInt(c)).sort((a:number,b:number)=>a-b);
  console.log(`  CN range non-basics: ${cnsNonBL[0]}–${cnsNonBL[cnsNonBL.length-1]}`);
  // Print high-CN ones to see what they are
  console.log(`  high-CN (>271) booster=true normal cards:`);
  for (const c of nonBL as any[]) {
    if (cnInt(c) > 271) console.log(`    cn=${c.collector_number} ${c.name} rarity=${c.rarity} type=${c.type_line} promo=${(c.promo_types??[]).join(",")}`);
  }

  // Extended art with proper CN range (442-487)
  const ea = await cards.find({ set: "fdn", treatment: "extended_art" })
    .project({ collector_number:1, name:1, rarity:1, promo_types:1, frame_effects:1, finishes:1 })
    .sort({ collector_number: 1 })
    .toArray();
  console.log(`\n=== Extended art (${ea.length}) ===`);
  const eaCns = (ea as any[]).map(c=>cnInt(c)).sort((a:number,b:number)=>a-b);
  console.log(`  CN range: ${eaCns[0]}–${eaCns[eaCns.length-1]}`);
  // Are any in the 700s?
  const ea700 = (ea as any[]).filter(c=>cnInt(c)>=700);
  console.log(`  EA in CN ≥700: ${ea700.length}`);
  for (const c of ea700.slice(0,20)) console.log(`    cn=${c.collector_number} ${c.name} rarity=${c.rarity} promo=${(c.promo_types??[]).join(",")} fin=${(c.finishes??[]).join("+")}`);
  // EA in 442-487 range
  const ea442 = (ea as any[]).filter(c=>cnInt(c)>=442 && cnInt(c)<=487);
  const ea442R = ea442.filter(c=>c.rarity==="rare").length;
  const ea442M = ea442.filter(c=>c.rarity==="mythic").length;
  console.log(`  EA in CN 442-487: ${ea442.length} (R: ${ea442R}, M: ${ea442M})`);

  // Look at Anything tagged "character" or with "character" in name/type
  const charCands = await cards.find({ set: "fdn", $or: [
    { promo_types: { $in: ["character", "characterland"] } },
    { name: { $regex: /Character/, $options: "i" } },
  ] }).toArray();
  console.log(`\n=== "character" candidates: ${charCands.length} ===`);

  // beginnerbox - what does it consist of?
  const bb = await cards.find({ set: "fdn", promo_types: "beginnerbox" })
    .project({ collector_number:1, name:1, rarity:1, treatment:1, type_line:1, finishes:1 })
    .sort({ collector_number: 1 })
    .toArray();
  const bbBL = (bb as any[]).filter(c=>/Basic Land/.test(c.type_line??""));
  const bbNonBL = (bb as any[]).filter(c=>!/Basic Land/.test(c.type_line??""));
  console.log(`\n=== beginnerbox (${bb.length}, basics: ${bbBL.length}, non-basics: ${bbNonBL.length}) ===`);
  console.log(`  basics CN range: ${(bbBL.length?bbBL[0].collector_number:"—")}–${(bbBL.length?bbBL[bbBL.length-1].collector_number:"—")}`);
  console.log(`  non-basics CN range: ${(bbNonBL.length?bbNonBL[0].collector_number:"—")}–${(bbNonBL.length?bbNonBL[bbNonBL.length-1].collector_number:"—")}`);

  await (await getClient()).close();
}
main().catch(e=>{console.error(e);process.exit(1);});
