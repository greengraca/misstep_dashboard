// Inspect any saved mb2 EV config in dashboard_ev_config and flag slot
// filters that reference the legacy "mb2-list" synthetic set value.
// Output is informational only — it doesn't modify the DB.
//
// Run:  npx tsx scripts/check-mb2-saved-config.ts

try {
  process.loadEnvFile(".env");
} catch {
  // MONGODB_URI must be exported manually then.
}

import { getClient, getDb } from "../lib/mongodb";

interface Outcome { filter?: Record<string, unknown> }
interface Slot { slot_number?: number; label?: string; outcomes?: Outcome[] }
interface BoosterConfig { slots?: Slot[] }
interface Config {
  set_code: string;
  play_booster?: BoosterConfig;
  collector_booster?: BoosterConfig;
  updated_by?: string;
  updated_at?: string;
}

async function main(): Promise<void> {
  const db = await getDb();
  const cfg = (await db
    .collection("dashboard_ev_config")
    .findOne({ set_code: "mb2" })) as Config | null;

  if (!cfg) {
    console.log("No saved config for mb2 — using getDefaultMB2BoosterConfig at runtime. Nothing to migrate.");
    return;
  }

  console.log(`Saved mb2 config found (updated by ${cfg.updated_by ?? "?"} at ${cfg.updated_at ?? "?"})`);

  const flagged: { booster: string; slot: number | string; outcome: number; set_codes: unknown }[] = [];
  const checkBooster = (boosterKey: "play_booster" | "collector_booster") => {
    const b = cfg[boosterKey];
    if (!b?.slots) return;
    b.slots.forEach((slot, sIdx) => {
      slot.outcomes?.forEach((outcome, oIdx) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sc = (outcome.filter as any)?.set_codes as unknown[];
        if (Array.isArray(sc) && sc.includes("mb2-list")) {
          flagged.push({
            booster: boosterKey,
            slot: slot.slot_number ?? slot.label ?? sIdx,
            outcome: oIdx,
            set_codes: sc,
          });
        }
      });
    });
  };
  checkBooster("play_booster");
  checkBooster("collector_booster");

  if (flagged.length === 0) {
    console.log("No slot filter references 'mb2-list'. Safe to migrate.");
  } else {
    console.log(`Found ${flagged.length} slot outcome(s) referencing 'mb2-list':`);
    for (const f of flagged) console.log("  -", f);
    console.log("\nThese filters will need their set_codes updated to 'plst' before deploy.");
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
