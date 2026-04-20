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
export const GET = withAuthReadParams<{ id: string }>(async (_req, { id }) => {
  const oid = parseId(id);
  if (!oid) return new Response(JSON.stringify({ error: "Invalid id" }), { status: 400 });

  const db = await getDb();
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
