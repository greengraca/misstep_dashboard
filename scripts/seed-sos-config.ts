/**
 * Seed the EV config for Secrets of Strixhaven (sos).
 *
 * Encodes the Play + Collector Booster structure documented by Wizards
 * of the Coast's collecting article and Mike Provencher's mtgscribe Play
 * Booster fact sheet. See notes/ev/sos.md for the full source-by-source
 * breakdown, every pool definition, and every pragmatic simplification.
 *
 * SOS is accompanied by the 65-card Mystical Archive bonus sheet (`soa`),
 * the 5-precon Commander subset (`soc`), and 10 Special Guests cards
 * (`spg` #149-158a). All four are queried at seed time to derive exact
 * CN lists + run sanity checks against published pool sizes.
 *
 * Idempotent — safe to re-run; uses upsert on { set_code: "sos" }.
 */

try {
  process.loadEnvFile(".env");
} catch {
  // .env missing — MONGODB_URI check below will fail with a useful error.
}

import { getDb, getClient } from "../lib/mongodb";
import { generateSnapshot } from "../lib/ev";
import type { EvBoosterConfig } from "../lib/types";

const SET_CODE = "sos";

// ── Explicit CN lists for constants we can't derive purely by query ──

// The 5 common-rarity dual lands that live in slot 14 (Land), NOT in the
// common slots 1-5 (per mtgscribe's 81-common figure which excludes them).
const DUAL_LAND_CNS = ["255", "256", "258", "262", "266"]; // Fields/Forum/Paradox/Spectacle/Titan's

// SPG SOS-flavored pool — 10 mythics at CN 149-158. Includes Library of
// Leng (#158); excludes Library of Alexandria (#158a, which has only the
// nonfoil finish and is treated as an art variant of the same sealed
// slot). Matches theexpectedvalue.com's `[149, 158]` inclusive range.
const SPG_SOS_CNS = ["149", "150", "151", "152", "153", "154", "155", "156", "157", "158"];

// SOC borderless face commanders — CN 1-10 (2 per precon × 5 precons).
// Derived dynamically from `{set: "soc", treatment: "borderless", rarity: "mythic"}`
// filtered to CN ≤ 10 (excludes the 6 Sol Ring + Talismans at CN 427-432).
const SOC_COMMANDER_CN_MAX = 10;

// SOC extended-art rares — CN 61-108 (48 unique rares). Derived dynamically
// from `{set: "soc", treatment: "extended_art", rarity: "rare"}`.
const SOC_EA_CN_MIN = 61;
const SOC_EA_CN_MAX = 108;

interface CardDoc {
  collector_number: string;
  name?: string;
  rarity?: string;
  treatment?: string;
  frame?: string;
  frame_effects?: string[];
  promo_types?: string[];
  type_line?: string;
  layout?: string;
  finishes?: string[];
  full_art?: boolean;
}

interface AllPools {
  // Mainline (SOS CN 1-266, excluding basics CN 267-281)
  mainCommons: string[];          // 81 — CN 1-266 C minus 5 duals
  mainUncommons: string[];        // 100 — CN 1-266 U
  mainRares: string[];            // 60 — CN 1-266 R
  mainMythics: string[];          // 20 — CN 1-266 M
  // Land pools (slot 14) — Full-Art (aka "Spellcraft") basics and default
  // basics are separate pools with different slot-14 rates AND meaningfully
  // different prices (Full-Art ~€0.65 NF avg, default ~€0.14 NF avg).
  dualLands: string[];            // 5 — DUAL_LAND_CNS
  fullArtBasics: string[];        // 5 — CN 267-271 (Full-Art / Spellcraft basics, 1 per color)
  defaultBasics: string[];        // 10 — CN 272-281 (default-frame basics, 2 per color)
  // Booster Fun pools (SOS CN ≥ 282)
  bdlPwDragonsM: string[];        // 7 — borderless PW + Elder Dragons, CN 282-288
  fnR: string[];                  // 6 — Borderless Field Notes rares, CN 289-300 R
  fnM: string[];                  // 6 — Borderless Field Notes mythics, CN 289-300 M
  bdlLandR: string[];             // 5 — Borderless Lands, CN 301-305
  eaR: string[];                  // 49 — Extended Art rares, CN 307-362
  eaM: string[];                  // 7 — Extended Art mythics, CN 307-362
  // Derived combined pools used by probability-union outcomes
  bdlSlot11AllR: string[];        // 5 — CN 301-305 (R only; slot 11 BDL "R" bucket)
  bdlSlot11AllM: string[];        // 7 — CN 282-288 (M only; slot 11 BDL "M" bucket)
  fnAll: string[];                // 12 — FN R + FN M combined for slot 10
}

