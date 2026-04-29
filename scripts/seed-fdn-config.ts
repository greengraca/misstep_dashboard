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

async function main() {
  const pools = await buildPools();
  console.log(`\nPools built. Mainline=${pools.mainline.commons.length}C/${pools.mainline.uncommons.length}U/${pools.mainline.rares.length}R/${pools.mainline.mythics.length}M, Borderless=${pools.borderless.commons.length}C/${pools.borderless.uncommons.length}U/${pools.borderless.rares.length}R/${pools.borderless.mythics.length}M, SPG=${pools.spgCns.length}.`);
  await (await getClient()).close();
}

main().catch((e) => { console.error(e); process.exit(1); });
