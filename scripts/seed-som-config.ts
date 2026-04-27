/**
 * Seed the EV config for Scars of Mirrodin (som, Oct 1 2010).
 *
 * Encodes the 2010 Draft Booster structure documented in:
 *   - Lethe's collation project page for SOM (the print-sheet authority)
 *     https://www.lethe.xyz/mtg/collation/som.html
 *   - MTG Wiki — confirmed against DB: 249 booster cards = 101 C + 60 U +
 *     53 R + 15 M + 20 basics (4 art × 5 lands).
 *
 * First set in the Scars of Mirrodin block — large expansion (249 cards),
 * pre-Innistrad, no DFCs. Standard pre-2014 Draft Booster.
 *
 * Coincidence: identical card counts to M12 (101/60/53/15) — same template
 * applies, just different cards inside.
 *
 * Pre-Collector-Booster era. play_booster only.
 *
 * Idempotent — safe to re-run; uses upsert on { set_code: "som" }.
 */

try {
  process.loadEnvFile(".env");
} catch {
  // .env missing — MONGODB_URI check below will fail with a useful error.
}

import { getDb, getClient } from "../lib/mongodb";
import { generateSnapshot } from "../lib/ev";
import type { EvBoosterConfig } from "../lib/types";

const SET_CODE = "som";

interface CardDoc {
  collector_number: string;
  name?: string;
  rarity?: string;
  layout?: string;
  type_line?: string;
}

interface AllPools {
  commons: string[];   // 101
  uncommons: string[]; //  60
  rares: string[];     //  53
  mythics: string[];   //  15
  basics: string[];    //  20 (4 art × 5 lands)
}

async function buildPools(): Promise<AllPools> {
  const db = await getDb();
  const cards = db.collection("dashboard_ev_cards");

  const all = (await cards
    .find({ set: SET_CODE, booster: true })
    .project({ collector_number: 1, name: 1, rarity: 1, layout: 1, type_line: 1 })
    .toArray()) as unknown as CardDoc[];

  if (all.length === 0) {
    throw new Error(
      `No ${SET_CODE} cards in dashboard_ev_cards. Sync som from Scryfall before running this seed.`,
    );
  }

  const isBasic = (c: CardDoc) => /Basic Land/.test(c.type_line ?? "");
  const nonBasic = all.filter((c) => !isBasic(c));
  const basics = all.filter(isBasic);

  const byRarity = (r: string) =>
    nonBasic.filter((c) => c.rarity === r).map((c) => c.collector_number);

  const commons = byRarity("common");
  const uncommons = byRarity("uncommon");
  const rares = byRarity("rare");
  const mythics = byRarity("mythic");

  const expect = (got: number, want: number, label: string) => {
    const ok = got === want;
    console.log(`  ${ok ? "✅" : "⚠️ "} ${label}: ${got}${ok ? "" : ` (expected ${want})`}`);
  };

  console.log("SOM pool sanity checks:");
  expect(all.length, 249, "total booster=true (101C + 60U + 53R + 15M + 20 basics)");
  expect(basics.length, 20, "basic lands (4 art × 5 lands)");
  expect(commons.length, 101, "commons");
  expect(uncommons.length, 60, "uncommons");
  expect(rares.length, 53, "rares");
  expect(mythics.length, 15, "mythics");

  const layouts = new Set(all.map((c) => c.layout));
  if (layouts.size !== 1 || !layouts.has("normal")) {
    console.warn(`  ⚠️  Unexpected layouts in som: ${[...layouts].join(", ")}`);
  } else {
    console.log("  ✅ all layouts normal (no DFCs/splits)");
  }

  return {
    commons,
    uncommons,
    rares,
    mythics,
    basics: basics.map((c) => c.collector_number),
  };
}

