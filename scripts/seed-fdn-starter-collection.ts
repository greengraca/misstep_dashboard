// Seed: Foundations Starter Collection (Nov 2024).
//
// Source: https://magic.wizards.com/en/news/announcements/foundations-starter-collection-contents
// (cached HTML — see notes/ev/fdn-starter-collection.md)
//
// Contents per WOTC announcement:
//   - 387 cards = 297 named (this list) + 90 basics (omitted; default
//     count_basic_lands=false zeroes their EV anyway)
//   - 26 traditional foils + 6 borderless-art prints
//   - Sol Ring / Arcane Signet / Command Tower live in `fdc` (foil-only)
//   - 3 Foundations Play Boosters
//   - 13 tokens / 2 reference cards / booklet / click wheel (no EV)
//
// Resolution rules:
//   - Default lookup: { set: 'fdn', name, treatment: 'normal',
//                       border_color: 'black', promo_types: 'startercollection' }
//     This picks the Starter Collection-tagged printing and disambiguates
//     against the booster-fun / setextension reprints in the same set.
//   - Borderless: same query but treatment: 'borderless'.
//   - FDC cards: { set: 'fdc', name } — only 3 cards in fdc, all foil.
//
// Idempotent. Pass --persist to upsert; --overwrite to replace existing.
// Without --persist this is a dry run that prints the resolved table.

try { process.loadEnvFile(".env"); } catch {}

import { getDb, getClient } from "../lib/mongodb";
import { upsertProduct, generateProductSnapshot } from "../lib/ev-products";
import type { EvProduct, EvProductCard } from "../lib/types";

const SLUG = "fdn-starter-collection";
const NAME = "Foundations Starter Collection";
const PARENT = "fdn";
const FDC = "fdc";
const TYPE = "starter" as const;
const RELEASE_YEAR = 2024;

interface Entry {
  count: number;
  name: string;
  treatment?: "normal" | "borderless";
  is_foil?: boolean;
  set?: "fdn" | "fdc";
  /** Pin a specific collector_number — bypasses promo_types/treatment filter.
   *  Use when a card is in the Starter Collection but Scryfall didn't tag the
   *  matching printing with `promo_types: "startercollection"`. */
  cn?: string;
}

