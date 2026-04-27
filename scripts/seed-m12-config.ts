/**
 * Seed the EV config for Magic 2012 (m12, Jul 15 2011).
 *
 * Encodes the 2011 Draft Booster structure documented in:
 *   - mtgen.net's M12 generator notes ("15/67 chance a booster has a foil,
 *     includes basic lands, and starting with this set, it always replaces
 *     a common"). https://mtgen.net/m12/
 *   - MTG Wiki's M12 page (set sizes — confirmed against DB: 249 booster cards
 *     = 101 C + 60 U + 53 R + 15 M + 20 basics).
 *   - Generic Draft Booster spec (15 game cards + 1 ad, 36 packs/box).
 *
 * No Lethe page exists for M12 (returns 404). The collation is documented
 * less rigorously than ISD, but the era-defining "foil replaces a common"
 * rule was INTRODUCED in M12 — ISD inherited it. So the slot structure is
 * effectively a simpler ISD without the DFC slot.
 *
 * See notes/ev/m12.md for the full source-by-source breakdown.
 *
 * Pre-Collector-Booster era (CBs started in 2019). play_booster only.
 *
 * Idempotent — safe to re-run; uses upsert on { set_code: "m12" }.
 */

try {
  process.loadEnvFile(".env");
} catch {
  // .env missing — MONGODB_URI check below will fail with a useful error.
}

import { getDb, getClient } from "../lib/mongodb";
import { generateSnapshot } from "../lib/ev";
import type { EvBoosterConfig } from "../lib/types";

const SET_CODE = "m12";

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
      `No ${SET_CODE} cards in dashboard_ev_cards. Sync m12 from Scryfall before running this seed.`,
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

  console.log("M12 pool sanity checks:");
  expect(all.length, 249, "total booster=true (101C + 60U + 53R + 15M + 20 basics)");
  expect(basics.length, 20, "basic lands (4 art × 5 lands)");
  expect(commons.length, 101, "commons");
  expect(uncommons.length, 60, "uncommons");
  expect(rares.length, 53, "rares");
  expect(mythics.length, 15, "mythics");

  // M12 should have NO non-normal layouts (no DFCs, splits, etc.).
  const layouts = new Set(all.map((c) => c.layout));
  if (layouts.size !== 1 || !layouts.has("normal")) {
    console.warn(`  ⚠️  Unexpected layouts in m12: ${[...layouts].join(", ")}`);
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
// Standard pre-2014 Draft Booster:
//   - 10 commons (one of which is the "common-or-foil" slot)
//   - 3 uncommons
//   - 1 rare/mythic (P(M) = 15/121 ≈ 12.4%)
//   - 1 basic land (uniform across 20 art prints)
//   - 1 ad / marketing card (no EV)
//
// Foil rate: 1 per 67 cards (mtgen.net) → 15/67 ≈ 22.39% per pack. Foil
// replaces a common; sub-distribution assumed 18:12:6:1 (C:U:R:M) per the
// era-typical ratio used in the SOI/ISD seeds. Foil pool excludes basics
// (small understatement — see notes/ev/m12.md).
function buildBooster(pools: AllPools): EvBoosterConfig {
  const commonPlain = { set_codes: [SET_CODE], custom_pool: pools.commons };
  const uncommonPlain = { set_codes: [SET_CODE], custom_pool: pools.uncommons };
  const rarePlain = { set_codes: [SET_CODE], custom_pool: pools.rares };
  const mythicPlain = { set_codes: [SET_CODE], custom_pool: pools.mythics };

  // Foil pools: M12 has no DFCs, so foil pools are simply the rarity pools.
  // (Same as plain pools, since plain pools already include all booster cards
  // at their rarity.)
  const foilCommonPool = commonPlain;
  const foilUncommonPool = uncommonPlain;
  const foilRarePool = rarePlain;
  const foilMythicPool = mythicPlain;

  const FOIL_RATE = 15 / 67;
  const FOIL_C = FOIL_RATE * (18 / 37);
  const FOIL_U = FOIL_RATE * (12 / 37);
  const FOIL_R = FOIL_RATE * (6 / 37);
  const FOIL_M = FOIL_RATE * (1 / 37);
  const PLAIN_COMMON_IN_FOIL_SLOT = 1 - FOIL_RATE;

  // R/M slot — exact print-sheet ratios from card counts.
  const RM_RARE = 106 / 121;   // 53 rares × 2 cells
  const RM_MYTHIC = 15 / 121;  // 15 mythics × 1 cell

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

      // 10: Common-or-foil. Replaces a common slot when foil is present.
      {
        slot_number: 10,
        label: "Common 10 / Foil",
        is_foil: false,
        outcomes: [
          { probability: PLAIN_COMMON_IN_FOIL_SLOT, filter: commonPlain },
          { probability: FOIL_C, is_foil: true, filter: foilCommonPool },
          { probability: FOIL_U, is_foil: true, filter: foilUncommonPool },
          { probability: FOIL_R, is_foil: true, filter: foilRarePool },
          { probability: FOIL_M, is_foil: true, filter: foilMythicPool },
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

      // 15: Basic land (uniform across 20 art prints — 4 per land × 5 lands).
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

  // Sanity-check: slot probabilities should sum to ~1.0 each (skip empty slots).
  const checkSlots = (cfg: EvBoosterConfig, name: string) => {
    for (const slot of cfg.slots) {
      const sum = slot.outcomes.reduce((s, o) => s + o.probability, 0);
      if (slot.outcomes.length > 0 && Math.abs(sum - 1) > 0.003) {
        console.warn(`  ⚠️  ${name} slot ${slot.slot_number} (${slot.label}): probabilities sum to ${sum.toFixed(4)} (expected 1.0)`);
      }
    }
  };
  console.log("\nSlot probability checks:");
  checkSlots(playBooster, "M12");

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
