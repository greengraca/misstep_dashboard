/**
 * Seed both Innistrad Event Decks (Jan 20, 2012):
 *   - Deathfed (G/U/B graveyard)
 *   - Hold the Line (W humans)
 *
 * Source: WOTC archive — "Innistrad Event Decks" feature articles.
 *
 * Each deck contains:
 *   - 60-card main deck
 *   - 15-card sideboard
 *   - NO booster packs
 *   - NO foil headline card (that started with Modern Event Decks in 2014)
 *
 * Card printings are pinned to the Standard-legal printing at Jan 2012:
 *   isd, m12, mbs, som, nph. The resolver will FAIL LOUDLY if a card
 *   isn't found at the expected set, so we never ship a wrong printing.
 *
 * Idempotent — safe to re-run; uses upsert by slug. Pass --overwrite to replace.
 */

try {
  process.loadEnvFile(".env");
} catch {
  // MONGODB_URI check below will fail with a useful error if .env is missing.
}

import { getDb, getClient } from "../lib/mongodb";
import { upsertProduct, generateProductSnapshot } from "../lib/ev-products";
import type { EvProduct, EvProductCard } from "../lib/types";

const PARENT = "isd";
const TYPE = "event_deck" as const;
const RELEASE_YEAR = 2012;

interface DecklistEntry {
  count: number;
  name: string;
  /** Pinned set code (Standard-legal at Jan 2012). */
  set: string;
}

interface EventDeck {
  slug: string;
  name: string;
  notes: string;
  main: DecklistEntry[];
  side: DecklistEntry[];
}

/**
 * Cards explicitly named in the printed Innistrad set (`isd`).
 *   Source-of-truth: Scryfall set listing for `isd` (264 cards).
 *   Notes: Oblivion Ring and Gideon's Lawkeeper feel like Innistrad cards
 *   but were NOT in `isd` — they're M12 reprints used in this event deck.
 */
const ISD: Record<string, true> = {
  "Forest": true, "Island": true, "Swamp": true, "Plains": true, "Mountain": true,
  "Hinterland Harbor": true, "Armored Skaab": true, "Boneyard Wurm": true,
  "Splinterfright": true, "Forbidden Alchemy": true, "Gnaw to the Bone": true,
  "Mulch": true, "Spider Spawning": true,
  "Champion of the Parish": true, "Doomed Traveler": true, "Elite Inquisitor": true,
  "Fiend Hunter": true, "Butcher's Cleaver": true,
  "Silver-Inlaid Dagger": true, "Bonds of Faith": true,
  "Nevermore": true,
};

/**
 * Reprints in M12 (Standard-legal core set at Jan 2012).
 */
const M12: Record<string, true> = {
  "Acidic Slime": true, "Birds of Paradise": true, "Llanowar Elves": true,
  "Merfolk Looter": true, "Flashfreeze": true, "Mind Control": true,
  "Naturalize": true, "Negate": true,
  "Elite Vanguard": true, "Honor of the Pure": true, "Celestial Purge": true,
  "Gideon's Lawkeeper": true, "Oblivion Ring": true,
};

/**
 * Mirrodin Besieged (mbs) printings.
 */
const MBS: Record<string, true> = {
  "Viridian Emissary": true, "Bonehoard": true, "Green Sun's Zenith": true,
  "Accorder Paladin": true, "Mirran Crusader": true, "Leonin Relic-Warder": true,
};

/** Scars of Mirrodin (som). Nihil Spellbomb's only printing at Jan 2012. */
const SOM: Record<string, true> = { "Ratchet Bomb": true, "Nihil Spellbomb": true };

/** New Phyrexia (nph). */
const NPH: Record<string, true> = { "Suture Priest": true };

function pinSet(name: string): string {
  if (ISD[name]) return "isd";
  if (M12[name]) return "m12";
  if (MBS[name]) return "mbs";
  if (SOM[name]) return "som";
  if (NPH[name]) return "nph";
  throw new Error(`No set pinned for "${name}" — update seed-isd-event-decks.ts`);
}

function entries(text: string): DecklistEntry[] {
  // Each line: "<count> <name>" — derive set from pinSet().
  return text
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("//"))
    .map((l) => {
      const m = l.match(/^(\d+)\s+(.+?)\s*$/);
      if (!m) throw new Error(`Bad decklist line: "${l}"`);
      const count = Number(m[1]);
      const name = m[2];
      return { count, name, set: pinSet(name) };
    });
}