const DECKLIST: Entry[] = [
  // ── White (39) ──
  { count: 1, name: "Lyra Dawnbringer", is_foil: true },
  { count: 1, name: "Angel of Vitality", is_foil: true },
  { count: 1, name: "Ajani's Pridemate", treatment: "borderless" },
  { count: 1, name: "Ajani's Pridemate" },
  { count: 1, name: "Charming Prince" },
  { count: 1, name: "Linden, the Steadfast Queen" },
  { count: 1, name: "Mentor of the Meek" },
  { count: 1, name: "Regal Caracal" },
  { count: 1, name: "Zetalpa, Primal Dawn" },
  { count: 1, name: "Cat Collector" },
  { count: 1, name: "Angel of Finality" },
  { count: 1, name: "Resolute Reinforcements" },
  { count: 1, name: "Savannah Lions" },
  { count: 1, name: "Inspiring Overseer" },
  { count: 1, name: "Archway Angel" },
  { count: 1, name: "Ballyrush Banneret" },
  { count: 1, name: "Crusader of Odric" },
  { count: 1, name: "Dawnwing Marshal" },
  { count: 1, name: "Felidar Cub" },
  { count: 1, name: "Knight of Grace" },
  { count: 1, name: "Syr Alin, the Lion's Claw" },
  { count: 4, name: "Hinterland Sanctifier" },
  { count: 1, name: "Make a Stand", is_foil: true },
  { count: 1, name: "Divine Resilience" },
  { count: 1, name: "Joust Through" },
  { count: 1, name: "Stroke of Midnight" },
  { count: 1, name: "Disenchant" },
  { count: 1, name: "Valorous Stance" },
  { count: 1, name: "Angelic Destiny" },
  { count: 1, name: "Felidar Retreat" },
  { count: 1, name: "Twinblade Blessing" },
  { count: 2, name: "Stasis Snare" },
  { count: 1, name: "Fumigate" },
  { count: 1, name: "Devout Decree" },
  { count: 1, name: "Release the Dogs" },
  // ── Blue (40) ──
  { count: 1, name: "Rite of Replication", is_foil: true },
  { count: 1, name: "Finale of Revelation" },
  { count: 1, name: "River's Rebuke" },
  { count: 1, name: "Chart a Course" },
  { count: 1, name: "Confiscate", is_foil: true },
  { count: 1, name: "Dictate of Kruphix" },
  { count: 1, name: "Witness Protection" },
  { count: 1, name: "Negate", is_foil: true },
  { count: 1, name: "Refute", treatment: "borderless" },
  { count: 1, name: "Faebloom Trick" },
  { count: 1, name: "Essence Scatter" },
  { count: 2, name: "Think Twice" },
  { count: 1, name: "Into the Roil" },
  { count: 4, name: "Opt" },
  { count: 1, name: "Dive Down" },
  { count: 1, name: "Flashfreeze" },
  { count: 1, name: "Mystical Teachings" },
  { count: 1, name: "Unsummon" },
  { count: 1, name: "Arcanis the Omnipotent" },
  { count: 1, name: "Harbinger of the Tides" },
  { count: 1, name: "Sphinx of the Final Word" },
  { count: 1, name: "Tempest Djinn" },
  { count: 1, name: "Voracious Greatshark" },
  { count: 1, name: "Clinquant Skymage" },
  { count: 2, name: "Mischievous Mystic" },
  { count: 2, name: "Brineborn Cutthroat" },
  { count: 1, name: "Micromancer" },
  { count: 1, name: "Mocking Sprite" },
  { count: 2, name: "Spectral Sailor" },
  { count: 1, name: "Tolarian Terror" },
  { count: 1, name: "Fog Bank" },
  { count: 1, name: "Gateway Sneak" },
  { count: 1, name: "Shipwreck Dowser" },
  // ── Black (39) ── article typo "Malikir" → real card "Gatekeeper of Malakir"
  { count: 1, name: "Massacre Wurm", is_foil: true },
  { count: 1, name: "Gatekeeper of Malakir", is_foil: true },
  { count: 3, name: "Vengeful Bloodwitch" },
  { count: 1, name: "Vengeful Bloodwitch", treatment: "borderless" },
  { count: 1, name: "Desecration Demon" },
  { count: 1, name: "Kalastria Highborn" },
  { count: 1, name: "Midnight Reaper" },
  { count: 1, name: "Myojin of Night's Reach" },
  { count: 1, name: "Nullpriest of Oblivion" },
  { count: 1, name: "Arbiter of Woe" },
  { count: 2, name: "Infestation Sage" },
  { count: 1, name: "Marauding Blight-Priest" },
  { count: 1, name: "Stromkirk Bloodthief" },
  { count: 1, name: "Vampire Nighthawk" },
  { count: 1, name: "Suspicious Shambler" },
  { count: 1, name: "Driver of the Dead" },
  { count: 1, name: "Knight of Malice" },
  { count: 1, name: "Pulse Tracker" },
  { count: 1, name: "Vile Entomber" },
  { count: 1, name: "Feed the Swarm", is_foil: true },
  { count: 1, name: "Dread Summons" },
  { count: 1, name: "Seeker's Folly" },
  { count: 1, name: "Exsanguinate" },
  { count: 1, name: "Zombify" },
  { count: 1, name: "Deathmark" },
  { count: 1, name: "Duress" },
  { count: 1, name: "Sanguine Indulgence" },
  { count: 1, name: "Demonic Pact" },
  { count: 1, name: "Midnight Snack" },
  { count: 1, name: "Vampiric Rites" },
  { count: 1, name: "Wishclaw Talisman" },
  { count: 2, name: "Hero's Downfall" },
  { count: 1, name: "Moment of Craving" },
  { count: 1, name: "Undying Malice" },
  { count: 1, name: "Tribute to Hunger" },
  // ── Red (38) ── article typo "Gratutious" → real card "Gratuitous Violence"
  { count: 1, name: "Gratuitous Violence", is_foil: true },
  { count: 1, name: "Impact Tremors", is_foil: true },
  { count: 1, name: "Guttersnipe", is_foil: true },
  { count: 1, name: "Ball Lightning" },
  { count: 1, name: "Dragonmaster Outcast" },
  { count: 1, name: "Lathliss, Dragon Queen" },
  { count: 1, name: "Redcap Gutter-Dweller" },
  { count: 1, name: "Stromkirk Noble" },
  { count: 1, name: "Taurean Mauler" },
  { count: 2, name: "Crackling Cyclops" },
  { count: 1, name: "Strongbox Raider" },
  { count: 1, name: "Fanatical Firebrand" },
  { count: 2, name: "Heartfire Immolator" },
  { count: 1, name: "Dragon Mage" },
  { count: 2, name: "Ghitu Lavarunner" },
  { count: 1, name: "Giant Cindermaw" },
  { count: 1, name: "Hoarding Dragon" },
  { count: 1, name: "Mindsparker" },
  { count: 1, name: "Ravenous Giant" },
  { count: 1, name: "Viashino Pyromancer" },
  { count: 1, name: "Abrade", treatment: "borderless" },
  { count: 4, name: "Burst Lightning" },
  { count: 1, name: "Hidetsugu's Second Rite" },
  { count: 1, name: "Thrill of Possibility" },
  { count: 1, name: "Bolt Bend" },
  { count: 1, name: "Harmless Offering" },
  { count: 1, name: "Goblin Negotiation" },
  { count: 1, name: "Seismic Rupture" },
  { count: 2, name: "Dragon Fodder" },
  { count: 1, name: "Crash Through" },
  { count: 1, name: "Obliterating Bolt" },
  // ── Green (39) ──
  { count: 2, name: "Imperious Perfect", is_foil: true },
  { count: 1, name: "Pelakka Wurm" },
  { count: 1, name: "Reclamation Sage", treatment: "borderless" },
  { count: 1, name: "Heroes' Bane" },
  { count: 1, name: "Predator Ooze" },
  { count: 1, name: "Rampaging Baloths" },
  { count: 1, name: "Surrak, the Hunt Caller" },
  { count: 1, name: "Vizier of the Menagerie" },
  { count: 1, name: "Wildborn Preserver" },
  { count: 1, name: "Elvish Regrower" },
  { count: 1, name: "Quakestrider Ceratops" },
  { count: 2, name: "Dwynen's Elite" },
  { count: 4, name: "Llanowar Elves" },
  { count: 1, name: "Wildwood Scourge" },
  { count: 1, name: "Thornweald Archer" },
  { count: 1, name: "Fierce Empath" },
  { count: 1, name: "Fynn, the Fangbearer" },
  { count: 1, name: "Gnarlback Rhino" },
  { count: 1, name: "Mold Adder" },
  { count: 1, name: "Springbloom Druid" },
  { count: 1, name: "Venom Connoisseur" },
  { count: 1, name: "Primal Might" },
  { count: 1, name: "Bushwhack" },
  { count: 1, name: "Overrun" },
  { count: 2, name: "Circuitous Route" },
  { count: 1, name: "Primeval Bounty" },
  { count: 1, name: "Garruk's Uprising" },
  { count: 1, name: "Ordeal of Nylea" },
  { count: 1, name: "Bite Down" },
  { count: 1, name: "Broken Wings" },
  { count: 1, name: "Giant Growth" },
  { count: 1, name: "Snakeskin Veil" },
  { count: 1, name: "Gigantosaurus", is_foil: true }, // CN 718 — foil-only full-art
  // ── Multicolor (29) ──
  { count: 1, name: "Boros Charm", is_foil: true },
  { count: 1, name: "Mortify" },
  { count: 1, name: "Teach by Example" },
  { count: 1, name: "Unflinching Courage", is_foil: true },
  { count: 1, name: "Aurelia, the Warleader" },
  { count: 1, name: "Ayli, Eternal Pilgrim" },
  { count: 1, name: "Drogskol Reaver" },
  { count: 1, name: "Halana and Alena, Partners" },
  { count: 1, name: "Immersturm Predator" },
  { count: 1, name: "Ovika, Enigma Goliath" },
  { count: 1, name: "Prime Speaker Zegana" },
  { count: 1, name: "Wilt-Leaf Liege" },
  { count: 1, name: "Dreadwing Scavenger" },
  { count: 1, name: "Fiendish Panda" },
  { count: 1, name: "Perforating Artist" },
  { count: 1, name: "Wardens of the Cycle" },
  { count: 1, name: "Empyrean Eagle" },
  { count: 1, name: "Ruby, Daring Tracker" },
  { count: 1, name: "Tatyova, Benthic Druid" },
  { count: 1, name: "Cloudblazer" },
  { count: 1, name: "Dryad Militant" },
  { count: 1, name: "Enigma Drake" },
  { count: 1, name: "Garna, Bloodfist of Keld" },
  { count: 1, name: "Savage Ventmaw" },
  { count: 1, name: "Trygon Predator" },
  { count: 1, name: "Consuming Aberration" },
  { count: 1, name: "Maelstrom Pulse" },
  { count: 1, name: "Heroic Reinforcements" },
  { count: 1, name: "Deadly Brew" },
  // ── Colorless (73) ──
  // Creatures (9)
  { count: 1, name: "Adaptive Automaton", is_foil: true },
  { count: 1, name: "Darksteel Colossus" },
  { count: 1, name: "Ramos, Dragon Engine" },
  { count: 1, name: "Steel Hellkite" },
  { count: 1, name: "Burnished Hart" },
  { count: 1, name: "Meteor Golem" },
  { count: 1, name: "Diamond Mare" },
  { count: 1, name: "Gate Colossus" },
  { count: 1, name: "Three Tree Mascot" },
  // Artifacts (16)
  { count: 1, name: "Gilded Lotus", is_foil: true },
  { count: 1, name: "Expedition Map", is_foil: true },
  { count: 1, name: "Hedron Archive", is_foil: true },
  { count: 1, name: "Swiftfoot Boots", cn: "258" }, // regular print — WOTC's article said "borderless" but the verified CM idProduct points to the main FDN page (no V-suffix), so the article was wrong here. CN 258 has no startercollection promo tag on Scryfall, hence the CN pin.
  { count: 1, name: "Basilisk Collar" },
  { count: 1, name: "Cultivator's Caravan" },
  { count: 1, name: "Mazemind Tome" },
  { count: 1, name: "Pyromancer's Goggles" },
  { count: 1, name: "Ravenous Amulet" },
  { count: 1, name: "Heraldic Banner" },
  { count: 1, name: "Feldon's Cane" },
  { count: 1, name: "Fireshrieker" },
  { count: 1, name: "Sorcerous Spyglass" },
  { count: 1, name: "Soul-Guide Lantern" },
  { count: 1, name: "Arcane Signet", is_foil: true, set: "fdc" },
  { count: 1, name: "Sol Ring", is_foil: true, set: "fdc" },
  // Lands (48 — non-basic only; the 90 basics are excluded per skill default)
  { count: 1, name: "Maze's End", is_foil: true },
  { count: 1, name: "Crawling Barrens" },
  { count: 1, name: "Temple of Abandon" },
  { count: 1, name: "Temple of Deceit" },
  { count: 1, name: "Temple of Enlightenment" },
  { count: 1, name: "Temple of Epiphany" },
  { count: 1, name: "Temple of Malady" },
  { count: 1, name: "Temple of Malice" },
  { count: 1, name: "Temple of Mystery" },
  { count: 1, name: "Temple of Plenty" },
  { count: 1, name: "Temple of Silence" },
  { count: 1, name: "Temple of Triumph" },
  { count: 2, name: "Bloodfell Caves" },
  { count: 2, name: "Blossoming Sands" },
  { count: 2, name: "Dismal Backwater" },
  { count: 2, name: "Evolving Wilds" },
  { count: 2, name: "Jungle Hollow" },
  { count: 1, name: "Rogue's Passage" },
  { count: 2, name: "Rugged Highlands" },
  { count: 2, name: "Scoured Barrens" },
  { count: 2, name: "Swiftwater Cliffs" },
  { count: 2, name: "Thornwood Falls" },
  { count: 2, name: "Tranquil Cove" },
  { count: 2, name: "Wind-Scarred Crag" },
  { count: 1, name: "Azorius Guildgate" },
  { count: 1, name: "Boros Guildgate" },
  { count: 1, name: "Cryptic Caves" },
  { count: 1, name: "Demolition Field" },
  { count: 1, name: "Dimir Guildgate" },
  { count: 1, name: "Golgari Guildgate" },
  { count: 1, name: "Gruul Guildgate" },
  { count: 1, name: "Izzet Guildgate" },
  { count: 1, name: "Orzhov Guildgate" },
  { count: 1, name: "Rakdos Guildgate" },
  { count: 1, name: "Selesnya Guildgate" },
  { count: 1, name: "Simic Guildgate" },
  { count: 1, name: "Command Tower", is_foil: true, set: "fdc" },
];

