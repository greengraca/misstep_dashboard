# FDN Play Booster EV Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Save a Play Booster EV config for `set_code: "fdn"` to `dashboard_ev_config` so the EV calculator emits accurate Foundations numbers, plus snapshot and supporting documentation.

**Architecture:** One idempotent seed script (`scripts/seed-fdn-config.ts`) following the `seed-mh3-config.ts` pattern: DB-driven `buildPools()` with runtime sanity checks, declarative `buildPlayBooster()` slot config with WOTC-derived probabilities, idempotent upsert on `{set_code: "fdn"}`, snapshot generation at end. Plus `notes/ev/fdn.md` documenting sources, decisions, and pool counts.

**Tech Stack:** TypeScript via `tsx` runtime, MongoDB native driver, existing `lib/ev.ts` `generateSnapshot()` + `EvBoosterConfig` type.

**Spec:** `docs/superpowers/specs/2026-04-30-fdn-play-booster-ev-config-design.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `scripts/seed-fdn-config.ts` | Create | Idempotent seed: builds pools, validates, upserts config, generates snapshot |
| `notes/ev/fdn.md` | Create | Source-of-truth documentation (sources, pool counts, slot table, decisions, snapshot history) |

No edits to existing source files. The calc engine already supports the config shape this script produces.

---

### Task 1: Scaffold seed script with constants and DB stub

**Files:**
- Create: `scripts/seed-fdn-config.ts`

- [ ] **Step 1: Create the script file with imports, constants, and a stub `main()` that connects + closes the DB**

```ts
/**
 * Seed the EV config for Foundations (fdn).
 *
 * Encodes the Play Booster structure documented by Wizards of the Coast
 * (https://magic.wizards.com/en/news/feature/collecting-foundations) and
 * Mike Provencher's mtgscribe fact sheet
 * (https://mtgscribe.com/2024/10/28/play-booster-fact-sheet-foundations/),
 * cross-checked against theexpectedvalue.com's published source. See
 * notes/ev/fdn.md for the full source-by-source breakdown of every probability
 * and every collector-number list referenced below.
 *
 * Slot 13 (traditional foil) modeled as standard MTG rarity-bucketed pool-union
 * (FOIL_CU = 11/12, FOIL_RM = 1/12), NOT WOTC's literal "same distribution as
 * non-foil wildcard" wording. Rationale in notes/ev/fdn.md#slot-13.
 *
 * Idempotent — safe to re-run; uses upsert on { set_code: "fdn" }.
 */

try {
  process.loadEnvFile(".env");
} catch {
  // .env missing — MONGODB_URI check below will fail with a useful error.
}

import { getDb, getClient } from "../lib/mongodb";
import { generateSnapshot } from "../lib/ev";
import type { EvBoosterConfig } from "../lib/types";

const SET_CODE = "fdn";

// ── Land-slot CN sets (verified against DB 2026-04-30) ──
// Per theexpectedvalue's source comment: "keeps Evolving Wilds, Rogue's
// Passage, and Secluded Courtyard out of the land slot."
const DUAL_LAND_CNS = ["259", "260", "261", "263", "265", "266", "268", "269", "270", "271"];
const REG_BASIC_CNS = ["272", "273", "274", "275", "276", "277", "278", "279", "280", "281"];
const ALT_ART_BASIC_CNS = ["282", "283", "284", "285", "286", "287", "288", "289", "290", "291"];

// ── SPG FDN-flavored CN range (per mtgscribe) ──
const SPG_FDN_CN_MIN = 74;
const SPG_FDN_CN_MAX = 83;

