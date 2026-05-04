// Smoke-test the manual-sales service against the dev DB. Creates a
// throwaway investment, exercises every code path, then cleans up.
//
// Run: npx tsx scripts/_smoke-manual-sales.ts
//
// On success, prints "ALL CHECKS PASSED". On any failure throws — the
// script is the test.

try { process.loadEnvFile(".env"); } catch {
  // .env missing
}

import { ObjectId } from "mongodb";
import { getDb, getClient } from "../lib/mongodb";
import {
  recordManualSale,
  deleteManualSale,
  generateManualSaleId,
} from "../lib/investments/manual-sales";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
}
function assertEq<T>(actual: T, expected: T, msg: string): void {
  if (actual !== expected) throw new Error(`ASSERT FAIL ${msg}: got ${actual}, want ${expected}`);
}

async function main() {
  const db = await getDb();

  // Create a throwaway investment + lot
  const invId = new ObjectId();
  const lotIdSeed = new ObjectId();
  await db.collection("dashboard_investments").insertOne({
    _id: invId,
    name: "_smoke manual-sales",
    code: `MS-SMK${Math.floor(Math.random() * 0xff).toString(16).padStart(2, "0").toUpperCase()}`,
    created_at: new Date(),
    created_by: "smoke",
    status: "listing",
    cost_total_eur: 100,
    source: {
      kind: "box",
      set_code: "j25",
      booster_type: "jumpstart",
      packs_per_box: 24,
      cards_per_pack: 20,
      box_count: 1,
    },
    cm_set_names: ["Foundations Jumpstart"],
    sealed_flips: [],
    expected_open_card_count: 480,
  });
  await db.collection("dashboard_investment_lots").insertOne({
    _id: lotIdSeed,
    investment_id: invId,
    cardmarket_id: 999001,
    foil: false,
    condition: "NM",
    language: "English",
    qty_opened: 3,
    qty_sold: 0,
    qty_remaining: 3,
    proceeds_eur: 0,
    cost_basis_per_unit: null,
    last_grown_at: new Date(),
  });

  console.log("---- was-listed mode ----");
  const r1 = await recordManualSale({
    db,
    investmentId: String(invId),
    cardmarketId: 999001,
    foil: false,
    condition: "NM",
    language: "English",
    qty: 1,
    unitPriceEur: 5,
    wasListed: true,
    date: new Date(),
    note: "smoke A",
  });
  assertEq(r1.status, "ok", "was-listed record");
  let lot = await db.collection("dashboard_investment_lots").findOne({ _id: lotIdSeed });
  assertEq(lot?.qty_opened, 3, "wasListed leaves qty_opened");
  assertEq(lot?.qty_sold, 1, "wasListed bumps qty_sold");
  assertEq(lot?.qty_remaining, 2, "wasListed decrements qty_remaining");
  assertEq(lot?.proceeds_eur, 5, "wasListed adds proceeds");

  console.log("---- insufficient-remaining ----");
  const r2 = await recordManualSale({
    db, investmentId: String(invId), cardmarketId: 999001, foil: false,
    condition: "NM", language: "English", qty: 99, unitPriceEur: 5,
    wasListed: true, date: new Date(),
  });
  assertEq(r2.status, "insufficient-remaining", "rejects qty>remaining");
  // Verify rollback: only the previous sale_log row should exist.
  const logsAfterReject = await db.collection("dashboard_investment_sale_log")
    .countDocuments({ investment_id: invId });
  assertEq(logsAfterReject, 1, "no sale_log row written on insufficient-remaining");

  console.log("---- off-the-books, existing lot ----");
  const r3 = await recordManualSale({
    db, investmentId: String(invId), cardmarketId: 999001, foil: false,
    condition: "NM", language: "English", qty: 1, unitPriceEur: 7,
    wasListed: false, date: new Date(), note: "smoke B",
  });
  assertEq(r3.status, "ok", "off-the-books on existing lot");
  lot = await db.collection("dashboard_investment_lots").findOne({ _id: lotIdSeed });
  assertEq(lot?.qty_opened, 4, "off-the-books grows opened");
  assertEq(lot?.qty_sold, 2, "off-the-books bumps sold");
  assertEq(lot?.qty_remaining, 2, "off-the-books leaves remaining alone");
  assertEq(lot?.proceeds_eur, 12, "off-the-books adds proceeds");

  console.log("---- off-the-books, new card (lot doesn't exist) ----");
  const r4 = await recordManualSale({
    db, investmentId: String(invId), cardmarketId: 999002, foil: false,
    condition: "NM", language: "English", qty: 2, unitPriceEur: 3,
    wasListed: false, date: new Date(),
  });
  assertEq(r4.status, "ok", "off-the-books creates lot");
  const newLot = await db.collection("dashboard_investment_lots").findOne({
    investment_id: invId, cardmarket_id: 999002,
  });
  assert(newLot, "new lot exists");
  assertEq(newLot?.qty_opened, 2, "new lot opened=2");
  assertEq(newLot?.qty_sold, 2, "new lot sold=2");
  assertEq(newLot?.qty_remaining, 0, "new lot remaining=0");

  console.log("---- delete: was-listed reversal ----");
  const ok1 = r1.status === "ok" ? r1 : null;
  assert(ok1, "r1 ok");
  const d1 = await deleteManualSale({
    db, investmentId: String(invId), saleLogId: ok1.sale_log_id,
  });
  assertEq(d1.status, "ok", "delete was-listed");
  lot = await db.collection("dashboard_investment_lots").findOne({ _id: lotIdSeed });
  assertEq(lot?.qty_opened, 4, "delete was-listed: opened still 4 (off-the-books B left it at 4)");
  assertEq(lot?.qty_sold, 1, "delete was-listed: sold returns to 1");
  assertEq(lot?.qty_remaining, 3, "delete was-listed: remaining returns to 3");
  assertEq(lot?.proceeds_eur, 7, "delete was-listed: proceeds returns to 7");

  console.log("---- delete: off-the-books reversal ----");
  const ok3 = r3.status === "ok" ? r3 : null;
  assert(ok3, "r3 ok");
  const d2 = await deleteManualSale({
    db, investmentId: String(invId), saleLogId: ok3.sale_log_id,
  });
  assertEq(d2.status, "ok", "delete off-the-books");
  lot = await db.collection("dashboard_investment_lots").findOne({ _id: lotIdSeed });
  assertEq(lot?.qty_opened, 3, "delete off-the-books: opened back to 3");
  assertEq(lot?.qty_sold, 0, "delete off-the-books: sold back to 0");
  assertEq(lot?.qty_remaining, 3, "delete off-the-books: remaining unchanged at 3");
  assertEq(lot?.proceeds_eur, 0, "delete off-the-books: proceeds back to 0");

  console.log("---- delete: refuses non-manual ----");
  const cmSale = await db.collection("dashboard_investment_sale_log").insertOne({
    lot_id: lotIdSeed,
    investment_id: invId,
    order_id: "12345",
    cardmarket_id: 999001,
    foil: false,
    condition: "NM",
    language: "English",
    qty: 1,
    unit_price_eur: 5,
    net_per_unit_eur: 4.75,
    attributed_at: new Date(),
  });
  const d3 = await deleteManualSale({
    db, investmentId: String(invId), saleLogId: String(cmSale.insertedId),
  });
  assertEq(d3.status, "not-manual", "refuses to delete CM sale");

  console.log("---- frozen investment: refuses record + delete ----");
  await db.collection("dashboard_investments").updateOne(
    { _id: invId }, { $set: { status: "closed" } }
  );
  const r5 = await recordManualSale({
    db, investmentId: String(invId), cardmarketId: 999001, foil: false,
    condition: "NM", language: "English", qty: 1, unitPriceEur: 5,
    wasListed: true, date: new Date(),
  });
  assertEq(r5.status, "frozen", "record refuses on closed");
  const ok4 = r4.status === "ok" ? r4 : null;
  assert(ok4, "r4 ok");
  const d4 = await deleteManualSale({
    db, investmentId: String(invId), saleLogId: ok4.sale_log_id,
  });
  assertEq(d4.status, "frozen", "delete refuses on closed");

  console.log("---- collection-kind: refuses off-the-books ----");
  await db.collection("dashboard_investments").updateOne(
    { _id: invId },
    { $set: { status: "listing", source: { kind: "collection", appraiser_collection_id: "fake", card_count: 0 } } }
  );
  const r6 = await recordManualSale({
    db, investmentId: String(invId), cardmarketId: 999001, foil: false,
    condition: "NM", language: "English", qty: 1, unitPriceEur: 5,
    wasListed: false, date: new Date(),
  });
  assertEq(r6.status, "cannot-grow-collection-kind", "collection-kind refuses off-the-books");

  console.log("---- id format ----");
  for (let i = 0; i < 5; i++) {
    const id = generateManualSaleId();
    assert(/^manual:[0-9a-f]{8}$/.test(id), `id format ${id}`);
  }

  // Cleanup
  await db.collection("dashboard_investment_sale_log").deleteMany({ investment_id: invId });
  await db.collection("dashboard_investment_lots").deleteMany({ investment_id: invId });
  await db.collection("dashboard_investments").deleteOne({ _id: invId });

  console.log("\nALL CHECKS PASSED");
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { const c = await getClient(); await c.close(); });
