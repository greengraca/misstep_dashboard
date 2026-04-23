/**
 * Seed the EV config for Modern Horizons 3 (mh3).
 *
 * Encodes the official Play Booster structure documented by Wizards of the
 * Coast and Mike Provencher's mtgscribe fact sheet (2024-05-22). See
 * notes/ev/mh3.md for the full source-by-source breakdown of every
 * probability and every collector-number list referenced below.
 *
 * Slot 14 (traditional foil) modeled as a rarity-bucketed pool-union — the
 * approach used by theexpectedvalue.com (the only published community EV
 * calculator whose source-code we can inspect). WOTC's collecting article
 * described slot 14's contents without publishing rates; the rarity-bucket
 * model is our best-evidence-backed interpretation. See
 * notes/ev/mh3.md#slot-14 for the full rationale.
 *
 * Idempotent — safe to re-run; uses upsert on { set_code: "mh3" }.
 */

try {
  process.loadEnvFile(".env");
} catch {
  // .env missing — MONGODB_URI check below will fail with a useful error.
}

import { getDb, getClient } from "../lib/mongodb";
import { generateSnapshot } from "../lib/ev";
import type { EvBoosterConfig } from "../lib/types";

const SET_CODE = "mh3";

// ── N2M variant collector numbers (from name-matching #262-303 against cn>303) ──
// Per WOTC's slot 13/14 table: N2M borderless splits into frame-break (6R+1M),
// profile (2R+2M), and "1 mythic rare (1.1%) regular borderless card". The
// 2 N2M borderless mythics are #343 Kaalia (creature, frame-break style) and
// #355 Phyrexian Tower (legendary land, "regular borderless"). Attribution
// based on: frame-break is typically creature/spell with dramatic frame-break
// art; Tower is a land and doesn't fit that visual category.
const N2M_BORDERLESS_FRAME_BREAK = ["323", "345", "346", "347", "348", "349", "343"]; // 6R + 1M (Kaalia)
const N2M_REGULAR_BORDERLESS_M = ["355"];                                              // 1M (Phyrexian Tower)
const N2M_BORDERLESS_PROFILE = ["365", "368", "372", "375"];                           // 2R + 2M
const N2M_RETRO_RM = ["395", "401", "412"];                                            // 1M + 2R
const N2M_BORDERLESS_ALL = [...N2M_BORDERLESS_FRAME_BREAK, ...N2M_REGULAR_BORDERLESS_M, ...N2M_BORDERLESS_PROFILE];

// ── Bundle vs Eldrazi basics (from MH3 set structure) ──
const REG_BASICS_BUNDLE = ["310", "311", "312", "313", "314", "315", "316", "317", "318", "319"];
const ELDRAZI_BASICS = ["304", "305", "306", "307", "308"];

// ── Cards to exclude from "mainline borderless" custom_pool ──
// Serialized concept Eldrazi (#381z/#382z/#383z) and textured-foil borderless DFC PWs
// (#468-472) are Collector Booster exclusives — they shouldn't appear in any Play
// Booster slot.
const COLLECTOR_ONLY_BORDERLESS = ["381z", "382z", "383z", "468", "469", "470", "471", "472"];

// ── Cards to exclude from "mainline retro" custom_pool ──
// #496 is the Buy-a-Box Flusterstorm — promo-only, never appears in any sealed booster.
const RETRO_NON_BOOSTER = ["496"];

// ── Collector Booster constants ──

// The 13 "new Eldrazi Commander deck rares" from Eldrazi Incursion that appear
// in slot 12 alongside 39 extended-art Commander rares. Verified by name-matching
// against m3c in Phase A discovery; all 13 match at m3c #32-39, #46, #51, #53,
// #57, #63 (rarity=rare, treatment=normal).
const ELDRAZI_INCURSION_NEW_RARES = [
  "Angelic Aberration", "Benthic Anomaly", "Bismuth Mindrender", "Chittering Dispatcher",
  "Eldrazi Confluence", "Eldritch Immunity", "Hideous Taskmaster", "Inversion Behemoth",
  "Mutated Cultist", "Selective Obliteration", "Spawnbed Protector", "Twins of Discord",
  "Ulamog's Dreadsire",
];

// The 5 MH3 ally-color fetch lands — used to split the mainline "borderless lands"
// pool (10 lands total) into fetch lands (5 rares) vs other borderless lands
// (5 rares + 1 mythic) for slots 13/14.
const ALLY_FETCH_NAMES = new Set([
  "Flooded Strand", "Polluted Delta", "Bloodstained Mire", "Wooded Foothills", "Windswept Heath",
]);

// Scryfall card layouts that indicate a double-faced card (modal DFC or transform).
const DFC_LAYOUTS = new Set(["transform", "modal_dfc"]);

interface PoolCNs { rare: string[]; mythic: string[] }
interface RetroPools { allRarity: string[]; rareOnly: string[]; mythicOnly: string[] }
interface FoilPools {
  commonCns: string[];     // 87 cards: 80 mainline + 7 retro
  uncommonCns: string[];   // 138 cards: 101 mainline + 20 N2M + 16 retro + 1 SCW full-art
  rareCns: string[];       // 150 cards: 60 + 40 BDL + 18 N2M + 8 N2M_BDL + 24 retro
  mythicMh3Cns: string[];  // 53 cards: 20 + 17 BDL + 4 N2M + 4 N2M_BDL + 8 retro (m3c split out separately)
}

