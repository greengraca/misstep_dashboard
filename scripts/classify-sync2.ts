try { process.loadEnvFile(".env"); } catch {}
import { getDb, getClient } from "../lib/mongodb";

async function main() {
  const db = await getDb();
  const col = db.collection("dashboard_ev_card_prices");
  const sync2 = await col.find({ d: new Date("2026-04-18T23:01:11.991Z") }).toArray();
  console.log(`Second sync inserted ${sync2.length} snapshots.`);
  let overlap = 0, onlyNew = 0;
  for (const s of sync2) {
    const inFirst = await col.findOne({ s: s.s, d: new Date("2026-04-18T13:00:24.218Z") });
    if (inFirst) overlap++; else onlyNew++;
  }
  console.log(`  also in first sync (real price change): ${overlap}`);
  console.log(`  new-in-scope cards (first snapshot):    ${onlyNew}`);
  await (await getClient()).close();
}
main().catch((e) => { console.error(e); process.exit(1); });
