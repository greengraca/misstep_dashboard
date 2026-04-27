/**
 * Seed all 5 Shadows over Innistrad Intro Packs as fixed-pool products.
 *
 * Source: https://magic.wizards.com/en/news/feature/shadows-over-innistrad-intro-pack-decklists-2016-03-30
 *
 * Each Intro Pack contains:
 *   - 60-card preconstructed deck (1 of which is an alt-art foil rare from `psoi`,
 *     the remaining 59 are regular `soi` printings)
 *   - 2 Shadows over Innistrad booster packs (15-card draft boosters)
 *
 * The foil "premium" rare lives in `psoi` with promo_types: ["setpromo", "intropack"].
 * Verified all 5 are present and priced (€0.53 - €1.02 foil) at seed time.
 *
 * Idempotent — safe to re-run; uses upsert by slug. Pass --overwrite to replace
 * existing entries.
 */

try {
  process.loadEnvFile(".env");
} catch {
  // MONGODB_URI check below will fail with a useful error if .env is missing.
}

import { getDb, getClient } from "../lib/mongodb";
import { upsertProduct, generateProductSnapshot } from "../lib/ev-products";
import type { EvProduct, EvProductCard } from "../lib/types";

const PARENT = "soi";
const PROMO_SET = "psoi";
const TYPE = "starter" as const;
const RELEASE_YEAR = 2016;
const BOOSTER_COUNT = 2;
const SEALED_BOOSTER_PRICE_EUR = 4.63; // SOI booster — current Cardmarket sealed price

interface DecklistEntry {
  count: number;
  name: string;
  /** When true, this entry is the alt-art foil intro-pack promo from `psoi`. */
  is_foil_promo?: boolean;
}

interface IntroPack {
  slug: string;
  name: string;
  /** WOTC-listed front cover art rare (foil). Used to flag the right deck row. */
  foil_promo_name: string;
  decklist: DecklistEntry[];
}

