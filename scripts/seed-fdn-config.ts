/**
 * Seed the EV config for Foundations (fdn).
 *
 * Encodes the Play Booster structure documented by Wizards of the Coast
 * (https://magic.wizards.com/en/news/feature/collecting-foundations) and
 * Mike Provencher's mtgscribe fact sheet
 * (https://mtgscribe.com/2024/10/28/play-booster-fact-sheet-foundations/),
 * cross-checked against theexpectedvalue.com's published source. See
 * notes/ev/fdn.md for the full source-by-source breakdown of every probability
 * and every collector-number list referenced below.
 *
 * Slot 13 (traditional foil) modeled as standard MTG rarity-bucketed pool-union
 * (FOIL_CU = 11/12, FOIL_RM = 1/12), NOT WOTC's literal "same distribution as
 * non-foil wildcard" wording. Rationale in notes/ev/fdn.md#slot-13.
 *
 * Idempotent — safe to re-run; uses upsert on { set_code: "fdn" }.
 */

try {
  process.loadEnvFile(".env");
} catch {
  // .env missing — MONGODB_URI check below will fail with a useful error.
}

import { getDb, getClient } from "../lib/mongodb";
import { generateSnapshot } from "../lib/ev";
import type { EvBoosterConfig } from "../lib/types";

const SET_CODE = "fdn";

// ── Land-slot CN sets (verified against DB 2026-04-30) ──
// Per theexpectedvalue's source comment: "keeps Evolving Wilds, Rogue's
// Passage, and Secluded Courtyard out of the land slot."
const DUAL_LAND_CNS = ["259", "260", "261", "263", "265", "266", "268", "269", "270", "271"];
const REG_BASIC_CNS = ["272", "273", "274", "275", "276", "277", "278", "279", "280", "281"];
const ALT_ART_BASIC_CNS = ["282", "283", "284", "285", "286", "287", "288", "289", "290", "291"];

// ── SPG FDN-flavored CN range (per mtgscribe) ──
const SPG_FDN_CN_MIN = 74;
const SPG_FDN_CN_MAX = 83;

interface FdnDoc {
  collector_number: string;
  name?: string;
  rarity?: string;
  treatment?: string;
  promo_types?: string[];
  booster?: boolean;
  type_line?: string;
}

interface SpgDoc {
  collector_number: string;
  name?: string;
  rarity?: string;
}

interface PoolCNs { commons: string[]; uncommons: string[]; rares: string[]; mythics: string[] }
interface AllPools {
  mainline: PoolCNs;
  borderless: PoolCNs;
  dualLandCns: string[];
  regBasicCns: string[];
  altArtBasicCns: string[];
  spgCns: string[];
}

const cnInt = (s: string): number => {
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
};