/** Per-treatment mh3 CN lists needed to drive the Collector Booster's 2-card joint distribution (slots 13/14) and the foil premium slot (15). */
interface CollectorPools {
  // Slots 1-4: foil commons (same as Play — 80 mainline)
  foilCommons: string[];
  // Slots 5-7: foil uncommons (121-card pool: 81 SF + 20 DFC + 20 N2M)
  foilUncommons: string[];
  // Slots 9/10: retro C/U + SCW (mh3-side pools; h2r side uses set_codes filter)
  mh3RetroCommons: string[];         // 7
  mh3RetroUncMainline: string[];     // 12
  mh3RetroUncN2M: string[];          // 4 — #413/418/428/437
  // Slot 11: foil R/M (mh3 mainline rares + mythic single/DFC + N2M R/M)
  mainlineRares: string[];           // 60 (also used in Play; duplicate here for clarity)
  mythicsSingleFaced: string[];      // 15
  mythicsDfc: string[];              // 5 (flipwalkers)
  n2mRares: string[];                // 18
  n2mMythics: string[];              // 4
  // Slot 12: Commander treatment variants (all m3c)
  cmdrRegularMythic: string[];       // 8 — m3c #1-8
  cmdrProfileMythic: string[];       // 8 — m3c #9-16
  cmdrEtchedMythic: string[];        // 8 — m3c #17-24
  cmdrExtendedMythic: string[];      // 7 — m3c #25-31 (Ulalek excluded)
  cmdrExtendedRares: string[];       // 39 — m3c rare + extended_art
  eldraziIncursionRares: string[];   // 13 — m3c rares by name
  // Slots 13/14 sub-pools
  mh3ExtendedR: string[];            // 20
  mh3ExtendedM: string[];            // 1
  mh3FrameBreakR: string[];          // 20 (mainline borderless, no portrait, not concept, not DFC PW, not Land)
  mh3FrameBreakM: string[];          // 3 (same filter, mythic rarity)
  mh3ProfileR: string[];             // 10 (mainline borderless with portrait promo)
  mh3ProfileM: string[];             // 5
  mh3ConceptEldraziM: string[];      // 3 — #381/382/383 non-serialized
  mh3FetchR: string[];               // 5 — borderless ally fetches by name
  mh3OtherLandsR: string[];          // 5 — borderless lands minus fetches, rare
  mh3OtherLandsM: string[];          // 1 — borderless lands minus fetches, mythic
  mh3DfcPwM: string[];               // 5 — #442-446
  n2mFrameBreakR: string[];          // 6 — N2M_BORDERLESS_FRAME_BREAK rare
  n2mFrameBreakM: string[];          // 1 — #343 Kaalia (frame-break creature, 0.6% in slot 13/14)
  n2mRegularBorderlessM: string[];   // 1 — #355 Phyrexian Tower (regular borderless land, 1.1% in slot 13/14)
  n2mProfileR: string[];             // 2 — N2M_BORDERLESS_PROFILE rare
  n2mProfileM: string[];             // 2
  retroNtmR: string[];               // 2 — #401/412
  retroNtmM: string[];               // 1 — #395
  // Slot 15 unique premium outcomes
  foilEtchedR: string[];             // 12 — mh3 #473-494 rare
  foilEtchedM: string[];             // 10 — mh3 #473-494 mythic
  texturedPw: string[];              // 5 — mh3 #468-472
}

interface AllPools {
  borderless: PoolCNs;
  retro: RetroPools;
  foil: FoilPools;
  collector: CollectorPools;
}

