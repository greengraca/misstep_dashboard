/**
 * Seed the EV config for Innistrad (isd, Sep 30 2011).
 *
 * Encodes the 2011 Draft Booster structure documented in:
 *   - Lethe's collation project page for ISD (the print-sheet authority)
 *     https://www.lethe.xyz/mtg/collation/isd.html
 *   - mtgen.net's ISD generator notes (DFC slot replaces a common; foil
 *     replaces another common; checklist 3/4 vs basic 1/4)
 *   - WOTC's "Booster Boosters" article (Mark Rosewater, Aug 2011)
 *     confirming "every booster has a double-faced card"
 *   - MTG Wiki's set summary (264 cards: 107C / 67U / 59R / 16M / 15 basics)
 *
 * See notes/ev/isd.md for the full source-by-source breakdown.
 *
 * Pre-Collector-Booster era (CBs started in 2019). play_booster only.
 *
 * Idempotent — safe to re-run; uses upsert on { set_code: "isd" }.
 */

try {
  process.loadEnvFile(".env");
} catch {
  // .env missing — MONGODB_URI check below will fail with a useful error.
}

import { getDb, getClient } from "../lib/mongodb";
import { generateSnapshot } from "../lib/ev";
import type { EvBoosterConfig } from "../lib/types";

const SET_CODE = "isd";

interface CardDoc {
  collector_number: string;
  name?: string;
  rarity?: string;
  layout?: string;
  type_line?: string;
  booster?: boolean;
}

