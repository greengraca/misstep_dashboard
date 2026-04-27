// Diagnose the current state of the MB2 EV pool. Run before deploy to
// confirm the bug is firing, and after deploy to confirm the fix restored
// the full pool. Read-only — no DB writes.
//
//   npx tsx scripts/diagnose-mb2-pool.ts

try {
  process.loadEnvFile(".env");
} catch {
  // MONGODB_URI must be exported manually then.
}

import { getClient, getDb } from "../lib/mongodb";
import { MB2_PICKUP_CARDS } from "../lib/ev-mb2-list";

async function main(): Promise<void> {
  const db = await getDb();
  const col = db.collection("dashboard_ev_cards");

  const native = await col.countDocuments({ set: "mb2" });
  const legacy = await col.countDocuments({ set: "mb2-list" });
  const names = MB2_PICKUP_CARDS.map((c) => c.name);
  const plstAll = await col.countDocuments({ set: "plst", name: { $in: names } });
  const plstDeduped = await col
    .aggregate([
      { $match: { set: "plst", name: { $in: names } } },
      { $group: { _id: "$name" } },
      { $count: "n" },
    ])
    .toArray();
  const plstUniqueNames = (plstDeduped[0]?.n as number) ?? 0;

  // Sample one slot-1-eligible filter to see what the calc actually sees.
  // Default config slot 1: { rarity: [common, uncommon], border_color: [black],
  // frame: [2015, 2003, 1997, 1993], finishes: [nonfoil], mono_color: true,
  // colors: [W] }
  const slot1FilterCount = (poolSet: "mb2-only" | "mb2-plus-mb2list" | "mb2-plus-plst-pickups"): Promise<number> => {
    const baseFilter = {
      rarity: { $in: ["common", "uncommon"] },
      border_color: "black",
      frame: { $in: ["2015", "2003", "1997", "1993"] },
      finishes: "nonfoil",
      colors: ["W"],
    };
    if (poolSet === "mb2-only") {
      return col.countDocuments({ ...baseFilter, set: "mb2" });
    }
    if (poolSet === "mb2-plus-mb2list") {
      return col.countDocuments({ ...baseFilter, set: { $in: ["mb2", "mb2-list"] } });
    }
    return col
      .aggregate([
        { $match: { ...baseFilter, $or: [{ set: "mb2" }, { set: "plst", name: { $in: names } }] } },
        { $group: { _id: "$name" } },
        { $count: "n" },
      ])
      .toArray()
      .then((r) => (r[0]?.n as number) ?? 0);
  };

  const s1Native = await slot1FilterCount("mb2-only");
  const s1Legacy = await slot1FilterCount("mb2-plus-mb2list");
  const s1New = await slot1FilterCount("mb2-plus-plst-pickups");

  console.log("=== MB2 pool diagnostic ===\n");
  console.log(`Native mb2 cards (set: "mb2")              : ${native}`);
  console.log(`Legacy mb2-list cards (set: "mb2-list")    : ${legacy}    ${legacy > 0 ? "← PRE-MIGRATION (or bug just fired)" : "← migrated/clean"}`);
  console.log(`Plst cards matching pickup names (raw)     : ${plstAll}`);
  console.log(`Plst pickups deduped by name               : ${plstUniqueNames}`);
  console.log(`Pickup names in code (MB2_PICKUP_CARDS)    : ${names.length}\n`);

  console.log("Slot 1 (White C/U) match counts under each pool resolution:");
  console.log(`  Pool = native mb2 only                   : ${s1Native}    ← what user sees when bug fires`);
  console.log(`  Pool = native mb2 + legacy mb2-list      : ${s1Legacy}    ← old "fixed" state right after Sync Cards`);
  console.log(`  Pool = native mb2 + plst pickups (NEW)   : ${s1New}    ← what the new VIRTUAL_POOLS resolution returns\n`);

  if (legacy > 0 && s1Native < 5 && s1New > s1Native + 50) {
    console.log("→ Bug is currently firing. The new code path will recover the full pool on read.");
  } else if (legacy === 0 && s1New > s1Native + 50) {
    console.log("→ Migration has run (or bug just fired). The new code path resolves the pool correctly via plst.");
  } else if (s1Legacy > s1Native + 50 && s1New > s1Native + 50) {
    console.log("→ Legacy and new pools both resolve. Safe to migrate.");
  } else {
    console.log("→ Unexpected state. Review counts above before deploying.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await (await getClient()).close();
  });
