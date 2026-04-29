// Read-only discovery script for FDN / FDC / SPG card structure.
// Used during EV-config brainstorming to ground pool design in real DB state.
// Run: npx tsx scripts/_inventory-fdn.ts

try { process.loadEnvFile(".env"); } catch {}

import { getDb, getClient } from "../lib/mongodb";

interface Doc {
  collector_number: string;
  name?: string;
  rarity?: string;
  treatment?: string;
  border_color?: string;
  frame?: string;
  frame_effects?: string[];
  promo_types?: string[];
  finishes?: string[];
  booster?: boolean;
  type_line?: string;
  layout?: string;
  set?: string;
}

const cnInt = (c: Doc): number => {
  const n = parseInt(c.collector_number, 10);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
};

async function main() {
  const db = await getDb();
  const cards = db.collection<Doc>("dashboard_ev_cards");

  // ── FDN ──
  const fdn = await cards.find({ set: "fdn" }).project({
    collector_number: 1, name: 1, rarity: 1, treatment: 1, border_color: 1,
    frame: 1, frame_effects: 1, promo_types: 1, finishes: 1, booster: 1, type_line: 1, layout: 1,
  }).toArray() as unknown as Doc[];

  console.log(`\n=== FDN ===  total docs: ${fdn.length}\n`);

  const sorted = [...fdn].sort((a, b) => cnInt(a) - cnInt(b));
  const lastCn = sorted.length ? sorted[sorted.length - 1].collector_number : "—";
  const firstCn = sorted.length ? sorted[0].collector_number : "—";
  console.log(`CN range: ${firstCn} → ${lastCn}`);

  // Rarity totals across whole set
  const rarityCount = (rs: string[], filter: (c: Doc) => boolean) => {
    const s: Record<string, number> = {};
    for (const r of rs) s[r] = 0;
    for (const c of fdn) if (filter(c) && c.rarity && rs.includes(c.rarity)) s[c.rarity]++;
    return s;
  };

  // Mainline (treatment=normal, border_color=black, no special promo_types)
  const isPlainBasicLand = (c: Doc) => /Basic Land/.test(c.type_line ?? "");
  const promoTagged = (c: Doc, tag: string) => (c.promo_types ?? []).includes(tag);

  const isMainline = (c: Doc) =>
    c.treatment === "normal" &&
    c.border_color !== "borderless" &&
    !promoTagged(c, "startercollection") &&
    !promoTagged(c, "setextension") &&
    !promoTagged(c, "manafoil") &&
    !promoTagged(c, "fracturefoil") &&
    !promoTagged(c, "japaneseshowcase") &&
    !promoTagged(c, "jpshowcase") &&
    c.booster === true;

  const isMainlineNoBasics = (c: Doc) => isMainline(c) && !isPlainBasicLand(c);

  console.log(`\n--- Treatment / promo_types histogram (full FDN) ---`);
  const treatments = new Map<string, number>();
  for (const c of fdn) {
    treatments.set(c.treatment ?? "—", (treatments.get(c.treatment ?? "—") ?? 0) + 1);
  }
  for (const [t, n] of [...treatments.entries()].sort((a, b) => b[1] - a[1])) console.log(`  treatment=${t}: ${n}`);

  const promoHist = new Map<string, number>();
  for (const c of fdn) for (const p of c.promo_types ?? []) promoHist.set(p, (promoHist.get(p) ?? 0) + 1);
  console.log(`\n--- promo_types histogram ---`);
  for (const [p, n] of [...promoHist.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${p}: ${n}`);

  const feHist = new Map<string, number>();
  for (const c of fdn) for (const f of c.frame_effects ?? []) feHist.set(f, (feHist.get(f) ?? 0) + 1);
  console.log(`\n--- frame_effects histogram ---`);
  for (const [f, n] of [...feHist.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${f}: ${n}`);

  const bcHist = new Map<string, number>();
  for (const c of fdn) bcHist.set(c.border_color ?? "—", (bcHist.get(c.border_color ?? "—") ?? 0) + 1);
  console.log(`\n--- border_color histogram ---`);
  for (const [b, n] of [...bcHist.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${b}: ${n}`);

  const finHist = new Map<string, number>();
  for (const c of fdn) finHist.set((c.finishes ?? []).sort().join("+") || "—", (finHist.get((c.finishes ?? []).sort().join("+") || "—") ?? 0) + 1);
  console.log(`\n--- finishes histogram ---`);
  for (const [f, n] of [...finHist.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${f}: ${n}`);

  // Mainline rarity counts (no basics)
  const m = rarityCount(["common", "uncommon", "rare", "mythic"], isMainlineNoBasics);
  console.log(`\n--- Mainline (no basics): ---`);
  console.log(`  C: ${m.common}, U: ${m.uncommon}, R: ${m.rare}, M: ${m.mythic}, total: ${m.common + m.uncommon + m.rare + m.mythic}`);

  // Basics
  const basics = fdn.filter(c => isPlainBasicLand(c));
  console.log(`\n--- Basic lands: ${basics.length} docs ---`);
  for (const b of basics) {
    console.log(`  cn=${b.collector_number} ${b.name} treatment=${b.treatment} promo=${(b.promo_types ?? []).join(",")} finishes=${(b.finishes ?? []).join("+")}`);
  }

  // Borderless docs by rarity (any borderless)
  const borderless = fdn.filter(c => c.treatment === "borderless");
  console.log(`\n--- Borderless: ${borderless.length} docs (all subtypes) ---`);
  const blByPromo = new Map<string, number>();
  for (const c of borderless) {
    const key = (c.promo_types ?? []).sort().join(",") || "(none)";
    blByPromo.set(key, (blByPromo.get(key) ?? 0) + 1);
  }
  for (const [k, n] of [...blByPromo.entries()].sort((a, b) => b[1] - a[1])) console.log(`  promo_types=[${k}]: ${n}`);

  const blRarity = rarityCount(["common", "uncommon", "rare", "mythic"], c => c.treatment === "borderless");
  console.log(`  by rarity: C ${blRarity.common}, U ${blRarity.uncommon}, R ${blRarity.rare}, M ${blRarity.mythic}`);

  // Borderless minus startercollection/setextension/manafoil/jpshowcase variants
  const isPureBorderless = (c: Doc) =>
    c.treatment === "borderless" &&
    !promoTagged(c, "startercollection") &&
    !promoTagged(c, "setextension") &&
    !promoTagged(c, "manafoil") &&
    !promoTagged(c, "fracturefoil") &&
    !promoTagged(c, "japaneseshowcase") &&
    !promoTagged(c, "jpshowcase");
  const pureBl = fdn.filter(isPureBorderless);
  const pureBlR = pureBl.filter(c => c.rarity === "rare");
  const pureBlM = pureBl.filter(c => c.rarity === "mythic");
  const pureBlU = pureBl.filter(c => c.rarity === "uncommon");
  const pureBlC = pureBl.filter(c => c.rarity === "common");
  console.log(`\n--- "Pure" borderless (no startercollection/setextension/manafoil/jpshowcase): ${pureBl.length} ---`);
  console.log(`  C: ${pureBlC.length}, U: ${pureBlU.length}, R: ${pureBlR.length}, M: ${pureBlM.length}`);
  if (pureBlC.length > 0) console.log(`  C CNs: ${pureBlC.map(c => c.collector_number).join(",")}`);
  if (pureBlU.length > 0) console.log(`  U CNs: ${pureBlU.map(c => c.collector_number).join(",")}`);
  if (pureBlR.length > 0 && pureBlR.length <= 60) console.log(`  R CNs: ${pureBlR.map(c => c.collector_number).join(",")}`);
  if (pureBlM.length > 0 && pureBlM.length <= 30) console.log(`  M CNs: ${pureBlM.map(c => c.collector_number).join(",")}`);

  // Extended art
  const ea = fdn.filter(c => c.treatment === "extended_art");
  const eaR = ea.filter(c => c.rarity === "rare").length;
  const eaM = ea.filter(c => c.rarity === "mythic").length;
  console.log(`\n--- Extended art: ${ea.length} docs (R: ${eaR}, M: ${eaM}) ---`);
  if (ea.length > 0) {
    const eaCns = ea.map(c => parseInt(c.collector_number, 10)).filter(n => Number.isFinite(n)).sort((a, b) => a - b);
    console.log(`  CN min=${eaCns[0]} max=${eaCns[eaCns.length - 1]}`);
  }

  // Mana-foil (per WOTC: "all borderless rare and mythic rare cards have mana foil versions")
  const manafoil = fdn.filter(c => promoTagged(c, "manafoil"));
  console.log(`\n--- promo_types: manafoil: ${manafoil.length} docs ---`);
  if (manafoil.length > 0) {
    const cnRange = manafoil.map(c => parseInt(c.collector_number, 10)).filter(Number.isFinite).sort((a, b) => a - b);
    const mfR = manafoil.filter(c => c.rarity === "rare").length;
    const mfM = manafoil.filter(c => c.rarity === "mythic").length;
    console.log(`  R: ${mfR}, M: ${mfM}, CN range: ${cnRange[0]}–${cnRange[cnRange.length - 1]}`);
  }

  // Japan Showcase
  const jpKeys = ["jpshowcase", "japaneseshowcase", "japanshowcase", "japanese"];
  for (const k of jpKeys) {
    const docs = fdn.filter(c => promoTagged(c, k));
    if (docs.length > 0) {
      const cns = docs.map(c => parseInt(c.collector_number, 10)).sort((a, b) => a - b);
      const fin = new Set<string>();
      for (const d of docs) for (const f of d.finishes ?? []) fin.add(f);
      console.log(`\n--- promo_types: ${k}: ${docs.length} docs ---`);
      console.log(`  CN range: ${cns[0]}–${cns[cns.length - 1]}, finishes seen: ${[...fin].join(",")}`);
      console.log(`  R: ${docs.filter(c => c.rarity === "rare").length}, M: ${docs.filter(c => c.rarity === "mythic").length}`);
    }
  }

  // Fracture foil
  const fracture = fdn.filter(c => promoTagged(c, "fracturefoil") || promoTagged(c, "fracture") || (c.frame_effects ?? []).includes("fracture") || (c.frame_effects ?? []).includes("fracturefoil"));
  console.log(`\n--- Fracture-foil candidates: ${fracture.length} docs ---`);
  for (const f of fracture.slice(0, 20)) {
    console.log(`  cn=${f.collector_number} ${f.name} promo=${(f.promo_types ?? []).join(",")} frame_effects=${(f.frame_effects ?? []).join(",")} finishes=${(f.finishes ?? []).join("+")}`);
  }

  // Character lands (Planeswalker + non-PW). WOTC says 10 PW + 10 non-PW = 20 total.
  // These might be tagged as "character" promo or have specific frame_effects or be a CN block.
  // Print everything in the high CN ranges that's a Land.
  console.log(`\n--- Lands by CN block ---`);
  const lands = fdn.filter(c => /Land/.test(c.type_line ?? "")).sort((a, b) => cnInt(a) - cnInt(b));
  let lastBucket = -1;
  for (const l of lands) {
    const n = cnInt(l);
    const bucket = Math.floor(n / 10);
    if (bucket !== lastBucket) {
      console.log(`  --- CN ${bucket * 10}s ---`);
      lastBucket = bucket;
    }
    console.log(`    cn=${l.collector_number} ${l.name} treatment=${l.treatment} rarity=${l.rarity} type=${l.type_line} promo=${(l.promo_types ?? []).join(",")} frame_eff=${(l.frame_effects ?? []).join(",")}`);
  }

  // ── FDC ──
  const fdc = await cards.find({ set: "fdc" }).project({
    collector_number: 1, name: 1, rarity: 1, treatment: 1, finishes: 1, promo_types: 1, type_line: 1,
  }).toArray() as unknown as Doc[];
  console.log(`\n=== FDC ===  total docs: ${fdc.length}`);
  if (fdc.length > 0) {
    const fdcCns = fdc.map(c => parseInt(c.collector_number, 10)).filter(Number.isFinite).sort((a, b) => a - b);
    console.log(`CN range: ${fdcCns[0]}–${fdcCns[fdcCns.length - 1]}`);
    const fdcR = rarityCount(["common", "uncommon", "rare", "mythic"], () => true);
    const ftrt = new Map<string, number>();
    for (const c of fdc) ftrt.set(c.treatment ?? "—", (ftrt.get(c.treatment ?? "—") ?? 0) + 1);
    console.log(`  treatments: ${[...ftrt.entries()].map(([k, v]) => `${k}=${v}`).join(", ")}`);
    console.log(`  rarities: C ${fdcR.common}, U ${fdcR.uncommon}, R ${fdcR.rare}, M ${fdcR.mythic}`);
  }

  // ── SPG (FDN-flavored, mtgscribe says CN 74-83) ──
  const spg = await cards.find({ set: "spg" }).project({
    collector_number: 1, name: 1, rarity: 1, finishes: 1, promo_types: 1,
  }).toArray() as unknown as Doc[];
  console.log(`\n=== SPG ===  total docs: ${spg.length}`);
  const spgFdn = spg.filter(c => {
    const n = cnInt(c);
    return n >= 74 && n <= 83;
  });
  console.log(`  CN 74-83 (FDN-flavored per mtgscribe): ${spgFdn.length}`);
  for (const c of spgFdn) {
    console.log(`    cn=${c.collector_number} ${c.name} rarity=${c.rarity} finishes=${(c.finishes ?? []).join("+")}`);
  }

  // ── Bundles around CNs of interest ──
  // Print all docs at CNs > 261 to see the "booster fun" / treatment block layout
  console.log(`\n=== FDN: high-CN block (treatment / borderless / EA / character lands) ===`);
  const high = sorted.filter(c => cnInt(c) > 0 && cnInt(c) < 1000);
  // Find first non-mainline-normal CN
  let breakCn = 0;
  for (const c of high) {
    if (c.treatment !== "normal" || (c.promo_types ?? []).length > 0) { breakCn = cnInt(c); break; }
  }
  console.log(`First non-normal-treatment CN: ${breakCn}`);
  // Group: print first 30 unique-treatment-tag combos
  const seenCombo = new Set<string>();
  let printed = 0;
  for (const c of high) {
    const key = `${c.treatment}|${(c.promo_types ?? []).sort().join(",")}|${(c.frame_effects ?? []).sort().join(",")}|${c.rarity}`;
    if (seenCombo.has(key)) continue;
    seenCombo.add(key);
    console.log(`  cn=${c.collector_number} ${c.name} | treatment=${c.treatment} | promo=[${(c.promo_types ?? []).join(",")}] | fe=[${(c.frame_effects ?? []).join(",")}] | rarity=${c.rarity} | finishes=${(c.finishes ?? []).join("+")}`);
    printed++;
    if (printed > 60) break;
  }

  await (await getClient()).close();
}

main().catch(e => { console.error(e); process.exit(1); });
