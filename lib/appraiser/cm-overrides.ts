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
export const COL_EV_CARDS = "dashboard_ev_cards";

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
 * across all collections, AND to the matching `dashboard_ev_cards` row.
 * Returns the count of each.
 *
 * Why we touch ev_cards:
 *   - The extension's `processCardPrices` keys both writes (ev_cards
 *     update + appraiser fan-out) by `cardmarket_id`. If the ev_cards
 *     doc still has cardmarket_id=null (typical for promo printings
 *     Scryfall doesn't index), every scrape with the override's ID
 *     misses the ev_cards updateOne and silently drops.
 *   - The appraiser hydration also looks up ev_cards by cardmarket_id
 *     to drive the foil/nonfoil variant fallback (single-variant CM
 *     products → use the nonfoil scrape for foil rows). Without an
 *     ev_cards match, that path can't run.
 *
 * Propagating the override to ev_cards makes both pipelines key off the
 * same ID. The user fixes Star of Extinction PLST #XLN-161 once and
 * every downstream surface — appraiser, EV, stock — sees the new ID.
 *
 * Note: Scryfall bulk sync respects DB overrides (see
 * lib/scryfall-bulk.ts loading getCmOverridesMap), so the next bulk
 * sync won't clobber the value with Scryfall's null.
 */
export async function setCmOverride(
  db: Db,
  args: {
    set: string;
    collectorNumber: string;
    cardmarket_id: number;
    userId: string;
  },
): Promise<{ matchedAppraiserCards: number; matchedEvCards: number }> {
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

  // ev_cards uses `collector_number` (snake) — different from appraiser's
  // camelCase `collectorNumber`. Both surfaces need the same idProduct.
  const [appraiserResult, evResult] = await Promise.all([
    db.collection(COL_APPRAISER_CARDS).updateMany(
      { set, collectorNumber },
      { $set: { cardmarket_id } },
    ),
    db.collection(COL_EV_CARDS).updateMany(
      { set, collector_number: collectorNumber },
      { $set: { cardmarket_id } },
    ),
  ]);

  return {
    matchedAppraiserCards: appraiserResult.modifiedCount ?? 0,
    matchedEvCards: evResult.modifiedCount ?? 0,
  };
}

/**
 * Loads every DB-stored override into a `${set}:${collector_number}` →
 * cardmarket_id map. Used by the Scryfall bulk sync to preserve user
 * overrides across bulk re-syncs (Scryfall keeps returning null for
 * these printings, and a naive sync would clobber the override).
 */
export async function getCmOverridesMap(db: Db): Promise<Record<string, number>> {
  const docs = await db
    .collection<CardmarketIdOverrideDoc>(COL_APPRAISER_CM_OVERRIDES)
    .find({}, { projection: { _id: 0, set: 1, collectorNumber: 1, cardmarket_id: 1 } })
    .toArray();
  const map: Record<string, number> = {};
  for (const d of docs) {
    map[`${d.set.toLowerCase()}:${d.collectorNumber}`] = d.cardmarket_id;
  }
  return map;
}

/**
 * Accepts any of:
 *   - A Cardmarket URL with `idProduct=N` query param
 *   - An HTML snippet containing `idAddProduct ... value="N"` (or the
 *     reverse `value="N" ... idAddProduct`) — copied straight from the
 *     CM product page's view-source
 *   - A bare numeric idProduct
 *
 * Returns the parsed numeric ID, or null when the input doesn't yield one.
 *
 * Examples:
 *   parseCardmarketIdInput("12345")                                  → 12345
 *   parseCardmarketIdInput("https://...Products?idProduct=12345")    → 12345
 *   parseCardmarketIdInput('<input name="idAddProduct" value="441234">') → 441234
 *   parseCardmarketIdInput("https://...Singles/Foo/Bar")             → null
 *   parseCardmarketIdInput("")                                       → null
 */
export function parseCardmarketIdInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // 1. URL with idProduct query param
  try {
    const u = new URL(trimmed);
    const id = u.searchParams.get("idProduct");
    if (id && /^\d+$/.test(id)) {
      const n = parseInt(id, 10);
      if (n > 0) return n;
    }
  } catch {
    // not a URL — fall through
  }
  // 2. HTML snippet: `name="idAddProduct" ... value="N"` or vice versa.
  // The hidden input on every CM product page carries the idProduct in its
  // value attribute. Both attribute orderings exist depending on theme.
  const htmlForward = trimmed.match(/idAddProduct[^>]{0,200}?value\s*=\s*["']?(\d+)/i);
  if (htmlForward) {
    const n = parseInt(htmlForward[1], 10);
    if (n > 0) return n;
  }
  const htmlBackward = trimmed.match(/value\s*=\s*["']?(\d+)[^<]{0,200}?idAddProduct/i);
  if (htmlBackward) {
    const n = parseInt(htmlBackward[1], 10);
    if (n > 0) return n;
  }
  // 3. Bare number
  if (/^\d+$/.test(trimmed)) {
    const n = parseInt(trimmed, 10);
    if (n > 0) return n;
  }
  return null;
}