async function buildPools(): Promise<AllPools> {
  const db = await getDb();
  const cards = db.collection("dashboard_ev_cards");

  const fdnDocs = (await cards
    .find({ set: SET_CODE })
    .project({ collector_number: 1, name: 1, rarity: 1, treatment: 1, promo_types: 1, booster: 1, type_line: 1 })
    .toArray()) as unknown as FdnDoc[];

  // String-range $gte/$lte on collector_number is lexicographic and would
  // catch unrelated single-digit CNs (e.g. "8" > "7" would land between
  // "74" and "83"). Fetch all SPG and filter numerically in JS.
  const spgAll = (await cards
    .find({ set: "spg" })
    .project({ collector_number: 1, name: 1, rarity: 1 })
    .toArray()) as unknown as SpgDoc[];
  const spgDocs = spgAll.filter((c) => {
    const n = cnInt(c.collector_number);
    return n >= SPG_FDN_CN_MIN && n <= SPG_FDN_CN_MAX;
  });

  if (fdnDocs.length === 0) {
    throw new Error(
      `No fdn cards found in dashboard_ev_cards. ` +
      `Sync fdn from Scryfall first (e.g. via the UI's "Sync Cards" button or syncCards("fdn")).`,
    );
  }

  // ── Mainline pool: booster:true, treatment:normal, CN ≤ 271, no basics, no duals ──
  const isPlainBasicLand = (c: FdnDoc) => /Basic Land/.test(c.type_line ?? "");
  const dualSet = new Set(DUAL_LAND_CNS);

  const mainlineDocs = fdnDocs.filter((c) =>
    c.booster === true &&
    c.treatment === "normal" &&
    cnInt(c.collector_number) <= 271 &&
    !isPlainBasicLand(c)
  );
  const mainlineCommons = mainlineDocs.filter((c) => c.rarity === "common" && !dualSet.has(c.collector_number));
  const mainlineUncommons = mainlineDocs.filter((c) => c.rarity === "uncommon");
  const mainlineRares = mainlineDocs.filter((c) => c.rarity === "rare");
  const mainlineMythics = mainlineDocs.filter((c) => c.rarity === "mythic");

  // ── Borderless play-booster pool: treatment:borderless, has boosterfun,
  //    excludes manafoil/japanshowcase/fracturefoil. INCLUDES the 6 SC-tagged
  //    boosterfun borderless prints (verified 2026-04-30: 1 C #313 Refute +
  //    5 U #293/325/327/340/355). Reconciles DB to WOTC's published 2+8.
  //    Filter does NOT include `booster: true` because all 6 SC-tagged
  //    borderless have booster:false on Scryfall. ──
  const hasPromo = (c: FdnDoc, p: string) => (c.promo_types ?? []).includes(p);
  const borderlessDocs = fdnDocs.filter((c) =>
    c.treatment === "borderless" &&
    hasPromo(c, "boosterfun") &&
    !hasPromo(c, "manafoil") &&
    !hasPromo(c, "japanshowcase") &&
    !hasPromo(c, "fracturefoil")
  );
  const borderlessCommons = borderlessDocs.filter((c) => c.rarity === "common");
  const borderlessUncommons = borderlessDocs.filter((c) => c.rarity === "uncommon");
  const borderlessRares = borderlessDocs.filter((c) => c.rarity === "rare");
  const borderlessMythics = borderlessDocs.filter((c) => c.rarity === "mythic");

  // ── SPG FDN-flavored — already filtered by CN range in the query ──
  const spgCns = spgDocs.map((c) => c.collector_number);

  const cns = (docs: { collector_number: string }[]) => docs.map((c) => c.collector_number);

  const pools: AllPools = {
    mainline: {
      commons: cns(mainlineCommons),
      uncommons: cns(mainlineUncommons),
      rares: cns(mainlineRares),
      mythics: cns(mainlineMythics),
    },
    borderless: {
      commons: cns(borderlessCommons),
      uncommons: cns(borderlessUncommons),
      rares: cns(borderlessRares),
      mythics: cns(borderlessMythics),
    },
    dualLandCns: DUAL_LAND_CNS,
    regBasicCns: REG_BASIC_CNS,
    altArtBasicCns: ALT_ART_BASIC_CNS,
    spgCns,
  };

  // ── Sanity checks against published WOTC + DB-verified counts ──
  const expect = (got: number, want: number, label: string) => {
    const ok = got === want;
    console.log(`  ${ok ? "✅" : "⚠️ "} ${label}: ${got}${ok ? "" : ` (expected ${want})`}`);
  };
  console.log("Pool sanity checks (FDN):");
  expect(pools.mainline.commons.length, 80, "mainline commons (no basics, no duals)");
  expect(pools.mainline.uncommons.length, 100, "mainline uncommons (DB-actual 101 expected — known 1-card delta from utility lands #264/#267)");
  expect(pools.mainline.rares.length, 60, "mainline rares");
  expect(pools.mainline.mythics.length, 20, "mainline mythics");
  expect(pools.borderless.commons.length, 2, "borderless commons (incl. SC-tagged #313)");
  expect(pools.borderless.uncommons.length, 8, "borderless uncommons (incl. 5 SC-tagged)");
  expect(pools.borderless.rares.length, 43, "borderless rares");
  expect(pools.borderless.mythics.length, 17, "borderless mythics (incl. 5 borderless PWs)");
  expect(pools.dualLandCns.length, 10, "dual lands (CN 259/260/261/263/265/266/268/269/270/271)");
  expect(pools.regBasicCns.length, 10, "regular basics (CN 272–281)");
  expect(pools.altArtBasicCns.length, 10, "alt-art / character basics (CN 282–291)");
  expect(pools.spgCns.length, 10, `SPG FDN-flavored (set:spg, cn ${SPG_FDN_CN_MIN}–${SPG_FDN_CN_MAX})`);

  return pools;
}