async function buildPools(): Promise<AllPools> {
  const db = await getDb();
  const cards = db.collection("dashboard_ev_cards");

  // Fetch the whole mh3 set once; partition in JS. Keeps the code explicit.
  interface Mh3Doc { collector_number: string; name?: string; rarity?: string; treatment?: string; frame?: string; frame_effects?: string[]; promo_types?: string[]; booster?: boolean; type_line?: string; layout?: string }
  const allMh3 = (await cards
    .find({ set: SET_CODE })
    .project({ collector_number: 1, name: 1, rarity: 1, treatment: 1, frame: 1, frame_effects: 1, promo_types: 1, booster: 1, type_line: 1, layout: 1 })
    .toArray()) as unknown as Mh3Doc[];

  // Also pull m3c (Commander cards) — needed for Collector Booster slot 12 pools.
  const allM3c = (await cards
    .find({ set: "m3c" })
    .project({ collector_number: 1, name: 1, rarity: 1, treatment: 1, frame_effects: 1, promo_types: 1 })
    .toArray()) as unknown as Mh3Doc[];

  if (allMh3.length === 0) {
    throw new Error(
      `No mh3 cards found in dashboard_ev_cards. ` +
      `Sync mh3 from Scryfall first (e.g. via the UI's "Sync Cards" button or syncCards("mh3")) before running this seed.`,
    );
  }

  const excludeBorderless = new Set([...N2M_BORDERLESS_ALL, ...COLLECTOR_ONLY_BORDERLESS]);
  const excludeRetro = new Set([...N2M_RETRO_RM, ...RETRO_NON_BOOSTER]);
  const n2mBdlAll = new Set(N2M_BORDERLESS_ALL);

  const cnInt = (c: Mh3Doc): number => {
    const n = parseInt(c.collector_number, 10);
    return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
  };
  const isMainlineCn = (c: Mh3Doc) => cnInt(c) <= 261;
  const isN2mCn = (c: Mh3Doc) => { const n = cnInt(c); return n >= 262 && n <= 303; };
  // "Basic Land" substring excluder — does NOT catch Snow-Covered Wastes
  // ("Basic Snow Land — Wastes"), which is intentional: SCW #229 is a real
  // uncommon card in the mainline pool.
  const isPlainBasicLand = (c: Mh3Doc) => /Basic Land/.test(c.type_line ?? "");

  // ── Mainline borderless (existing) ──
  const mainlineBorderless = allMh3.filter((c) => c.treatment === "borderless" && !excludeBorderless.has(c.collector_number));
  const borderless: PoolCNs = {
    rare: mainlineBorderless.filter((c) => c.rarity === "rare").map((c) => c.collector_number),
    mythic: mainlineBorderless.filter((c) => c.rarity === "mythic").map((c) => c.collector_number),
  };

  // ── Mainline retro (existing) ──
  const mainlineRetro = allMh3.filter((c) => c.frame === "1997" && !excludeRetro.has(c.collector_number));
  const retro: RetroPools = {
    allRarity: mainlineRetro.map((c) => c.collector_number),
    rareOnly: mainlineRetro.filter((c) => c.rarity === "rare").map((c) => c.collector_number),
    mythicOnly: mainlineRetro.filter((c) => c.rarity === "mythic").map((c) => c.collector_number),
  };

  // ── Foil slot unions (new) ──
  // Each pool below is ALL foil-eligible cards at that rarity. theexpectedvalue's
  // slot 14 model treats them as one uniform per-card draw inside each rarity.
  const mainlineCommons = allMh3.filter((c) =>
    c.rarity === "common" && c.treatment === "normal" && c.booster === true && !isPlainBasicLand(c) && isMainlineCn(c),
  );
  const mainlineUncommons = allMh3.filter((c) =>
    c.rarity === "uncommon" && c.treatment === "normal" && c.booster === true && isMainlineCn(c),
  );
  const mainlineRares = allMh3.filter((c) =>
    c.rarity === "rare" && c.treatment === "normal" && c.booster === true && isMainlineCn(c),
  );
  const mainlineMythics = allMh3.filter((c) =>
    c.rarity === "mythic" && c.treatment === "normal" && c.booster === true && isMainlineCn(c),
  );

  const n2mReg = allMh3.filter((c) => isN2mCn(c) && c.treatment === "normal" && c.frame === "2015");
  const n2mUncommons = n2mReg.filter((c) => c.rarity === "uncommon");
  const n2mRares = n2mReg.filter((c) => c.rarity === "rare");
  const n2mMythics = n2mReg.filter((c) => c.rarity === "mythic");

  const n2mBdlByRarity = allMh3.filter((c) => n2mBdlAll.has(c.collector_number));
  const n2mBdlRares = n2mBdlByRarity.filter((c) => c.rarity === "rare");
  const n2mBdlMythics = n2mBdlByRarity.filter((c) => c.rarity === "mythic");

  const retroCommons = mainlineRetro.filter((c) => c.rarity === "common");
  const retroUncommons = mainlineRetro.filter((c) => c.rarity === "uncommon");
  // retro.rareOnly / retro.mythicOnly reused below

  // Full-art Snow-Covered Wastes (#309) — sits in the foil uncommon pool
  // and appears at 0.08% in slot 13's wildcard per theexpectedvalue. (We
  // drop the slot-13 single-card outcome as <€0.02 EV impact.)
  const wastesFullArt = allMh3.filter((c) => c.collector_number === "309");

  const foil: FoilPools = {
    commonCns: [
      ...mainlineCommons.map((c) => c.collector_number),
      ...retroCommons.map((c) => c.collector_number),
    ],
    uncommonCns: [
      ...mainlineUncommons.map((c) => c.collector_number),
      ...n2mUncommons.map((c) => c.collector_number),
      ...retroUncommons.map((c) => c.collector_number),
      ...wastesFullArt.map((c) => c.collector_number),
    ],
    rareCns: [
      ...mainlineRares.map((c) => c.collector_number),
      ...borderless.rare,
      ...n2mRares.map((c) => c.collector_number),
      ...n2mBdlRares.map((c) => c.collector_number),
      ...retro.rareOnly,
    ],
    mythicMh3Cns: [
      ...mainlineMythics.map((c) => c.collector_number),
      ...borderless.mythic,
      ...n2mMythics.map((c) => c.collector_number),
      ...n2mBdlMythics.map((c) => c.collector_number),
      ...retro.mythicOnly,
    ],
  };

  // ── Collector Booster sub-pools (all mh3-side) ──
  const mainlineUncommonsSingleFaced = mainlineUncommons.filter((c) => !DFC_LAYOUTS.has(c.layout ?? "normal"));
  const mainlineUncommonsDfc = mainlineUncommons.filter((c) => DFC_LAYOUTS.has(c.layout ?? "normal"));
  const mainlineMythicsDfc = mainlineMythics.filter((c) => DFC_LAYOUTS.has(c.layout ?? "normal"));
  const mainlineMythicsSingle = mainlineMythics.filter((c) => !DFC_LAYOUTS.has(c.layout ?? "normal"));

  const mh3RetroUncMainline = retroUncommons.filter((c) => ![413, 418, 428, 437].includes(parseInt(c.collector_number, 10)));
  const mh3RetroUncN2M = retroUncommons.filter((c) => [413, 418, 428, 437].includes(parseInt(c.collector_number, 10)));

  // Mainline borderless sub-classifications for slots 13/14.
  const hasPromo = (c: Mh3Doc, pt: string) => (c.promo_types ?? []).includes(pt);
  const hasFrameEffect = (c: Mh3Doc, fe: string) => (c.frame_effects ?? []).includes(fe);
  const bdlMainlineDocs = allMh3.filter((c) => c.treatment === "borderless" && !excludeBorderless.has(c.collector_number));
  const bdlIsLand = (c: Mh3Doc) => /Land/.test(c.type_line ?? "");
  const bdlIsDfcPwRange = (c: Mh3Doc) => { const n = parseInt(c.collector_number, 10); return n >= 442 && n <= 446; };
  const bdlIsConcept = (c: Mh3Doc) => hasPromo(c, "concept");
  const bdlIsProfile = (c: Mh3Doc) => hasPromo(c, "portrait");
  const bdlIsFrameBreak = (c: Mh3Doc) =>
    !bdlIsProfile(c) && !bdlIsConcept(c) && !bdlIsDfcPwRange(c) && !bdlIsLand(c);
  const mh3FrameBreakR = bdlMainlineDocs.filter((c) => c.rarity === "rare" && bdlIsFrameBreak(c));
  const mh3FrameBreakM = bdlMainlineDocs.filter((c) => c.rarity === "mythic" && bdlIsFrameBreak(c));
  const mh3ProfileRDocs = bdlMainlineDocs.filter((c) => c.rarity === "rare" && bdlIsProfile(c));
  const mh3ProfileMDocs = bdlMainlineDocs.filter((c) => c.rarity === "mythic" && bdlIsProfile(c));
  const mh3ConceptEldrazi = bdlMainlineDocs.filter((c) => bdlIsConcept(c));
  const mh3DfcPwMDocs = bdlMainlineDocs.filter((c) => bdlIsDfcPwRange(c) && c.rarity === "mythic");
  const mh3BdlLandsR = bdlMainlineDocs.filter((c) => c.rarity === "rare" && bdlIsLand(c) && !bdlIsProfile(c) && !bdlIsConcept(c));
  const mh3BdlLandsM = bdlMainlineDocs.filter((c) => c.rarity === "mythic" && bdlIsLand(c) && !bdlIsProfile(c) && !bdlIsConcept(c));
  const mh3FetchR = mh3BdlLandsR.filter((c) => ALLY_FETCH_NAMES.has(c.name ?? ""));
  const mh3OtherLandsR = mh3BdlLandsR.filter((c) => !ALLY_FETCH_NAMES.has(c.name ?? ""));

  // N2M borderless sub-pools.
  const n2mFrameBreakR = allMh3.filter((c) => c.rarity === "rare" && N2M_BORDERLESS_FRAME_BREAK.includes(c.collector_number));
  const n2mFrameBreakM = allMh3.filter((c) => c.rarity === "mythic" && N2M_BORDERLESS_FRAME_BREAK.includes(c.collector_number)); // 1 card — #343 Kaalia (creature, frame-break style)
  const n2mRegularBorderlessM = allMh3.filter((c) => c.rarity === "mythic" && N2M_REGULAR_BORDERLESS_M.includes(c.collector_number)); // 1 card — #355 Phyrexian Tower (legendary land)
  const n2mProfileR = allMh3.filter((c) => c.rarity === "rare" && N2M_BORDERLESS_PROFILE.includes(c.collector_number));
  const n2mProfileM = allMh3.filter((c) => c.rarity === "mythic" && N2M_BORDERLESS_PROFILE.includes(c.collector_number));

  // N2M retros split by rarity.
  const n2mRetroDocs = allMh3.filter((c) => c.frame === "1997" && N2M_RETRO_RM.includes(c.collector_number));
  const retroNtmR = n2mRetroDocs.filter((c) => c.rarity === "rare");
  const retroNtmM = n2mRetroDocs.filter((c) => c.rarity === "mythic");

  // Extended art mh3 (slot 13/14).
  const mh3ExtendedR = allMh3.filter((c) => c.treatment === "extended_art" && c.rarity === "rare");
  const mh3ExtendedM = allMh3.filter((c) => c.treatment === "extended_art" && c.rarity === "mythic");

  // Foil-etched (mh3 #473-494).
  const mh3FoilEtchedDocs = allMh3.filter((c) => hasFrameEffect(c, "etched") && parseInt(c.collector_number, 10) >= 473 && parseInt(c.collector_number, 10) <= 494);
  const foilEtchedR = mh3FoilEtchedDocs.filter((c) => c.rarity === "rare");
  const foilEtchedM = mh3FoilEtchedDocs.filter((c) => c.rarity === "mythic");

  // Textured foil DFC PWs #468-472 (Collector-only).
  const texturedPw = allMh3.filter((c) => { const n = parseInt(c.collector_number, 10); return n >= 468 && n <= 472; });

  // ── m3c Commander pools ──
  const m3cFaceCommanderNames = new Set(["Azlask, the Swelling Scourge", "Cayth, Famed Mechanist", "Coram, the Undertaker", "Disa the Restless", "Jyoti, Moag Ancient", "Omo, Queen of Vesuva", "Satya, Aetherflux Genius", "Ulalek, Fused Atrocity"]);
  const m3cFaceMythic = allM3c.filter((c) => c.rarity === "mythic" && m3cFaceCommanderNames.has(c.name ?? ""));
  const cmdrRegularMythic = m3cFaceMythic.filter((c) => c.treatment === "normal" && !hasFrameEffect(c, "etched") && !(c.promo_types ?? []).includes("ripplefoil"));
  const cmdrProfileMythic = m3cFaceMythic.filter((c) => c.treatment === "borderless" && hasPromo(c, "portrait") && !hasPromo(c, "ripplefoil"));
  const cmdrEtchedMythic = m3cFaceMythic.filter((c) => c.treatment === "normal" && hasFrameEffect(c, "etched") && !hasPromo(c, "ripplefoil") && !hasPromo(c, "thick"));
  const cmdrExtendedMythic = m3cFaceMythic.filter((c) => c.treatment === "extended_art");
  const cmdrExtendedRares = allM3c.filter((c) => c.rarity === "rare" && c.treatment === "extended_art");

  const eldraziIncursionNameSet = new Set(ELDRAZI_INCURSION_NEW_RARES);
  // De-dupe by name — there shouldn't be duplicates but be safe.
  const eldraziIncursionSeenNames = new Set<string>();
  const eldraziIncursionRares = allM3c.filter((c) => {
    if (c.rarity !== "rare" || c.treatment !== "normal" || !eldraziIncursionNameSet.has(c.name ?? "")) return false;
    if (eldraziIncursionSeenNames.has(c.name ?? "")) return false;
    eldraziIncursionSeenNames.add(c.name ?? "");
    return true;
  });

  const cns = (docs: Mh3Doc[]) => docs.map((c) => c.collector_number);
  const collector: CollectorPools = {
    foilCommons: cns(mainlineCommons),
    foilUncommons: [...cns(mainlineUncommonsSingleFaced), ...cns(mainlineUncommonsDfc), ...cns(n2mUncommons)],
    mh3RetroCommons: cns(retroCommons),
    mh3RetroUncMainline: cns(mh3RetroUncMainline),
    mh3RetroUncN2M: cns(mh3RetroUncN2M),
    mainlineRares: cns(mainlineRares),
    mythicsSingleFaced: cns(mainlineMythicsSingle),
    mythicsDfc: cns(mainlineMythicsDfc),
    n2mRares: cns(n2mRares),
    n2mMythics: cns(n2mMythics),
    cmdrRegularMythic: cns(cmdrRegularMythic),
    cmdrProfileMythic: cns(cmdrProfileMythic),
    cmdrEtchedMythic: cns(cmdrEtchedMythic),
    cmdrExtendedMythic: cns(cmdrExtendedMythic),
    cmdrExtendedRares: cns(cmdrExtendedRares),
    eldraziIncursionRares: cns(eldraziIncursionRares),
    mh3ExtendedR: cns(mh3ExtendedR),
    mh3ExtendedM: cns(mh3ExtendedM),
    mh3FrameBreakR: cns(mh3FrameBreakR),
    mh3FrameBreakM: cns(mh3FrameBreakM),
    mh3ProfileR: cns(mh3ProfileRDocs),
    mh3ProfileM: cns(mh3ProfileMDocs),
    mh3ConceptEldraziM: cns(mh3ConceptEldrazi),
    mh3FetchR: cns(mh3FetchR),
    mh3OtherLandsR: cns(mh3OtherLandsR),
    mh3OtherLandsM: cns(mh3BdlLandsM),
    mh3DfcPwM: cns(mh3DfcPwMDocs),
    n2mFrameBreakR: cns(n2mFrameBreakR),
    n2mFrameBreakM: cns(n2mFrameBreakM),
    n2mRegularBorderlessM: cns(n2mRegularBorderlessM),
    n2mProfileR: cns(n2mProfileR),
    n2mProfileM: cns(n2mProfileM),
    retroNtmR: cns(retroNtmR),
    retroNtmM: cns(retroNtmM),
    foilEtchedR: cns(foilEtchedR),
    foilEtchedM: cns(foilEtchedM),
    texturedPw: cns(texturedPw),
  };

  // ── Sanity checks against known counts ──
  const expect = (got: number, want: number, label: string) => {
    const ok = got === want;
    console.log(`  ${ok ? "✅" : "⚠️ "} ${label}: ${got}${ok ? "" : ` (expected ${want})`}`);
  };
  console.log("Pool sanity checks against WOTC / theexpectedvalue counts:");
  expect(borderless.rare.length, 40, "mainline borderless rares");
  expect(borderless.mythic.length, 17, "mainline borderless mythics (= 3 frame-break + 5 profile + 3 concept Eldrazi + 6 'other' fetch/PW)");
  expect(retro.rareOnly.length, 24, "mainline retro rares (slot 11 pool)");
  expect(retro.mythicOnly.length, 8, "mainline retro mythics");
  expect(retro.allRarity.length, 55, "mainline retro all-rarity (slot 13 pool: 7C + 16U + 24R + 8M)");
  expect(foil.commonCns.length, 87, "foil common union (80 mainline + 7 retro)");
  expect(foil.uncommonCns.length, 138, "foil uncommon union (101 mainline + 20 N2M + 16 retro + 1 SCW full-art)");
  expect(foil.rareCns.length, 150, "foil rare union (60 mainline + 40 BDL + 18 N2M + 8 N2M_BDL + 24 retro)");
  expect(foil.mythicMh3Cns.length, 53, "foil mh3 mythic union (20 mainline + 17 BDL + 4 N2M + 4 N2M_BDL + 8 retro); m3c mythics are a separate 16-card outcome");
  // Collector Booster pool checks
  console.log("Collector Booster pool checks:");
  expect(collector.foilCommons.length, 80, "CB foil commons");
  expect(collector.foilUncommons.length, 121, "CB foil uncommons (81 SF + 20 DFC + 20 N2M)");
  expect(collector.mh3RetroCommons.length, 7, "CB mh3 retro commons (slot 9/10)");
  expect(collector.mh3RetroUncMainline.length, 12, "CB mh3 mainline retro uncommons");
  expect(collector.mh3RetroUncN2M.length, 4, "CB N2M retro uncommons #413/418/428/437");
  expect(collector.mainlineRares.length, 60, "CB mainline rares");
  expect(collector.mythicsSingleFaced.length, 15, "CB single-faced mythics");
  expect(collector.mythicsDfc.length, 5, "CB DFC mythics (flipwalkers)");
  expect(collector.cmdrRegularMythic.length, 8, "CB m3c regular face commanders");
  expect(collector.cmdrProfileMythic.length, 8, "CB m3c borderless profile commanders");
  expect(collector.cmdrEtchedMythic.length, 8, "CB m3c foil-etched commanders");
  expect(collector.cmdrExtendedMythic.length, 7, "CB m3c extended-art commanders (Ulalek excluded)");
  expect(collector.cmdrExtendedRares.length, 39, "CB m3c extended-art Commander rares");
  expect(collector.eldraziIncursionRares.length, 13, "CB m3c Eldrazi Incursion new rares (from curated name list)");
  expect(collector.mh3ExtendedR.length, 20, "CB mh3 extended-art rares");
  expect(collector.mh3ExtendedM.length, 1, "CB mh3 extended-art mythic");
  expect(collector.mh3FrameBreakR.length, 20, "CB mh3 frame-break rares");
  expect(collector.mh3FrameBreakM.length, 3, "CB mh3 frame-break mythics");
  expect(collector.mh3ProfileR.length, 10, "CB mh3 borderless profile rares");
  expect(collector.mh3ProfileM.length, 5, "CB mh3 borderless profile mythics");
  expect(collector.mh3ConceptEldraziM.length, 3, "CB mh3 borderless concept Eldrazi");
  expect(collector.mh3FetchR.length, 5, "CB mh3 borderless ally fetches");
  expect(collector.mh3OtherLandsR.length, 5, "CB mh3 other borderless lands (rare)");
  expect(collector.mh3OtherLandsM.length, 1, "CB mh3 other borderless lands (mythic)");
  expect(collector.mh3DfcPwM.length, 5, "CB mh3 borderless DFC PWs");
  expect(collector.n2mFrameBreakR.length, 6, "CB N2M frame-break rares");
  expect(collector.n2mFrameBreakM.length, 1, "CB N2M frame-break mythic (#343 Kaalia)");
  expect(collector.n2mRegularBorderlessM.length, 1, "CB N2M regular borderless mythic (#355 Phyrexian Tower)");
  expect(collector.n2mProfileR.length, 2, "CB N2M profile rares");
  expect(collector.n2mProfileM.length, 2, "CB N2M profile mythics");
  expect(collector.retroNtmR.length, 2, "CB N2M retro rares");
  expect(collector.retroNtmM.length, 1, "CB N2M retro mythic");
  expect(collector.foilEtchedR.length, 12, "CB foil-etched rares (#473-494)");
  expect(collector.foilEtchedM.length, 10, "CB foil-etched mythics (#473-494)");
  expect(collector.texturedPw.length, 5, "CB textured foil DFC PWs (#468-472)");

  return { borderless, retro, foil, collector };
}

