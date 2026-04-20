import { ObjectId } from "mongodb";
import { withAuthReadParams } from "@/lib/api-helpers";
import { getDb } from "@/lib/mongodb";
import {
  COL_APPRAISER_CARDS,
  type AppraiserCardDoc,
} from "@/lib/appraiser/types";

function parseId(id: string): ObjectId | null {
  try { return new ObjectId(id); } catch { return null; }
}

/**
 * Diagnostic endpoint — returns raw DB state for an appraiser collection so
 * we can pin down whether CM price fan-out from the extension is landing.
 *
 * Not linked from the UI; hit directly:
 *   /api/appraiser/collections/<id>/debug
 */
export const GET = withAuthReadParams<{ id: string }>(async (req, { id }) => {
  const oid = parseId(id);
  if (!oid) return new Response(JSON.stringify({ error: "Invalid id" }), { status: 400 });

  const { searchParams } = new URL(req.url);
  const nameFilter = searchParams.get("name");
  const cmIdFilter = searchParams.get("cardmarket_id");

  const db = await getDb();

  // If the caller is hunting a specific card, return the full matching docs
  // + the matching sync_log entries for that cardmarket_id so we can see
  // exactly what the extension scraped vs what the appraiser has stored.
  if (nameFilter || cmIdFilter) {
    const cardQuery: Record<string, unknown> = { collectionId: oid };
    if (nameFilter) cardQuery.name = { $regex: nameFilter, $options: "i" };
    if (cmIdFilter) cardQuery.cardmarket_id = parseInt(cmIdFilter, 10);
    const matched = await db
      .collection<AppraiserCardDoc>(COL_APPRAISER_CARDS)
      .find(cardQuery)
      .toArray();

    const cmIds = matched
      .map((c) => c.cardmarket_id)
      .filter((x): x is number => x != null);

    // What the extension actually wrote to ev_cards for the same cardmarket_id.
    // This is the ground truth: if ev_cards has cm_prices.nonfoil.from for
    // productId 6425, the scrape worked and the fan-out is the break point.
    // If ev_cards has no cm_prices at all, the CM page itself didn't expose
    // a From price (or the scrape failed upstream).
    const evCards = cmIds.length
      ? await db
          .collection("dashboard_ev_cards")
          .find({ cardmarket_id: { $in: cmIds } })
          .toArray()
      : [];

    // Recent sync_log rows for those cardmarket_ids (correct schema: top-level
    // `details` is a string like 'Pyroblast (#6425) nonfoil — trend €8.98').
    const syncLogHits = cmIds.length
      ? await db
          .collection("dashboard_sync_log")
          .find({
            dataType: "card_prices",
            $or: cmIds.map((id) => ({ details: { $regex: `#${id}\\b` } })),
          })
          .sort({ receivedAt: -1 })
          .limit(20)
          .toArray()
      : [];

    return {
      matched: matched.map((c) => ({
        _id: String(c._id),
        name: c.name,
        set: c.set,
        collectorNumber: c.collectorNumber,
        scryfallId: c.scryfallId,
        cardmarket_id: c.cardmarket_id,
        cardmarket_id_type: typeof c.cardmarket_id,
        cardmarketUrl: c.cardmarketUrl,
        foil: c.foil,
        foil_type: typeof c.foil,
        qty: c.qty,
        trendPrice: c.trendPrice,
        fromPrice: c.fromPrice,
        cm_prices: c.cm_prices,
        pricedAt: c.pricedAt,
        status: c.status,
      })),
      evCards: evCards.map((e) => ({
        _id: String(e._id),
        name: e.name,
        set: e.set,
        cardmarket_id: e.cardmarket_id,
        cardmarket_id_type: typeof e.cardmarket_id,
        cm_prices: e.cm_prices ?? null,
        price_eur: e.price_eur,
        price_eur_foil: e.price_eur_foil,
      })),
      syncLogHits: syncLogHits.map((l) => ({
        receivedAt: l.receivedAt,
        submittedBy: l.submittedBy,
        details: l.details,
      })),
    };
  }

  const cards = await db
    .collection<AppraiserCardDoc>(COL_APPRAISER_CARDS)
    .find({ collectionId: oid })
    .toArray();

  const total = cards.length;
  const withCardmarketId = cards.filter((c) => c.cardmarket_id != null).length;
  const withoutCardmarketId = cards.filter((c) => c.cardmarket_id == null).length;
  const withFromPrice = cards.filter((c) => c.fromPrice != null).length;
  const withTrendPrice = cards.filter((c) => c.trendPrice != null).length;
  const withCmPrices = cards.filter((c) => c.cm_prices != null).length;

  const statuses: Record<string, number> = {};
  for (const c of cards) statuses[c.status] = (statuses[c.status] || 0) + 1;

  const cardmarketIds = cards
    .map((c) => c.cardmarket_id)
    .filter((x): x is number => x != null);

  const sample = cards.slice(0, 5).map((c) => ({
    name: c.name,
    set: c.set,
    scryfallId: c.scryfallId,
    cardmarket_id: c.cardmarket_id,
    cardmarketUrl: c.cardmarketUrl,
    foil: c.foil,
    qty: c.qty,
    trendPrice: c.trendPrice,
    fromPrice: c.fromPrice,
    cm_prices: c.cm_prices ? Object.keys(c.cm_prices) : null,
    pricedAt: c.pricedAt,
    status: c.status,
  }));

  return {
    summary: {
      total,
      withCardmarketId,
      withoutCardmarketId,
      withFromPrice,
      withTrendPrice,
      withCmPrices,
      statuses,
      uniqueCardmarketIdCount: new Set(cardmarketIds).size,
      cardmarketIdRange:
        cardmarketIds.length > 0
          ? { min: Math.min(...cardmarketIds), max: Math.max(...cardmarketIds) }
          : null,
    },
    sample,
  };
}, "appraiser-collection-debug");
