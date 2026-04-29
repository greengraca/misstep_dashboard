# FDN Play Booster EV config — design

**Date:** 2026-04-30
**Set:** Foundations (fdn)
**Scope:** Play Booster only. Collector Booster deferred.

## Goal

Save a saved EV config for `set_code: "fdn"` to `dashboard_ev_config` so the EV calculator emits accurate Play Booster numbers for Foundations. Pattern matches `scripts/seed-mh3-config.ts` / `scripts/seed-sos-config.ts`: DB-driven `buildPools()` + per-slot probabilities + sanity-check pass + idempotent upsert + post-seed `generateSnapshot("fdn")`.

## Sources

1. WOTC "Collecting Foundations" — <https://magic.wizards.com/en/news/feature/collecting-foundations>
2. mtgscribe Play Booster fact sheet (2024-10-28) — <https://mtgscribe.com/2024/10/28/play-booster-fact-sheet-foundations/>
3. theexpectedvalue.com Foundations Play Booster calculator (local cached HTML) — used for slot-13 foil rate interpretation, land-slot CN sets, and `AVG_COMMONS = 6.985` validation
4. Lethe collation site — does NOT cover FDN (returns 404; FDN is a Play Booster set, post-Lethe scope)
5. Live DB inventory (`scripts/_inventory-fdn.ts` + `_inventory-fdn-2.ts`) — confirmed pool sizes against published counts

## Files to add

```
scripts/seed-fdn-config.ts   # idempotent seed script (~250 lines)
notes/ev/fdn.md              # source-of-truth documentation (gitignored under notes/)
```

No edits to existing files needed (the calc engine already supports the slot/outcome shape this config produces).

## Pool derivation rules

`buildPools()` queries `dashboard_ev_cards` once for `set: "fdn"` and once for `set: "spg"` (CN 74–83), partitions in JS, and returns:

