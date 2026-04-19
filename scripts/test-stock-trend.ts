// Exercises the new searchStock aggregation — both fast (no overpriced
// filter) and slow (overpriced filter) paths — to validate the join and
// timings end-to-end against the live DB.
//
//   npx tsx scripts/test-stock-trend.ts

try { process.loadEnvFile(".env"); } catch {}

import { searchStock } from "../lib/stock";
import { getClient } from "../lib/mongodb";

function timeIt<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const started = Date.now();
  return fn().then((result) => {
    console.log(`${label} — ${((Date.now() - started) / 1000).toFixed(2)}s`);
    return result;
  });
}

async function main() {
  const baseParams = { sort: "lastSeenAt" as const, dir: "desc" as const, page: 1, pageSize: 5 };

  console.log("=== FAST PATH: no overpriced filter, page 1 of 5 ===");
  const fast = await timeIt("searchStock fast", () => searchStock(baseParams));
  console.log(`total=${fast.total} totalQty=${fast.totalQty} totalValue=€${fast.totalValue}`);
  console.log("rows:");
  for (const r of fast.rows) {
    const trend = r.trend_eur != null ? `€${r.trend_eur.toFixed(2)}` : "—";
    const op = r.overpriced_pct != null ? `${(r.overpriced_pct * 100).toFixed(1)}%` : "—";
    console.log(`  ${r.name.padEnd(30)} (${r.set.slice(0, 25).padEnd(25)}) €${r.price.toFixed(2)}  trend=${trend}  Δ=${op}`);
  }

  console.log("\n=== SLOW PATH: overpriced > +20%, sort by overpriced desc ===");
  const slow = await timeIt("searchStock slow", () =>
    searchStock({
      ...baseParams,
      minOverpricedPct: 0.2,
      sort: "overpriced_pct",
    })
  );
  console.log(`total=${slow.total} (overpriced by > 20%) totalQty=${slow.totalQty} totalValue=€${slow.totalValue}`);
  console.log("rows:");
  for (const r of slow.rows) {
    const trend = r.trend_eur != null ? `€${r.trend_eur.toFixed(2)}` : "—";
    const op = r.overpriced_pct != null ? `${(r.overpriced_pct * 100).toFixed(1)}%` : "—";
    console.log(`  ${r.name.padEnd(30)} (${r.set.slice(0, 25).padEnd(25)}) €${r.price.toFixed(2)}  trend=${trend}  Δ=${op}`);
  }

  await (await getClient()).close();
}

main().catch((e) => { console.error(e); process.exit(1); });