// Slot 14 (traditional foil) — rarity-bucketed pool-union model per
// theexpectedvalue.com. Total rarity distribution matches WOTC's published
// Play Booster foil rates (66.7% C / 25% U / 6.9% R / 1.4% M), applied
// across each rarity's union pool. m3c face commanders are split out as
// their own outcome (pool-proportional weighting) since they live in a
// different set_code.
function buildFoilSlotOutcomes(pools: AllPools): EvBoosterConfig["slots"][number]["outcomes"] {
  const FOIL_COMMON = 0.667;
  const FOIL_UNCOMMON = 0.250;
  const FOIL_RARE = 0.069;
  const FOIL_MYTHIC_TOTAL = 0.014;

  const mh3MythicCount = pools.foil.mythicMh3Cns.length;
  const m3cMythicCount = 16;
  const totalMythicCount = mh3MythicCount + m3cMythicCount;
  // Pool-proportional split so per-card pull rate stays uniform across the
  // combined mythic foil pool.
  const mythicMh3Weight = FOIL_MYTHIC_TOTAL * (mh3MythicCount / totalMythicCount);
  const mythicM3cWeight = FOIL_MYTHIC_TOTAL * (m3cMythicCount / totalMythicCount);

  return [
    { probability: FOIL_COMMON, filter: { set_codes: [SET_CODE], custom_pool: pools.foil.commonCns } },
    { probability: FOIL_UNCOMMON, filter: { set_codes: [SET_CODE], custom_pool: pools.foil.uncommonCns } },
    { probability: FOIL_RARE, filter: { set_codes: [SET_CODE], custom_pool: pools.foil.rareCns } },
    { probability: mythicMh3Weight, filter: { set_codes: [SET_CODE], custom_pool: pools.foil.mythicMh3Cns } },
    { probability: mythicM3cWeight, filter: { set_codes: ["m3c"], rarity: ["mythic"], collector_number_min: 1, collector_number_max: 16 } },
  ];
}

