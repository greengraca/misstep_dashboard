/**
 * Seed the EV config for Avatar: The Last Airbender (tla).
 *
 * Encodes the Play + Collector Booster structure documented by Wizards of
 * the Coast's collecting article, Mike Provencher's mtgscribe Play fact
 * sheet, and MTGPrice's Mana Math article. See notes/ev/tla.md for the
 * full source-by-source breakdown of every probability and every
 * collector-number list referenced below.
 *
 * Known structural oddity: Play Booster is 30 packs/box (not 36 like
 * standard Play Boosters). Premium packaging / premium price point.
 *
 * Elemental Frame vs Battle Pose pool ambiguity (see notes/ev/tla.md):
 * Scryfall metadata doesn't distinguish them — both share
 * frame_effects: ["inverted"], border: "borderless", boosterfun promo.
 * We split by CN heuristic (297-315 + 333 = Elemental; 331-332, 334-335
 * = Battle Pose regular) and apply WOTC's family-level rates to each.
 *
 * Idempotent — safe to re-run; uses upsert on { set_code: "tla" }.
 */

try {
  process.loadEnvFile(".env");
} catch {
  // .env missing — MONGODB_URI check below will fail with a useful error.
}

import { getDb, getClient } from "../lib/mongodb";
import { generateSnapshot } from "../lib/ev";
import type { EvBoosterConfig } from "../lib/types";

const SET_CODE = "tla";

// ── CN-range boundaries for each Booster Fun family ──
// Verified against Scryfall's set-page section anchors
// (scryfall.com/sets/tla#borderless-scene-cards-book-1 etc.):
//   297-315 = Borderless Scene Cards (Book 1/2/3) — 19 cards, 4U+11R+4M
//   316-330 = Borderless Field Notes — 15 cards, 8R+7M
//   331-335 = Borderless Battle Pose Cards (regular) — 5 cards, 2R+3M
//   336-353 = Elemental Frame Cards — 18 cards, 15R+3M
//   354-358 = Borderless Double-Faced Sagas — 5M
//   359-362 = Borderless Neon Ink Battle Pose Cards — 4R (textless, CB-only)
//   363     = Borderless Raised Foil Avatar Aang — 1M (CB-only, English-only)
//   364-392 = Extended Art Cards — 28R+1M (CB-only per WOTC)
//   393     = Buy-a-Box promo (not in boosters)
//   394     = Bundle promo (not in boosters)

// The 4 uncommon scene cards (Play slot 8-10 at 3.6%, CB slot 9 at 8%).
const UNCOMMON_SCENE_CNS = ["299", "300", "301", "306"];

// Neon Ink Battle Pose (CB-only, textless, 4R)
const NEON_INK_CNS = ["359", "360", "361", "362"];

// Raised Foil Avatar Aang (CB-only, English-only, 1M)
const RAISED_FOIL_AANG_CN = "363";

// Buy-a-Box + Bundle promo CNs (not in boosters, excluded from EA pool)
const NON_BOOSTER_EA_CNS = ["393", "394"];

// Full-art basic series — contiguous CN ranges verified via Scryfall + EV-calc:
//   Appa basics:           TLA 287-291 (5 cards, 1 of each basic type)
//   Avatar's Journey:      TLA 292-296 (5 cards, 1 of each basic type)
const APPA_BASIC_CNS = ["287", "288", "289", "290", "291"];
const JOURNEY_BASIC_CNS = ["292", "293", "294", "295", "296"];

// Layouts that indicate a DFC card
const DFC_LAYOUTS = new Set(["transform", "modal_dfc"]);

interface TlaDoc {
  collector_number: string;
  name?: string;
  rarity?: string;
  treatment?: string;
  frame?: string;
  frame_effects?: string[];
  promo_types?: string[];
  booster?: boolean;
  type_line?: string;
  layout?: string;
  border_color?: string;
  full_art?: boolean;
  textless?: boolean;
}

