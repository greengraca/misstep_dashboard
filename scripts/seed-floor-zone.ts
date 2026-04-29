try { process.loadEnvFile(".env"); } catch {}
import { getDb, getClient } from "../lib/mongodb";
import { getLayout, setLayout } from "../lib/storage-db";
import { randomUUID } from "node:crypto";

/**
 * Seed (or update) the initial off-shelf floor zone.
 *
 * Currently holds the sets João stores in boxes outside the shelf:
 *   - plst   The List
 *   - cmr    Commander Legends
 *   - clb    Commander Legends: Battle for Baldur's Gate
 *   - mh1    Modern Horizons (1)
 *
 * To add more sets later, edit the SETS list below and re-run, or edit the
 * floorZones doc directly via the layout API.
 *
 * After this script, click "Rebuild" on the storage page to route the
 * matching cards into the floor zone.
 */

const ZONE_ID = "off-shelf-1";
const SETS = ["plst", "cmr", "clb", "mh1"];

async function main() {
  const db = await getDb();
  const layout = await getLayout();

  const existing = layout.floorZones ?? [];
  const found = existing.find((z) => z.id === ZONE_ID);

  if (found) {
    // Merge: union the existing setCodes with the new ones.
    const union = Array.from(new Set([...found.setCodes, ...SETS])).sort();
    const updated = existing.map((z) =>
      z.id === ZONE_ID ? { ...z, setCodes: union, label: "Off-shelf" } : z
    );
    await setLayout({ shelfRows: layout.shelfRows, floorZones: updated });
    console.log(`Updated floor zone "${ZONE_ID}" — ${union.length} sets:`, union);
  } else {
    const newZone = {
      id: ZONE_ID,
      label: "Off-shelf",
      setCodes: SETS,
      capacity: "4k" as const,
    };
    await setLayout({
      shelfRows: layout.shelfRows,
      floorZones: [...existing, newZone],
    });
    console.log(`Created floor zone "${ZONE_ID}" with sets:`, SETS);
  }

  // Sanity: report what's in the layout now.
  const after = await getLayout();
  console.log("\nfloorZones now:", JSON.stringify(after.floorZones, null, 2));
  // Touch the unused randomUUID import so eslint stays quiet.
  void randomUUID;

  await getClient().then((c) => c.close());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