const INTRO_PACKS: IntroPack[] = [
  {
    slug: `${PARENT}-starter-ghostly-tide`,
    name: "Shadows over Innistrad Intro Pack — Ghostly Tide",
    foil_promo_name: "Drogskol Cavalry",
    decklist: [
      { count: 1, name: "Rattlechains" },
      { count: 2, name: "Seagraf Skaab" },
      { count: 2, name: "Dauntless Cathar" },
      { count: 2, name: "Niblis of Dusk" },
      { count: 2, name: "Spectral Shepherd" },
      { count: 1, name: "Reckless Scholar" },
      { count: 2, name: "Apothecary Geist" },
      { count: 2, name: "Nearheath Chaplain" },
      { count: 1, name: "Silent Observer" },
      { count: 2, name: "Emissary of the Sleepless" },
      { count: 2, name: "Stormrider Spirit" },
      { count: 1, name: "Drogskol Cavalry", is_foil_promo: true },
      { count: 1, name: "Chaplain's Blessing" },
      { count: 2, name: "Not Forgotten" },
      { count: 1, name: "Pore Over the Pages" },
      { count: 1, name: "Essence Flux" },
      { count: 2, name: "Puncturing Light" },
      { count: 1, name: "Silverstrike" },
      { count: 1, name: "Catalog" },
      { count: 1, name: "Deny Existence" },
      { count: 2, name: "Vessel of Ephemera" },
      { count: 2, name: "Bound by Moonsilver" },
      { count: 1, name: "Sleep Paralysis" },
      { count: 13, name: "Plains" },
      { count: 12, name: "Island" },
    ],
  },
  {
    slug: `${PARENT}-starter-unearthed-secrets`,
    name: "Shadows over Innistrad Intro Pack — Unearthed Secrets",
    foil_promo_name: "Nephalia Moondrakes",
    decklist: [
      { count: 2, name: "Erdwal Illuminator" },
      { count: 2, name: "Quilled Wolf" },
      { count: 2, name: "Stitched Mangler" },
      { count: 2, name: "Byway Courier" },
      { count: 1, name: "Gloomwidow" },
      { count: 2, name: "Graf Mole" },
      { count: 1, name: "Tireless Tracker" },
      { count: 2, name: "Drownyard Explorers" },
      { count: 2, name: "Briarbridge Patrol" },
      { count: 1, name: "Pack Guardian" },
      { count: 2, name: "Thornhide Wolves" },
      { count: 1, name: "Watcher in the Web" },
      { count: 1, name: "Nephalia Moondrakes", is_foil_promo: true },
      { count: 3, name: "Confront the Unknown" },
      { count: 1, name: "Ghostly Wings" },
      { count: 1, name: "Jace's Scrutiny" },
      { count: 2, name: "Ongoing Investigation" },
      { count: 1, name: "Press for Answers" },
      { count: 1, name: "Aim High" },
      { count: 1, name: "Magnifying Glass" },
      { count: 1, name: "Root Out" },
      { count: 2, name: "Gone Missing" },
      { count: 1, name: "Ulvenwald Mysteries" },
      { count: 13, name: "Island" },
      { count: 12, name: "Forest" },
    ],
  },
  {
    slug: `${PARENT}-starter-vampiric-thirst`,
    name: "Shadows over Innistrad Intro Pack — Vampiric Thirst",
    foil_promo_name: "Markov Dreadknight",
    decklist: [
      { count: 2, name: "Ravenous Bloodseeker" },
      { count: 2, name: "Indulgent Aristocrat" },
      { count: 1, name: "Olivia's Bloodsworn" },
      { count: 2, name: "Sanguinary Mage" },
      { count: 2, name: "Vampire Noble" },
      { count: 2, name: "Bloodmad Vampire" },
      { count: 2, name: "Stromkirk Mentor" },
      { count: 1, name: "Mad Prophet" },
      { count: 2, name: "Voldaren Duelist" },
      { count: 2, name: "Twins of Maurer Estate" },
      { count: 1, name: "Markov Dreadknight", is_foil_promo: true },
      { count: 2, name: "Incorrigible Youths" },
      { count: 1, name: "Macabre Waltz" },
      { count: 1, name: "Murderous Compulsion" },
      { count: 2, name: "Tormenting Voice" },
      { count: 2, name: "Alms of the Vein" },
      { count: 2, name: "Malevolent Whispers" },
      { count: 1, name: "Burn from Within" },
      { count: 2, name: "Fiery Temper" },
      { count: 1, name: "Sinister Concoction" },
      { count: 1, name: "Senseless Rage" },
      { count: 1, name: "Creeping Dread" },
      { count: 13, name: "Swamp" },
      { count: 12, name: "Mountain" },
    ],
  },
  {
    slug: `${PARENT}-starter-angelic-fury`,
    name: "Shadows over Innistrad Intro Pack — Angelic Fury",
    foil_promo_name: "Flameblade Angel",
    decklist: [
      { count: 3, name: "Devilthorn Fox" },
      { count: 2, name: "Stern Constable" },
      { count: 2, name: "Ember-Eye Wolf" },
      { count: 1, name: "Unruly Mob" },
      { count: 2, name: "Howlpack Wolf" },
      { count: 3, name: "Cathar's Companion" },
      { count: 2, name: "Pyre Hound" },
      { count: 1, name: "Runaway Carriage" },
      { count: 2, name: "Inspiring Captain" },
      { count: 1, name: "Flameblade Angel", is_foil_promo: true },
      { count: 2, name: "Lightning Axe" },
      { count: 2, name: "Rush of Adrenaline" },
      { count: 1, name: "Gryff's Boon" },
      { count: 1, name: "Magmatic Chasm" },
      { count: 2, name: "Nahiri's Machinations" },
      { count: 1, name: "Murderer's Axe" },
      { count: 2, name: "Dance with Devils" },
      { count: 2, name: "Inner Struggle" },
      { count: 1, name: "Dissension in the Ranks" },
      { count: 1, name: "Angelic Purge" },
      { count: 1, name: "Devils' Playground" },
      { count: 12, name: "Plains" },
      { count: 13, name: "Mountain" },
    ],
  },
  {
    slug: `${PARENT}-starter-horrific-visions`,
    name: "Shadows over Innistrad Intro Pack — Horrific Visions",
    foil_promo_name: "Soul Swallower",
    decklist: [
      { count: 2, name: "Groundskeeper" },
      { count: 1, name: "Loam Dryad" },
      { count: 3, name: "Moldgraf Scavenger" },
      { count: 2, name: "Obsessive Skinner" },
      { count: 2, name: "Wicker Witch" },
      { count: 1, name: "Wild-Field Scarecrow" },
      { count: 1, name: "Inexorable Blob" },
      { count: 1, name: "Crow of Dark Tidings" },
      { count: 2, name: "Tooth Collector" },
      { count: 2, name: "Stallion of Ashmouth" },
      { count: 1, name: "Soul Swallower", is_foil_promo: true },
      { count: 1, name: "Ghoulsteed" },
      { count: 1, name: "Hound of the Farbogs" },
      { count: 1, name: "Morkrut Necropod" },
      { count: 1, name: "Kessig Dire Swine" },
      { count: 2, name: "Explosive Apparatus" },
      { count: 2, name: "Dead Weight" },
      { count: 1, name: "Fork in the Road" },
      { count: 1, name: "Rabid Bite" },
      { count: 2, name: "Vessel of Nascency" },
      { count: 1, name: "Crawling Sensation" },
      { count: 1, name: "Merciless Resolve" },
      { count: 1, name: "Might Beyond Reason" },
      { count: 1, name: "Throttle" },
      { count: 1, name: "Liliana's Indignation" },
      { count: 1, name: "Foul Orchard" },
      { count: 1, name: "Warped Landscape" },
      { count: 12, name: "Forest" },
      { count: 11, name: "Swamp" },
    ],
  },
];

