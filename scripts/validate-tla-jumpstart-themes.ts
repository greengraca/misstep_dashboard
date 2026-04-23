try {
  process.loadEnvFile(".env");
} catch {}

import { getDb } from "../lib/mongodb";
import { TLA_JUMPSTART_THEMES } from "../lib/ev-jumpstart-tla";

// TLE-first priority order for targeted card pool load.
// Later pushes override earlier via Map.set.
const POOL_SPECS: { set: string; cnFrom: number; cnTo: number; label: string }[] = [
  // Lowest priority first. Mirror of JUMPSTART_VIRTUAL_POOLS["jtla"] in lib/ev.ts:
  { set: "tla", cnFrom: 1, cnTo: 281, label: "TLA mainline + dual/location lands" },
  { set: "tla", cnFrom: 282, cnTo: 286, label: "TLA default basics" },
  { set: "tla", cnFrom: 292, cnTo: 296, label: "TLA Avatar's Journey basics" },
  { set: "tla", cnFrom: 287, cnTo: 291, label: "TLA Appa basics (wins for 'Plains', 'Island', etc.)" },
  { set: "tle", cnFrom: 171, cnTo: 209, label: "TLE JS-Extended-Art" },
  { set: "tle", cnFrom: 210, cnTo: 264, label: "TLE Beginner-Box main" },
  { set: "tle", cnFrom: 74, cnTo: 170, label: "TLE Jumpstart-main" },
];

(async () => {
  const db = await getDb();
  const col = db.collection("dashboard_ev_cards");

  // Load pool in priority order. Later entries override earlier.
  const cardByName = new Map<
    string,
    { set: string; cn: string; rarity: string; name: string; price_eur: number | null; price_eur_foil: number | null }
  >();
  const poolStats: Record<string, number> = {};

  for (const spec of POOL_SPECS) {
    const cns = Array.from({ length: spec.cnTo - spec.cnFrom + 1 }, (_, i) =>
      String(spec.cnFrom + i)
    );
    const docs = await col
      .find({ set: spec.set, collector_number: { $in: cns } })
      .project({ name: 1, set: 1, collector_number: 1, rarity: 1, price_eur: 1, price_eur_foil: 1 })
      .toArray();
    poolStats[spec.label] = docs.length;
    for (const d of docs) {
      cardByName.set((d.name as string).toLowerCase(), {
        set: d.set,
        cn: d.collector_number as string,
        rarity: d.rarity,
        name: d.name,
        price_eur: d.price_eur ?? null,
        price_eur_foil: d.price_eur_foil ?? null,
      });
    }
  }

  console.log("=== CARD POOL LOAD (priority order, later wins) ===");
  for (const [label, n] of Object.entries(poolStats)) console.log(`  ${label}: ${n}`);
  console.log(`  TOTAL unique names after priority merge: ${cardByName.size}`);
  console.log();

  const tierCounts = { common: 0, rare: 0, mythic: 0 };
  const unresolved = new Set<string>();
  let themePriceSum = 0;
  const themeSummaries: {
    name: string;
    variant: number;
    color: string;
    tier: string;
    resolved: number;
    missing: number;
    priced: number;
    priceSum: number;
  }[] = [];

  for (const theme of TLA_JUMPSTART_THEMES) {
    tierCounts[theme.tier]++;
    let resolved = 0;
    let missing = 0;
    let priced = 0;
    let priceSum = 0;
    for (const name of theme.cards) {
      const card = cardByName.get(name.toLowerCase());
      if (!card) {
        missing++;
        unresolved.add(name);
      } else {
        resolved++;
        if (card.price_eur != null) {
          priced++;
          priceSum += card.price_eur;
        }
      }
    }
    themeSummaries.push({
      name: theme.name,
      variant: theme.variant,
      color: theme.color,
      tier: theme.tier,
      resolved,
      missing,
      priced,
      priceSum,
    });
    themePriceSum += priceSum;
  }

  console.log("=== TIER DISTRIBUTION ===");
  console.log(`  common: ${tierCounts.common} (expected 40)`);
  console.log(`  rare:   ${tierCounts.rare} (expected 15)`);
  console.log(`  mythic: ${tierCounts.mythic} (expected 11)`);
  console.log(`  TOTAL:  ${tierCounts.common + tierCounts.rare + tierCounts.mythic} (expected 66)`);
  console.log();

  console.log("=== UNRESOLVED NAMES ===");
  if (unresolved.size === 0) console.log("  (none — every card name matched)");
  else {
    for (const n of Array.from(unresolved).sort()) console.log("  -", n);
  }
  console.log();

  console.log("=== THEME EV SUMMARY (sorted by gross) ===");
  themeSummaries.sort((a, b) => b.priceSum - a.priceSum);
  for (const t of themeSummaries) {
    console.log(
      `  [${t.tier.padEnd(6)}] ${t.color.padEnd(5)} ${t.name.padEnd(18)} v${t.variant}  resolved=${t.resolved}/${t.resolved + t.missing} priced=${t.priced}  €${t.priceSum.toFixed(2)}`
    );
  }
  console.log();
  console.log(`BOX EV (uniform 1/66 per pack × 24 packs):`);
  const uniformAvg = themeSummaries.reduce((s, t) => s + t.priceSum, 0) / 66;
  console.log(`  avg theme EV:   €${uniformAvg.toFixed(2)}`);
  console.log(`  box EV gross:   €${(uniformAvg * 24).toFixed(2)}`);
  console.log(`  box EV net (0.05 fee): €${(uniformAvg * 24 * 0.95).toFixed(2)}`);

  process.exit(0);
})();
