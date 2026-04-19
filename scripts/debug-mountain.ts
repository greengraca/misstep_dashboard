try { process.loadEnvFile(".env"); } catch {}

import { searchStock } from "../lib/stock";
import { getDb, getClient } from "../lib/mongodb";

async function main() {
  const db = await getDb();

  // How many Theros Beyond Death Mountain variants does ev_cards have?
  const variants = await db
    .collection("dashboard_ev_cards")
    .find(
      { set: "thb", name: "Mountain" },
      {
        projection: {
          _id: 0,
          scryfall_id: 1,
          collector_number: 1,
          treatment: 1,
          price_eur: 1,
          cardmarket_id: 1,
          "cm_prices.nonfoil.trend": 1,
          "cm_prices.nonfoil.updatedAt": 1,
          prices_updated_at: 1,
        },
      }
    )
    .toArray();
  console.log(`thb Mountain variants in ev_cards: ${variants.length}`);
  for (const v of variants) {
    console.log(
      `  #${v.collector_number} ${v.treatment?.padEnd(12) ?? "?"} cmId=${v.cardmarket_id}  ` +
        `scry=€${v.price_eur}  ext=${v.cm_prices?.nonfoil?.trend != null ? `€${v.cm_prices.nonfoil.trend} (@ ${v.cm_prices.nonfoil.updatedAt})` : "—"}`
    );
  }

  // Now search stock for it
  console.log("\nsearchStock result for Mountain / Theros Beyond Death:");
  const res = await searchStock({
    name: "Mountain",
    set: "Theros Beyond Death",
    sort: "lastSeenAt",
    dir: "desc",
    page: 1,
    pageSize: 10,
  });
  for (const r of res.rows) {
    console.log(
      `  €${r.price} foil=${r.foil} trend=€${r.trend_eur} src=${r.trend_source} updatedAt=${r.trend_updated_at} Δ=${r.overpriced_pct != null ? (r.overpriced_pct * 100).toFixed(0) + "%" : "—"}`
    );
  }

  await (await getClient()).close();
}
main().catch((e) => { console.error(e); process.exit(1); });