interface AllPools {
  // Play Booster pools
  mainCommons: string[];        // 80 — CN 1-262 rarity=common (spells only)
  mainUncommons: string[];      // 110 — mainline uncommons 109 spells + 1 #281 land
  mainRares: string[];          // 60 — 53 spell R + 7 land R
  mainMythics: string[];        // 20 — all spell M
  dualLands: string[];          // 11 — common-rarity lands in 263-281
  defaultBasics: string[];      // 5 — CN 282-286
  appaBasics: string[];         // 5 — CN 287-291
  journeyBasics: string[];      // 5 — CN 292-296
  uncommonScene: string[];      // 4 — CN 299-301, 306 (U Scene Cards)
  // Booster Fun R/M pools — CN ranges per Scryfall set-page anchors
  sceneR: string[];             // 11 — CN 297-315 R (Borderless Scene Cards)
  sceneM: string[];             // 4 — CN 297-315 M
  fieldNotesR: string[];        // 8 — CN 316-330 R
  fieldNotesM: string[];        // 7 — CN 316-330 M
  battlePoseR: string[];        // 2 — CN 333, 334 (Borderless Battle Pose Cards R)
  battlePoseM: string[];        // 3 — CN 331, 332, 335
  elementalR: string[];         // 15 — CN 336-353 R (Elemental Frame Cards)
  elementalM: string[];         // 3 — CN 336-353 M
  dfcSagaM: string[];           // 5 — CN 354-358
  // Collector-only pools
  neonInkR: string[];           // 4 — CN 359-362
  raisedFoilAangM: string[];    // 1 — CN 363
  extendedArtR: string[];       // 28 — CN 364-392 R (excluding 393, 394 promos)
  extendedArtM: string[];       // 1 — CN 385
  // Full-art basics combined (for Collector slot 10 — 50/50 over the 10 FA basics)
  fullArtBasicsAll: string[];   // 10 — CN 287-296
}

