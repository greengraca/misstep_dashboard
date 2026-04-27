/**
 * Seed the EV config for Shadows over Innistrad (soi).
 *
 * Encodes the 2016 draft-booster structure documented in:
 *   - WOTC's SOI mechanics article + Mark Rosewater's "double-faced cards
 *     matter" design diary (1.125 DFC as-fan, 1/8 R/M-DFC rate)
 *   - The MTG Salvation forum's print-sheet reverse-engineering thread
 *     (the explicit slot enumeration: "1 normal R/M, 3 normal U, 1 C/U DFC,
 *     7 normal C, 1 C-or-foil, 1 C-or-R/M-DFC")
 *   - Lethe's collation project page for SOI (5 pack configurations)
 *   - The community-standard 2014-2017 foil rate (1/12 + 1/18 + 1/36 + 1/216)
 *
 * See notes/ev/soi.md for the full source-by-source breakdown.
 *
 * No Collector Booster (CBs didn't exist in 2016).
 *
 * Idempotent — safe to re-run; uses upsert on { set_code: "soi" }.
 */

try {
  process.loadEnvFile(".env");
} catch {
  // .env missing — MONGODB_URI check below will fail with a useful error.
}

import { getDb, getClient } from "../lib/mongodb";
import { generateSnapshot } from "../lib/ev";
import type { EvBoosterConfig } from "../lib/types";

const SET_CODE = "soi";

interface CardDoc {
  collector_number: string;
  name?: string;
  rarity?: string;
  layout?: string;
  type_line?: string;
  booster?: boolean;
}

interface AllPools {
  // Non-DFC pools (regular C/U/R/M slots + foil R sub-pool reads from these too,
  // but the foil C/U/R/M outcomes use the FULL pools incl. DFCs — see notes/ev/soi.md)
  nonDfcCommons: string[];   // 101
  nonDfcUncommons: string[]; // 80
  nonDfcRares: string[];     // 53
  nonDfcMythics: string[];   // 15
  // DFC pools
  dfcCommons: string[];      // 4
  dfcUncommons: string[];    // 20
  dfcRares: string[];        // 6
  dfcMythics: string[];      // 3
  // Combined pools (used by foil outcomes — foil sheet contains DFCs too)
  allCommons: string[];      // 105 (non-basic)
  allUncommons: string[];    // 100
  allRares: string[];        // 59
  allMythics: string[];      // 18
  // Land pool
  basics: string[];          // 15
}

async function buildPools(): Promise<AllPools> {
  const db = await getDb();
  const cards = db.collection("dashboard_ev_cards");

  const all = (await cards
    .find({ set: SET_CODE, booster: true })
    .project({ collector_number: 1, name: 1, rarity: 1, layout: 1, type_line: 1, booster: 1 })
    .toArray()) as unknown as CardDoc[];

  if (all.length === 0) {
    throw new Error(
      `No ${SET_CODE} cards in dashboard_ev_cards. Sync soi from Scryfall before running this seed.`,
    );
  }

  const isBasic = (c: CardDoc) => /Basic Land/.test(c.type_line ?? "");
  const isDfc = (c: CardDoc) => c.layout === "transform";

  const nonBasicNonDfc = all.filter((c) => !isBasic(c) && !isDfc(c));
  const dfc = all.filter(isDfc);
  const basics = all.filter(isBasic);

  const byRarity = (docs: CardDoc[], r: string) => docs.filter((c) => c.rarity === r).map((c) => c.collector_number);

  const nonDfcCommons = byRarity(nonBasicNonDfc, "common");
  const nonDfcUncommons = byRarity(nonBasicNonDfc, "uncommon");
  const nonDfcRares = byRarity(nonBasicNonDfc, "rare");
  const nonDfcMythics = byRarity(nonBasicNonDfc, "mythic");

  const dfcCommons = byRarity(dfc, "common");
  const dfcUncommons = byRarity(dfc, "uncommon");
  const dfcRares = byRarity(dfc, "rare");
  const dfcMythics = byRarity(dfc, "mythic");

  // Sanity checks against WOTC / DB ground truth
  const expect = (got: number, want: number, label: string) => {
    const ok = got === want;
    console.log(`  ${ok ? "✅" : "⚠️ "} ${label}: ${got}${ok ? "" : ` (expected ${want})`}`);
  };

  console.log("SOI pool sanity checks:");
  expect(all.length, 297, "total booster=true (105C + 100U + 59R + 18M + 15 basics)");
  expect(basics.length, 15, "basic lands");
  expect(nonDfcCommons.length, 101, "non-DFC commons (105 - 4 DFC)");
  expect(nonDfcUncommons.length, 80, "non-DFC uncommons (100 - 20 DFC)");
  expect(nonDfcRares.length, 53, "non-DFC rares (59 - 6 DFC)");
  expect(nonDfcMythics.length, 15, "non-DFC mythics (18 - 3 DFC)");
  expect(dfcCommons.length, 4, "DFC commons (#149, #158, #210, #229)");
  expect(dfcUncommons.length, 20, "DFC uncommons");
  expect(dfcRares.length, 6, "DFC rares (#21, #92, #108, #159, #225, #281)");
  expect(dfcMythics.length, 3, "DFC mythics (#5 Avacyn, #88 Startled Awake, #243 Arlinn)");

  return {
    nonDfcCommons,
    nonDfcUncommons,
    nonDfcRares,
    nonDfcMythics,
    dfcCommons,
    dfcUncommons,
    dfcRares,
    dfcMythics,
    allCommons: [...nonDfcCommons, ...dfcCommons],
    allUncommons: [...nonDfcUncommons, ...dfcUncommons],
    allRares: [...nonDfcRares, ...dfcRares],
    allMythics: [...nonDfcMythics, ...dfcMythics],
    basics: basics.map((c) => c.collector_number),
  };
}

