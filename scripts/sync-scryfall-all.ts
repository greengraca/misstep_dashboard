// One-shot runner for refreshAllScryfall(). Use when you want to trigger the
// full Scryfall bulk sync (and write a price-history snapshot) outside the
// Vercel Cron path — e.g. seeding or local testing.
//
//   npx tsx scripts/sync-scryfall-all.ts

try {
  process.loadEnvFile(".env");
} catch {
  // .env missing — MONGODB_URI check inside getDb will surface a useful error.
}

import { refreshAllScryfall } from "../lib/ev";
import { getClient } from "../lib/mongodb";

async function main() {
  console.log("Starting refreshAllScryfall...");
  const started = Date.now();
  const result = await refreshAllScryfall();
  console.log("Done in", ((Date.now() - started) / 1000).toFixed(1), "s");
  console.log(JSON.stringify(result, null, 2));
  await (await getClient()).close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