async function buildPools(): Promise<AllPools> {
  const db = await getDb();
  const cards = db.collection("dashboard_ev_cards");

  const allTla = (await cards
    .find({ set: SET_CODE })
    .project({
      collector_number: 1, name: 1, rarity: 1, treatment: 1, frame: 1,
      frame_effects: 1, promo_types: 1, booster: 1, type_line: 1, layout: 1,
      border_color: 1, full_art: 1, textless: 1,
    })
    .toArray()) as unknown as TlaDoc[];

  if (allTla.length === 0) {
    throw new Error(
      `No ${SET_CODE} cards in dashboard_ev_cards. Sync tla from Scryfall first.`,
    );
  }

  const allTle = (await cards
    .find({ set: "tle" })
    .project({
      collector_number: 1, name: 1, rarity: 1, treatment: 1,
      frame_effects: 1, promo_types: 1, booster: 1, type_line: 1,
    })
    .toArray()) as unknown as TlaDoc[];

  if (allTle.length === 0) {
    throw new Error(
      `No tle cards in dashboard_ev_cards. Sync tle before seeding tla.`,
    );
  }

  const cn = (c: TlaDoc): number => {
    const n = parseInt(c.collector_number, 10);
    return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
  };
  const inRange = (lo: number, hi: number) => (c: TlaDoc) => {
    const n = cn(c); return n >= lo && n <= hi;
  };
  const hasFx = (c: TlaDoc, fx: string) => (c.frame_effects ?? []).includes(fx);

  // ── Main spell pool (CN 1-262) ──
  const spells = allTla.filter(inRange(1, 262));
  const mainCommonsSpells = spells.filter((c) => c.rarity === "common").map((c) => c.collector_number);
  const mainUncommonsSpells = spells.filter((c) => c.rarity === "uncommon").map((c) => c.collector_number);
  const mainRaresSpells = spells.filter((c) => c.rarity === "rare").map((c) => c.collector_number);
  const mainMythicsSpells = spells.filter((c) => c.rarity === "mythic").map((c) => c.collector_number);

  // ── Main land pools (CN 263-281) ──
  const lands = allTla.filter(inRange(263, 281));
  const dualLands = lands.filter((c) => c.rarity === "common").map((c) => c.collector_number);
  const landRares = lands.filter((c) => c.rarity === "rare").map((c) => c.collector_number);
  const landUncommons = lands.filter((c) => c.rarity === "uncommon").map((c) => c.collector_number);

  // ── Combined mainline pools (used by Play slots 8-10, 11, CB slot 11) ──
  // Uncommons: 109 spells + 1 land (#281)
  const mainUncommons = [...mainUncommonsSpells, ...landUncommons];
  // Rares: 53 spells + 7 lands
  const mainRares = [...mainRaresSpells, ...landRares];
  const mainMythics = [...mainMythicsSpells];

  // ── Basic lands ──
  const defaultBasics = allTla.filter(inRange(282, 286)).map((c) => c.collector_number);
  const appaBasics = APPA_BASIC_CNS;
  const journeyBasics = JOURNEY_BASIC_CNS;
  const fullArtBasicsAll = allTla.filter(inRange(287, 296)).map((c) => c.collector_number);

  // ── Uncommon Scene Cards (CN 299-301, 306) ──
  const uncommonScene = UNCOMMON_SCENE_CNS;

  // ── Booster Fun R/M pools (CN ranges per Scryfall set-page) ──
  // Scene Cards: CN 297-315 (excluding the 4 uncommons which live in
  // `uncommonScene` and are handled by a separate rate)
  const sceneAll = allTla.filter((c) => {
    const n = cn(c);
    return n >= 297 && n <= 315 && c.rarity !== "uncommon";
  });
  const sceneR = sceneAll.filter((c) => c.rarity === "rare").map((c) => c.collector_number);
  const sceneM = sceneAll.filter((c) => c.rarity === "mythic").map((c) => c.collector_number);

  // Field Notes: CN 316-330
  const fnAll = allTla.filter(inRange(316, 330));
  const fieldNotesR = fnAll.filter((c) => c.rarity === "rare").map((c) => c.collector_number);
  const fieldNotesM = fnAll.filter((c) => c.rarity === "mythic").map((c) => c.collector_number);

  // Battle Pose (regular): CN 331-335 — 5 cards, 2R + 3M
  //   331 United Front (M), 332 Sozin's Comet (M), 333 Avatar Destiny (R),
  //   334 Fire Lord Azula (R), 335 Ozai, the Phoenix King (M)
  const battleAll = allTla.filter(inRange(331, 335));
  const battlePoseR = battleAll.filter((c) => c.rarity === "rare").map((c) => c.collector_number);
  const battlePoseM = battleAll.filter((c) => c.rarity === "mythic").map((c) => c.collector_number);

  // Elemental Frame Cards: CN 336-353 (15R + 3M)
  const elementalAll = allTla.filter(inRange(336, 353));
  const elementalR = elementalAll.filter((c) => c.rarity === "rare").map((c) => c.collector_number);
  const elementalM = elementalAll.filter((c) => c.rarity === "mythic").map((c) => c.collector_number);

  // DFC Sagas (CN 354-358, all mythic)
  const dfcSagaM = allTla.filter(inRange(354, 358)).map((c) => c.collector_number);

  // ── Collector-only pools ──
  const neonInkR = NEON_INK_CNS;
  const raisedFoilAangM = [RAISED_FOIL_AANG_CN];

  // Extended Art (CN 364-392, excluding 393/394 promos)
  const eaAll = allTla.filter(
    (c) => {
      const n = cn(c);
      return n >= 364 && n <= 392 && !NON_BOOSTER_EA_CNS.includes(c.collector_number);
    },
  );
  const extendedArtR = eaAll.filter((c) => c.rarity === "rare").map((c) => c.collector_number);
  const extendedArtM = eaAll.filter((c) => c.rarity === "mythic").map((c) => c.collector_number);

  // ── Sanity checks against WOTC counts ──
  const expect = (got: number, want: number, label: string) => {
    const ok = got === want;
    console.log(`  ${ok ? "✅" : "⚠️ "} ${label}: ${got}${ok ? "" : ` (expected ${want})`}`);
  };

  console.log("TLA pool sanity checks:");
  expect(mainCommonsSpells.length, 80, "main spell commons (CN 1-262 C)");
  expect(mainUncommons.length, 110, "main uncommons (109 spells + 1 land)");
  expect(mainRares.length, 60, "main rares (53 spells + 7 lands)");
  expect(mainMythics.length, 20, "main mythics");
  expect(dualLands.length, 11, "common dual lands (CN 263-281 C)");
  expect(defaultBasics.length, 5, "default-frame basics (CN 282-286)");
  expect(fullArtBasicsAll.length, 10, "full-art basics (CN 287-296)");
  expect(appaBasics.length, 5, "Appa basics (CN 287-291)");
  expect(journeyBasics.length, 5, "Avatar's Journey basics (CN 292-296)");
  expect(uncommonScene.length, 4, "uncommon scene cards (CN 299-301, 306)");
  expect(sceneR.length, 11, "scene card R (CN 297-315 R, excl U)");
  expect(sceneM.length, 4, "scene card M (CN 297-315 M)");
  expect(fieldNotesR.length, 8, "field notes R (CN 316-330 R)");
  expect(fieldNotesM.length, 7, "field notes M (CN 316-330 M)");
  expect(battlePoseR.length, 2, "battle pose R (CN 333, 334)");
  expect(battlePoseM.length, 3, "battle pose M (CN 331, 332, 335)");
  expect(elementalR.length, 15, "elemental frame R (CN 336-353 R)");
  expect(elementalM.length, 3, "elemental frame M (CN 336-353 M)");
  expect(dfcSagaM.length, 5, "DFC saga M (CN 354-358)");
  expect(neonInkR.length, 4, "neon ink battle pose R (CN 359-362)");
  expect(raisedFoilAangM.length, 1, "raised foil Aang M (CN 363)");
  expect(extendedArtR.length, 28, "extended art R (CN 364-392 excl promos)");
  expect(extendedArtM.length, 1, "extended art M (#385)");

  console.log("\nTLE pool sanity checks:");
  const tleSourceMaterial = allTle.filter(inRange(1, 61));
  const tleSceneBox = allTle.filter(inRange(62, 73));
  const tleJumpstartMain = allTle.filter(inRange(74, 170));
  const tleJumpstartEA = allTle.filter(inRange(171, 209));
  const tleBeginnerBox = allTle.filter(inRange(210, 264));
  expect(tleSourceMaterial.length, 61, "TLE 1-61 Source Material (all mythic)");
  expect(tleSceneBox.length, 12, "TLE 62-73 Scene Box new-to-Magic (all rare)");
  expect(
    tleJumpstartMain.filter((c) => c.rarity === "common").length, 22,
    "TLE 74-170 Jumpstart commons",
  );
  expect(
    tleJumpstartMain.filter((c) => c.rarity === "uncommon").length, 32,
    "TLE 74-170 Jumpstart uncommons",
  );
  expect(
    tleJumpstartMain.filter((c) => c.rarity === "rare").length, 32,
    "TLE 74-170 Jumpstart rares",
  );
  expect(
    tleJumpstartMain.filter((c) => c.rarity === "mythic").length, 11,
    "TLE 74-170 Jumpstart mythics",
  );
  expect(
    tleJumpstartEA.filter((c) => c.rarity === "rare").length, 28,
    "TLE 171-209 Jumpstart EA rares",
  );
  expect(
    tleJumpstartEA.filter((c) => c.rarity === "mythic").length, 11,
    "TLE 171-209 Jumpstart EA mythics",
  );
  expect(
    tleBeginnerBox.filter((c) => c.rarity === "common").length, 31,
    "TLE 210-264 Beginner Box commons",
  );
  expect(
    tleBeginnerBox.filter((c) => c.rarity === "uncommon").length, 14,
    "TLE 210-264 Beginner Box uncommons",
  );
  expect(
    tleBeginnerBox.filter((c) => c.rarity === "rare").length, 10,
    "TLE 210-264 Beginner Box rares",
  );

  return {
    mainCommons: mainCommonsSpells,
    mainUncommons,
    mainRares,
    mainMythics,
    dualLands,
    defaultBasics,
    appaBasics,
    journeyBasics,
    fullArtBasicsAll,
    uncommonScene,
    sceneR, sceneM,
    fieldNotesR, fieldNotesM,
    battlePoseR, battlePoseM,
    elementalR, elementalM,
    dfcSagaM,
    neonInkR,
    raisedFoilAangM,
    extendedArtR, extendedArtM,
  };
}