// ── Booster config ──────────────────────────────────────────────────────────
//
// 15 cards + 1 ad/marketing = 16 slots, 36 packs/box.
//
// Per the MTG Salvation print-sheet analysis, an SOI pack contains:
//   - 1 normal R/M slot
//   - 3 normal U slots
//   - 1 C/U DFC slot (always present)
//   - 7 normal C slots
//   - 1 slot that is either a normal C or a foil (any rarity)
//   - 1 slot that is either a normal C or an R/M DFC (1/8 packs)
//   - 1 land slot (basic; some packs swap for a checklist — €0 either way)
//   - 1 ad/marketing card (no EV)
//
// "Normal" means non-DFC. The 4 DFC commons + 20 DFC uncommons appear in the
// dedicated C/U DFC slot only; the 6 DFC rares + 3 DFC mythics appear in the
// dedicated R/M DFC outcome only. Foil DFCs DO appear: the foil-wildcard slot
// (slot 8) draws from the FULL rarity pools incl. DFCs, since the foil print
// sheet contains both DFC and non-DFC cards (e.g. foil Archangel Avacyn ~€4).
//
// Per-card pull ratio per the MTG Salvation analysis is 1:2:4:10 (M:R:U:C
// across 120 packs). This implies:
//   - C/U DFC slot: 4 commons × 10/120 + 20 uncommons × 4/120 = 1 → P(C) = 1/3,
//     P(U) = 2/3 (cards weighted by their print-sheet share, which for SOI
//     happens to be uniform within rarity)
//   - R/M DFC trigger: 6 rares × 2/120 + 3 mythics × 1/120 = 15/120 = 1/8 → ✅
//   - Conditional on R/M DFC trigger: P(R) = 12/15 = 4/5, P(M) = 3/15 = 1/5
//   - Normal R/M slot: standard 7/8 R + 1/8 M (the long-running pre-2024 ratio)
//
// Foil rate: standard 2014-2017 1/12 + 1/18 + 1/36 + 1/216 = 37/216 ≈ 1/5.84
// (i.e. ~1 foil per 6 packs). Box average: 3 C + 2 U + 1 R + 1/6 M foils ≈
// ~6 foils/box, which matches WOTC's published "3C + 2U + 1R per box".
function buildBooster(pools: AllPools): EvBoosterConfig {
  const commonPlain = { set_codes: [SET_CODE], custom_pool: pools.nonDfcCommons };
  const uncommonPlain = { set_codes: [SET_CODE], custom_pool: pools.nonDfcUncommons };
  const rarePlain = { set_codes: [SET_CODE], custom_pool: pools.nonDfcRares };
  const mythicPlain = { set_codes: [SET_CODE], custom_pool: pools.nonDfcMythics };

  // Foil pools include DFCs (the foil print sheet mixes them).
  const foilCommonPool = { set_codes: [SET_CODE], custom_pool: pools.allCommons };
  const foilUncommonPool = { set_codes: [SET_CODE], custom_pool: pools.allUncommons };
  const foilRarePool = { set_codes: [SET_CODE], custom_pool: pools.allRares };
  const foilMythicPool = { set_codes: [SET_CODE], custom_pool: pools.allMythics };

  // Foil sub-distribution (37/216 base): C 18/37, U 12/37, R 6/37, M 1/37
  const FOIL_RATE = 1 / 6;
  const FOIL_C = FOIL_RATE * (18 / 37);
  const FOIL_U = FOIL_RATE * (12 / 37);
  const FOIL_R = FOIL_RATE * (6 / 37);
  const FOIL_M = FOIL_RATE * (1 / 37);
  const PLAIN_COMMON_IN_FOIL_SLOT = 1 - FOIL_RATE; // 5/6

  // R/M DFC trigger: 1/8 packs total, split 4/5 R + 1/5 M
  const RM_DFC_TRIGGER = 1 / 8;
  const R_DFC = RM_DFC_TRIGGER * (4 / 5); // = 1/10
  const M_DFC = RM_DFC_TRIGGER * (1 / 5); // = 1/40
  const PLAIN_COMMON_IN_DFC_SLOT = 1 - RM_DFC_TRIGGER; // 7/8

  return {
    packs_per_box: 36,
    cards_per_pack: 15,
    slots: [
      // 1-7: 7 plain commons
      ...[1, 2, 3, 4, 5, 6, 7].map((n) => ({
        slot_number: n,
        label: `Common ${n}`,
        is_foil: false,
        outcomes: [{ probability: 1, filter: commonPlain }],
      })),

      // 8: Common-or-foil wildcard. Foil outcomes draw from FULL rarity pools
      // (incl. DFCs) — that's how foil DFCs like Archangel Avacyn are produced.
      {
        slot_number: 8,
        label: "Common 8 / Foil",
        is_foil: false,
        outcomes: [
          { probability: PLAIN_COMMON_IN_FOIL_SLOT, filter: commonPlain },
          { probability: FOIL_C, is_foil: true, filter: foilCommonPool },
          { probability: FOIL_U, is_foil: true, filter: foilUncommonPool },
          { probability: FOIL_R, is_foil: true, filter: foilRarePool },
          { probability: FOIL_M, is_foil: true, filter: foilMythicPool },
        ],
      },

      // 9: Common-or-R/M-DFC. R/M DFC pool is non-foil only here (foil DFCs
      // already accounted for in slot 8).
      {
        slot_number: 9,
        label: "Common 9 / R/M DFC",
        is_foil: false,
        outcomes: [
          { probability: PLAIN_COMMON_IN_DFC_SLOT, filter: commonPlain },
          { probability: R_DFC, filter: { set_codes: [SET_CODE], custom_pool: pools.dfcRares } },
          { probability: M_DFC, filter: { set_codes: [SET_CODE], custom_pool: pools.dfcMythics } },
        ],
      },

      // 10: C/U DFC slot. 1/3 common DFC, 2/3 uncommon DFC (derived from the
      // 1:2:4:10 per-card ratio: 4×10 / (4×10 + 20×4) = 40/120, 20×4 / 120 = 80/120).
      {
        slot_number: 10,
        label: "C/U DFC",
        is_foil: false,
        outcomes: [
          { probability: 1 / 3, filter: { set_codes: [SET_CODE], custom_pool: pools.dfcCommons } },
          { probability: 2 / 3, filter: { set_codes: [SET_CODE], custom_pool: pools.dfcUncommons } },
        ],
      },

      // 11-13: 3 plain uncommons
      ...[11, 12, 13].map((n) => ({
        slot_number: n,
        label: `Uncommon ${n - 10}`,
        is_foil: false,
        outcomes: [{ probability: 1, filter: uncommonPlain }],
      })),

      // 14: R/M slot. 7/8 R + 1/8 M, non-DFC pools (DFC R/M handled in slot 9).
      {
        slot_number: 14,
        label: "Rare / Mythic",
        is_foil: false,
        outcomes: [
          { probability: 7 / 8, filter: rarePlain },
          { probability: 1 / 8, filter: mythicPlain },
        ],
      },

      // 15: Land. Uniform across 15 basics. Some packs swap for a checklist
      // card (€0) — small enough to ignore (< €1/box impact).
      {
        slot_number: 15,
        label: "Basic Land",
        is_foil: false,
        outcomes: [{ probability: 1, filter: { set_codes: [SET_CODE], custom_pool: pools.basics } }],
      },

      // 16: Ad / marketing card — no EV.
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
  checkSlots(playBooster, "SOI");

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