interface AllPools {
  // Non-DFC pools (used for plain C/U/R/M slots).
  nonDfcCommons: string[];   // 101
  nonDfcUncommons: string[]; // 60
  nonDfcRares: string[];     // 53
  nonDfcMythics: string[];   // 15
  // DFC pools (used for the dedicated DFC slot).
  dfcCommons: string[];      //  6
  dfcUncommons: string[];    //  7
  dfcRares: string[];        //  6
  dfcMythics: string[];      //  1
  // Combined pools (foil draws read from these — foil sheet mixes DFCs in).
  allCommons: string[];      // 107
  allUncommons: string[];    //  67
  allRares: string[];        //  59
  allMythics: string[];      //  16
  // Land pool — basics only, 15 entries (5 lands × 3 art versions).
  basics: string[];
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
      `No ${SET_CODE} cards in dashboard_ev_cards. Sync isd from Scryfall before running this seed.`,
    );
  }

  const isBasic = (c: CardDoc) => /Basic Land/.test(c.type_line ?? "");
  const isDfc = (c: CardDoc) => c.layout === "transform";

  const nonBasicNonDfc = all.filter((c) => !isBasic(c) && !isDfc(c));
  const dfc = all.filter(isDfc);
  const basics = all.filter(isBasic);

  const byRarity = (docs: CardDoc[], r: string) =>
    docs.filter((c) => c.rarity === r).map((c) => c.collector_number);

  const nonDfcCommons = byRarity(nonBasicNonDfc, "common");
  const nonDfcUncommons = byRarity(nonBasicNonDfc, "uncommon");
  const nonDfcRares = byRarity(nonBasicNonDfc, "rare");
  const nonDfcMythics = byRarity(nonBasicNonDfc, "mythic");

  const dfcCommons = byRarity(dfc, "common");
  const dfcUncommons = byRarity(dfc, "uncommon");
  const dfcRares = byRarity(dfc, "rare");
  const dfcMythics = byRarity(dfc, "mythic");

  // Sanity checks against MTG Wiki / Scryfall ground truth.
  const expect = (got: number, want: number, label: string) => {
    const ok = got === want;
    console.log(`  ${ok ? "✅" : "⚠️ "} ${label}: ${got}${ok ? "" : ` (expected ${want})`}`);
  };

  console.log("ISD pool sanity checks:");
  expect(all.length, 264, "total booster=true (107C + 67U + 59R + 16M + 15 basics)");
  expect(basics.length, 15, "basic lands");
  expect(nonDfcCommons.length, 101, "non-DFC commons (107 - 6 DFC)");
  expect(nonDfcUncommons.length, 60, "non-DFC uncommons (67 - 7 DFC)");
  expect(nonDfcRares.length, 53, "non-DFC rares (59 - 6 DFC)");
  expect(nonDfcMythics.length, 15, "non-DFC mythics (16 - 1 DFC)");
  expect(dfcCommons.length, 6, "DFC commons");
  expect(dfcUncommons.length, 7, "DFC uncommons");
  expect(dfcRares.length, 6, "DFC rares");
  expect(dfcMythics.length, 1, "DFC mythics (Garruk Relentless)");

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
// 15 game cards + 1 ad/marketing = 16 slots, 36 packs/box.
//
// Per Lethe's print-sheet analysis, an ISD pack contains:
//   - 1 plain R/M slot (drawn from the non-DFC R/M sheet)
//   - 3 plain U slots
//   - 9 plain C slots, BUT one of them is the "common-or-foil" slot
//   - 1 DFC slot (always present, any rarity, drawn from a dedicated DFC sheet)
//   - 1 land slot (basic 1/4, checklist 3/4 — both €0)
//   - 1 ad / marketing card (no EV)
//
// DFC sheet weights (Lethe): 1 mythic × 1, 6 rares × 2, 7 uncommons × 6,
// 6 commons × 11 → 121 cells. So the per-rarity probabilities for the DFC
// slot are 66/121 C, 42/121 U, 12/121 R, 1/121 M (NOT the standard 1:2:4:10
// — ISD's DFC sheet has a custom weighting).
//
// R/M slot weights: 53 rares × 2 + 15 mythics × 1 = 121 cells →
// P(R) = 106/121, P(M) = 15/121 (≈ 87.6% / 12.4%, essentially 7/8 + 1/8).
//
// Foil rate: Lethe quotes "1 foil per 67 cards advertised". With 15 game
// cards/pack (excluding the ad), that's 15/67 ≈ 22.39% per pack.
// Distribution across rarities follows the era-typical 18:12:6:1 (C:U:R:M)
// per-pack ratio (same pattern as SOI's 2014-2017 era — ISD predates that
// but uses the same single-foil-per-pack mechanic). Foil pools include DFCs
// — slight double-count of foil DFCs vs the regular DFC slot, ~€0.05/pack
// effect — see notes/ev/isd.md for the full discussion.
function buildBooster(pools: AllPools): EvBoosterConfig {
  const commonPlain = { set_codes: [SET_CODE], custom_pool: pools.nonDfcCommons };
  const uncommonPlain = { set_codes: [SET_CODE], custom_pool: pools.nonDfcUncommons };
  const rarePlain = { set_codes: [SET_CODE], custom_pool: pools.nonDfcRares };
  const mythicPlain = { set_codes: [SET_CODE], custom_pool: pools.nonDfcMythics };

  // Foil pools include DFCs (the foil sheet mixes both).
  const foilCommonPool = { set_codes: [SET_CODE], custom_pool: pools.allCommons };
  const foilUncommonPool = { set_codes: [SET_CODE], custom_pool: pools.allUncommons };
  const foilRarePool = { set_codes: [SET_CODE], custom_pool: pools.allRares };
  const foilMythicPool = { set_codes: [SET_CODE], custom_pool: pools.allMythics };

  // Foil rate: 15 game cards / 67 cards-per-foil = 22.39% per pack.
  // Distribution: 18:12:6:1 (C:U:R:M).
  const FOIL_RATE = 15 / 67;
  const FOIL_C = FOIL_RATE * (18 / 37);
  const FOIL_U = FOIL_RATE * (12 / 37);
  const FOIL_R = FOIL_RATE * (6 / 37);
  const FOIL_M = FOIL_RATE * (1 / 37);
  const PLAIN_COMMON_IN_FOIL_SLOT = 1 - FOIL_RATE;

  // R/M slot — exact print-sheet ratios.
  const RM_RARE = 106 / 121;
  const RM_MYTHIC = 15 / 121;

  // DFC slot — Lethe's custom 1:2:6:11 weights (per-card).
  const DFC_C = 66 / 121; // 6 commons × 11 cells
  const DFC_U = 42 / 121; // 7 uncommons × 6 cells
  const DFC_R = 12 / 121; // 6 rares × 2 cells
  const DFC_M = 1 / 121;  // 1 mythic × 1 cell

  return {
    packs_per_box: 36,
    cards_per_pack: 15,
    slots: [
      // 1-8: 8 plain commons.
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
        slot_number: n,
        label: `Common ${n}`,
        is_foil: false,
        outcomes: [{ probability: 1, filter: commonPlain }],
      })),

      // 9: Common-or-foil. Foil outcomes draw from FULL rarity pools (incl.
      // DFCs). Note: Lethe says foil DFCs displace the DFC slot, not a
      // common. Our model puts all foils in one slot and includes DFCs in
      // the foil rarity pools, which slightly double-counts foil DFCs.
      // Effect ~€0.05/pack — documented in notes/ev/isd.md.
      {
        slot_number: 9,
        label: "Common 9 / Foil",
        is_foil: false,
        outcomes: [
          { probability: PLAIN_COMMON_IN_FOIL_SLOT, filter: commonPlain },
          { probability: FOIL_C, is_foil: true, filter: foilCommonPool },
          { probability: FOIL_U, is_foil: true, filter: foilUncommonPool },
          { probability: FOIL_R, is_foil: true, filter: foilRarePool },
          { probability: FOIL_M, is_foil: true, filter: foilMythicPool },
        ],
      },

      // 10-12: 3 plain uncommons.
      ...[10, 11, 12].map((n) => ({
        slot_number: n,
        label: `Uncommon ${n - 9}`,
        is_foil: false,
        outcomes: [{ probability: 1, filter: uncommonPlain }],
      })),

      // 13: R/M slot — non-DFC rare/mythic.
      {
        slot_number: 13,
        label: "Rare / Mythic",
        is_foil: false,
        outcomes: [
          { probability: RM_RARE, filter: rarePlain },
          { probability: RM_MYTHIC, filter: mythicPlain },
        ],
      },

      // 14: Dedicated DFC slot — any rarity, ISD's custom 1:2:6:11 weights.
      {
        slot_number: 14,
        label: "Double-Faced Card",
        is_foil: false,
        outcomes: [
          { probability: DFC_C, filter: { set_codes: [SET_CODE], custom_pool: pools.dfcCommons } },
          { probability: DFC_U, filter: { set_codes: [SET_CODE], custom_pool: pools.dfcUncommons } },
          { probability: DFC_R, filter: { set_codes: [SET_CODE], custom_pool: pools.dfcRares } },
          { probability: DFC_M, filter: { set_codes: [SET_CODE], custom_pool: pools.dfcMythics } },
        ],
      },

      // 15: Land slot. Basic 1/4, checklist 3/4 (per Lethe). Both €0 under
      // sift_floor=0.25, so the EV impact is identical — encode as 1.0
      // basic for cleanest probability sum.
      {
        slot_number: 15,
        label: "Basic Land or Checklist",
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
  checkSlots(playBooster, "ISD");

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
