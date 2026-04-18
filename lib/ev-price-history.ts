// Historical price snapshots for cards we care about (cardmarket_id != null
// ∪ cards currently in stock). Writes only when price changes vs the last
// stored snapshot for that card — keeps the collection small on free-tier
// MongoDB while preserving enough points to chart trends.

import type { Db } from "mongodb";
import type { EvCardPriceSnapshot } from "@/lib/types";

export const COL_PRICE_HISTORY = "dashboard_ev_card_prices";
export const COL_EV_CARDS = "dashboard_ev_cards";
export const COL_EV_SETS = "dashboard_ev_sets";
export const COL_CM_STOCK = "dashboard_cm_stock";

const TTL_DAYS = 180;
const TTL_INDEX_NAME = "d_ttl";

let indexesEnsured = false;

export async function ensureIndexes(db: Db): Promise<void> {
  if (indexesEnsured) return;
  const col = db.collection(COL_PRICE_HISTORY);
  const wantSeconds = TTL_DAYS * 86400;

  await col.createIndex({ s: 1, d: -1 }, { name: "s_d_desc" });

  // TTL needs special handling: createIndex throws if the existing index has a
  // different expireAfterSeconds. Use collMod to adjust in place when the
  // value drifts (e.g. shortening from 365d to 180d).
  const existing = (await col.listIndexes().toArray()).find(
    (i) => i.name === TTL_INDEX_NAME
  );
  if (!existing) {
    await col.createIndex({ d: 1 }, { name: TTL_INDEX_NAME, expireAfterSeconds: wantSeconds });
  } else if (existing.expireAfterSeconds !== wantSeconds) {
    await db.command({
      collMod: COL_PRICE_HISTORY,
      index: { name: TTL_INDEX_NAME, expireAfterSeconds: wantSeconds },
    });
  }

  indexesEnsured = true;
}

/**
 * Scryfall-id set of cards to snapshot:
 *   • every ev_cards doc with a non-null cardmarket_id, plus
 *   • every ev_cards doc matched by a current stock row
 *     (via stock.set [CM name] → ev_sets.name → code → ev_cards{name, set: code}).
 *
 * The second branch catches stock we own that somehow lacks a cardmarket_id,
 * though in practice the overlap is near-total — it's defensive.
 * CM set-name variants ("X: Extras", "X: Promos") currently don't resolve and
 * are skipped (see CLAUDE.md — normalization table TODO).
 */
export async function getInScopeScryfallIds(db: Db): Promise<Set<string>> {
  const ids = new Set<string>();

  const cards = db.collection(COL_EV_CARDS);
  const withCmId = await cards
    .find({ cardmarket_id: { $ne: null } }, { projection: { scryfall_id: 1 } })
    .toArray();
  for (const c of withCmId) ids.add(c.scryfall_id as string);

  // Stock-join branch
  const setDocs = await db
    .collection(COL_EV_SETS)
    .find({}, { projection: { name: 1, code: 1 } })
    .toArray();
  const nameToCode = new Map<string, string>();
  for (const s of setDocs) nameToCode.set(s.name as string, s.code as string);

  const stockRows = await db
    .collection(COL_CM_STOCK)
    .find({}, { projection: { name: 1, set: 1 } })
    .toArray();
  const namesByCode = new Map<string, Set<string>>();
  for (const r of stockRows) {
    const code = nameToCode.get(r.set as string);
    if (!code) continue;
    if (!namesByCode.has(code)) namesByCode.set(code, new Set());
    namesByCode.get(code)!.add(r.name as string);
  }
  for (const [code, names] of namesByCode) {
    const matches = await cards
      .find({ set: code, name: { $in: [...names] } }, { projection: { scryfall_id: 1 } })
      .toArray();
    for (const m of matches) ids.add(m.scryfall_id as string);
  }

  return ids;
}

/**
 * For each scryfall_id in `ids`, fetch the latest stored (e, f) tuple. Used
 * to compare against incoming prices so we only insert on change.
 */
export async function getLastSnapshotMap(
  db: Db,
  ids: Set<string>
): Promise<Map<string, { e: number | null; f: number | null }>> {
  const map = new Map<string, { e: number | null; f: number | null }>();
  if (ids.size === 0) return map;

  const cursor = db.collection(COL_PRICE_HISTORY).aggregate(
    [
      { $match: { s: { $in: [...ids] } } },
      { $sort: { s: 1, d: -1 } },
      { $group: { _id: "$s", e: { $first: "$e" }, f: { $first: "$f" } } },
    ],
    { allowDiskUse: true }
  );
  for await (const doc of cursor) {
    map.set(doc._id as string, {
      e: (doc.e as number | null) ?? null,
      f: (doc.f as number | null) ?? null,
    });
  }
  return map;
}

/**
 * Insert snapshots for rows whose (e, f) changed vs `lastSnapshots`. Mutates
 * `lastSnapshots` in place so subsequent calls in the same run compare against
 * the new values. Returns count of docs actually inserted.
 */
export async function insertSnapshotsOnChange(
  db: Db,
  batch: Array<{ scryfall_id: string; e: number | null; f: number | null }>,
  date: Date,
  lastSnapshots: Map<string, { e: number | null; f: number | null }>
): Promise<number> {
  if (batch.length === 0) return 0;

  const toInsert: EvCardPriceSnapshot[] = [];
  for (const row of batch) {
    const last = lastSnapshots.get(row.scryfall_id);
    if (last && last.e === row.e && last.f === row.f) continue;
    toInsert.push({ s: row.scryfall_id, d: date, e: row.e, f: row.f });
    lastSnapshots.set(row.scryfall_id, { e: row.e, f: row.f });
  }
  if (toInsert.length === 0) return 0;

  await db
    .collection(COL_PRICE_HISTORY)
    .insertMany(toInsert as never, { ordered: false });
  return toInsert.length;
}