async function main() {
  const db = await getDb();
  console.log(`Connected to ${db.databaseName}; fdn seed scaffold ready.`);
  await (await getClient()).close();
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run the scaffold to verify DB connection works**

Run: `npx tsx scripts/seed-fdn-config.ts`
Expected: prints `Connected to <dbname>; fdn seed scaffold ready.` and exits 0.

- [ ] **Step 3: Commit**

```bash
git add scripts/seed-fdn-config.ts
git commit -m "feat(ev): scaffold fdn seed script"
```

---

### Task 2: Implement `buildPools()` with runtime sanity checks

**Files:**
- Modify: `scripts/seed-fdn-config.ts`

- [ ] **Step 1: Add the `Doc` interface, `buildPools()` function, and sanity-check helpers**

Insert directly above `async function main()`:

```ts
interface FdnDoc {
  collector_number: string;
  name?: string;
  rarity?: string;
  treatment?: string;
  promo_types?: string[];
  booster?: boolean;
  type_line?: string;
}

interface SpgDoc {
  collector_number: string;
  name?: string;
  rarity?: string;
}

interface PoolCNs { commons: string[]; uncommons: string[]; rares: string[]; mythics: string[] }
interface AllPools {
  mainline: PoolCNs;
  borderless: PoolCNs;
  dualLandCns: string[];
  regBasicCns: string[];
  altArtBasicCns: string[];
  spgCns: string[];
}

const cnInt = (s: string): number => {
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
};

async function buildPools(): Promise<AllPools> {
  const db = await getDb();
  const cards = db.collection("dashboard_ev_cards");

  const fdnDocs = (await cards
    .find({ set: SET_CODE })
    .project({ collector_number: 1, name: 1, rarity: 1, treatment: 1, promo_types: 1, booster: 1, type_line: 1 })
    .toArray()) as unknown as FdnDoc[];

  const spgDocs = (await cards
    .find({ set: "spg", collector_number: { $gte: String(SPG_FDN_CN_MIN), $lte: String(SPG_FDN_CN_MAX) } })
    .project({ collector_number: 1, name: 1, rarity: 1 })
    .toArray()) as unknown as SpgDoc[];

  if (fdnDocs.length === 0) {
    throw new Error(
      `No fdn cards found in dashboard_ev_cards. ` +
      `Sync fdn from Scryfall first (e.g. via the UI's "Sync Cards" button or syncCards("fdn")).`,
    );
  }

  // ── Mainline pool: booster:true, treatment:normal, CN ≤ 271, no basics, no duals ──
  const isPlainBasicLand = (c: FdnDoc) => /Basic Land/.test(c.type_line ?? "");
  const dualSet = new Set(DUAL_LAND_CNS);

  const mainlineDocs = fdnDocs.filter((c) =>
    c.booster === true &&
    c.treatment === "normal" &&
    cnInt(c.collector_number) <= 271 &&
    !isPlainBasicLand(c)
  );
  const mainlineCommons = mainlineDocs.filter((c) => c.rarity === "common" && !dualSet.has(c.collector_number));
  const mainlineUncommons = mainlineDocs.filter((c) => c.rarity === "uncommon");
  const mainlineRares = mainlineDocs.filter((c) => c.rarity === "rare");
  const mainlineMythics = mainlineDocs.filter((c) => c.rarity === "mythic");

  // ── Borderless play-booster pool: treatment:borderless, has boosterfun,
  //    excludes manafoil/japanshowcase/fracturefoil. INCLUDES the 6 SC-tagged
  //    boosterfun borderless prints (verified 2026-04-30: 1 C #313 Refute +
  //    5 U #293/325/327/340/355). Reconciles DB to WOTC's published 2+8.
  //    Filter does NOT include `booster: true` because all 6 SC-tagged
  //    borderless have booster:false on Scryfall. ──
  const hasPromo = (c: FdnDoc, p: string) => (c.promo_types ?? []).includes(p);
  const borderlessDocs = fdnDocs.filter((c) =>
    c.treatment === "borderless" &&
    hasPromo(c, "boosterfun") &&
    !hasPromo(c, "manafoil") &&
    !hasPromo(c, "japanshowcase") &&
    !hasPromo(c, "fracturefoil")
  );
  const borderlessCommons = borderlessDocs.filter((c) => c.rarity === "common");
  const borderlessUncommons = borderlessDocs.filter((c) => c.rarity === "uncommon");
  const borderlessRares = borderlessDocs.filter((c) => c.rarity === "rare");
  const borderlessMythics = borderlessDocs.filter((c) => c.rarity === "mythic");

  // ── SPG FDN-flavored — already filtered by CN range in the query ──
  const spgCns = spgDocs.map((c) => c.collector_number);

  const cns = (docs: { collector_number: string }[]) => docs.map((c) => c.collector_number);

  const pools: AllPools = {
    mainline: {
      commons: cns(mainlineCommons),
      uncommons: cns(mainlineUncommons),
      rares: cns(mainlineRares),
      mythics: cns(mainlineMythics),
    },
    borderless: {
      commons: cns(borderlessCommons),
      uncommons: cns(borderlessUncommons),
      rares: cns(borderlessRares),
      mythics: cns(borderlessMythics),
    },
    dualLandCns: DUAL_LAND_CNS,
    regBasicCns: REG_BASIC_CNS,
    altArtBasicCns: ALT_ART_BASIC_CNS,
    spgCns,
  };

  // ── Sanity checks against published WOTC + DB-verified counts ──
  const expect = (got: number, want: number, label: string) => {
    const ok = got === want;
    console.log(`  ${ok ? "✅" : "⚠️ "} ${label}: ${got}${ok ? "" : ` (expected ${want})`}`);
  };
  console.log("Pool sanity checks (FDN):");
  expect(pools.mainline.commons.length, 80, "mainline commons (no basics, no duals)");
  expect(pools.mainline.uncommons.length, 100, "mainline uncommons (DB-actual 101 expected — known 1-card delta from utility lands #264/#267)");
  expect(pools.mainline.rares.length, 60, "mainline rares");
  expect(pools.mainline.mythics.length, 20, "mainline mythics");
  expect(pools.borderless.commons.length, 2, "borderless commons (incl. SC-tagged #313)");
  expect(pools.borderless.uncommons.length, 8, "borderless uncommons (incl. 5 SC-tagged)");
  expect(pools.borderless.rares.length, 43, "borderless rares");
  expect(pools.borderless.mythics.length, 17, "borderless mythics (incl. 5 borderless PWs)");
  expect(pools.dualLandCns.length, 10, "dual lands (CN 259/260/261/263/265/266/268/269/270/271)");
  expect(pools.regBasicCns.length, 10, "regular basics (CN 272–281)");
  expect(pools.altArtBasicCns.length, 10, "alt-art / character basics (CN 282–291)");
  expect(pools.spgCns.length, 10, `SPG FDN-flavored (set:spg, cn ${SPG_FDN_CN_MIN}–${SPG_FDN_CN_MAX})`);

  return pools;
}
```

- [ ] **Step 2: Update `main()` to call `buildPools()` and print pool sizes**

Replace the existing `main()` body with:

```ts
async function main() {
  const pools = await buildPools();
  console.log(`\nPools built. Mainline=${pools.mainline.commons.length}C/${pools.mainline.uncommons.length}U/${pools.mainline.rares.length}R/${pools.mainline.mythics.length}M, Borderless=${pools.borderless.commons.length}C/${pools.borderless.uncommons.length}U/${pools.borderless.rares.length}R/${pools.borderless.mythics.length}M, SPG=${pools.spgCns.length}.`);
  await (await getClient()).close();
}
```

- [ ] **Step 3: Run and verify pool counts**

Run: `npx tsx scripts/seed-fdn-config.ts`

Expected output:
```
Pool sanity checks (FDN):
  ✅ mainline commons (no basics, no duals): 80
  ⚠️  mainline uncommons (DB-actual 101 expected — known 1-card delta from utility lands #264/#267): 101 (expected 100)
  ✅ mainline rares: 60
  ✅ mainline mythics: 20
  ✅ borderless commons (incl. SC-tagged #313): 2
  ✅ borderless uncommons (incl. 5 SC-tagged): 8
  ✅ borderless rares: 43
  ✅ borderless mythics (incl. 5 borderless PWs): 17
  ✅ dual lands (CN 259/260/261/263/265/266/268/269/270/271): 10
  ✅ regular basics (CN 272–281): 10
  ✅ alt-art / character basics (CN 282–291): 10
  ✅ SPG FDN-flavored (set:spg, cn 74–83): 10

Pools built. Mainline=80C/101U/60R/20M, Borderless=2C/8U/43R/17M, SPG=10.
```

The single `⚠️ ` on mainline uncommons is **expected** (the off-by-1 from utility uncommon lands per spec). All other lines must be `✅`. If anything else shows `⚠️ `, STOP and investigate before proceeding to Task 3.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-fdn-config.ts
git commit -m "feat(ev): build fdn play-booster pools with sanity checks"
```

---

### Task 3: Implement `buildPlayBooster()` slot config + `checkSlots()` validator

**Files:**
- Modify: `scripts/seed-fdn-config.ts`

- [ ] **Step 1: Add `buildPlayBooster()` directly above `main()`**

```ts
function buildPlayBooster(pools: AllPools): EvBoosterConfig {
  const m = pools.mainline;
  const b = pools.borderless;

  // Reusable filters
  const mainlineCommonFilter = { set_codes: [SET_CODE], custom_pool: m.commons };
  const mainlineUncommonFilter = { set_codes: [SET_CODE], custom_pool: m.uncommons };
  const mainlineRareFilter = { set_codes: [SET_CODE], custom_pool: m.rares };
  const mainlineMythicFilter = { set_codes: [SET_CODE], custom_pool: m.mythics };

  // Slot 12 wildcard probabilities (per WOTC, sum to 1.000)
  const WC = { C: 0.167, U: 0.583, R: 0.163, M: 0.026, BDR: 0.016, BDM: 0.003, BDC: 0.018, BDU: 0.024 };

  // Slot 11 R/M (per WOTC, sum to 1.000)
  const RM = { rareMain: 0.780, mythMain: 0.128, bdrR: 0.077, bdrM: 0.015 };

  // Slot 13 foil rates — Model B: standard MTG rarity-bucketed pool-union.
  // FOIL_CU=11/12 split into C (2/3) and U (1/3); FOIL_RM=1/12 split into R (6/7)
  // and M (1/7). Sum = 22/36 + 11/36 + 6/84 + 1/84 = 11/12 + 1/12 = 1.000.
  const FOIL_C = (11 / 12) * (2 / 3);
  const FOIL_U = (11 / 12) * (1 / 3);
  const FOIL_R = (1 / 12) * (6 / 7);
  const FOIL_M = (1 / 12) * (1 / 7);

  return {
    packs_per_box: 36,
    cards_per_pack: 14,
    slots: [
      // 1-6: always common (mainline 80-card pool)
      ...[1, 2, 3, 4, 5, 6].map((n) => ({
        slot_number: n,
        label: `Common ${n}`,
        is_foil: false,
        outcomes: [{ probability: 1, filter: mainlineCommonFilter }],
      })),

      // 7: common (98.5%) or SPG (1.5%, set:spg cn 74–83, non-foil)
      {
        slot_number: 7,
        label: "Common / SPG",
        is_foil: false,
        outcomes: [
          { probability: 0.985, filter: mainlineCommonFilter },
          { probability: 0.015, filter: { set_codes: ["spg"], collector_number_min: SPG_FDN_CN_MIN, collector_number_max: SPG_FDN_CN_MAX } },
        ],
      },

      // 8-10: always uncommon (mainline 101-card pool incl. utility lands)
      ...[8, 9, 10].map((n) => ({
        slot_number: n,
        label: `Uncommon ${n - 7}`,
        is_foil: false,
        outcomes: [{ probability: 1, filter: mainlineUncommonFilter }],
      })),

      // 11: Rare / Mythic (78% R / 12.8% M / 7.7% BDL R / 1.5% BDL M)
      {
        slot_number: 11,
        label: "Rare / Mythic",
        is_foil: false,
        outcomes: [
          { probability: RM.rareMain, filter: mainlineRareFilter },
          { probability: RM.mythMain, filter: mainlineMythicFilter },
          { probability: RM.bdrR, filter: { set_codes: [SET_CODE], custom_pool: b.rares } },
          { probability: RM.bdrM, filter: { set_codes: [SET_CODE], custom_pool: b.mythics } },
        ],
      },

      // 12: Non-foil wildcard — 8 outcomes per WOTC
      {
        slot_number: 12,
        label: "Non-foil Wildcard",
        is_foil: false,
        outcomes: [
          { probability: WC.C, filter: mainlineCommonFilter },
          { probability: WC.U, filter: mainlineUncommonFilter },
          { probability: WC.R, filter: mainlineRareFilter },
          { probability: WC.M, filter: mainlineMythicFilter },
          { probability: WC.BDC, filter: { set_codes: [SET_CODE], custom_pool: b.commons } },
          { probability: WC.BDU, filter: { set_codes: [SET_CODE], custom_pool: b.uncommons } },
          { probability: WC.BDR, filter: { set_codes: [SET_CODE], custom_pool: b.rares } },
          { probability: WC.BDM, filter: { set_codes: [SET_CODE], custom_pool: b.mythics } },
        ],
      },

      // 13: Traditional Foil — Model B (standard MTG rarity-bucketed pool-union).
      // is_foil=true at slot level; outcomes union mainline + borderless per rarity.
      // SPG NOT included (per WOTC: "SPG cards aren't found in the wildcard nor
      // traditional foil slot in Play Boosters").
      {
        slot_number: 13,
        label: "Traditional Foil",
        is_foil: true,
        outcomes: [
          { probability: FOIL_C, filter: { set_codes: [SET_CODE], custom_pool: [...m.commons, ...b.commons] } },
          { probability: FOIL_U, filter: { set_codes: [SET_CODE], custom_pool: [...m.uncommons, ...b.uncommons] } },
          { probability: FOIL_R, filter: { set_codes: [SET_CODE], custom_pool: [...m.rares, ...b.rares] } },
          { probability: FOIL_M, filter: { set_codes: [SET_CODE], custom_pool: [...m.mythics, ...b.mythics] } },
        ],
      },

      // 14: Land — 3 sub-pools × {non-foil 80%, foil 20%} = 6 outcomes.
      // Slot is_foil=false so per-outcome is_foil=true overrides for foil rows.
      {
        slot_number: 14,
        label: "Land",
        is_foil: false,
        outcomes: [
          { probability: 0.20, filter: { set_codes: [SET_CODE], custom_pool: pools.altArtBasicCns } },
          { probability: 0.05, is_foil: true, filter: { set_codes: [SET_CODE], custom_pool: pools.altArtBasicCns } },
          { probability: 0.40, filter: { set_codes: [SET_CODE], custom_pool: pools.dualLandCns } },
          { probability: 0.10, is_foil: true, filter: { set_codes: [SET_CODE], custom_pool: pools.dualLandCns } },
          { probability: 0.20, filter: { set_codes: [SET_CODE], custom_pool: pools.regBasicCns } },
          { probability: 0.05, is_foil: true, filter: { set_codes: [SET_CODE], custom_pool: pools.regBasicCns } },
        ],
      },
    ],
  };
}
```

- [ ] **Step 2: Update `main()` to build the play booster config and run `checkSlots()` validator**

Replace `main()` with:

```ts
async function main() {
  const pools = await buildPools();
  const playBooster = buildPlayBooster(pools);

  // Validate every slot's outcomes sum to ~1.0
  const checkSlots = (cfg: EvBoosterConfig, name: string) => {
    let allOk = true;
    for (const slot of cfg.slots) {
      const sum = slot.outcomes.reduce((s, o) => s + o.probability, 0);
      if (slot.outcomes.length > 0 && Math.abs(sum - 1) > 0.003) {
        console.warn(`  ⚠️  ${name} slot ${slot.slot_number} (${slot.label}): probabilities sum to ${sum.toFixed(4)} (expected 1.0)`);
        allOk = false;
      }
    }
    if (allOk) console.log(`\n✅ All ${cfg.slots.length} ${name} slots have probabilities summing to 1.0 ± 0.003.`);
  };
  checkSlots(playBooster, "Play");

  await (await getClient()).close();
}
```

- [ ] **Step 3: Run and verify slot sums**

Run: `npx tsx scripts/seed-fdn-config.ts`

Expected: same Pool sanity check output as Task 2, then:
```
✅ All 14 Play slots have probabilities summing to 1.0 ± 0.003.
```

If any slot prints a `⚠️ ` line, STOP — there's a probability typo in `buildPlayBooster()`.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-fdn-config.ts
git commit -m "feat(ev): define fdn play-booster slot config (14 slots, model-B foil)"
```

---

### Task 4: Wire upsert + snapshot generation into `main()`

**Files:**
- Modify: `scripts/seed-fdn-config.ts`

- [ ] **Step 1: Replace `main()` to upsert config and generate snapshot**

```ts
async function main() {
  const pools = await buildPools();
  const playBooster = buildPlayBooster(pools);

  const checkSlots = (cfg: EvBoosterConfig, name: string) => {
    let allOk = true;
    for (const slot of cfg.slots) {
      const sum = slot.outcomes.reduce((s, o) => s + o.probability, 0);
      if (slot.outcomes.length > 0 && Math.abs(sum - 1) > 0.003) {
        console.warn(`  ⚠️  ${name} slot ${slot.slot_number} (${slot.label}): probabilities sum to ${sum.toFixed(4)} (expected 1.0)`);
        allOk = false;
      }
    }
    if (allOk) console.log(`\n✅ All ${cfg.slots.length} ${name} slots have probabilities summing to 1.0 ± 0.003.`);
  };
  checkSlots(playBooster, "Play");

  const db = await getDb();
  const col = db.collection("dashboard_ev_config");
  const now = new Date().toISOString();

  await col.updateOne(
    { set_code: SET_CODE },
    {
      $set: {
        set_code: SET_CODE,
        sift_floor: 0.25,
        fee_rate: 0.05,
        play_booster: playBooster,
        updated_at: now,
        updated_by: "seed-script",
      },
    },
    { upsert: true },
  );
  console.log(`\nSaved Play Booster config for ${SET_CODE} (sift_floor=0.25, fee_rate=0.05).`);

  console.log(`\nGenerating snapshot…`);
  const snap = await generateSnapshot(SET_CODE);
  if (!snap) {
    console.error(`  Failed to generate snapshot for ${SET_CODE}.`);
  } else {
    console.log(`  date=${snap.date}`);
    console.log(`  play_ev_gross=€${snap.play_ev_gross}`);
    console.log(`  play_ev_net=€${snap.play_ev_net}`);
    console.log(`  play_pack_ev_net=€${snap.play_pack_ev_net}`);
    console.log(`  card_count_total=${snap.card_count_total}`);
    console.log(`  card_count_priced=${snap.card_count_priced}`);
  }

  await (await getClient()).close();
}
```

- [ ] **Step 2: Run the full seed and verify snapshot output**

Run: `npx tsx scripts/seed-fdn-config.ts`

Expected output (after pool checks + slot validator):
```
Saved Play Booster config for fdn (sift_floor=0.25, fee_rate=0.05).

Generating snapshot…
  date=2026-04-30
  play_ev_gross=€<positive number>
  play_ev_net=€<positive number, ≈ gross × 0.95>
  play_pack_ev_net=€<positive number, ≈ ev_net / 36>
  card_count_total=<number>
  card_count_priced=<number, > 0>
```

If `play_ev_gross` is `0` or null → STOP, investigate: most likely cause is that pool CNs don't resolve to cards in the calc engine, or all prices are below `sift_floor`.

- [ ] **Step 3: Verify config and snapshot persisted in DB**

Run a quick read-back inline:

```bash
npx tsx -e 'process.loadEnvFile(".env"); import("./lib/mongodb").then(async ({getDb,getClient})=>{const db=await getDb();const cfg=await db.collection("dashboard_ev_config").findOne({set_code:"fdn"});console.log("config slots:",cfg?.play_booster?.slots?.length,"sift_floor:",cfg?.sift_floor,"fee_rate:",cfg?.fee_rate);const snap=await db.collection("dashboard_ev_snapshots").findOne({set_code:"fdn"},{sort:{date:-1}});console.log("snapshot date:",snap?.date,"play_ev_net:",snap?.play_ev_net);await (await getClient()).close();});'
```

Expected:
```
config slots: 14 sift_floor: 0.25 fee_rate: 0.05
snapshot date: 2026-04-30 play_ev_net: <positive number>
```

- [ ] **Step 4: Open the dashboard UI and confirm FDN appears with the new EV figure**

Run dev server if not already running: `npm run dev` (port 3025).

Navigate to: `http://localhost:3025/ev` and locate FDN in the set list. The set row should show the new `play_ev_net` figure. The set detail page should render all 14 slots.

- [ ] **Step 5: Commit**

```bash
git add scripts/seed-fdn-config.ts
git commit -m "feat(ev): persist fdn config and generate initial snapshot"
```

---

### Task 5: Write `notes/ev/fdn.md` documentation

**Files:**
- Create: `notes/ev/fdn.md`

- [ ] **Step 1: Write the notes file using the `sos.md` template**

Replace `<EV_FIGURES>` placeholders in step-by-step content below with the actual numbers printed by the Task 4 snapshot run.

```markdown
# Foundations (`fdn`) — EV Config Notes

**Last reviewed:** 2026-04-30 (Play Booster initial seed)

## Why this set was configured

Foundations is a 2024 Play Booster set with rich treatment splits (boosterfun
borderless C/U/R/M, mana-foil duplicates, Japan Showcase + fracture-foil
mythics, extended-art Booster Fun) and a 10-card SPG sub-pool (`spg`
#74–83). The default Play Booster config doesn't model the 8-outcome
wildcard, the 6-outcome Land slot, or the SPG-replacement common slot — a
saved config is required.

Collector Booster is **deferred** (out of scope for this seed). Mana foil
+ Japan Showcase + fracture foil + extended-art are CB-only and not
modeled here.

## Sources

- WOTC "Collecting Foundations":
  <https://magic.wizards.com/en/news/feature/collecting-foundations>
- Mike Provencher's mtgscribe Play Booster fact sheet (2024-10-28):
  <https://mtgscribe.com/2024/10/28/play-booster-fact-sheet-foundations/>
- theexpectedvalue.com Foundations Play Booster calculator (local cached
  HTML, 2026-04-30) — used for slot 13 foil rate model and land-slot CN
  exclusion logic
- Lethe collation site — does NOT cover FDN (404; FDN is a Play Booster
  set, post-Lethe scope)

All three published sources agree on slot 11 (R/M), slot 12 (Wildcard),
and the land-slot composition. They diverge on slot 13 (Traditional
Foil) — see "Slot 13 foil model" below.

## Set-code landscape

| Set code | Name | Role | Cards |
|----------|------|------|-------|
| `fdn` | Foundations | Main set | 771 docs |
| `spg` | Special Guests | 10 FDN-flavored mythics at #74–83 | 10 in-sealed |
| `fdc` | Foundations Commander | OUT OF SCOPE for this config (separate set / no CB) | — |

## FDN CN layout

| CN range | Contents | Role |
|----------|----------|------|
| 1–271 | Mainline cards (booster:true, treatment:normal) | 80C + 101U + 60R + 20M (DB) — 90 + 101 + 60 + 20 = 271 docs |
| of which 259/260/261/263/265/266/268/269/270/271 | 10 dual lands (gainlands, common rarity) | Slot 14 dual pool |
| of which 264 + 267 | Rogue's Passage + Secluded Courtyard (utility uncommon lands) | **Stay in mainline U pool**, not land slot — per theexpectedvalue + mtgscribe |
| 272–281 | 10 regular basics (`beginnerbox,startercollection`) | Slot 14 regular basic pool |
| 282–291 | 10 alt-art / character basics (`startercollection`) | Slot 14 alt-art pool |
| 292–361 | Borderless boosterfun (64 docs) | Slot 11 BDL R/M pool + Slot 12 BDL C/U/R/M pool |
| 362–421 | Mana foil borderless (60 docs, foil-only) | CB-only, **excluded** |
| 422–441 | Japan Showcase mythics (20 docs, foil-only — 10 reg + 10 fracturefoil) | CB-only, **excluded** |
| 442–487 | Extended art (37R + 9M, +1 BAB at #729) | CB-only, **excluded** |
| 497–771 | Beginnerbox + Setextension + Bundle + BAB + high-CN startercollection prints (~170 cards) | Not in Play Booster, **excluded** |

## Pool sanity-check expected counts

| Pool | Filter | Expected | Status |
|------|--------|----------|--------|
| mainline commons | `booster:true, treatment:normal, cn ≤ 271, !BasicLand, cn ∉ DUAL_CNS, rarity:common` | 80 | ✅ |
| mainline uncommons | `booster:true, treatment:normal, cn ≤ 271, rarity:uncommon` | 100 (mtgscribe) — DB has 101 | ⚠️ off-by-1 (utility lands #264/#267 stay in U pool); immaterial |
| mainline rares | `booster:true, treatment:normal, cn ≤ 271, rarity:rare` | 60 | ✅ |
| mainline mythics | `booster:true, treatment:normal, cn ≤ 271, rarity:mythic` | 20 | ✅ |
| borderless C/U/R/M | `treatment:borderless, "boosterfun" ∈ promo, !manafoil, !japanshowcase, !fracturefoil` | 2C + 8U + 43R + 17M | ✅ |
| dual lands | hardcoded 10 CNs | 10 | ✅ |
| regular basics | CN 272–281, BasicLand | 10 | ✅ |
| alt-art basics | CN 282–291, BasicLand | 10 | ✅ |
| SPG FDN-flavored | `set:spg, cn 74–83` | 10 | ✅ |

## Borderless C/U pool — including the 6 SC-tagged borderless prints

DB partitions:
- 64 "pure" boosterfun borderless: 1C + 3U + 43R + 17M
- 60 mana-foil duplicates (`boosterfun,manafoil`): CB-only, excluded
- 6 `boosterfun,startercollection` borderless prints

The 6 SC-tagged borderless are (verified 2026-04-30 from `dashboard_ev_cards`):

| CN | Name | Rarity |
|---:|------|--------|
| 293 | Ajani's Pridemate | U |
| 313 | Refute | **C** |
| 325 | Vengeful Bloodwitch | U |
| 327 | Abrade | U |
| 340 | Reclamation Sage | U |
| 355 | Swiftfoot Boots | U |

Adding them to the pure boosterfun pool gives **2C + 8U + 43R + 17M = 70 cards total**, exactly matching WOTC's published "2 borderless commons + 8 borderless uncommons + 43 borderless rares + 17 borderless mythic rares (incl. 5 borderless planeswalkers)."

The SC tag is incidental metadata — same Scryfall ID = same card, same Cardmarket listing. The cards do appear in Play Boosters as borderless C/U variants. Filter therefore drops only manafoil/japanshowcase/fracturefoil tags, NOT startercollection. Filter does NOT include `booster: true` because all 6 SC-tagged borderless have `booster: false` on Scryfall.

## Play Booster — 14 slots (token implicit), 36 packs/box

| # | Slot | Outcomes |
|---|------|----------|
| 1–6 | Common ×6 | 1.000 mainline common (80-card pool: cn ≤ 271, no basics, no duals) |
| 7 | Common / SPG | 0.985 mainline common · 0.015 SPG (10 cards #74–83 in `spg`) |
| 8–10 | Uncommon ×3 | 1.000 mainline uncommon (101-card pool incl. utility lands) |
| 11 | Rare / Mythic | 0.780 R · 0.128 M · 0.077 BDL R · 0.015 BDL M |
| 12 | Non-foil Wildcard | 0.167 C · 0.583 U · 0.163 R · 0.026 M · 0.018 BDL C · 0.024 BDL U · 0.016 BDL R · 0.003 BDL M |
| 13 | Traditional Foil (Model B) | 0.611 C-union · 0.306 U-union · 0.071 R-union · 0.012 M-union — pool-union of mainline + borderless per rarity, is_foil=true |
| 14 | Land | 0.20 NF alt-art · 0.05 F alt-art · 0.40 NF dual · 0.10 F dual · 0.20 NF reg basic · 0.05 F reg basic |

## Slot 13 foil model — Model B over Model A

WOTC's article literally says "Traditional Foil Wildcard (1 slot): Same distribution as non-foil wildcard." Two interpretations:

- **Model A (literal):** slot 13 mirrors slot 12 with is_foil=true. Implies foil R/M ≈ 20.8% per pack ≈ 7.5 foil R/M per box — ~2.5× standard MTG foil R/M rates. Inconsistent with physical foil-sheet print structure.
- **Model B (theexpectedvalue / standard MTG):** rarity-bucketed pool-union with FOIL_CU=11/12 split into C (2/3) and U (1/3); FOIL_RM=1/12 split into R (6/7) and M (1/7). Matches every other Play Booster product since 2020.

**Decided B.** WOTC's "same distribution" wording is most naturally read as "same pool composition (C/U/R/M of both treatments)" rather than "same per-rarity rates" — copywriter language, not probability theory. theexpectedvalue.com's author made the same call.

## Pragmatic simplifications

1. **Collector Booster not modeled.** Out of scope. Mana foils (60), Japan Showcase (20), fracture foil (10), extended art (46) all CB-only.
2. **Mainline U pool stays at DB-actual 101**, not normalized to mtgscribe's 100. Per-card pull rate near-identical between 100 and 101; EV delta <€0.10/box.
3. **Slot 13 foil rates** — see "Model B" above.
4. **Beginnerbox + setextension reprints (CN 497–771)** — separate Beginner Box product; not in Play Boosters; excluded by `booster:true` filter.
5. **Bundle promo (#728), BAB (#729 Solemn Simulacrum EA)** — promo-only; excluded by `booster:true`.
6. **Maze's End + other high-CN startercollection mythics (CN 565–727)** — Starter-Collection-only prints; excluded by `booster:true` + CN ≤ 271 filter.

## Snapshot history

### Play Booster
| Date | Box gross | Box net | Pack net | Card count | Notes |
|------|-----------|---------|----------|------------|-------|
| 2026-04-30 | €<EV_FIGURES_FROM_TASK_4> | €<...> | €<...> | <...> | Initial seed (Play only; CB deferred). |

## Action checklist if EV looks wrong

1. Re-run `npx tsx scripts/seed-fdn-config.ts` — idempotent; re-applies config and generates a fresh snapshot. Pool sanity checks run at startup and confirm counts match expectations.
2. Verify source sets are synced:
   - `fdn`: ~771 docs
   - `spg`: at least 83 cards (incl. #74–83 for FDN)
3. If any pool count diverges from expected (other than the known mainline U +1), Scryfall data has drifted — investigate before persisting.
4. If a slot probability sum drifts from 1.0 by >0.003, the seed prints a `⚠️ ` warning at startup.
5. If a snapshot is missing or has €0 EV, hit "Snapshot" in the UI or `POST /api/ev/snapshots/generate`. Most likely cause is mainline cards with all-null Scryfall prices (set still in pre-release pricing).

## Known issues / future work

1. **Collector Booster modeling.** Adds mana foil + Japan Showcase + fracture foil + extended art outcomes. Significant CB-exclusive value. Pair with a CB sub-pool sanity-check pass at seed time.
2. **CM ID overrides.** Several FDN Starter Collection cards already have CM ID overrides in `lib/cardmarket-url.ts` (see `notes/ev/fdn-starter-collection.md`). If main-set FDN cards turn out to have wrong CM IDs (Cardmarket links going to unrelated products), add entries to `MANUAL_CARDMARKET_ID_OVERRIDES`.
3. **Slot 13 foil model verification.** If community / box-cracking data shows foil R/M rates noticeably ABOVE 8.3%/pack, re-evaluate Model A vs Model B.
4. **Fdc integration for any future FDN-related products.** Not applicable for this seed, but FDC (Foundations Commander) currently has 3 docs in `dashboard_ev_cards` (Sol Ring / Arcane Signet / Command Tower for Starter Collection). Full FDC modeling is its own future task.
```

- [ ] **Step 2: Replace `<EV_FIGURES_FROM_TASK_4>` placeholders**

Open the snapshot output captured in Task 4 (re-run if needed: `npx tsx scripts/seed-fdn-config.ts`). Replace the four `<EV_FIGURES_FROM_TASK_4>` placeholders in the snapshot history table with the real values for `play_ev_gross`, `play_ev_net`, `play_pack_ev_net`, and `card_count_total`.

- [ ] **Step 3: Commit**

`notes/` is gitignored, so this file won't be committed by `git add notes/ev/fdn.md`. That's intentional (notes live locally per repo convention). No commit needed for this step — just verify the file exists at `notes/ev/fdn.md` with no `<EV_FIGURES_FROM_TASK_4>` placeholders remaining.

```bash
test -f notes/ev/fdn.md && ! grep -q "EV_FIGURES_FROM_TASK_4" notes/ev/fdn.md && echo "notes/ev/fdn.md complete"
```

Expected: `notes/ev/fdn.md complete`

---

### Task 6: Final verification + cleanup decision

**Files:** None modified — verification only.

- [ ] **Step 1: Re-run the seed end-to-end as a final smoke test**

Run: `npx tsx scripts/seed-fdn-config.ts`

Confirm: all sanity checks pass (only the known mainline U `⚠️ ` line), all 14 slots sum to 1.0, snapshot generates with positive EV figures.

- [ ] **Step 2: Confirm the EV grid shows FDN with the new figure**

Open `http://localhost:3025/ev`. Confirm FDN's row shows the `play_ev_net` matching the snapshot value.

- [ ] **Step 3: Decide whether to keep the discovery scripts**

Three discovery scripts were created during brainstorming:
- `scripts/_inventory-fdn.ts`
- `scripts/_inventory-fdn-2.ts`
- `scripts/_inventory-fdn-3.ts`

The repo convention (per the existing untracked `scripts/_audit-fdn-cm-ids.ts`) is to commit these alongside the feature work — they aid future debugging and reproduce the discovery for reviewers.

**Default:** keep all three. Commit them in Step 4. If you want to delete them instead, run `git rm scripts/_inventory-fdn*.ts` before committing.

- [ ] **Step 4: Final commit (discovery scripts)**

```bash
git add scripts/_inventory-fdn.ts scripts/_inventory-fdn-2.ts scripts/_inventory-fdn-3.ts
git commit -m "chore(ev): add fdn discovery scripts used to derive seed pools"
```

- [ ] **Step 5: Smoke-test idempotency**

Run the seed a second time:

```bash
npx tsx scripts/seed-fdn-config.ts
```

Expected: same output (sanity checks pass, slot sums OK, snapshot regenerates with same-day date — single snapshot row in DB, not duplicates).

Verify no duplicate snapshot was created:

```bash
npx tsx -e 'process.loadEnvFile(".env"); import("./lib/mongodb").then(async ({getDb,getClient})=>{const db=await getDb();const count=await db.collection("dashboard_ev_snapshots").countDocuments({set_code:"fdn",date:new Date().toISOString().slice(0,10)});console.log("snapshots for fdn today:",count);await (await getClient()).close();});'
```

Expected: `snapshots for fdn today: 1`.

---

## Self-Review Notes

**Spec coverage:**
- ✅ Pool derivation rules (Task 2 implements all 12 pool counts with sanity checks)
- ✅ Slot definitions for all 14 slots (Task 3)
- ✅ Slot 13 Model B foil rate model (Task 3)
- ✅ Borderless C/U pool inclusion of SC-tagged prints (Task 2 filter logic + sanity-check label)
- ✅ Idempotent upsert + snapshot generation (Task 4)
- ✅ `notes/ev/fdn.md` template populated (Task 5)
- ✅ Acceptance criteria (Tasks 4 + 6 verification steps)

**Type consistency:**
- `AllPools` / `PoolCNs` / `FdnDoc` / `SpgDoc` defined in Task 2 and used unchanged in Tasks 3–4.
- `EvBoosterConfig` imported from `lib/types` (existing type, no changes).

**No placeholders:**
- Every code block contains complete code.
- Every command has expected output.
- The single `<EV_FIGURES_FROM_TASK_4>` token in Task 5 step 1 is intentional and resolved in Task 5 step 2.
