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

async function main() {
  const db = await getDb();
  console.log(`Connected to ${db.databaseName}; fdn seed scaffold ready.`);
  await (await getClient()).close();
}

main().catch((e) => { console.error(e); process.exit(1); });
