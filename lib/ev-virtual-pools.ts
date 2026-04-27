// lib/ev-virtual-pools.ts
//
// Registry of "virtual" EV set codes whose card pool is composed at read time
// from one or more underlying real Scryfall sets. Two pool shapes are
// supported:
//
//   - Pure-virtual (e.g. `jtla`): a code that does NOT exist in Scryfall as
//     its own set, resolved purely from cn_range / name_list specs against
//     other sets. Used when a Jumpstart product ships under an existing
//     parent set's CN range.
//
//   - Native-plus-extensions (e.g. `mb2`): a real Scryfall set code whose pool
//     also includes cards from other sets identified by a spec. Used when a
//     product (Mystery Booster 2 here) reprints cards from `plst` (The List)
//     alongside its own native printings.
//
// This pattern was introduced to fix the silent invariant violation where
// MB2 pickup cards used to be persisted with a synthetic `set: "mb2-list"`
// value, which the 3-day Scryfall bulk sync would overwrite back to the real
// `set: "plst"` — wiping the MB2 EV pool every cron cycle. Read-time
// virtualization keeps the canonical Scryfall data untouched, so future
// pickup-style products can extend the registry with no schema or migration
// risk.

import { MB2_PICKUP_CARDS } from "@/lib/ev-mb2-list";

export type VirtualPoolSpec =
  | { type: "cn_range"; set: string; cnFrom: number; cnTo: number }
  | { type: "name_list"; set: string; names: readonly string[] };

export interface VirtualPoolDef {
  /**
   * Real Scryfall set code that contributes its full card list to this pool.
   * Omit for pure-virtual codes (e.g. `jtla`) that don't have a native set.
   */
  native?: string;
  /**
   * Additional pool specs resolved against other real Scryfall sets. Order is
   * preserved when the resolver concatenates buckets — used by the Jumpstart
   * EV path to apply spec-priority semantics (later specs override earlier
   * ones in the per-name lookup Map inside calculateJumpstartEv).
   */
  extensions: ReadonlyArray<VirtualPoolSpec>;
}

/**
 * Pure-data expansion of a pool definition into Mongo-side query buckets.
 * Each bucket is one query against the cards collection; the resolver in
 * lib/ev.ts runs them in order and concatenates the results.
 *
 * `dedupeBy: "name"` signals the resolver to keep one document per name
 * (earliest released_at). Plst can have multiple printings of the same
 * card name across List drops; the user-visible MB2 pool is one card per
 * name (matching what `/cards/collection` returns to syncMB2Cards).
 */
export interface PoolBucket {
  filter: Record<string, unknown>;
  dedupeBy?: "name";
}

export function expandPoolToBuckets(def: VirtualPoolDef): PoolBucket[] {
  const buckets: PoolBucket[] = [];
  if (def.native) buckets.push({ filter: { set: def.native } });

  for (const spec of def.extensions) {
    if (spec.type === "cn_range") {
      const cns = Array.from(
        { length: spec.cnTo - spec.cnFrom + 1 },
        (_, i) => String(spec.cnFrom + i)
      );
      buckets.push({ filter: { set: spec.set, collector_number: { $in: cns } } });
    } else if (spec.type === "name_list") {
      buckets.push({
        filter: { set: spec.set, name: { $in: [...spec.names] } },
        dedupeBy: "name",
      });
    }
  }
  return buckets;
}

export const VIRTUAL_POOLS: Record<string, VirtualPoolDef> = {
  // Avatar Jumpstart — virtual code, no native set. Specs ordered so later
  // entries override earlier ones in the per-name map inside
  // calculateJumpstartEv (lowest priority first; tle 74-170 wins for shared
  // legendary names like Aang, Katara). See notes/ev/tla-jumpstart.md.
  jtla: {
    extensions: [
      { type: "cn_range", set: "tla", cnFrom: 1, cnTo: 281 },     // TLA mainline + dual/location lands
      { type: "cn_range", set: "tla", cnFrom: 282, cnTo: 286 },   // TLA default basics
      { type: "cn_range", set: "tla", cnFrom: 292, cnTo: 296 },   // TLA Avatar's Journey full-art basics
      { type: "cn_range", set: "tla", cnFrom: 287, cnTo: 291 },   // TLA Appa full-art basics
      { type: "cn_range", set: "tle", cnFrom: 171, cnTo: 209 },   // Jumpstart Extended Art
      { type: "cn_range", set: "tle", cnFrom: 210, cnTo: 264 },   // Beginner Box main
      { type: "cn_range", set: "tle", cnFrom: 74, cnTo: 170 },    // JS-main — HIGHEST priority
    ],
  },
  // Mystery Booster 2 — native mb2 (385 cards) plus plst (The List) reprints
  // identified by name. The plst names are the 1,447-entry pickup list
  // captured in lib/ev-mb2-list.ts; the resolver dedupes plst by name (earliest
  // printing wins) so a name appearing in multiple List drops yields one card.
  // See notes/ev/mb2.md.
  mb2: {
    native: "mb2",
    extensions: [
      {
        type: "name_list",
        set: "plst",
        names: MB2_PICKUP_CARDS.map((c) => c.name),
      },
    ],
  },
};