async function buildPools(): Promise<AllPools> {
  const db = await getDb();
  const cards = db.collection("dashboard_ev_cards");

  const allSos = (await cards
    .find({ set: SET_CODE })
    .project({
      collector_number: 1, name: 1, rarity: 1, treatment: 1, frame: 1,
      frame_effects: 1, promo_types: 1, type_line: 1, layout: 1,
      finishes: 1, full_art: 1,
    })
    .toArray()) as unknown as CardDoc[];

  if (allSos.length === 0) {
    throw new Error(
      `No ${SET_CODE} cards in dashboard_ev_cards. ` +
      `Sync sos from Scryfall first before running this seed.`,
    );
  }

  // Verify source sets exist; the calc's collectExtraSetCodes pulls them
  // automatically at calc time, but failing fast here gives a clearer error
  // than an empty pool later.
  for (const otherSet of ["soa", "soc", "spg"] as const) {
    const n = await cards.countDocuments({ set: otherSet });
    if (n === 0) {
      throw new Error(`No ${otherSet} cards synced. Sync ${otherSet} from Scryfall before seeding sos.`);
    }
  }

  const cnInt = (c: CardDoc): number => {
    const n = parseInt(c.collector_number, 10);
    return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
  };
  const inCnRange = (c: CardDoc, lo: number, hi: number) => {
    const n = cnInt(c);
    return n >= lo && n <= hi;
  };

  const dualSet = new Set(DUAL_LAND_CNS);

  // ── Mainline pools (CN 1-266) ──
  const mainline = allSos.filter((c) => inCnRange(c, 1, 266));
  const mainCommons = mainline
    .filter((c) => c.rarity === "common" && !dualSet.has(c.collector_number))
    .map((c) => c.collector_number);
  const mainUncommons = mainline
    .filter((c) => c.rarity === "uncommon")
    .map((c) => c.collector_number);
  const mainRares = mainline
    .filter((c) => c.rarity === "rare")
    .map((c) => c.collector_number);
  const mainMythics = mainline
    .filter((c) => c.rarity === "mythic")
    .map((c) => c.collector_number);

  // ── Lands ──
  const dualLands = DUAL_LAND_CNS;
  const fullArtBasics = allSos
    .filter((c) => inCnRange(c, 267, 271))
    .map((c) => c.collector_number);
  const defaultBasics = allSos
    .filter((c) => inCnRange(c, 272, 281))
    .map((c) => c.collector_number);

  // ── Booster Fun ──
  const bdlPwDragonsM = allSos
    .filter((c) => inCnRange(c, 282, 288) && c.rarity === "mythic" && c.treatment === "borderless")
    .map((c) => c.collector_number);

  const fnAllDocs = allSos.filter((c) =>
    inCnRange(c, 289, 300) && c.treatment === "borderless",
  );
  const fnR = fnAllDocs.filter((c) => c.rarity === "rare").map((c) => c.collector_number);
  const fnM = fnAllDocs.filter((c) => c.rarity === "mythic").map((c) => c.collector_number);
  const fnAll = fnAllDocs.map((c) => c.collector_number);

  const bdlLandR = allSos
    .filter((c) => inCnRange(c, 301, 305) && c.rarity === "rare" && c.treatment === "borderless")
    .map((c) => c.collector_number);

  const eaDocs = allSos.filter((c) =>
    inCnRange(c, 307, 362) && c.treatment === "extended_art",
  );
  const eaR = eaDocs.filter((c) => c.rarity === "rare").map((c) => c.collector_number);
  const eaM = eaDocs.filter((c) => c.rarity === "mythic").map((c) => c.collector_number);

  const bdlSlot11AllR = bdlLandR;           // 5R at CN 301-305
  const bdlSlot11AllM = bdlPwDragonsM;      // 7M at CN 282-288

  // ── Sanity checks against WOTC / mtgscribe counts ──
  const expect = (got: number, want: number, label: string) => {
    const ok = got === want;
    console.log(`  ${ok ? "✅" : "⚠️ "} ${label}: ${got}${ok ? "" : ` (expected ${want})`}`);
  };

  console.log("SOS pool sanity checks:");
  expect(mainCommons.length, 81, "mainline commons (CN 1-266 C, excl. 5 duals)");
  expect(mainUncommons.length, 100, "mainline uncommons (CN 1-266 U)");
  expect(mainRares.length, 60, "mainline rares (CN 1-266 R, incl. 7 land rares)");
  expect(mainMythics.length, 20, "mainline mythics (CN 1-266 M)");
  expect(dualLands.length, 5, "common-rarity dual lands");
  expect(fullArtBasics.length, 5, "Full-Art basics (CN 267-271)");
  expect(defaultBasics.length, 10, "default basics (CN 272-281)");
  expect(bdlPwDragonsM.length, 7, "Borderless PW + Elder Dragons (CN 282-288 M borderless)");
  expect(fnR.length, 6, "Borderless Field Notes rares (CN 289-300 R borderless)");
  expect(fnM.length, 6, "Borderless Field Notes mythics (CN 289-300 M borderless)");
  expect(bdlLandR.length, 5, "Borderless Lands (CN 301-305 R borderless)");
  expect(eaR.length, 49, "Extended Art rares (CN 307-362 R ext-art)");
  expect(eaM.length, 7, "Extended Art mythics (CN 307-362 M ext-art)");

  return {
    mainCommons,
    mainUncommons,
    mainRares,
    mainMythics,
    dualLands,
    fullArtBasics,
    defaultBasics,
    bdlPwDragonsM,
    fnR,
    fnM,
    bdlLandR,
    eaR,
    eaM,
    bdlSlot11AllR,
    bdlSlot11AllM,
    fnAll,
  };
}

