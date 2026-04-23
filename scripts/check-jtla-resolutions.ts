try { process.loadEnvFile(".env"); } catch {}

import { getDb, getClient } from "../lib/mongodb";
import { getCardsForSet } from "../lib/ev";

(async () => {
  // Load jtla virtual pool in priority order
  const { cards } = await getCardsForSet("jtla");

  // Build name→card lookup (mirrors calculateJumpstartEv)
  const cardByName = new Map<string, typeof cards[number]>();
  for (const c of cards) cardByName.set(c.name.toLowerCase(), c);

  const samples = [
    "Path to Redemption",
    "Plains",
    "Island",
    "Swamp",
    "Mountain",
    "Forest",
    "Aang, Airbending Master",
    "Katara, Waterbending Master",
    "Momo, Rambunctious Rascal",
    "Rabaroo Troop",
    "Octopus Form",
    "Thriving Heath",
    "Thriving Grove",
  ];

  console.log(`Pool size: ${cards.length}`);
  console.log(`Unique names after merge: ${cardByName.size}`);
  console.log();
  for (const n of samples) {
    const c = cardByName.get(n.toLowerCase());
    if (!c) {
      console.log(`  ${n.padEnd(30)} → UNRESOLVED`);
      continue;
    }
    console.log(
      `  ${n.padEnd(30)} → ${c.set} #${c.collector_number} (${c.rarity}) €${c.price_eur ?? "null"}`
    );
  }

  await (await getClient()).close();
  process.exit(0);
})();
