try {
  process.loadEnvFile(".env");
} catch {
  // .env missing
}

import { ObjectId } from "mongodb";
import { getDb, getClient } from "../lib/mongodb";

const INVESTMENT_ID = "69e80180715adc74ddf18dc4";

async function main() {
  const db = await getDb();

  console.log(`\n══════ Investment ${INVESTMENT_ID} ══════\n`);
  const inv = await db.collection("dashboard_investments").findOne({ _id: new ObjectId(INVESTMENT_ID) });
  if (!inv) {
    console.log("NOT FOUND");
    return;
  }
  console.log(JSON.stringify(inv, null, 2));

  const code: string | undefined = inv.code;
  console.log(`\ncode = ${code ?? "(none — pre-tag-system, would be invisible to attribution!)"}`);
  console.log(`status = ${inv.status}`);
  console.log(`source.kind = ${inv.source?.kind}`);

  console.log(`\n══════ Lots for this investment ══════\n`);
  const lots = await db
    .collection("dashboard_investment_lots")
    .find({ investment_id: new ObjectId(INVESTMENT_ID) })
    .toArray();
  console.log(`count = ${lots.length}`);
  for (const lot of lots) {
    console.log(
      `  cm=${lot.cardmarket_id}  foil=${lot.foil}  cond=${lot.condition}  lang=${lot.language}` +
        `  qty_opened=${lot.qty_opened}  qty_sold=${lot.qty_sold}  qty_remaining=${lot.qty_remaining}` +
        `  last_grown_at=${lot.last_grown_at?.toISOString?.() ?? lot.last_grown_at ?? "(never)"}`
    );
  }

  if (!code) {
    console.log("\n!! No code on investment — attribution skipped entirely. Bail.");
    return;
  }

  console.log(`\n══════ dashboard_cm_stock listings whose comment contains "${code}" ══════\n`);
  const escapedCode = code.replace(/-/g, "\\-");
  const stockRows = await db
    .collection("dashboard_cm_stock")
    .find({ comment: { $regex: `\\b${escapedCode}\\b`, $options: "i" } })
    .toArray();
  console.log(`count = ${stockRows.length}`);

  // Distribution of firstSeenAt vs investment created_at
  const invCreated = inv.created_at instanceof Date ? inv.created_at : new Date(inv.created_at);
  let beforeInv = 0, afterInv = 0, sameDay = 0;
  let earliestFirst: string | null = null;
  let latestFirst: string | null = null;
  for (const r of stockRows) {
    const fs: string | undefined = r.firstSeenAt;
    if (!fs) continue;
    if (!earliestFirst || fs < earliestFirst) earliestFirst = fs;
    if (!latestFirst || fs > latestFirst) latestFirst = fs;
    const fsDate = new Date(fs);
    if (fsDate < invCreated) beforeInv++;
    else if (fsDate.toDateString() === invCreated.toDateString()) sameDay++;
    else afterInv++;
  }
  console.log(`\n  firstSeenAt distribution vs investment created_at (${invCreated.toISOString()}):`);
  console.log(`    before investment: ${beforeInv}`);
  console.log(`    same day:          ${sameDay}`);
  console.log(`    after  investment: ${afterInv}`);
  console.log(`    earliest firstSeenAt: ${earliestFirst}`);
  console.log(`    latest   firstSeenAt: ${latestFirst}`);

  // Print first 10 with full timestamps
  console.log(`\n  sample of 10 (firstSeenAt → lastSeenAt):`);
  for (const r of stockRows.slice(0, 10)) {
    console.log(
      `    productId=${r.productId} qty=${r.qty} cond=${r.condition} foil=${r.foil}` +
        `  firstSeenAt=${r.firstSeenAt}  lastSeenAt=${r.lastSeenAt}  comment="${r.comment}"`
    );
  }

  // (Skip per-row tuple compare when lots is empty — every row would MISS.)
  if (lots.length > 0) {
    console.log(`\n══════ Tuple comparison: stock listings vs lots ══════\n`);
    const lotKeys = new Set(
      lots.map((l) => `${l.cardmarket_id}|${l.foil}|${l.condition}|${l.language}`)
    );
    for (const r of stockRows) {
      const key = `${r.productId}|${r.foil ?? false}|${r.condition}|${r.language ?? "English"}`;
      const matched = lotKeys.has(key);
      console.log(`  ${matched ? "MATCH" : "MISS "}  key=${key}  stockId=${r._id}`);
    }
  } else {
    console.log(`\n══════ Tuple comparison skipped (0 lots) ══════\n`);
  }

  console.log(`\n══════ Lookup attribution would do: findInvestmentByCode("${code}") ══════\n`);
  const found = await db
    .collection("dashboard_investments")
    .findOne({ code, status: { $in: ["listing", "closed"] } });
  console.log(found ? `OK — found _id=${found._id} status=${found.status}` : "NOT FOUND (status not listing/closed?)");

  console.log(`\n══════ Recent error log entries for attribution ══════\n`);
  const errors = await db
    .collection("dashboard_error_log")
    .find({ context: { $regex: "attribution", $options: "i" } })
    .sort({ created_at: -1 })
    .limit(20)
    .toArray();
  console.log(`count = ${errors.length}`);
  for (const e of errors) {
    console.log(`  ${e.created_at?.toISOString?.()}  ctx=${e.context}  msg=${e.message}  meta=${JSON.stringify(e.meta)}`);
  }

  console.log(`\n══════ Any other recent errors at all (last 10) ══════\n`);
  const anyErrors = await db
    .collection("dashboard_error_log")
    .find({})
    .sort({ created_at: -1 })
    .limit(10)
    .toArray();
  for (const e of anyErrors) {
    console.log(`  ${e.created_at?.toISOString?.() ?? e.created_at}  level=${e.level}  ctx=${e.context}  msg=${(e.message || "").slice(0, 120)}`);
  }

  console.log(`\n══════ Sync log entries that touched product_stock (last 10) ══════\n`);
  const syncLogs = await db
    .collection("dashboard_sync_log")
    .find({ dataType: "product_stock" })
    .sort({ receivedAt: -1 })
    .limit(10)
    .toArray();
  for (const s of syncLogs) {
    console.log(`  ${s.receivedAt}  by=${s.submittedBy}  details="${s.details ?? ""}"  stats=${JSON.stringify(s.stats)}`);
  }

  console.log(`\n══════ Sale log for this investment ══════\n`);
  const sales = await db
    .collection("dashboard_investment_sale_log")
    .find({ investment_id: new ObjectId(INVESTMENT_ID) })
    .sort({ attributed_at: -1 })
    .limit(20)
    .toArray();
  console.log(`count = ${sales.length}`);
  for (const s of sales) {
    console.log(
      `  ${s.attributed_at?.toISOString?.()}  order=${s.order_id}  cm=${s.cardmarket_id}` +
        `  foil=${s.foil} cond=${s.condition} lang=${s.language}  qty=${s.qty}  net=${s.net_per_unit_eur}`
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    const c = await getClient();
    await c.close();
  });