function buildPlayBooster(pools: AllPools): EvBoosterConfig {
  const commonFilter = { set_codes: [SET_CODE], custom_pool: pools.mainCommons };
  const uncommonFilter = { set_codes: [SET_CODE], custom_pool: pools.mainUncommons };
  const rareFilter = { set_codes: [SET_CODE], custom_pool: pools.mainRares };
  const mythicFilter = { set_codes: [SET_CODE], custom_pool: pools.mainMythics };

  return {
    packs_per_box: 30,
    cards_per_pack: 14,
    slots: [
      // 1-6: Commons (6 slots)
      ...[1, 2, 3, 4, 5, 6].map((n) => ({
        slot_number: n,
        label: `Common ${n}`,
        is_foil: false,
        outcomes: [{ probability: 1, filter: commonFilter }],
      })),

      // 7: Common / Source Material (1-in-26 replacement)
      {
        slot_number: 7,
        label: "Common / Source Material",
        is_foil: false,
        outcomes: [
          { probability: 0.9615, filter: commonFilter },
          {
            probability: 0.0385,
            filter: { set_codes: ["tle"], collector_number_min: 1, collector_number_max: 61 },
          },
        ],
      },

      // 8-10: Uncommons (3 slots; 3.6% U Scene replacement)
      ...[8, 9, 10].map((n) => ({
        slot_number: n,
        label: `Uncommon ${n - 7}`,
        is_foil: false,
        outcomes: [
          { probability: 0.964, filter: uncommonFilter },
          { probability: 0.036, filter: { set_codes: [SET_CODE], custom_pool: pools.uncommonScene } },
        ],
      })),

      // 11: Rare / Mythic + Booster Fun
      // 92.6% main (80 R + 12.6 M) + 7.4% BF
      {
        slot_number: 11,
        label: "Rare / Mythic",
        is_foil: false,
        outcomes: [
          { probability: 0.800, filter: rareFilter },
          { probability: 0.126, filter: mythicFilter },
          // Scene 1.6% R + 0.4% M
          { probability: 0.016, filter: { set_codes: [SET_CODE], custom_pool: pools.sceneR } },
          { probability: 0.004, filter: { set_codes: [SET_CODE], custom_pool: pools.sceneM } },
          // Field Notes 1.4% R + 0.6% M
          { probability: 0.014, filter: { set_codes: [SET_CODE], custom_pool: pools.fieldNotesR } },
          { probability: 0.006, filter: { set_codes: [SET_CODE], custom_pool: pools.fieldNotesM } },
          // Elemental Frame 2.4% R + 0.5% M
          { probability: 0.024, filter: { set_codes: [SET_CODE], custom_pool: pools.elementalR } },
          { probability: 0.005, filter: { set_codes: [SET_CODE], custom_pool: pools.elementalM } },
          // Battle Pose 0.3% R + 0.1% M (WOTC "<1%" combined)
          { probability: 0.003, filter: { set_codes: [SET_CODE], custom_pool: pools.battlePoseR } },
          { probability: 0.001, filter: { set_codes: [SET_CODE], custom_pool: pools.battlePoseM } },
          // DFC Saga M 0.1%
          { probability: 0.001, filter: { set_codes: [SET_CODE], custom_pool: pools.dfcSagaM } },
        ],
      },

      // 12: Non-foil Wildcard (any rarity) + BF
      // 97.6% main (4.2C + 74.1U + 16.7R + 2.6M) + 2.4% BF
      {
        slot_number: 12,
        label: "Non-foil Wildcard",
        is_foil: false,
        outcomes: [
          { probability: 0.042, filter: commonFilter },
          { probability: 0.741, filter: uncommonFilter },
          { probability: 0.167, filter: rareFilter },
          { probability: 0.026, filter: mythicFilter },
          // BF <1% each: spread 2.4% over 6 pool categories
          { probability: 0.004, filter: { set_codes: [SET_CODE], custom_pool: pools.uncommonScene } },
          {
            probability: 0.004,
            filter: { set_codes: [SET_CODE], custom_pool: [...pools.sceneR, ...pools.sceneM] },
          },
          {
            probability: 0.004,
            filter: { set_codes: [SET_CODE], custom_pool: [...pools.fieldNotesR, ...pools.fieldNotesM] },
          },
          {
            probability: 0.005,
            filter: { set_codes: [SET_CODE], custom_pool: [...pools.elementalR, ...pools.elementalM] },
          },
          {
            probability: 0.003,
            filter: { set_codes: [SET_CODE], custom_pool: [...pools.battlePoseR, ...pools.battlePoseM] },
          },
          { probability: 0.004, filter: { set_codes: [SET_CODE], custom_pool: pools.dfcSagaM } },
        ],
      },

      // 13: Traditional Foil (any rarity) + BF foil
      // 98.5% main + 1.5% BF; all outcomes is_foil=true via slot-level flag
      {
        slot_number: 13,
        label: "Traditional Foil",
        is_foil: true,
        outcomes: [
          { probability: 0.539, filter: commonFilter },
          { probability: 0.367, filter: uncommonFilter },
          { probability: 0.067, filter: rareFilter },
          { probability: 0.012, filter: mythicFilter },
          // BF foil <1% each: 6 × 0.25% = 1.5%
          { probability: 0.0025, filter: { set_codes: [SET_CODE], custom_pool: pools.uncommonScene } },
          {
            probability: 0.0025,
            filter: { set_codes: [SET_CODE], custom_pool: [...pools.sceneR, ...pools.sceneM] },
          },
          {
            probability: 0.0025,
            filter: { set_codes: [SET_CODE], custom_pool: [...pools.fieldNotesR, ...pools.fieldNotesM] },
          },
          {
            probability: 0.0030,
            filter: { set_codes: [SET_CODE], custom_pool: [...pools.elementalR, ...pools.elementalM] },
          },
          {
            probability: 0.0025,
            filter: { set_codes: [SET_CODE], custom_pool: [...pools.battlePoseR, ...pools.battlePoseM] },
          },
          { probability: 0.0020, filter: { set_codes: [SET_CODE], custom_pool: pools.dfcSagaM } },
        ],
      },

      // 14: Land
      // 40% NF dual · 20% NF default basic · 10% NF Appa · 10% NF Journey
      // + foil variants: 10% · 5% · 2.5% · 2.5%
      {
        slot_number: 14,
        label: "Land",
        is_foil: false,
        outcomes: [
          { probability: 0.40, filter: { set_codes: [SET_CODE], custom_pool: pools.dualLands } },
          { probability: 0.20, filter: { set_codes: [SET_CODE], custom_pool: pools.defaultBasics } },
          { probability: 0.10, filter: { set_codes: [SET_CODE], custom_pool: pools.appaBasics } },
          { probability: 0.10, filter: { set_codes: [SET_CODE], custom_pool: pools.journeyBasics } },
          { probability: 0.10, is_foil: true, filter: { set_codes: [SET_CODE], custom_pool: pools.dualLands } },
          { probability: 0.05, is_foil: true, filter: { set_codes: [SET_CODE], custom_pool: pools.defaultBasics } },
          { probability: 0.025, is_foil: true, filter: { set_codes: [SET_CODE], custom_pool: pools.appaBasics } },
          { probability: 0.025, is_foil: true, filter: { set_codes: [SET_CODE], custom_pool: pools.journeyBasics } },
        ],
      },

      // 15: DFC helper / token (not modeled)
      { slot_number: 15, label: "DFC Helper / Token", is_foil: false, outcomes: [] },
    ],
  };
}