// ── Play Booster ────────────────────────────────────────────────────────────
//
// 14 cards + 1 token = 15 slots. SOS is a PREMIUM Play Booster box with
// 30 packs/display (not the standard 36 — same structural oddity as TLA).
// Probabilities from mtgscribe fact sheet + theexpectedvalue.com's slot
// constants where WOTC's "<1%" values need concrete numbers.
function buildPlayBooster(pools: AllPools): EvBoosterConfig {
  const commonFilter = { set_codes: [SET_CODE], custom_pool: pools.mainCommons };
  const uncommonFilter = { set_codes: [SET_CODE], custom_pool: pools.mainUncommons };
  const rareFilter = { set_codes: [SET_CODE], custom_pool: pools.mainRares };
  const mythicFilter = { set_codes: [SET_CODE], custom_pool: pools.mainMythics };
  const dualFilter = { set_codes: [SET_CODE], custom_pool: pools.dualLands };
  const fullArtBasicFilter = { set_codes: [SET_CODE], custom_pool: pools.fullArtBasics };
  const defaultBasicFilter = { set_codes: [SET_CODE], custom_pool: pools.defaultBasics };
  // Slot 10/11 borderless: use the full 12-card pool (7M PW/ED #282-288 +
  // 5R borderless lands #301-305). Matches theexpectedvalue's
  // `borderlessRares.concat(borderlessMythics)` approach.
  const bdlAllFilter = {
    set_codes: [SET_CODE],
    custom_pool: [...pools.bdlSlot11AllR, ...pools.bdlSlot11AllM],
  };
  const fnAllFilter = { set_codes: [SET_CODE], custom_pool: pools.fnAll };

  return {
    packs_per_box: 30,
    cards_per_pack: 14,
    slots: [
      // 1-5: Commons (5 slots, excludes 5 duals + all basics)
      ...[1, 2, 3, 4, 5].map((n) => ({
        slot_number: n,
        label: `Common ${n}`,
        is_foil: false,
        outcomes: [{ probability: 1, filter: commonFilter }],
      })),

      // 6: Common / SPG (1-in-55 replacement = 1.818%)
      {
        slot_number: 6,
        label: "Common / SPG",
        is_foil: false,
        outcomes: [
          { probability: 0.98182, filter: commonFilter },
          { probability: 0.01818, filter: { set_codes: ["spg"], custom_pool: SPG_SOS_CNS } },
        ],
      },

      // 7-9: Uncommons (3 slots, 100-card pool)
      ...[7, 8, 9].map((n) => ({
        slot_number: n,
        label: `Uncommon ${n - 6}`,
        is_foil: false,
        outcomes: [{ probability: 1, filter: uncommonFilter }],
      })),

      // 10: Wildcard (any rarity + borderless + Field Notes)
      // Per theexpectedvalue: C 39.1, U 39.1, R 19.5, M 1.9, BDL 0.3, FN 0.1
      // (Wizards publishes the 4 main rates exactly; BDL and FN are explicit
      //  assumptions filling the residual ~0.4% <1% mass.)
      {
        slot_number: 10,
        label: "Wildcard",
        is_foil: false,
        outcomes: [
          { probability: 0.391, filter: commonFilter },
          { probability: 0.391, filter: uncommonFilter },
          { probability: 0.195, filter: rareFilter },
          { probability: 0.019, filter: mythicFilter },
          // Borderless (12 cards: 5R #301-305 + 7M #282-288)
          { probability: 0.003, filter: bdlAllFilter },
          // Field Notes (12 cards #289-300, 6R + 6M)
          { probability: 0.001, filter: fnAllFilter },
        ],
      },

      // 11: Rare / Mythic + Booster Fun
      // Published: R 82.5, M 14.1, BDL 1.6, FN R 1.2. Residual 0.6%
      // attributed to FN M per theexpectedvalue.com.
      {
        slot_number: 11,
        label: "Rare / Mythic",
        is_foil: false,
        outcomes: [
          { probability: 0.825, filter: rareFilter },
          { probability: 0.141, filter: mythicFilter },
          // BDL combined (12 cards: 5R at #301-305 + 7M at #282-288)
          { probability: 0.016, filter: bdlAllFilter },
          { probability: 0.012, filter: { set_codes: [SET_CODE], custom_pool: pools.fnR } },
          { probability: 0.006, filter: { set_codes: [SET_CODE], custom_pool: pools.fnM } },
        ],
      },

      // 12: Mystical Archive — non-Japanese Play Booster variant
      // Per WOTC: U 87.5, R 9.6, M 2.9 (sum = 100%)
      {
        slot_number: 12,
        label: "Mystical Archive",
        is_foil: false,
        outcomes: [
          {
            probability: 0.875,
            filter: { set_codes: ["soa"], rarity: ["uncommon"], collector_number_min: 1, collector_number_max: 65 },
          },
          {
            probability: 0.096,
            filter: { set_codes: ["soa"], rarity: ["rare"], collector_number_min: 1, collector_number_max: 65 },
          },
          {
            probability: 0.029,
            filter: { set_codes: ["soa"], rarity: ["mythic"], collector_number_min: 1, collector_number_max: 65 },
          },
        ],
      },

      // 13: Traditional Foil — rarity distribution + MA + BDL + FN
      // Published: C 54.4, U 33.6, R 6.7, M 1.1, MA U 2.8. Residual 1.4%
      // split per theexpectedvalue: BDL 0.4, FN 0.2, MA R 0.6, MA M 0.2.
      {
        slot_number: 13,
        label: "Traditional Foil",
        is_foil: true,
        outcomes: [
          { probability: 0.544, filter: commonFilter },
          { probability: 0.336, filter: uncommonFilter },
          { probability: 0.067, filter: rareFilter },
          { probability: 0.011, filter: mythicFilter },
          { probability: 0.004, filter: bdlAllFilter },
          { probability: 0.002, filter: fnAllFilter },
          {
            probability: 0.028,
            filter: { set_codes: ["soa"], rarity: ["uncommon"], collector_number_min: 1, collector_number_max: 65 },
          },
          {
            probability: 0.006,
            filter: { set_codes: ["soa"], rarity: ["rare"], collector_number_min: 1, collector_number_max: 65 },
          },
          {
            probability: 0.002,
            filter: { set_codes: ["soa"], rarity: ["mythic"], collector_number_min: 1, collector_number_max: 65 },
          },
        ],
      },

      // 14: Land — three distinct buckets (Dual / Full-Art / Default) with
      // distinct slot-14 rates per WOTC. Full-Art basics #267-271 trend
      // €0.54-0.78 NF (above sift floor); default basics #272-281 trend
      // €0.10-0.18 NF (below sift floor). Split matters for EV attribution.
      {
        slot_number: 14,
        label: "Land",
        is_foil: false,
        outcomes: [
          // Dual lands (5 common-rarity duals)
          { probability: 0.400, filter: dualFilter },
          { probability: 0.100, is_foil: true, filter: dualFilter },
          // Full-Art / Spellcraft basics (CN 267-271, 5 cards)
          { probability: 0.133, filter: fullArtBasicFilter },
          { probability: 0.033, is_foil: true, filter: fullArtBasicFilter },
          // Default basics (CN 272-281, 10 cards)
          { probability: 0.267, filter: defaultBasicFilter },
          { probability: 0.067, is_foil: true, filter: defaultBasicFilter },
        ],
      },

      // 15: Token — no EV
      { slot_number: 15, label: "Token", is_foil: false, outcomes: [] },
    ],
  };
}