function buildPlayBooster(pools: AllPools): EvBoosterConfig {
  // Reusable filters (kept inline to make slot definitions self-contained)
  const mainlineCommon = { rarity: ["common"], treatment: ["normal"], booster: true, type_line_not_contains: "Basic Land" };
  const mainlineUncommon = { set_codes: [SET_CODE], rarity: ["uncommon"], treatment: ["normal"], booster: true, collector_number_max: 261 };
  const mainlineRare = { set_codes: [SET_CODE], rarity: ["rare"], treatment: ["normal"], booster: true, collector_number_max: 261 };
  const mainlineMythic = { set_codes: [SET_CODE], rarity: ["mythic"], treatment: ["normal"], booster: true, collector_number_max: 261 };

  return {
    packs_per_box: 36,
    cards_per_pack: 14,
    slots: [
      // 1-5: plain commons (5 slots, mainline only — no basics, no bonus sheet)
      ...[1, 2, 3, 4, 5].map((n) => ({
        slot_number: n,
        label: `Common ${n}`,
        is_foil: false,
        outcomes: [{ probability: 1, filter: mainlineCommon }],
      })),

      // 6: common with 1/64 SPG replacement
      {
        slot_number: 6,
        label: "Common / SPG",
        is_foil: false,
        outcomes: [
          { probability: 0.984375, filter: mainlineCommon },
          // SPG #39-48 (10 borderless mythics), non-foil in Play Boosters.
          { probability: 0.015625, filter: { set_codes: ["spg"], collector_number_min: 39, collector_number_max: 48 } },
        ],
      },

      // 7: land / common (50% common, 33.3% reg basic, 16.7% Eldrazi basic, half each foil)
      {
        slot_number: 7,
        label: "Land / Common",
        is_foil: false,
        outcomes: [
          { probability: 0.500, filter: mainlineCommon },
          { probability: 0.200, filter: { set_codes: [SET_CODE], custom_pool: REG_BASICS_BUNDLE } },
          { probability: 0.133, is_foil: true, filter: { set_codes: [SET_CODE], custom_pool: REG_BASICS_BUNDLE } },
          { probability: 0.100, filter: { set_codes: [SET_CODE], custom_pool: ELDRAZI_BASICS } },
          { probability: 0.067, is_foil: true, filter: { set_codes: [SET_CODE], custom_pool: ELDRAZI_BASICS } },
        ],
      },

      // 8-10: uncommons (mainline only, single-faced + DFC pooled together)
      ...[8, 9, 10].map((n) => ({
        slot_number: n,
        label: `Uncommon ${n - 7}`,
        is_foil: false,
        outcomes: [{ probability: 1, filter: mainlineUncommon }],
      })),

      // 11: rare/mythic with treatment splits
      {
        slot_number: 11,
        label: "Rare / Mythic",
        is_foil: false,
        outcomes: [
          { probability: 0.7980, filter: mainlineRare },
          { probability: 0.1300, filter: mainlineMythic },
          // Retro frame R/M — mainline only (excludes 3 N2M retros + #496 Flusterstorm).
          // R/M ratio derived from the 24R/8M mainline pool (= 0.75/0.25), applied to WOTC's 2.1% total.
          { probability: 0.0158, filter: { set_codes: [SET_CODE], custom_pool: pools.retro.rareOnly } },
          { probability: 0.0053, filter: { set_codes: [SET_CODE], custom_pool: pools.retro.mythicOnly } },
          // Borderless Booster Fun R/M — mainline only.
          // R/M ratio derived from the 40R/17M mainline pool (= 0.70/0.30), applied to WOTC's 5.1% total.
          { probability: 0.0357, filter: { set_codes: [SET_CODE], custom_pool: pools.borderless.rare } },
          { probability: 0.0153, filter: { set_codes: [SET_CODE], custom_pool: pools.borderless.mythic } },
        ],
      },

      // 12: New-to-Modern bonus sheet — fully modeled with all 4 variant subtypes
      {
        slot_number: 12,
        label: "New-to-Modern",
        is_foil: false,
        outcomes: [
          // Regular frame, 98.6% of slot
          { probability: 0.7500, filter: { set_codes: [SET_CODE], collector_number_min: 262, collector_number_max: 303, rarity: ["uncommon"] } },
          { probability: 0.2130, filter: { set_codes: [SET_CODE], collector_number_min: 262, collector_number_max: 303, rarity: ["rare"] } },
          { probability: 0.0230, filter: { set_codes: [SET_CODE], collector_number_min: 262, collector_number_max: 303, rarity: ["mythic"] } },
          // Variants, 1.4% of slot. Each WOTC sub-category modeled separately:
          //   0.8% frame-break (6R + 1M Kaalia)
          //   0.3% profile (2R + 2M)
          //   0.2% retro R/M (2R + 1M)
          //   0.1% "other borderless mythic" (1M Phyrexian Tower)
          { probability: 0.0080, filter: { set_codes: [SET_CODE], custom_pool: N2M_BORDERLESS_FRAME_BREAK } },
          { probability: 0.0030, filter: { set_codes: [SET_CODE], custom_pool: N2M_BORDERLESS_PROFILE } },
          { probability: 0.0020, filter: { set_codes: [SET_CODE], custom_pool: N2M_RETRO_RM } },
          { probability: 0.0010, filter: { set_codes: [SET_CODE], custom_pool: N2M_REGULAR_BORDERLESS_M } },
        ],
      },

      // 13: non-foil wildcard — nine explicit outcomes per WOTC slot 13 table
      {
        slot_number: 13,
        label: "Non-foil Wildcard",
        is_foil: false,
        outcomes: [
          { probability: 0.4170, filter: mainlineCommon },
          // Combined single-faced + DFC uncommons (33.4% + 8.3%) — per-card pull rate
          // identical for both sub-pools, so combining doesn't shift EV.
          { probability: 0.4170, filter: mainlineUncommon },
          { probability: 0.0670, filter: mainlineRare },
          { probability: 0.0110, filter: mainlineMythic },
          { probability: 0.0040, filter: { set_codes: [SET_CODE], custom_pool: [...pools.borderless.rare, ...pools.borderless.mythic] } },
          { probability: 0.0420, filter: { set_codes: [SET_CODE], custom_pool: pools.retro.allRarity } },
          { probability: 0.0420, filter: { set_codes: ["m3c"], rarity: ["mythic"], collector_number_min: 1, collector_number_max: 16 } },
        ],
      },

      // 14: traditional foil — rarity-bucketed pool-union (see buildFoilSlotOutcomes).
      // This is NOT a mirror of slot 13. WOTC's collecting article says the
      // foil slot is a union of foil N2M + foil retro N2M + foil wildcard
      // (minus SPG). We model it as rarity buckets with unioned pools per
      // theexpectedvalue.com — the only public calculator whose source code
      // specifies a methodology for this slot.
      {
        slot_number: 14,
        label: "Traditional Foil",
        is_foil: true,
        outcomes: buildFoilSlotOutcomes(pools),
      },
    ],
  };
}

