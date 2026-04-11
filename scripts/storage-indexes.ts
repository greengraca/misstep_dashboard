// scripts/storage-indexes.ts
//
// One-shot migration to create indexes on the dashboard_storage_* collections.
// Idempotent — run it whenever. Safe to re-run.
//
// Usage: npx tsx scripts/storage-indexes.ts

import { getDb } from "../lib/mongodb";

const COL_SLOTS = "dashboard_storage_slots";
const COL_LAYOUT = "dashboard_storage_layout";
const COL_OVERRIDES = "dashboard_storage_overrides";
const COL_REBUILD_LOG = "dashboard_storage_rebuild_log";

async function safeCreateIndex(
  col: ReturnType<Awaited<ReturnType<typeof getDb>>["collection"]>,
  spec: Record<string, 1 | -1 | "text">,
  options: { name: string; unique?: boolean }
): Promise<void> {
  try {
    await col.createIndex(spec, options);
    console.log(`  + ${options.name}`);
  } catch (err) {
    // Index already exists or conflicts — log and continue.
    console.log(`  = ${options.name} (${(err as Error).message})`);
  }
}

async function main() {
  const db = await getDb();

  console.log("dashboard_storage_slots:");
  const slots = db.collection(COL_SLOTS);
  await safeCreateIndex(slots, { position: 1 }, { name: "position_unique", unique: true });
  await safeCreateIndex(
    slots,
    { shelfRowIndex: 1, boxIndexInRow: 1, boxRowIndex: 1, positionInBoxRow: 1 },
    { name: "placement_compound" }
  );
  await safeCreateIndex(slots, { set: 1 }, { name: "set_idx" });
  await safeCreateIndex(slots, { colorGroup: 1 }, { name: "color_idx" });
  await safeCreateIndex(slots, { variantKey: 1 }, { name: "variant_idx" });
  await safeCreateIndex(slots, { name: "text" }, { name: "name_text" });

  console.log("dashboard_storage_overrides:");
  const overrides = db.collection(COL_OVERRIDES);
  await safeCreateIndex(overrides, { anchorSlotKey: 1 }, { name: "anchor_idx" });
  await safeCreateIndex(overrides, { targetBoxId: 1 }, { name: "target_idx" });
  await safeCreateIndex(overrides, { lastStatus: 1 }, { name: "status_idx" });

  console.log("dashboard_storage_rebuild_log:");
  const log = db.collection(COL_REBUILD_LOG);
  await safeCreateIndex(log, { startedAt: -1 }, { name: "started_desc" });

  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