function buildPlayBooster(pools: AllPools): EvBoosterConfig {
  const m = pools.mainline;
  const b = pools.borderless;

  // Reusable filters
  const mainlineCommonFilter = { set_codes: [SET_CODE], custom_pool: m.commons };
  const mainlineUncommonFilter = { set_codes: [SET_CODE], custom_pool: m.uncommons };
  const mainlineRareFilter = { set_codes: [SET_CODE], custom_pool: m.rares };
  const mainlineMythicFilter = { set_codes: [SET_CODE], custom_pool: m.mythics };

  // Slot 12 wildcard probabilities (per WOTC, sum to 1.000)
  const WC = { C: 0.167, U: 0.583, R: 0.163, M: 0.026, BDR: 0.016, BDM: 0.003, BDC: 0.018, BDU: 0.024 };

  // Slot 11 R/M (per WOTC, sum to 1.000)
  const RM = { rareMain: 0.780, mythMain: 0.128, bdrR: 0.077, bdrM: 0.015 };

  // Slot 13 foil rates — Model B: standard MTG rarity-bucketed pool-union.
  // FOIL_CU=11/12 split into C (2/3) and U (1/3); FOIL_RM=1/12 split into R (6/7)
  // and M (1/7). Sum = 22/36 + 11/36 + 6/84 + 1/84 = 11/12 + 1/12 = 1.000.
  const FOIL_C = (11 / 12) * (2 / 3);
  const FOIL_U = (11 / 12) * (1 / 3);
  const FOIL_R = (1 / 12) * (6 / 7);
  const FOIL_M = (1 / 12) * (1 / 7);

  return {
    packs_per_box: 36,
    cards_per_pack: 14,
    slots: [
      // 1-6: always common (mainline 80-card pool)
      ...[1, 2, 3, 4, 5, 6].map((n) => ({
        slot_number: n,
        label: `Common ${n}`,
        is_foil: false,
        outcomes: [{ probability: 1, filter: mainlineCommonFilter }],
      })),

      // 7: common (98.5%) or SPG (1.5%, set:spg cn 74–83, non-foil)
      {
        slot_number: 7,
        label: "Common / SPG",
        is_foil: false,
        outcomes: [
          { probability: 0.985, filter: mainlineCommonFilter },
          { probability: 0.015, filter: { set_codes: ["spg"], collector_number_min: SPG_FDN_CN_MIN, collector_number_max: SPG_FDN_CN_MAX } },
        ],
      },

      // 8-10: always uncommon (mainline 101-card pool incl. utility lands)
      ...[8, 9, 10].map((n) => ({
        slot_number: n,
        label: `Uncommon ${n - 7}`,
        is_foil: false,
        outcomes: [{ probability: 1, filter: mainlineUncommonFilter }],
      })),

      // 11: Rare / Mythic (78% R / 12.8% M / 7.7% BDL R / 1.5% BDL M)
      {
        slot_number: 11,
        label: "Rare / Mythic",
        is_foil: false,
        outcomes: [
          { probability: RM.rareMain, filter: mainlineRareFilter },
          { probability: RM.mythMain, filter: mainlineMythicFilter },
          { probability: RM.bdrR, filter: { set_codes: [SET_CODE], custom_pool: b.rares } },
          { probability: RM.bdrM, filter: { set_codes: [SET_CODE], custom_pool: b.mythics } },
        ],
      },

      // 12: Non-foil wildcard — 8 outcomes per WOTC
      {
        slot_number: 12,
        label: "Non-foil Wildcard",
        is_foil: false,
        outcomes: [
          { probability: WC.C, filter: mainlineCommonFilter },
          { probability: WC.U, filter: mainlineUncommonFilter },
          { probability: WC.R, filter: mainlineRareFilter },
          { probability: WC.M, filter: mainlineMythicFilter },
          { probability: WC.BDC, filter: { set_codes: [SET_CODE], custom_pool: b.commons } },
          { probability: WC.BDU, filter: { set_codes: [SET_CODE], custom_pool: b.uncommons } },
          { probability: WC.BDR, filter: { set_codes: [SET_CODE], custom_pool: b.rares } },
          { probability: WC.BDM, filter: { set_codes: [SET_CODE], custom_pool: b.mythics } },
        ],
      },

      // 13: Traditional Foil — Model B (standard MTG rarity-bucketed pool-union).
      // is_foil=true at slot level; outcomes union mainline + borderless per rarity.
      // SPG NOT included (per WOTC: "SPG cards aren't found in the wildcard nor
      // traditional foil slot in Play Boosters").
      {
        slot_number: 13,
        label: "Traditional Foil",
        is_foil: true,
        outcomes: [
          { probability: FOIL_C, filter: { set_codes: [SET_CODE], custom_pool: [...m.commons, ...b.commons] } },
          { probability: FOIL_U, filter: { set_codes: [SET_CODE], custom_pool: [...m.uncommons, ...b.uncommons] } },
          { probability: FOIL_R, filter: { set_codes: [SET_CODE], custom_pool: [...m.rares, ...b.rares] } },
          { probability: FOIL_M, filter: { set_codes: [SET_CODE], custom_pool: [...m.mythics, ...b.mythics] } },
        ],
      },

      // 14: Land — 3 sub-pools × {non-foil 80%, foil 20%} = 6 outcomes.
      // Slot is_foil=false so per-outcome is_foil=true overrides for foil rows.
      {
        slot_number: 14,
        label: "Land",
        is_foil: false,
        outcomes: [
          { probability: 0.20, filter: { set_codes: [SET_CODE], custom_pool: pools.altArtBasicCns } },
          { probability: 0.05, is_foil: true, filter: { set_codes: [SET_CODE], custom_pool: pools.altArtBasicCns } },
          { probability: 0.40, filter: { set_codes: [SET_CODE], custom_pool: pools.dualLandCns } },
          { probability: 0.10, is_foil: true, filter: { set_codes: [SET_CODE], custom_pool: pools.dualLandCns } },
          { probability: 0.20, filter: { set_codes: [SET_CODE], custom_pool: pools.regBasicCns } },
          { probability: 0.05, is_foil: true, filter: { set_codes: [SET_CODE], custom_pool: pools.regBasicCns } },
        ],
      },
    ],
  };
}

async function main() {
  const pools = await buildPools();
  const playBooster = buildPlayBooster(pools);

  // Validate every slot's outcomes sum to ~1.0
  const checkSlots = (cfg: EvBoosterConfig, name: string) => {
    let allOk = true;
    for (const slot of cfg.slots) {
      const sum = slot.outcomes.reduce((s, o) => s + o.probability, 0);
      if (slot.outcomes.length > 0 && Math.abs(sum - 1) > 0.003) {
        console.warn(`  ⚠️  ${name} slot ${slot.slot_number} (${slot.label}): probabilities sum to ${sum.toFixed(4)} (expected 1.0)`);
        allOk = false;
      }
    }
    if (allOk) console.log(`\n✅ All ${cfg.slots.length} ${name} slots have probabilities summing to 1.0 ± 0.003.`);
  };
  checkSlots(playBooster, "Play");

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
        updated_at: now,
        updated_by: "seed-script",
      },
    },
    { upsert: true },
  );
  console.log(`\nSaved Play Booster config for ${SET_CODE} (sift_floor=0.25, fee_rate=0.05).`);

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