interface Resolved {
  scryfall_id: string;
  name: string;
  set: string;
  collector_number: string;
  treatment: string;
  border_color: string;
  finishes: string[];
  price_eur: number | null;
  price_eur_foil: number | null;
}

async function resolveOne(entry: Entry): Promise<Resolved | null> {
  const db = await getDb();
  const col = db.collection<Resolved>("dashboard_ev_cards");
  const setCode = entry.set ?? PARENT;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any;
  if (entry.cn) {
    q = { set: setCode, name: entry.name, collector_number: entry.cn };
  } else if (setCode === FDC) {
    q = { set: FDC, name: entry.name };
  } else if (entry.treatment === "borderless") {
    q = {
      set: PARENT,
      name: entry.name,
      treatment: "borderless",
      promo_types: "startercollection",
    };
  } else {
    q = {
      set: PARENT,
      name: entry.name,
      treatment: "normal",
      border_color: "black",
      promo_types: "startercollection",
    };
  }

  const card = await col.findOne(q, {
    projection: {
      scryfall_id: 1, name: 1, set: 1, collector_number: 1,
      treatment: 1, border_color: 1, finishes: 1,
      price_eur: 1, price_eur_foil: 1,
    } as never,
  });
  return card;
}

async function main() {
  const args = process.argv.slice(2);
  const persist = args.includes("--persist");
  const overwrite = args.includes("--overwrite");

  const resolved: { entry: Entry; card: Resolved }[] = [];
  const missing: string[] = [];

  for (const e of DECKLIST) {
    const card = await resolveOne(e);
    if (!card) {
      missing.push(`${e.name} [${e.set ?? PARENT}, treat=${e.treatment ?? "normal"}, foil=${!!e.is_foil}]`);
      continue;
    }
    resolved.push({ entry: e, card });
  }

  if (missing.length) {
    console.error(`\n❌ MISSING (${missing.length}):`);
    for (const m of missing) console.error("   ", m);
    process.exit(1);
  }

  // Sanity totals.
  const totalCards = DECKLIST.reduce((s, e) => s + e.count, 0);
  const uniqueLines = DECKLIST.length;
  console.log(`\nResolved ${uniqueLines} entries → ${totalCards} cards`);

  // Render the per-entry table.
  console.log("\n┌─ Decklist ───────────────────────────");
  for (const r of resolved) {
    const f = r.entry.is_foil ? "★F" : "  ";
    const t = r.entry.treatment === "borderless" ? "BL" : "NM";
    const px = r.entry.is_foil ? r.card.price_eur_foil : r.card.price_eur;
    const pxs = px == null ? "    —" : `€${(px).toFixed(2)}`.padStart(6);
    console.log(
      `  ${String(r.entry.count).padStart(2)}  ${f}  ${t}  ${r.card.set.toUpperCase()} CN${String(r.card.collector_number).padStart(4)}  ${pxs}  ${r.entry.name}`,
    );
  }

  let approxGross = 0;
  for (const r of resolved) {
    const px = r.entry.is_foil ? r.card.price_eur_foil : r.card.price_eur;
    if (typeof px === "number") approxGross += px * r.entry.count;
  }
  console.log(`\nApprox cards-only gross EV (Scryfall snapshot): €${approxGross.toFixed(2)}`);

  // Build EvProductCard[] (aggregate same scryfall_id+is_foil rows).
  const cards: EvProductCard[] = [];
  const map = new Map<string, EvProductCard>();
  for (const r of resolved) {
    const c: EvProductCard = {
      scryfall_id: r.card.scryfall_id,
      name: r.card.name,
      set_code: r.card.set,
      count: r.entry.count,
      is_foil: !!r.entry.is_foil,
    };
    const k = `${c.scryfall_id}|${c.is_foil}`;
    const existing = map.get(k);
    if (existing) existing.count += c.count;
    else { map.set(k, c); cards.push(c); }
  }
  console.log(`\nMerged: ${cards.length} unique entries → ${cards.reduce((s, c) => s + c.count, 0)} cards`);

  const product: Omit<EvProduct, "_id" | "seeded_at"> = {
    slug: SLUG,
    name: NAME,
    product_type: TYPE,
    release_year: RELEASE_YEAR,
    parent_set_code: PARENT,
    cards,
    included_boosters: [{ set_code: "fdn", count: 3, sealed_price_eur: 4.25 }],
    notes:
      "Source: WOTC announcement (Oct 29, 2024). 387 cards = 297 listed (this product) " +
      "+ 90 basics (omitted; default count_basic_lands=false treats them as €0). " +
      "26 traditional foils + 6 borderless-art prints. Sol Ring / Arcane Signet / " +
      "Command Tower live in fdc, foil-only, promo_types=['startercollection']. " +
      "Includes 3 Foundations Play Boosters @ €4.25 sealed (user-entered 2026-04-29). " +
      "Opened-EV will populate once an fdn snapshot exists with play_ev_net.",
  };

  if (!persist) {
    console.log("\n[dry run] Pass --persist to upsert; --overwrite to replace.");
    await (await getClient()).close();
    return;
  }

  const res = await upsertProduct(product, { overwrite });
  console.log(`\n${res.created ? "Created" : "Updated"} ${res.slug}`);
  const snap = await generateProductSnapshot(SLUG);
  if (snap.written) {
    const db = await getDb();
    const latest = await db.collection("dashboard_ev_snapshots")
      .findOne({ product_slug: SLUG }, { sort: { date: -1 } });
    if (latest) {
      console.log(
        `Snapshot ${latest.date}: cards-only €${latest.ev_net_cards_only}` +
        ` | sealed €${latest.ev_net_sealed}` +
        ` | opened €${latest.ev_net_opened}`,
      );
    }
  } else {
    console.log(`Snapshot skipped: ${snap.reason}`);
  }
  await (await getClient()).close();
}

main().catch((e) => { console.error(e); process.exit(1); });