interface CardLookup {
  scryfall_id: string;
  name: string;
  set: string;
  collector_number: string;
  rarity: string;
  promo_types?: string[];
}

async function resolveDecklist(
  decklist: DecklistEntry[],
): Promise<{ cards: EvProductCard[]; missing: string[] }> {
  const db = await getDb();
  const cards = db.collection<CardLookup>("dashboard_ev_cards");
  const missing: string[] = [];
  const out: EvProductCard[] = [];

  for (const entry of decklist) {
    if (entry.is_foil_promo) {
      // Foil intro-pack promo: must live in psoi with promo_types: ["setpromo", "intropack"].
      // The non-"intropack" psoi printings (e.g. CN15s with prerelease+datestamped) are
      // explicitly excluded — they're a different product.
      const promo = await cards.findOne({
        set: PROMO_SET,
        name: entry.name,
        promo_types: { $all: ["intropack"] },
      });
      if (!promo) {
        missing.push(`${entry.name} (foil promo, ${PROMO_SET}/intropack)`);
        continue;
      }
      out.push({
        scryfall_id: promo.scryfall_id,
        name: promo.name,
        set_code: promo.set,
        count: entry.count,
        is_foil: true,
        role: "key_card",
      });
      continue;
    }

    // Regular soi printing. For basics, just take whichever printing comes back.
    const card = await cards.findOne({ set: PARENT, name: entry.name });
    if (!card) {
      missing.push(`${entry.name} (${PARENT})`);
      continue;
    }
    out.push({
      scryfall_id: card.scryfall_id,
      name: card.name,
      set_code: card.set,
      count: entry.count,
      is_foil: false,
    });
  }

  return { cards: out, missing };
}

async function seedOne(pack: IntroPack, overwrite: boolean): Promise<void> {
  const total = pack.decklist.reduce((s, e) => s + e.count, 0);
  if (total !== 60) {
    throw new Error(`${pack.slug}: decklist sums to ${total}, expected 60.`);
  }

  const { cards, missing } = await resolveDecklist(pack.decklist);
  if (missing.length) {
    throw new Error(`${pack.slug}: failed to resolve cards:\n  - ${missing.join("\n  - ")}`);
  }

  const product: Omit<EvProduct, "_id" | "seeded_at"> = {
    slug: pack.slug,
    name: pack.name,
    product_type: TYPE,
    release_year: RELEASE_YEAR,
    parent_set_code: PARENT,
    cards,
    included_boosters: [{ set_code: PARENT, count: BOOSTER_COUNT, sealed_price_eur: SEALED_BOOSTER_PRICE_EUR }],
    notes:
      `Source: WOTC decklists 2016-03-30. Foil premium rare: ${pack.foil_promo_name} ` +
      `(alt-art, psoi/intropack). Includes ${BOOSTER_COUNT} SOI boosters.`,
  };

  await upsertProduct(product, { overwrite });

  const snap = await generateProductSnapshot(pack.slug);
  console.log(`  ✅ ${pack.slug}`);
  console.log(`     Cards: ${cards.length} unique entries, ${total} total`);
  if (snap.written) {
    const db = await getDb();
    const latest = await db.collection("dashboard_ev_snapshots")
      .findOne({ product_slug: pack.slug }, { sort: { date: -1 } });
    if (latest) {
      console.log(`     Snapshot ${latest.date}: cards-only €${latest.ev_net_cards_only}, sealed €${latest.ev_net_sealed}, opened €${latest.ev_net_opened}`);
    }
  } else {
    console.log(`     Snapshot skipped: ${snap.reason}`);
  }
}

async function main() {
  const overwrite = process.argv.includes("--overwrite");
  console.log(`Seeding ${INTRO_PACKS.length} SOI Intro Packs (overwrite=${overwrite})…\n`);

  for (const pack of INTRO_PACKS) {
    try {
      await seedOne(pack, overwrite);
    } catch (e) {
      console.error(`  ❌ ${pack.slug}: ${(e as Error).message}`);
    }
    console.log();
  }

  await (await getClient()).close();
}

main().catch((e) => { console.error(e); process.exit(1); });
