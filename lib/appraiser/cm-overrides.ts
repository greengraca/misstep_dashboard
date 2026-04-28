// User-managed overrides for cards where Scryfall doesn't know the right
// Cardmarket idProduct. Keyed by `{set, collectorNumber}` so a single
// override applies across every appraiser collection that holds the same
// printing — fixing it once in one collection benefits future CSV imports
// and other open collections.
//
// Used in two places:
//   1. `cardDocToPayload` (lib/appraiser/ev-join.ts) — already rebuilds
//      cardmarketUrl from authoritative fields, so once cardmarket_id is
//      set on a doc the URL flows automatically.
//   2. POST /api/appraiser/collections/[id]/cards (card-add) — applies the
//      override after Scryfall resolve, before insert, so new docs are
//      born with the right ID.
//
// Stored in `dashboard_appraiser_cm_overrides`. The (set, collectorNumber)
// pair is unique per override; setting an override is idempotent.

import type { Db, ObjectId } from "mongodb";

export const COL_APPRAISER_CM_OVERRIDES = "dashboard_appraiser_cm_overrides";
export const COL_APPRAISER_CARDS = "dashboard_appraiser_cards";

export interface CardmarketIdOverrideDoc {
  _id: ObjectId;
  /** Lowercase Scryfall set code. */
  set: string;
  /** Collector number with original casing (CN can include letters). */
  collectorNumber: string;
  cardmarket_id: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

/** Single-card lookup. Returns null when no override exists for this printing. */
export async function getCmOverride(
  db: Db,
  set: string | undefined | null,
  collectorNumber: string | undefined | null,
): Promise<number | null> {
  if (!set || !collectorNumber) return null;
  const doc = await db
    .collection<CardmarketIdOverrideDoc>(COL_APPRAISER_CM_OVERRIDES)
    .findOne({ set: set.toLowerCase(), collectorNumber });
  return doc?.cardmarket_id ?? null;
}

/**
 * Upsert an override and propagate it to every matching appraiser card
 * across all collections. Returns the number of appraiser docs updated.
 *
 * The propagation step is what makes the override feel "global" — the user
 * fixes Star of Extinction PLST #XLN-161 once and every collection that
 * holds it picks up the new cardmarket_id immediately.
 */
export async function setCmOverride(
  db: Db,
  args: {
    set: string;
    collectorNumber: string;
    cardmarket_id: number;
    userId: string;
  },
): Promise<{ matchedAppraiserCards: number }> {
  const set = args.set.toLowerCase();
  const collectorNumber = args.collectorNumber;
  const cardmarket_id = args.cardmarket_id;
  const now = new Date();

  await db
    .collection<CardmarketIdOverrideDoc>(COL_APPRAISER_CM_OVERRIDES)
    .updateOne(
      { set, collectorNumber },
      {
        $set: {
          cardmarket_id,
          updatedAt: now,
          createdBy: args.userId,
        },
        $setOnInsert: {
          set,
          collectorNumber,
          createdAt: now,
        },
      },
      { upsert: true },
    );

  // Propagate to all matching appraiser cards. cardDocToPayload always
  // rebuilds cardmarketUrl from authoritative fields, so we don't need to
  // touch the URL here — just the ID.
  const result = await db.collection(COL_APPRAISER_CARDS).updateMany(
    { set, collectorNumber },
    { $set: { cardmarket_id } },
  );

  return { matchedAppraiserCards: result.modifiedCount ?? 0 };
}

/**
 * Accepts either a Cardmarket URL with `idProduct=N` query param OR a bare
 * idProduct number. Returns the parsed numeric ID, or null when the input
 * doesn't yield one.
 *
 * Examples:
 *   parseCardmarketIdInput("12345")                                  → 12345
 *   parseCardmarketIdInput("https://...Products?idProduct=12345")    → 12345
 *   parseCardmarketIdInput("https://...Singles/Foo/Bar")             → null
 *   parseCardmarketIdInput("")                                       → null
 */
export function parseCardmarketIdInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    const id = u.searchParams.get("idProduct");
    if (id && /^\d+$/.test(id)) {
      const n = parseInt(id, 10);
      if (n > 0) return n;
    }
  } catch {
    // not a URL — fall through to bare-number parse
  }
  if (/^\d+$/.test(trimmed)) {
    const n = parseInt(trimmed, 10);
    if (n > 0) return n;
  }
  return null;
}