const DECKS: EventDeck[] = [
  {
    slug: "isd-event-deathfed",
    name: "Innistrad Event Deck — Deathfed",
    notes:
      "Source: WOTC archive — Innistrad Event Deck Decklists (2012-01-20). " +
      "G/U/B graveyard-matters strategy. 60 main + 15 sideboard, no boosters, no foil headline card.",
    main: entries(`
      13 Forest
      1 Hinterland Harbor
      7 Island
      3 Swamp
      2 Acidic Slime
      4 Armored Skaab
      1 Birds of Paradise
      4 Boneyard Wurm
      4 Llanowar Elves
      2 Merfolk Looter
      1 Splinterfright
      3 Viridian Emissary
      2 Bonehoard
      1 Ratchet Bomb
      4 Forbidden Alchemy
      1 Gnaw to the Bone
      1 Green Sun's Zenith
      4 Mulch
      2 Spider Spawning
    `),
    side: entries(`
      4 Flashfreeze
      2 Gnaw to the Bone
      2 Mind Control
      3 Naturalize
      4 Negate
    `),
  },
  {
    slug: "isd-event-hold-the-line",
    name: "Innistrad Event Deck — Hold the Line",
    notes:
      "Source: WOTC archive — Innistrad Event Deck Decklists (2012-01-20). " +
      "Mono-white Humans aggro. 60 main + 15 sideboard, no boosters, no foil headline card.",
    main: entries(`
      24 Plains
      4 Accorder Paladin
      1 Champion of the Parish
      4 Doomed Traveler
      1 Elite Inquisitor
      2 Elite Vanguard
      4 Fiend Hunter
      4 Gideon's Lawkeeper
      2 Mirran Crusader
      2 Butcher's Cleaver
      2 Silver-Inlaid Dagger
      4 Bonds of Faith
      2 Honor of the Pure
      4 Oblivion Ring
    `),
    side: entries(`
      4 Celestial Purge
      4 Leonin Relic-Warder
      1 Nevermore
      3 Nihil Spellbomb
      3 Suture Priest
    `),
  },
];

interface CardLookup {
  scryfall_id: string;
  name: string;
  set: string;
  collector_number: string;
  rarity: string;
  type_line?: string;
  finishes?: string[];
}

async function resolveDecklist(
  list: DecklistEntry[],
): Promise<{ cards: EvProductCard[]; missing: string[] }> {
  const db = await getDb();
  const cards = db.collection<CardLookup>("dashboard_ev_cards");
  const missing: string[] = [];
  const out: EvProductCard[] = [];

  for (const entry of list) {
    // For basics, take the lowest-CN printing in the set (deterministic).
    const isBasic = ["Plains", "Island", "Swamp", "Mountain", "Forest"].includes(entry.name);
    const query = { set: entry.set, name: entry.name };
    const card = await cards
      .find(query)
      .sort({ collector_number_int: 1, collector_number: 1 })
      .limit(1)
      .next();

    if (!card) {
      missing.push(`${entry.name} (${entry.set})`);
      continue;
    }
    out.push({
      scryfall_id: card.scryfall_id,
      name: card.name,
      set_code: card.set,
      count: entry.count,
      is_foil: false,
    });
    void isBasic;
  }

  return { cards: out, missing };
}

async function seedOne(deck: EventDeck, overwrite: boolean): Promise<void> {
  const mainTotal = deck.main.reduce((s, e) => s + e.count, 0);
  const sideTotal = deck.side.reduce((s, e) => s + e.count, 0);
  if (mainTotal !== 60) throw new Error(`${deck.slug}: main = ${mainTotal}, expected 60`);
  if (sideTotal !== 15) throw new Error(`${deck.slug}: side = ${sideTotal}, expected 15`);

  const allEntries = [...deck.main, ...deck.side];
  const { cards: resolved, missing } = await resolveDecklist(allEntries);
  if (missing.length) {
    throw new Error(`${deck.slug}: failed to resolve cards:\n  - ${missing.join("\n  - ")}`);
  }

  // Aggregate by {scryfall_id, is_foil}: a card appearing in both main and
  // sideboard (e.g. Deathfed's Gnaw to the Bone — 1 main + 2 side) resolves
  // to the same printing twice. The EV math handles duplicates correctly,
  // but the decklist UI would render two rows for the same card. Collapse
  // them into a single row with summed count.
  const cardMap = new Map<string, EvProductCard>();
  for (const c of resolved) {
    const key = `${c.scryfall_id}|${c.is_foil}`;
    const existing = cardMap.get(key);
    if (existing) existing.count += c.count;
    else cardMap.set(key, { ...c });
  }
  const cards = [...cardMap.values()];

  const product: Omit<EvProduct, "_id" | "seeded_at"> = {
    slug: deck.slug,
    name: deck.name,
    product_type: TYPE,
    release_year: RELEASE_YEAR,
    parent_set_code: PARENT,
    cards,
    notes: deck.notes,
  };

  await upsertProduct(product, { overwrite });
  const snap = await generateProductSnapshot(deck.slug);

  console.log(`  ✅ ${deck.slug}`);
  console.log(`     Cards: ${cards.length} unique entries, ${mainTotal + sideTotal} total (${mainTotal} main + ${sideTotal} side)`);
  if (snap.written) {
    const db = await getDb();
    const latest = await db.collection("dashboard_ev_snapshots")
      .findOne({ product_slug: deck.slug }, { sort: { date: -1 } });
    if (latest) {
      console.log(`     Snapshot ${latest.date}: cards-only €${latest.ev_net_cards_only}`);
    }
  } else {
    console.log(`     Snapshot skipped: ${snap.reason}`);
  }
}

async function main() {
  const overwrite = process.argv.includes("--overwrite");
  console.log(`Seeding ${DECKS.length} Innistrad Event Decks (overwrite=${overwrite})…\n`);
  for (const deck of DECKS) {
    try {
      await seedOne(deck, overwrite);
    } catch (e) {
      console.error(`  ❌ ${deck.slug}: ${(e as Error).message}`);
    }
    console.log();
  }
  await (await getClient()).close();
}

main().catch((e) => { console.error(e); process.exit(1); });