function buildCollectorBooster(pools: AllPools): EvBoosterConfig {
  // TLA common pool for CB slots 1-3: spell commons (80) + dual lands (11) = 91 cards
  const cbCommonPool = [...pools.mainCommons, ...pools.dualLands];

  // Slot 13 outcomes (non-foil BF R/M). Sum should be ~1.0.
  // Raw WOTC sum = 99.5%; nudge EF R 11.7→12.2 to reach 100.
  const slot13Outcomes = [
    { probability: 0.078, filter: { set_codes: [SET_CODE], custom_pool: pools.sceneR } },          // Scene R
    { probability: 0.011, filter: { set_codes: [SET_CODE], custom_pool: pools.sceneM } },          // Scene M
    { probability: 0.069, filter: { set_codes: [SET_CODE], custom_pool: pools.fieldNotesR } },     // FN R
    { probability: 0.030, filter: { set_codes: [SET_CODE], custom_pool: pools.fieldNotesM } },     // FN M
    { probability: 0.013, filter: { set_codes: [SET_CODE], custom_pool: pools.battlePoseR } },     // BP R
    { probability: 0.004, filter: { set_codes: [SET_CODE], custom_pool: pools.battlePoseM } },     // BP M <1%
    { probability: 0.122, filter: { set_codes: [SET_CODE], custom_pool: pools.elementalR } },      // EF R (nudged 11.7→12.2)
    { probability: 0.011, filter: { set_codes: [SET_CODE], custom_pool: pools.elementalM } },      // EF M
    { probability: 0.022, filter: { set_codes: [SET_CODE], custom_pool: pools.dfcSagaM } },        // DFC Saga M
    { probability: 0.242, filter: { set_codes: [SET_CODE], custom_pool: pools.extendedArtR } },    // EA main R
    { probability: 0.004, filter: { set_codes: [SET_CODE], custom_pool: pools.extendedArtM } },    // EA main M <1%
    { probability: 0.242, filter: { set_codes: ["tle"], collector_number_min: 171, collector_number_max: 209, rarity: ["rare"] } },   // EA JS R
    { probability: 0.048, filter: { set_codes: ["tle"], collector_number_min: 171, collector_number_max: 209, rarity: ["mythic"] } }, // EA JS M
    { probability: 0.104, filter: { set_codes: ["tle"], collector_number_min: 62, collector_number_max: 73 } },                       // New-to-Magic Scene Box R
  ];

  // Slot 15 outcomes (foil BF R/M). Sum should be ~1.0.
  // Raw sum = 100.1%. Use slot-level is_foil=true for all foil outcomes.
  const slot15Outcomes = [
    { probability: 0.128, filter: { set_codes: [SET_CODE], custom_pool: pools.sceneR } },
    { probability: 0.018, filter: { set_codes: [SET_CODE], custom_pool: pools.sceneM } },
    { probability: 0.114, filter: { set_codes: [SET_CODE], custom_pool: pools.fieldNotesR } },
    { probability: 0.050, filter: { set_codes: [SET_CODE], custom_pool: pools.fieldNotesM } },
    { probability: 0.021, filter: { set_codes: [SET_CODE], custom_pool: pools.battlePoseR } },
    { probability: 0.014, filter: { set_codes: [SET_CODE], custom_pool: pools.battlePoseM } },
    // <1% items per MTGPrice Mana Math estimates:
    //   Neon Ink: remainder after EA-M and Aang fit within <1% combined = 0.51%
    //   EA main M: MTGPrice "~0.45% estimated" = 0.0045
    //   Raised Foil Aang: MTGPrice "1-in-2000 to 1-in-3000 packs" mid = 0.04% = 0.0004
    { probability: 0.0051, filter: { set_codes: [SET_CODE], custom_pool: pools.neonInkR } },         // neon ink <1%
    { probability: 0.192,  filter: { set_codes: [SET_CODE], custom_pool: pools.elementalR } },
    { probability: 0.018,  filter: { set_codes: [SET_CODE], custom_pool: pools.elementalM } },
    { probability: 0.036,  filter: { set_codes: [SET_CODE], custom_pool: pools.dfcSagaM } },
    { probability: 0.399,  filter: { set_codes: [SET_CODE], custom_pool: pools.extendedArtR } },
    { probability: 0.0045, filter: { set_codes: [SET_CODE], custom_pool: pools.extendedArtM } },     // EA main M ~0.45%
    { probability: 0.0004, filter: { set_codes: [SET_CODE], custom_pool: pools.raisedFoilAangM } },  // Raised Foil Aang ~1/2500 packs
  ];

  return {
    packs_per_box: 12,
    cards_per_pack: 15,
    slots: [
      // 1-3: Foil Commons TLA (91-card pool: 80 spell C + 11 dual land C)
      ...[1, 2, 3].map((n) => ({
        slot_number: n,
        label: `Foil Common ${n}`,
        is_foil: true,
        outcomes: [{ probability: 1, filter: { set_codes: [SET_CODE], custom_pool: cbCommonPool } }],
      })),

      // 4-6: Foil Uncommons TLA (110-card pool)
      ...[4, 5, 6].map((n) => ({
        slot_number: n,
        label: `Foil Uncommon ${n - 3}`,
        is_foil: true,
        outcomes: [{ probability: 1, filter: { set_codes: [SET_CODE], custom_pool: pools.mainUncommons } }],
      })),

      // 7-8: Foil TLE Commons (53-card pool: 22 JS + 31 BB)
      ...[7, 8].map((n) => ({
        slot_number: n,
        label: `Foil TLE Common ${n - 6}`,
        is_foil: true,
        outcomes: [
          {
            probability: 1,
            filter: {
              set_codes: ["tle"],
              rarity: ["common"],
              collector_number_min: 74,
              collector_number_max: 264,
            },
          },
        ],
      })),

      // 9: Foil TLE or BF Uncommon
      // 8% → 4 U scene cards. 92% → 46 TLE U (32 JS + 14 BB)
      {
        slot_number: 9,
        label: "Foil TLE / BF Uncommon",
        is_foil: true,
        outcomes: [
          { probability: 0.08, filter: { set_codes: [SET_CODE], custom_pool: pools.uncommonScene } },
          {
            probability: 0.92,
            filter: {
              set_codes: ["tle"],
              rarity: ["uncommon"],
              collector_number_min: 74,
              collector_number_max: 264,
            },
          },
        ],
      },

      // 10: Foil Full-Art Basic (50% Appa, 50% Avatar's Journey)
      {
        slot_number: 10,
        label: "Foil Full-Art Basic",
        is_foil: true,
        outcomes: [
          { probability: 0.50, filter: { set_codes: [SET_CODE], custom_pool: pools.appaBasics } },
          { probability: 0.50, filter: { set_codes: [SET_CODE], custom_pool: pools.journeyBasics } },
        ],
      },

      // 11: Foil TLA R/M (60 R + 20 M)
      {
        slot_number: 11,
        label: "Foil TLA R/M",
        is_foil: true,
        outcomes: [
          { probability: 0.857, filter: { set_codes: [SET_CODE], custom_pool: pools.mainRares } },
          { probability: 0.143, filter: { set_codes: [SET_CODE], custom_pool: pools.mainMythics } },
        ],
      },

      // 12: Foil TLE R/M (5 sub-pools)
      {
        slot_number: 12,
        label: "Foil TLE R/M",
        is_foil: true,
        outcomes: [
          // Jumpstart R (32) = 37%
          {
            probability: 0.370,
            filter: { set_codes: ["tle"], rarity: ["rare"], collector_number_min: 74, collector_number_max: 170 },
          },
          // Jumpstart M (11) = 6.4%
          {
            probability: 0.064,
            filter: { set_codes: ["tle"], rarity: ["mythic"], collector_number_min: 74, collector_number_max: 170 },
          },
          // Beginner Box R (10) = 11.5%
          {
            probability: 0.115,
            filter: { set_codes: ["tle"], rarity: ["rare"], collector_number_min: 210, collector_number_max: 264 },
          },
          // Jumpstart EA R (28) = 32.4%
          {
            probability: 0.324,
            filter: { set_codes: ["tle"], rarity: ["rare"], collector_number_min: 171, collector_number_max: 209 },
          },
          // Jumpstart EA M (11) = 12.7%
          {
            probability: 0.127,
            filter: { set_codes: ["tle"], rarity: ["mythic"], collector_number_min: 171, collector_number_max: 209 },
          },
        ],
      },

      // 13: Non-foil BF R/M (14 outcomes)
      { slot_number: 13, label: "Non-foil BF R/M", is_foil: false, outcomes: slot13Outcomes },

      // 14: Source Material (75% NF / 25% foil, TLE 1-61)
      {
        slot_number: 14,
        label: "Source Material",
        is_foil: false,
        outcomes: [
          {
            probability: 0.75,
            filter: { set_codes: ["tle"], collector_number_min: 1, collector_number_max: 61 },
          },
          {
            probability: 0.25,
            is_foil: true,
            filter: { set_codes: ["tle"], collector_number_min: 1, collector_number_max: 61 },
          },
        ],
      },

      // 15: Foil BF R/M (13 outcomes)
      { slot_number: 15, label: "Foil BF R/M", is_foil: true, outcomes: slot15Outcomes },

      // 16: Art card / token (not modeled)
      { slot_number: 16, label: "Art Card / Token", is_foil: false, outcomes: [] },
    ],
  };
}

async function main() {
  const pools = await buildPools();
  const playBooster = buildPlayBooster(pools);
  const collectorBooster = buildCollectorBooster(pools);

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
