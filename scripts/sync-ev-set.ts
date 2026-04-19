// Manually sync one Scryfall set (by code) into dashboard_ev_sets and
// dashboard_ev_cards, bypassing the UI-level MIN_RELEASE_YEAR filter.
// Used by the add-ev-product skill to pull in pre-2020 parent sets.
//
//   npx tsx scripts/sync-ev-set.ts akh
//   npx tsx scripts/sync-ev-set.ts akh pakh   # also syncs auxiliary promo set
//
// Does NOT call refreshAllScryfall — this is a targeted, cheap sync suitable
// for ad-hoc product seeding.

try { process.loadEnvFile(".env"); } catch {}

import { getClient } from "../lib/mongodb";
import { syncOneSet, syncCards } from "../lib/ev";

async function syncOne(code: string): Promise<void> {
  console.log(`\n── ${code} ─────────────────────────`);
  const setRes = await syncOneSet(code);
  console.log(`  sets: +${setRes.added} new, ${setRes.updated} updated`);
  const cardRes = await syncCards(code);
  console.log(`  cards: +${cardRes.added} new, ${cardRes.updated} updated (${cardRes.total} total)`);
}

async function main() {
  const codes = process.argv.slice(2).map((s) => s.toLowerCase()).filter(Boolean);
  if (codes.length === 0) {
    console.error("Usage: npx tsx scripts/sync-ev-set.ts <set_code> [aux_set_code ...]");
    process.exit(2);
  }
  for (const code of codes) {
    await syncOne(code);
  }
  await (await getClient()).close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