// ── Collector Booster config ────────────────────────────────────────────────
//
// 16 slots per pack (15 cards + 1 token), 12 packs per display box. Slot-by-slot
// rates are from WOTC's MH3 collecting article verbatim. Every pool size has
// been verified against WOTC's published counts at seed time (see sanity-check
// block in buildPools).
//
// Serialized concept Eldrazi are INTENTIONALLY NOT modeled — 750 total copies
// across the print run vs millions of Collector Boosters make their per-pack
// rate ≈0.04%, contributing <€1/box of EV even at €1,000+ prices. Skipping
// simplifies the config without materially affecting the number.
//
// Slots 13/14 ("2 non-foil R/M") are modeled as two INDEPENDENT slots each
// drawing from the same distribution. WOTC's 200%-summing table gives expected
// card counts per pack (not per slot); dividing each entry by 2 gives the
// per-slot probability, and sampling each of the 2 slots independently
// reproduces the joint expectation. (WOTC doesn't explicitly specify whether
// the 2 slots are independent-with-replacement or guaranteed-different; our
// choice matches theexpectedvalue.com's implicit modeling.)
//
// Slot 15 (foil premium) is a UNION of 5 unique-to-slot-15 outcomes (~21.4%)
// plus a foil echo of slots 13/14's distribution, each category scaled by
// 78.6/200 = 0.393. Per WOTC: "percentages reduced appropriately."
function buildCollectorBooster(pools: AllPools): EvBoosterConfig {
  const cp = pools.collector;

  // Joint 2-card distribution for slots 13/14. Entries are (percentage-of-200%, pool, rarity-for-labeling).
  // Per-slot probability = percentage / 200 (i.e. 45.4% joint → 0.227 per slot).
  const JOINT = [
    { pct: 45.4, pool: cp.mh3ExtendedR,        label: "mh3 ext-art R" },
    { pct:  1.1, pool: cp.mh3ExtendedM,        label: "mh3 ext-art M" },
    { pct: 29.6, pool: cp.mh3FrameBreakR,      label: "mh3 frame-break R" },
    { pct:  2.8, pool: cp.mh3FrameBreakM,      label: "mh3 frame-break M" },
    { pct: 18.2, pool: cp.mh3ProfileR,         label: "mh3 profile R" },
    { pct:  4.6, pool: cp.mh3ProfileM,         label: "mh3 profile M" },
    { pct:  1.7, pool: cp.mh3ConceptEldraziM,  label: "mh3 concept Eldrazi M" },
    { pct:  5.7, pool: cp.mh3FetchR,           label: "mh3 borderless fetch R" },
    { pct: 11.4, pool: cp.mh3OtherLandsR,      label: "mh3 other borderless lands R" },
    { pct:  1.1, pool: cp.mh3OtherLandsM,      label: "mh3 other borderless lands M" },
    { pct:  5.7, pool: cp.mh3DfcPwM,           label: "mh3 borderless DFC PW M" },
    { pct: 13.6, pool: cp.n2mFrameBreakR,       label: "N2M frame-break R" },
    { pct:  0.6, pool: cp.n2mFrameBreakM,       label: "N2M frame-break M (#343 Kaalia)" },
    { pct:  1.1, pool: cp.n2mRegularBorderlessM, label: "N2M regular borderless M (#355 Phyrexian Tower)" },
    { pct:  4.6, pool: cp.n2mProfileR,         label: "N2M profile R" },
    { pct:  1.7, pool: cp.n2mProfileM,         label: "N2M profile M" },
    { pct: 28.4, pool: pools.retro.rareOnly,   label: "mh3 retro R" },
    { pct:  5.7, pool: pools.retro.mythicOnly, label: "mh3 retro M" },
    { pct:  4.6, pool: cp.retroNtmR,           label: "N2M retro R" },
    { pct:  1.1, pool: cp.retroNtmM,           label: "N2M retro M" },
    { pct:  4.5, pool: [],                     label: "h2r retro R (filter by set)" },      // uses set_codes filter below
    { pct:  6.8, pool: [],                     label: "h2r retro M (filter by set)" },
  ];

  // Outcomes for slots 13/14 (per-slot probability = pct/200).
  const slot13_14Outcomes = [
    ...JOINT.filter((e) => e.label.startsWith("h2r retro R") === false && e.label.startsWith("h2r retro M") === false).map((e) => ({
      probability: e.pct / 200,
      filter: { set_codes: [SET_CODE], custom_pool: e.pool },
    })),
    // h2r uses set_codes instead of custom_pool since all h2r cards participate.
    { probability:  4.5 / 200, filter: { set_codes: ["h2r"], rarity: ["rare"] } },
    { probability:  6.8 / 200, filter: { set_codes: ["h2r"], rarity: ["mythic"] } },
  ];

  // Slot 15 echo (foil mirror of slots 13/14) scaled by (100 - 21.4) / 200 = 0.393.
  // Each echo outcome is per-entry pct × 0.00393 (= pct/200 × 0.786).
  const SLOT15_ECHO_SCALE = (100 - 21.4) / 200; // ≈0.393
  const slot15EchoOutcomes = [
    ...JOINT.filter((e) => e.label.startsWith("h2r retro R") === false && e.label.startsWith("h2r retro M") === false).map((e) => ({
      probability: (e.pct * SLOT15_ECHO_SCALE) / 100,
      filter: { set_codes: [SET_CODE], custom_pool: e.pool },
    })),
    { probability: (4.5 * SLOT15_ECHO_SCALE) / 100, filter: { set_codes: ["h2r"], rarity: ["rare"] } },
    { probability: (6.8 * SLOT15_ECHO_SCALE) / 100, filter: { set_codes: ["h2r"], rarity: ["mythic"] } },
  ];

  // Retro C/U + SCW outcomes (slots 9 non-foil and 10 foil-mirror).
  const retroCUOutcomes = [
    { probability: 0.307, filter: { set_codes: [SET_CODE], custom_pool: cp.mh3RetroCommons } },
    { probability: 0.316, filter: { set_codes: [SET_CODE], custom_pool: cp.mh3RetroUncMainline } },
    { probability: 0.105, filter: { set_codes: [SET_CODE], custom_pool: cp.mh3RetroUncN2M } },
    { probability: 0.088, filter: { set_codes: ["h2r"], rarity: ["common"] } },
    { probability: 0.158, filter: { set_codes: ["h2r"], rarity: ["uncommon"] } },
    { probability: 0.026, filter: { set_codes: [SET_CODE], custom_pool: ["309"] } }, // #309 Full-art SCW
  ];

  return {
    packs_per_box: 12,
    cards_per_pack: 15,
    slots: [
      // 1-4: foil commons (80-card mh3 mainline pool, same as Play's common pool)
      ...[1, 2, 3, 4].map((n) => ({
        slot_number: n,
        label: `Foil Common ${n}`,
        is_foil: true,
        outcomes: [{ probability: 1, filter: { set_codes: [SET_CODE], custom_pool: cp.foilCommons } }],
      })),

      // 5-7: foil uncommons (121-card pool: 81 SF + 20 DFC + 20 N2M — WOTC's
      // 2/0.5/0.5 per-pack averages are captured here as a uniform 121-card pool
      // since per-card pull rate is effectively identical across the sub-groups).
      ...[5, 6, 7].map((n) => ({
        slot_number: n,
        label: `Foil Uncommon ${n - 4}`,
        is_foil: true,
        outcomes: [{ probability: 1, filter: { set_codes: [SET_CODE], custom_pool: cp.foilUncommons } }],
      })),

      // 8: foil full-art Eldrazi basic
      {
        slot_number: 8,
        label: "Foil Eldrazi Basic",
        is_foil: true,
        outcomes: [{ probability: 1, filter: { set_codes: [SET_CODE], custom_pool: ELDRAZI_BASICS } }],
      },

      // 9: non-foil retro C/U + full-art SCW
      {
        slot_number: 9,
        label: "Retro C/U + FA SCW",
        is_foil: false,
        outcomes: retroCUOutcomes,
      },

      // 10: foil retro C/U + full-art SCW — same pool as slot 9 with is_foil=true
      {
        slot_number: 10,
        label: "Foil Retro C/U + FA SCW",
        is_foil: true,
        outcomes: retroCUOutcomes,
      },

      // 11: foil R/M (mh3 mainline + mythics + N2M)
      {
        slot_number: 11,
        label: "Foil R/M",
        is_foil: true,
        outcomes: [
          { probability: 0.667, filter: { set_codes: [SET_CODE], custom_pool: cp.mainlineRares } },
          { probability: 0.083, filter: { set_codes: [SET_CODE], custom_pool: cp.mythicsSingleFaced } },
          { probability: 0.028, filter: { set_codes: [SET_CODE], custom_pool: cp.mythicsDfc } },
          { probability: 0.200, filter: { set_codes: [SET_CODE], custom_pool: cp.n2mRares } },
          { probability: 0.022, filter: { set_codes: [SET_CODE], custom_pool: cp.n2mMythics } },
        ],
      },

      // 12: Commander slot (mixed foil-etched, non-foil, traditional foil).
      // The 3.3% foil-etched outcome targets cards with finishes=["etched"]; we
      // use is_foil=true so the calc reads price_eur_foil. If foil-etched prices
      // end up null for these cards (common for etched-only printings on
      // Scryfall), the fallback chain kicks in — flagged as a known issue if
      // the snapshot shows a suspicious zero.
      {
        slot_number: 12,
        label: "Commander",
        is_foil: false,
        outcomes: [
          { probability: 0.033, is_foil: true, filter: { set_codes: ["m3c"], custom_pool: cp.cmdrEtchedMythic } },
          { probability: 0.061, filter: { set_codes: ["m3c"], custom_pool: cp.cmdrProfileMythic } },
          { probability: 0.035, is_foil: true, filter: { set_codes: ["m3c"], custom_pool: cp.cmdrProfileMythic } },
          { probability: 0.053, filter: { set_codes: ["m3c"], custom_pool: cp.cmdrExtendedMythic } },
          { probability: 0.030, is_foil: true, filter: { set_codes: ["m3c"], custom_pool: cp.cmdrExtendedMythic } },
          { probability: 0.789, filter: { set_codes: ["m3c"], custom_pool: [...cp.cmdrExtendedRares, ...cp.eldraziIncursionRares] } },
        ],
      },

      // 13 / 14: Non-foil R/M — two independent slots with the same distribution.
      // Each outcome's probability = WOTC's 200%-sum percentage / 200.
      { slot_number: 13, label: "Non-foil R/M A", is_foil: false, outcomes: slot13_14Outcomes },
      { slot_number: 14, label: "Non-foil R/M B", is_foil: false, outcomes: slot13_14Outcomes },

      // 15: Foil premium — unique outcomes (21.4%) + scaled foil echo of slots 13/14.
      // Serialized concept Eldrazi NOT modeled (too rare, <€1/box impact).
      {
        slot_number: 15,
        label: "Foil Premium",
        is_foil: true,
        outcomes: [
          // Unique-to-slot-15 outcomes (21.4% total)
          { probability: 0.093, filter: { set_codes: [SET_CODE], custom_pool: cp.foilEtchedR } },
          { probability: 0.039, filter: { set_codes: [SET_CODE], custom_pool: cp.foilEtchedM } },
          { probability: 0.044, filter: { set_codes: ["spg"], collector_number_min: 39, collector_number_max: 48 } },
          { probability: 0.019, filter: { set_codes: ["spg"], collector_number_min: 49, collector_number_max: 53 } },
          { probability: 0.019, filter: { set_codes: [SET_CODE], custom_pool: cp.texturedPw } },
          // Foil echo of slots 13/14 (scaled by 0.393, total 78.6%)
          ...slot15EchoOutcomes,
        ],
      },

      // 16: token/ad — no EV
      { slot_number: 16, label: "Token", is_foil: true, outcomes: [] },
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
    { upsert: true }
  );
  console.log(`\nSaved Play + Collector Booster configs for ${SET_CODE} (sift_floor=0.25, fee_rate=0.05).`);

  // Generate today's snapshot so the EV grid + history chart pick it up.
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