// ── Collector Booster ───────────────────────────────────────────────────────
//
// 15 cards + 1 art/token = 16 slots. 12 packs per display box (standard CB).
// Probabilities from WOTC collecting article; slot 10 "Spellcraft Land" is
// our best-evidence interpretation (5 borderless rare dual lands at CN
// 301-305); see notes/ev/sos.md for alternatives.
function buildCollectorBooster(pools: AllPools): EvBoosterConfig {
  // CB foil common pool = 81 mainline commons + 5 duals = 86 cards
  const cbCommonPool = [...pools.mainCommons, ...pools.dualLands];

  // MA Uncommon slot outcomes (slots 8, 9) — 31.7/31.7/31.7/5.0 per WOTC
  const maUncommonOutcomes = [
    // Non-foil English MA U (CN 1-65 U)
    {
      probability: 0.317,
      filter: { set_codes: ["soa"], rarity: ["uncommon"], collector_number_min: 1, collector_number_max: 65 },
    },
    // Foil English MA U (same pool, is_foil override)
    {
      probability: 0.317,
      is_foil: true,
      filter: { set_codes: ["soa"], rarity: ["uncommon"], collector_number_min: 1, collector_number_max: 65 },
    },
    // Non-foil Japanese MA U (CN 66-130 U)
    {
      probability: 0.317,
      filter: { set_codes: ["soa"], rarity: ["uncommon"], collector_number_min: 66, collector_number_max: 130 },
    },
    // Silver-scroll JP MA U (CN 131-195 U, foil-only)
    {
      probability: 0.050,
      is_foil: true,
      filter: { set_codes: ["soa"], rarity: ["uncommon"], collector_number_min: 131, collector_number_max: 195 },
    },
  ];

  // MA R/M slot (slot 14) — 6 outcomes, 25.6/7.7 per variant × 3 variants
  const maRmOutcomes = [
    // Non-foil English
    {
      probability: 0.256,
      filter: { set_codes: ["soa"], rarity: ["rare"], collector_number_min: 1, collector_number_max: 65 },
    },
    {
      probability: 0.077,
      filter: { set_codes: ["soa"], rarity: ["mythic"], collector_number_min: 1, collector_number_max: 65 },
    },
    // Japanese
    {
      probability: 0.256,
      filter: { set_codes: ["soa"], rarity: ["rare"], collector_number_min: 66, collector_number_max: 130 },
    },
    {
      probability: 0.077,
      filter: { set_codes: ["soa"], rarity: ["mythic"], collector_number_min: 66, collector_number_max: 130 },
    },
    // Foil English (same CN range, is_foil override)
    {
      probability: 0.256,
      is_foil: true,
      filter: { set_codes: ["soa"], rarity: ["rare"], collector_number_min: 1, collector_number_max: 65 },
    },
    {
      probability: 0.077,
      is_foil: true,
      filter: { set_codes: ["soa"], rarity: ["mythic"], collector_number_min: 1, collector_number_max: 65 },
    },
  ];

  return {
    packs_per_box: 12,
    cards_per_pack: 15,
    slots: [
      // 1-4: Foil Commons (86-card pool: 81 mainline commons + 5 duals)
      ...[1, 2, 3, 4].map((n) => ({
        slot_number: n,
        label: `Foil Common ${n}`,
        is_foil: true,
        outcomes: [{ probability: 1, filter: { set_codes: [SET_CODE], custom_pool: cbCommonPool } }],
      })),

      // 5-7: Foil Uncommons (100-card pool)
      ...[5, 6, 7].map((n) => ({
        slot_number: n,
        label: `Foil Uncommon ${n - 4}`,
        is_foil: true,
        outcomes: [{ probability: 1, filter: { set_codes: [SET_CODE], custom_pool: pools.mainUncommons } }],
      })),

      // 8-9: MA Uncommon (×2 slots, same distribution)
      ...[8, 9].map((n) => ({
        slot_number: n,
        label: `MA Uncommon ${n - 7}`,
        is_foil: false,
        outcomes: maUncommonOutcomes,
      })),

      // 10: Spellcraft Land (trad foil) — 5 Full-Art basics CN 267-271.
      // "Spellcraft" is WOTC's name for the premium-frame basic-land
      // treatment (same pool used in Play slot 14's 13.3+3.3% Full-Art
      // bucket). The 5 borderless rare dual lands at CN 301-305 are
      // "Portal View / Borderless Lands" and appear in the Booster Fun
      // slots (13 non-foil + 15 foil), not a dedicated Land slot.
      {
        slot_number: 10,
        label: "Spellcraft Land",
        is_foil: true,
        outcomes: [
          { probability: 1, filter: { set_codes: [SET_CODE], custom_pool: pools.fullArtBasics } },
        ],
      },

      // 11: Rare/Mythic Foil — mainline only (60 R + 20 M)
      {
        slot_number: 11,
        label: "Rare / Mythic Foil",
        is_foil: true,
        outcomes: [
          { probability: 0.857, filter: { set_codes: [SET_CODE], custom_pool: pools.mainRares } },
          { probability: 0.143, filter: { set_codes: [SET_CODE], custom_pool: pools.mainMythics } },
        ],
      },

      // 12: SOC Non-foil — 10 borderless commanders (9%) + 48 EA rares (91%)
      {
        slot_number: 12,
        label: "SOC Non-foil",
        is_foil: false,
        outcomes: [
          {
            probability: 0.09,
            filter: {
              set_codes: ["soc"],
              rarity: ["mythic"],
              collector_number_min: 1,
              collector_number_max: SOC_COMMANDER_CN_MAX,
            },
          },
          {
            probability: 0.91,
            filter: {
              set_codes: ["soc"],
              rarity: ["rare"],
              collector_number_min: SOC_EA_CN_MIN,
              collector_number_max: SOC_EA_CN_MAX,
            },
          },
        ],
      },

      // 13: Non-foil Booster Fun — EA + BDL + FN split per WOTC
      // 0.70 + 0.05 + 0.071 + 0.05 + 0.086 + 0.043 = 1.000
      {
        slot_number: 13,
        label: "Non-foil Booster Fun",
        is_foil: false,
        outcomes: [
          { probability: 0.700, filter: { set_codes: [SET_CODE], custom_pool: pools.eaR } },
          { probability: 0.050, filter: { set_codes: [SET_CODE], custom_pool: pools.eaM } },
          { probability: 0.071, filter: { set_codes: [SET_CODE], custom_pool: pools.bdlLandR } },
          { probability: 0.050, filter: { set_codes: [SET_CODE], custom_pool: pools.bdlPwDragonsM } },
          { probability: 0.086, filter: { set_codes: [SET_CODE], custom_pool: pools.fnR } },
          { probability: 0.043, filter: { set_codes: [SET_CODE], custom_pool: pools.fnM } },
        ],
      },

      // 14: MA R/M — 6 outcomes across 3 variants
      {
        slot_number: 14,
        label: "MA Rare / Mythic",
        is_foil: false,
        outcomes: maRmOutcomes,
      },

      // 15: Foil Booster Fun — 9 outcomes, includes silver-scroll JP MA + SPG foil
      // Serialized Emeritus (<1%) NOT modeled (see notes).
      {
        slot_number: 15,
        label: "Foil Booster Fun",
        is_foil: true,
        outcomes: [
          { probability: 0.599, filter: { set_codes: [SET_CODE], custom_pool: pools.eaR } },
          { probability: 0.043, filter: { set_codes: [SET_CODE], custom_pool: pools.eaM } },
          { probability: 0.061, filter: { set_codes: [SET_CODE], custom_pool: pools.bdlLandR } },
          { probability: 0.043, filter: { set_codes: [SET_CODE], custom_pool: pools.bdlPwDragonsM } },
          { probability: 0.073, filter: { set_codes: [SET_CODE], custom_pool: pools.fnR } },
          { probability: 0.037, filter: { set_codes: [SET_CODE], custom_pool: pools.fnM } },
          // Silver-scroll JP MA (foil-only, CN 131-195)
          {
            probability: 0.077,
            filter: { set_codes: ["soa"], rarity: ["rare"], collector_number_min: 131, collector_number_max: 195 },
          },
          {
            probability: 0.023,
            filter: { set_codes: ["soa"], rarity: ["mythic"], collector_number_min: 131, collector_number_max: 195 },
          },
          // SPG foil (10 SOS-flavored cards). #158a is nonfoil-only on Scryfall
          // → its contribution to this slot is €0. Minor under-weighting.
          {
            probability: 0.045,
            filter: { set_codes: ["spg"], custom_pool: SPG_SOS_CNS },
          },
        ],
      },

      // 16: Art card / Token — no EV
      { slot_number: 16, label: "Art Card / Token", is_foil: false, outcomes: [] },
    ],
  };
}

