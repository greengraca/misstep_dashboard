/**
 * Seed the Avatar: The Last Airbender Jumpstart EV model (set_code: "jtla").
 *
 * Idempotent — safe to re-run. Performs three things:
 *
 *   1. Upserts a synthetic `jtla` row in `dashboard_ev_sets` so the UI has
 *      something to show (Scryfall's own `jtla` memorabilia set is only for
 *      the front-card inserts; the actual Jumpstart cards live under `tle`
 *      CN 74-170 with fallbacks into `tla` mainline). The getSets query was
 *      extended to bypass the `set_type` / release-year filter for Jumpstart-
 *      referenced codes, so this row just needs to exist.
 *
 *   2. Seeds the 66 theme variants into `dashboard_ev_jumpstart_themes` via
 *      seedJumpstartThemes (which deletes + re-inserts atomically).
 *
 *   3. Generates an initial snapshot so the set appears in the EV list with
 *      a box_ev_net number.
 *
 * See notes/ev/tla-jumpstart.md for the tier mapping source and pragmatic
 * decisions.
 */

try {
  process.loadEnvFile(".env");
} catch {
  // .env missing — MONGODB_URI check below will fail with a useful error.
}

import { getDb, getClient } from "../lib/mongodb";
import { seedJumpstartThemes, generateSnapshot, ensureJumpstartWeights } from "../lib/ev";

const SET_CODE = "jtla";
const EXPECTED_VARIANTS = 66;
const EXPECTED_TIERS = { common: 40, rare: 15, mythic: 11 };

(async () => {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is required — ensure .env is present.");
    process.exit(1);
  }

  const db = await getDb();
  const nowIso = new Date().toISOString();

  // 1) Upsert synthetic set row so getSets() + UI pick it up.
  // Borrow TLE's icon_svg_uri (the Avatar glider symbol) since jtla cards
  // physically ship with the TLE expansion code — Scryfall's own `jtla`
  // is a memorabilia set with its own icon for the front-card inserts,
  // not the actual gameplay cards.
  console.log("── Step 1: upserting jtla set row ──");
  const tleRow = await db
    .collection("dashboard_ev_sets")
    .findOne({ code: "tle" }, { projection: { icon_svg_uri: 1 } });
  const iconSvgUri = tleRow?.icon_svg_uri ?? null;
  if (!iconSvgUri) {
    console.warn(
      "  ⚠ no icon_svg_uri on tle row — set card will render iconless until tle is synced."
    );
  }
  await db.collection("dashboard_ev_sets").updateOne(
    { code: SET_CODE },
    {
      $set: {
        code: SET_CODE,
        name: "Avatar: The Last Airbender Jumpstart",
        set_type: "draft_innovation",
        released_at: "2025-11-21",
        card_count: EXPECTED_VARIANTS, // variant count; no native pool
        icon_svg_uri: iconSvgUri,
        parent_set_code: "tla",
        digital: false,
        synced_at: nowIso,
      },
    },
    { upsert: true }
  );
  console.log(`  ✓ dashboard_ev_sets row upserted (icon=${iconSvgUri ? "tle" : "none"})`);

  // 2) Seed themes. seedJumpstartThemes does a delete-then-insert, so this
  // is idempotent.
  console.log("\n── Step 2: seeding 66 theme variants ──");
  const { seeded } = await seedJumpstartThemes(SET_CODE);
  if (seeded !== EXPECTED_VARIANTS) {
    console.error(
      `  ✗ expected ${EXPECTED_VARIANTS} variants, seeded ${seeded}. Aborting.`
    );
    await (await getClient()).close();
    process.exit(1);
  }
  console.log(`  ✓ ${seeded} variants seeded`);

  // Sanity-check tier distribution against WOTC's published split.
  const tierDocs = await db
    .collection("dashboard_ev_jumpstart_themes")
    .aggregate([
      { $match: { set_code: SET_CODE } },
      { $group: { _id: "$tier", count: { $sum: 1 } } },
    ])
    .toArray();
  const tierCounts: Record<string, number> = { common: 0, rare: 0, mythic: 0 };
  for (const d of tierDocs) tierCounts[d._id as string] = d.count as number;
  console.log(
    `  tier split: common=${tierCounts.common}, rare=${tierCounts.rare}, mythic=${tierCounts.mythic}`
  );
  const tierOK =
    tierCounts.common === EXPECTED_TIERS.common &&
    tierCounts.rare === EXPECTED_TIERS.rare &&
    tierCounts.mythic === EXPECTED_TIERS.mythic;
  if (!tierOK) {
    console.error(
      `  ✗ tier counts do not match expected ${EXPECTED_TIERS.common}/${EXPECTED_TIERS.rare}/${EXPECTED_TIERS.mythic}`
    );
    await (await getClient()).close();
    process.exit(1);
  }
  console.log("  ✓ tier split matches WOTC / MTGWiki");

  // 3) Initialize the jumpstart_weights doc so tier_weights come from our
  // custom prior (tier_counts = variant counts per tier → uniform 1/66 per
  // variant). Without this step, getJumpstartWeights returns null on the
  // first snapshot and calculateJumpstartEv falls back to the shared default
  // (0.65/0.30/0.05), which systematically over-weights mythic themes and
  // under-reports EV by ~30-40%.
  console.log("\n── Step 3: ensuring weights record (uniform 1/66 prior) ──");
  const weights = await ensureJumpstartWeights(SET_CODE);
  console.log(
    `  ✓ tier_weights: common=${weights.tier_weights.common.toFixed(4)}, rare=${weights.tier_weights.rare.toFixed(4)}, mythic=${weights.tier_weights.mythic.toFixed(4)}`
  );

  // 4) Generate an initial snapshot.
  console.log("\n── Step 4: generating snapshot ──");
  const snap = await generateSnapshot(SET_CODE);
  if (!snap) {
    console.error("  ✗ generateSnapshot returned null");
    await (await getClient()).close();
    process.exit(1);
  }
  console.log(
    `  ✓ snapshot: play_ev_gross=€${snap.play_ev_gross} play_ev_net=€${snap.play_ev_net} cards=${snap.card_count_priced}/${snap.card_count_total}`
  );

  await (await getClient()).close();
  console.log("\n✅ Seed complete.");
  process.exit(0);
})().catch(async (err) => {
  console.error(err);
  try {
    await (await getClient()).close();
  } catch {}
  process.exit(1);
});