// ── Booster config ──────────────────────────────────────────────────────────
//
// 15 game cards + 1 ad/marketing = 16 slots, 36 packs/box.
//
// Standard pre-2014 Draft Booster (per Lethe):
//   - 10 commons (split between C1 and C2 print runs)
//   - 3 uncommons (A/B run distribution: 65% 2A+1B, 35% 1A+2B)
//   - 1 rare/mythic — split into A run (29R×2 + 8M = 66 cells) and B run
//     (24R×2 + 7M = 55 cells), total 121 cells. P(M) = 15/121 ≈ 12.4%.
//   - 1 basic land (4 art × 5 lands = 20 art prints — "metal-textured" art)
//   - 1 ad / marketing card (no EV)
//
// Foil rate: 1:67 cards = 15/67 ≈ 22.39% per pack. Sub-distribution
// 18:12:6:1 (C:U:R:M) per the era-typical ratio. Foil replaces a common.
function buildBooster(pools: AllPools): EvBoosterConfig {
  const commonPlain = { set_codes: [SET_CODE], custom_pool: pools.commons };
  const uncommonPlain = { set_codes: [SET_CODE], custom_pool: pools.uncommons };
  const rarePlain = { set_codes: [SET_CODE], custom_pool: pools.rares };
  const mythicPlain = { set_codes: [SET_CODE], custom_pool: pools.mythics };

  const FOIL_RATE = 15 / 67;
  const FOIL_C = FOIL_RATE * (18 / 37);
  const FOIL_U = FOIL_RATE * (12 / 37);
  const FOIL_R = FOIL_RATE * (6 / 37);
  const FOIL_M = FOIL_RATE * (1 / 37);
  const PLAIN_COMMON_IN_FOIL_SLOT = 1 - FOIL_RATE;

  // R/M weights from card counts: 53R × 2 + 15M × 1 = 121 cells.
  const RM_RARE = 106 / 121;
  const RM_MYTHIC = 15 / 121;

  return {
    packs_per_box: 36,
    cards_per_pack: 15,
    slots: [
      // 1-9: 9 plain commons.
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({
        slot_number: n,
        label: `Common ${n}`,
        is_foil: false,
        outcomes: [{ probability: 1, filter: commonPlain }],
      })),

      // 10: Common-or-foil.
      {
        slot_number: 10,
        label: "Common 10 / Foil",
        is_foil: false,
        outcomes: [
          { probability: PLAIN_COMMON_IN_FOIL_SLOT, filter: commonPlain },
          { probability: FOIL_C, is_foil: true, filter: commonPlain },
          { probability: FOIL_U, is_foil: true, filter: uncommonPlain },
          { probability: FOIL_R, is_foil: true, filter: rarePlain },
          { probability: FOIL_M, is_foil: true, filter: mythicPlain },
        ],
      },

      // 11-13: 3 plain uncommons.
      ...[11, 12, 13].map((n) => ({
        slot_number: n,
        label: `Uncommon ${n - 10}`,
        is_foil: false,
        outcomes: [{ probability: 1, filter: uncommonPlain }],
      })),

      // 14: R/M slot.
      {
        slot_number: 14,
        label: "Rare / Mythic",
        is_foil: false,
        outcomes: [
          { probability: RM_RARE, filter: rarePlain },
          { probability: RM_MYTHIC, filter: mythicPlain },
        ],
      },

      // 15: Basic land.
      {
        slot_number: 15,
        label: "Basic Land",
        is_foil: false,
        outcomes: [{ probability: 1, filter: { set_codes: [SET_CODE], custom_pool: pools.basics } }],
      },

      // 16: Ad / marketing — no EV.
      { slot_number: 16, label: "Ad / Marketing", is_foil: false, outcomes: [] },
    ],
  };
}

async function main() {
  const pools = await buildPools();
  const playBooster = buildBooster(pools);

  const checkSlots = (cfg: EvBoosterConfig, name: string) => {
    for (const slot of cfg.slots) {
      const sum = slot.outcomes.reduce((s, o) => s + o.probability, 0);
      if (slot.outcomes.length > 0 && Math.abs(sum - 1) > 0.003) {
        console.warn(`  ⚠️  ${name} slot ${slot.slot_number} (${slot.label}): probabilities sum to ${sum.toFixed(4)} (expected 1.0)`);
      }
    }
  };
  console.log("\nSlot probability checks:");
  checkSlots(playBooster, "SOM");

  const db = await getDb();
  const col = db.collection("dashboard_ev_config");
  const now = new Date().toISOString();

  await col.updateOne(
    { set_code: SET_CODE },
    {
      $set: {
        set_code: SET_CODE,
        sift_floor: 0.25,
        fee_rate: 0.05,
        play_booster: playBooster,
        collector_booster: null,
        updated_at: now,
        updated_by: "seed-script",
      },
    },
    { upsert: true },
  );
  console.log(`\nSaved booster config for ${SET_CODE} (sift_floor=0.25, fee_rate=0.05).`);

  console.log(`\nGenerating snapshot…`);
  const snap = await generateSnapshot(SET_CODE);
  if (!snap) {
    console.error(`  Failed to generate snapshot for ${SET_CODE}.`);
  } else {
    console.log(`  date=${snap.date}`);
    console.log(`  play_ev_gross=€${snap.play_ev_gross}`);
    console.log(`  play_ev_net=€${snap.play_ev_net}`);
    console.log(`  play_pack_ev_net=€${snap.play_pack_ev_net}`);
    console.log(`  card_count_total=${snap.card_count_total}`);
    console.log(`  card_count_priced=${snap.card_count_priced}`);
  }

  await (await getClient()).close();
}

main().catch((e) => { console.error(e); process.exit(1); });