| Pool | Filter | Expected count |
|---|---|---:|
| `mainlineCommons` | `treatment:normal, booster:true, rarity:common, !type_line~/Basic Land/, cn ≤ 271, cn ∉ DUAL_CNS` | **80** |
| `mainlineUncommons` | `treatment:normal, booster:true, rarity:uncommon, cn ≤ 271` | **101** (DB-actual; mtgscribe says 100 — off-by-1, immaterial; includes utility lands #264 Rogue's Passage + #267 Secluded Courtyard which intentionally stay in U pool per theexpectedvalue) |
| `mainlineRares` | `treatment:normal, booster:true, rarity:rare, cn ≤ 271` | **60** |
| `mainlineMythics` | `treatment:normal, booster:true, rarity:mythic, cn ≤ 271` | **20** |
| `borderlessC` | `treatment:borderless, "boosterfun" ∈ promo_types, !manafoil, !japanshowcase, !fracturefoil, rarity:common` | **2** (1 pure boosterfun + 1 SC-tagged) |
| `borderlessU` | same, rarity:uncommon | **8** (3 pure + 5 SC-tagged) |
| `borderlessR` | same, rarity:rare | **43** |
| `borderlessM` | same, rarity:mythic | **17** (incl. 5 borderless PWs) |
| `dualLandCns` | hardcoded `["259","260","261","263","265","266","268","269","270","271"]` | **10** |
| `regularBasicCns` | CN range `272–281`, type ~ `/Basic Land/` | **10** |
| `altArtBasicCns` | CN range `282–291`, type ~ `/Basic Land/` | **10** |
| `spgFdn` | `set:spg, cn 74–83` | **10** |

### Why borderless C/U pool includes the 6 SC-tagged borderless prints

DB shows 130 borderless docs total: 64 "pure" boosterfun + 60 mana-foil duplicates (CB-only, excluded) + 6 `boosterfun,startercollection`. Pure boosterfun gives 1C + 3U + 43R + 17M.

The 6 SC-tagged are (verified from DB 2026-04-30):

| CN | Name | Rarity |
|---:|---|---|
| 293 | Ajani's Pridemate | U |
| 313 | Refute | **C** |
| 325 | Vengeful Bloodwitch | U |
| 327 | Abrade | U |
| 340 | Reclamation Sage | U |
| 355 | Swiftfoot Boots | U |

Adding them gives 2C + 8U + 43R + 17M = 70 cards, **exactly matching WOTC's "2 borderless commons + 8 borderless uncommons"**. The SC tag is incidental metadata — same Scryfall ID = same card, and the cards do appear in Play Boosters.

Filter therefore drops only manafoil/japanshowcase/fracturefoil tags, NOT startercollection. Filter does NOT include `booster: true` because all 6 SC-tagged borderless have `booster: false` on Scryfall (Scryfall flags them as Starter-Collection product members rather than standard-booster) — the pool selector is `treatment + promo_types`, which catches all 70.

## Slot definitions

`packs_per_box: 36`, `cards_per_pack: 14` (token slot is implicit, not modeled). 14 slots:

| # | Label | `is_foil` | Outcomes | Sum |
|---|---|---|---|--:|
| 1–6 | Common | false | 1.000 mainlineCommons | 1.000 |
| 7 | Common / SPG | false | 0.985 mainlineCommons · 0.015 SPG (`set:spg, cn 74–83`) | 1.000 |
| 8–10 | Uncommon | false | 1.000 mainlineUncommons | 1.000 |
| 11 | Rare / Mythic | false | 0.780 R · 0.128 M · 0.077 BDL R · 0.015 BDL M | 1.000 |
| 12 | Non-foil Wildcard | false | 0.167 C · 0.583 U · 0.163 R · 0.026 M · 0.018 BDL C · 0.024 BDL U · 0.016 BDL R · 0.003 BDL M | 1.000 |
| 13 | Traditional Foil | true | 0.611 C-union · 0.306 U-union · 0.071 R-union · 0.012 M-union | 1.000 |
| 14 | Land | false | 0.20 NF alt-art basic · 0.05 F alt-art (`is_foil:true`) · 0.40 NF dual · 0.10 F dual · 0.20 NF regular basic · 0.05 F regular | 1.000 |

### Slot 13 foil rate model — Model B (theexpectedvalue / standard MTG)

Each rarity outcome:

```
foil C: (11/12)(2/3) = 0.611  → custom_pool = [...mainlineCommons, ...borderlessC] (82 cards)
foil U: (11/12)(1/3) = 0.306  → [...mainlineUncommons, ...borderlessU] (109 cards)
foil R: (1/12)(6/7)  = 0.071  → [...mainlineRares, ...borderlessR] (103 cards)
foil M: (1/12)(1/7)  = 0.012  → [...mainlineMythics, ...borderlessM] (37 cards)
```

WOTC's literal "same distribution as non-foil wildcard" implies foil R/M ≈ 20.8% per pack — ~2.5× standard MTG foil rates and inconsistent with the physical foil-sheet print structure (uniform across MTG products). theexpectedvalue.com explicitly chose Model B over WOTC's literal text. Going with B.

### Slot 14 land-slot membership

theexpectedvalue's source comment: *"keeps Evolving Wilds, Rogue's Passage, and Secluded Courtyard out of the land slot."* Land slot pool is exactly 30 CNs:

- 10 dual lands (gainlands): 259, 260, 261, 263, 265, 266, 268, 269, 270, 271
- 10 regular basics: 272–281
- 10 alt-art "character" basics: 282–291

Evolving Wilds (#262, common, fetch) stays in `mainlineCommons`. Rogue's Passage (#264, U) and Secluded Courtyard (#267, U) stay in `mainlineUncommons`.

## Sanity checks

`buildPools()` runs `expect(got, want, label)` against every count in the table above. Mismatches log `⚠️ ` but **do not throw** — keeps the seed runnable when Scryfall data drifts. Same warn-not-throw pattern as `seed-mh3-config.ts`.

`main()` runs `checkSlots(playBooster, "Play")` after building. Warns if any slot's outcomes sum to ≠ 1.0 ± 0.003.

## Storage shape

```ts
upsert dashboard_ev_config { set_code: "fdn" } with $set:
  set_code: "fdn",
  sift_floor: 0.25,
  fee_rate: 0.05,
  play_booster: <EvBoosterConfig>,
  updated_at: <ISO>,
  updated_by: "seed-script"
```

`collector_booster` field omitted. Future CB seed run will add it without disturbing `play_booster`.

## Snapshot

After upsert: `await generateSnapshot("fdn")`. Logs date + `play_ev_gross` / `play_ev_net` / `play_pack_ev_net` for verification. Powers the EV grid + history chart.

## Pragmatic simplifications

1. **Collector Booster not modeled** — out of scope. Mana foils (60), Japan Showcase (20), fracture foil (10), extended art (46) all CB-only, excluded automatically by `booster:true` + treatment + CN filters.
2. **Beginnerbox + setextension reprints (CN 497–771, ~170 cards)** — separate Beginner Box product; not in Play Boosters; excluded by `booster:true`.
3. **Bundle promo (#728), BAB (#729 Solemn Simulacrum EA)** — promo-only; excluded by `booster:true`.
4. **Maze's End + other high-CN startercollection mythics (CN 565–727)** — Starter-Collection-only prints with separate Scryfall IDs; not in Play Boosters; excluded by `booster:true` + CN ≤ 271.
5. **Mainline U pool stays 101 (not normalized to 100)** — utility lands Rogue's Passage / Secluded Courtyard correctly belong here per theexpectedvalue + mtgscribe; per-card pull rate near-identical between 100 and 101; EV delta <€0.10/box.
6. **Slot 13 foil rates** — see "Model B" above. WOTC's literal interpretation rejected on print-economics grounds.

## Idempotency

- Upsert keyed on `{ set_code: "fdn" }` — re-runs cleanly overwrite.
- All hardcoded CN sets (10 duals, 10 reg basics, 10 alt-art basics, 10 SPG) live as constants near the top of the file; if Scryfall renumbers, sanity-check warnings will flag the issue.

## What `notes/ev/fdn.md` will contain

Same template as `notes/ev/sos.md`:

1. Why configured + sources (WOTC, mtgscribe, theexpectedvalue triangulation; Lethe N/A)
2. Set-code landscape (fdn, spg #74–83, fdc deferred)
3. FDN CN layout table
4. Slot table verbatim from this spec
5. Pool sanity-check expected counts
6. Borderless C/U inclusion rationale (1+3 pure → 2+8 with SC)
7. Slot 13 foil-model fork (A vs B, decision + reasoning)
8. Pragmatic simplifications
9. Snapshot history (initial seed EV)
10. Known issues / future work (CB; price overrides if any FDN cards have wrong CM IDs)

## Out of scope

- Collector Booster config (deferred per user)
- Mana foil / Japan Showcase / fracture foil pools (CB-only)
- Extended art pool (CB-only)
- FDC (Foundations Commander) modeling — separate set code, separate config
- Foundations Jumpstart (J25) — separate config under `j25` slug; uses Jumpstart theme model, not Play Booster
- Foundations Beginner Box / Starter Collection — already exist as products; not affected
- Cardmarket extension / price scraping changes
- Default config fallback changes (`getDefaultPlayBoosterConfig`)
- Any UI work

## Acceptance

1. `npx tsx scripts/seed-fdn-config.ts` runs cleanly to completion. All sanity checks print `✅` (or only `⚠️ ` lines for the known mainline U off-by-1).
2. `dashboard_ev_config` has a doc with `set_code: "fdn"`, `sift_floor: 0.25`, `fee_rate: 0.05`, `play_booster: { packs_per_box: 36, cards_per_pack: 14, slots: [...14 slots...] }`, no `collector_booster`.
3. `dashboard_ev_snapshots` has a fresh snapshot for `set_code: "fdn"` with non-null `play_ev_gross` / `play_ev_net` / `play_pack_ev_net`.
4. `notes/ev/fdn.md` exists with the 10-section template populated.
5. EV grid in the dashboard UI shows FDN with the new figures (no UI work — just appears via the snapshot).
