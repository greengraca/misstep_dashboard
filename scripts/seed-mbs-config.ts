/**
 * Seed the EV config for Mirrodin Besieged (mbs, Feb 4 2011).
 *
 * Encodes the 2011 Draft Booster structure documented in:
 *   - Lethe's collation project page for MBS (the print-sheet authority)
 *     https://www.lethe.xyz/mtg/collation/mbs.html
 *   - MTG Wiki's MBS page (set sizes — confirmed against DB: 155 booster
 *     cards = 60 C + 40 U + 35 R + 10 M + 10 basics).
 *
 * Small expansion in the Scars of Mirrodin block (155 cards). Standard
 * pre-2014 Draft Booster: 10 C + 3 U + 1 R/M + 1 basic land + 1 ad.
 *
 * MBS-specific quirks documented in notes/ev/mbs.md:
 *   - Faction-split print runs (5 Mirran + 5 Phyrexian commons per pack;
 *     U from 3 of 4 sub-runs; R/M split across two faction sheets). For
 *     EV we pool by rarity uniformly — the faction split affects WHICH
 *     cards show up, not the rarity slot's expected value.
 *   - 10 basics (5 lands × 2 art versions). Some packs include SOM basic
 *     reprints — irrelevant for EV (basics sift to €0).
 *
 * Pre-Collector-Booster era. play_booster only.
 *
 * Idempotent — safe to re-run; uses upsert on { set_code: "mbs" }.
 */

try {
  process.loadEnvFile(".env");
} catch {
  // .env missing — MONGODB_URI check below will fail with a useful error.
}

import { getDb, getClient } from "../lib/mongodb";
import { generateSnapshot } from "../lib/ev";
import type { EvBoosterConfig } from "../lib/types";

const SET_CODE = "mbs";

interface CardDoc {
  collector_number: string;
  name?: string;
  rarity?: string;
  layout?: string;
  type_line?: string;
}

interface AllPools {
  commons: string[];   // 60
  uncommons: string[]; // 40
  rares: string[];     // 35
  mythics: string[];   // 10
  basics: string[];    // 10 (5 lands × 2 art)
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
      `No ${SET_CODE} cards in dashboard_ev_cards. Sync mbs from Scryfall before running this seed.`,
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

  console.log("MBS pool sanity checks:");
  expect(all.length, 155, "total booster=true (60C + 40U + 35R + 10M + 10 basics)");
  expect(basics.length, 10, "basic lands (5 lands × 2 art)");
  expect(commons.length, 60, "commons");
  expect(uncommons.length, 40, "uncommons");
  expect(rares.length, 35, "rares");
  expect(mythics.length, 10, "mythics");

  const layouts = new Set(all.map((c) => c.layout));
  if (layouts.size !== 1 || !layouts.has("normal")) {
    console.warn(`  ⚠️  Unexpected layouts in mbs: ${[...layouts].join(", ")}`);
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
// Per Lethe's print-sheet analysis:
//   - 10 commons (5 Mirran-faction + 5 Phyrexian-faction per pack)
//   - 3 uncommons (drawn from 3 of 4 sub-runs alphabetically)
//   - 1 R/M (faction-split sheet — Mirran 18R+4M, Phyrexian 17R+5M; for
//     EV we use the aggregate 35R × 2 + 10M × 1 = 80 cells → P(M) = 1/8)
//   - 1 basic land (10 art versions, sometimes SOM reprints)
//   - 1 ad / marketing
//
// Foil rate: 15/67 ≈ 22.39% per pack (Lethe). Sub-distribution 18:12:6:1
// (C:U:R:M) — same era-typical split as ISD/M12. Foil replaces a common.
function buildBooster(pools: AllPools): EvBoosterConfig {
  const commonPlain = { set_codes: [SET_CODE], custom_pool: pools.commons };
  const uncommonPlain = { set_codes: [SET_CODE], custom_pool: pools.uncommons };
  const rarePlain = { set_codes: [SET_CODE], custom_pool: pools.rares };
  const mythicPlain = { set_codes: [SET_CODE], custom_pool: pools.mythics };

  // M12-style: no DFCs, foil pools = plain pools.
  const FOIL_RATE = 15 / 67;
  const FOIL_C = FOIL_RATE * (18 / 37);
  const FOIL_U = FOIL_RATE * (12 / 37);
  const FOIL_R = FOIL_RATE * (6 / 37);
  const FOIL_M = FOIL_RATE * (1 / 37);
  const PLAIN_COMMON_IN_FOIL_SLOT = 1 - FOIL_RATE;

  // R/M weights from card counts: 35R × 2 + 10M × 1 = 80.
  const RM_RARE = 70 / 80;     // 0.875
  const RM_MYTHIC = 10 / 80;   // 0.125

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

      // 10: Common-or-foil.
      {
        slot_number: 10,
        label: "Common 10 / Foil",
        is_foil: false,
        outcomes: [
          { probability: PLAIN_COMMON_IN_FOIL_SLOT, filter: commonPlain },
          { probability: FOIL_C, is_foil: true, filter: commonPlain },
          { probability: FOIL_U, is_foil: true, filter: uncommonPlain },
          { probability: FOIL_R, is_foil: true, filter: rarePlain },
          { probability: FOIL_M, is_foil: true, filter: mythicPlain },
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

      // 15: Basic land.
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

  const checkSlots = (cfg: EvBoosterConfig, name: string) => {
    for (const slot of cfg.slots) {
      const sum = slot.outcomes.reduce((s, o) => s + o.probability, 0);
      if (slot.outcomes.length > 0 && Math.abs(sum - 1) > 0.003) {
        console.warn(`  ⚠️  ${name} slot ${slot.slot_number} (${slot.label}): probabilities sum to ${sum.toFixed(4)} (expected 1.0)`);
      }
    }
  };
  console.log("\nSlot probability checks:");
  checkSlots(playBooster, "MBS");

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
