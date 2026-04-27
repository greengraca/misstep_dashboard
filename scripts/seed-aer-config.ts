/**
 * Seed the EV config for Aether Revolt (aer).
 *
 * AER is a 2017 small expansion (Kaladesh block). Booster structure (per
 * Wizards / mtggoldfish):
 *
 *   10 commons + 3 uncommons + 1 R/M + 1 marketing card = 15 cards/pack
 *   - foil REPLACES a common at ~1/6 packs
 *   - Kaladesh Invention REPLACES the foil at ~1/144 packs (24 AER Inventions
 *     live in `mps`, collector_number 31-54)
 *   - NO basic land slot (AER printed zero basics)
 *
 * The default `getDefaultDraftBoosterConfig` is *almost* right for AER but:
 *   - hardcodes pMasterpiece = 1/129 (we override to the AER-specific 1/144);
 *   - includes a slot 15 "Basic Land" outcome that matches 0 AER cards;
 *   - assumes `cards_per_pack: 15` including that empty land slot.
 *
 * This script saves a precise config matching AER reality. See notes/ev/aer.md
 * for source-by-source breakdown of every probability.
 *
 * Idempotent — safe to re-run; uses upsert on { set_code: "aer" }.
 */

try { process.loadEnvFile(".env"); } catch {}

import { getDb, getClient } from "../lib/mongodb";
import { generateSnapshot } from "../lib/ev";
import type { EvBoosterConfig, EvSlotOutcome } from "../lib/types";

const SET_CODE = "aer";

// AER-specific Inventions pull rate (1 in 144 packs). Default config uses
// 1/129 across all draft-booster era sets — that's a generic fallback; for
// AER the published rate is 1/144, matching KLD.
const P_MASTERPIECE = 1 / 144;

// Foil-replacement rate is 1/6 packs (standard pre-2020 draft booster). The
// Invention eats into this when it hits, so foil-non-masterpiece probability
// is (1/6 - 1/144).
const P_FOIL_ANY = 1 / 6 - P_MASTERPIECE;
const P_COMMON_PLAIN = 1 - 1 / 6;

// Conditional foil-rarity weights — same proportions as the default Draft
// Booster era model (theoretical 18/12/6/1 ratio over commons/unc/rare/mythic;
// sums to 37, so divide by 37 to weight P_FOIL_ANY across the four rarities).
const P_FOIL_COMMON = P_FOIL_ANY * (18 / 37);
const P_FOIL_UNCOMMON = P_FOIL_ANY * (12 / 37);
const P_FOIL_RARE = P_FOIL_ANY * (6 / 37);
const P_FOIL_MYTHIC = P_FOIL_ANY * (1 / 37);

// Reusable filters. AER has no basic lands so type_line_not_contains is
// defensive only; matches the default-config style.
const COMMON_FILTER = { rarity: ["common"], treatment: ["normal"], booster: true, type_line_not_contains: "Basic Land" };
const UNCOMMON_FILTER = { rarity: ["uncommon"], treatment: ["normal"], booster: true };
const RARE_FILTER = { rarity: ["rare"], treatment: ["normal"], booster: true };
const MYTHIC_FILTER = { rarity: ["mythic"], treatment: ["normal"], booster: true };

function buildPlayBooster(): EvBoosterConfig {
  const slot10Outcomes: EvSlotOutcome[] = [
    { probability: P_COMMON_PLAIN, filter: COMMON_FILTER },
    { probability: P_FOIL_COMMON, is_foil: true, filter: { rarity: ["common"], finishes: ["foil"], booster: true, type_line_not_contains: "Basic Land" } },
    { probability: P_FOIL_UNCOMMON, is_foil: true, filter: { rarity: ["uncommon"], finishes: ["foil"], booster: true } },
    { probability: P_FOIL_RARE, is_foil: true, filter: { rarity: ["rare"], finishes: ["foil"], booster: true } },
    { probability: P_FOIL_MYTHIC, is_foil: true, filter: { rarity: ["mythic"], finishes: ["foil"], booster: true } },
    {
      probability: P_MASTERPIECE,
      is_foil: true,
      filter: { set_codes: ["mps"], collector_number_min: 31 },
    },
  ];

  return {
    packs_per_box: 36,
    cards_per_pack: 14, // 10C + 3U + 1R/M; 15th physical card is marketing/token (no EV)
    slots: [
      { slot_number: 1, label: "Common 1", is_foil: false, outcomes: [{ probability: 1, filter: COMMON_FILTER }] },
      { slot_number: 2, label: "Common 2", is_foil: false, outcomes: [{ probability: 1, filter: COMMON_FILTER }] },
      { slot_number: 3, label: "Common 3", is_foil: false, outcomes: [{ probability: 1, filter: COMMON_FILTER }] },
      { slot_number: 4, label: "Common 4", is_foil: false, outcomes: [{ probability: 1, filter: COMMON_FILTER }] },
      { slot_number: 5, label: "Common 5", is_foil: false, outcomes: [{ probability: 1, filter: COMMON_FILTER }] },
      { slot_number: 6, label: "Common 6", is_foil: false, outcomes: [{ probability: 1, filter: COMMON_FILTER }] },
      { slot_number: 7, label: "Common 7", is_foil: false, outcomes: [{ probability: 1, filter: COMMON_FILTER }] },
      { slot_number: 8, label: "Common 8", is_foil: false, outcomes: [{ probability: 1, filter: COMMON_FILTER }] },
      { slot_number: 9, label: "Common 9", is_foil: false, outcomes: [{ probability: 1, filter: COMMON_FILTER }] },
      { slot_number: 10, label: "Common / Foil / Invention", is_foil: false, outcomes: slot10Outcomes },
      { slot_number: 11, label: "Uncommon 1", is_foil: false, outcomes: [{ probability: 1, filter: UNCOMMON_FILTER }] },
      { slot_number: 12, label: "Uncommon 2", is_foil: false, outcomes: [{ probability: 1, filter: UNCOMMON_FILTER }] },
      { slot_number: 13, label: "Uncommon 3", is_foil: false, outcomes: [{ probability: 1, filter: UNCOMMON_FILTER }] },
      {
        slot_number: 14, label: "Rare / Mythic", is_foil: false,
        outcomes: [
          { probability: 0.875, filter: RARE_FILTER },
          { probability: 0.125, filter: MYTHIC_FILTER },
        ],
      },
    ],
  };
}

async function main() {
  const playBooster = buildPlayBooster();

  // Sanity-check: every slot's outcome probabilities should sum to ~1.0.
  for (const slot of playBooster.slots) {
    const sum = slot.outcomes.reduce((s, o) => s + o.probability, 0);
    if (Math.abs(sum - 1) > 0.003) {
      console.warn(`  ⚠️  slot ${slot.slot_number} (${slot.label}): probabilities sum to ${sum.toFixed(6)} (expected 1.0)`);
    }
  }

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
        collector_booster: null, // AER predates Collector Boosters (introduced 2019).
        updated_at: now,
        updated_by: "seed-aer-config",
      },
    },
    { upsert: true },
  );
  console.log(`Saved Play Booster config for ${SET_CODE} (sift_floor=0.25, fee_rate=0.05, masterpiece=1/144).`);

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