async function main() {
  const pools = await buildPools();
  const playBooster = buildPlayBooster(pools);
  const collectorBooster = buildCollectorBooster(pools);

  // Sanity-check: slot probabilities should sum to ~1.0 each.
  const checkSlots = (cfg: EvBoosterConfig, name: string) => {
    for (const slot of cfg.slots) {
      const sum = slot.outcomes.reduce((s, o) => s + o.probability, 0);
      if (slot.outcomes.length > 0 && Math.abs(sum - 1) > 0.003) {
        console.warn(`  ⚠️  ${name} slot ${slot.slot_number} (${slot.label}): probabilities sum to ${sum.toFixed(4)} (expected 1.0)`);
      }
    }
  };
  console.log("\nSlot probability checks:");
  checkSlots(playBooster, "Play");
  checkSlots(collectorBooster, "Collector");

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
        collector_booster: collectorBooster,
        updated_at: now,
        updated_by: "seed-script",
      },
    },
    { upsert: true },
  );
  console.log(`\nSaved Play + Collector Booster configs for ${SET_CODE} (sift_floor=0.25, fee_rate=0.05).`);

  console.log(`\nGenerating snapshot…`);
  const snap = await generateSnapshot(SET_CODE);
  if (!snap) {
    console.error(`  Failed to generate snapshot for ${SET_CODE}.`);
  } else {
    console.log(`  date=${snap.date}`);
    console.log(`  play_ev_gross=€${snap.play_ev_gross}`);
    console.log(`  play_ev_net=€${snap.play_ev_net}`);
    console.log(`  play_pack_ev_net=€${snap.play_pack_ev_net}`);
    console.log(`  collector_ev_gross=€${snap.collector_ev_gross}`);
    console.log(`  collector_ev_net=€${snap.collector_ev_net}`);
    console.log(`  collector_pack_ev_net=€${snap.collector_pack_ev_net}`);
    console.log(`  card_count_total=${snap.card_count_total}`);
    console.log(`  card_count_priced=${snap.card_count_priced}`);
  }

  await (await getClient()).close();
}

main().catch((e) => { console.error(e); process.exit(1); });
