import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { withAuthParams } from "@/lib/api-helpers";
import { getDb } from "@/lib/mongodb";
import { resolveScryfall } from "@/lib/appraiser/scryfall-resolve";
import {
  COL_APPRAISER_CARDS,
  COL_APPRAISER_COLLECTIONS,
  type AppraiserCardDoc,
  type AppraiserCollectionDoc,
} from "@/lib/appraiser/types";

function parseId(id: string): ObjectId | null {
  try {
    return new ObjectId(id);
  } catch {
    return null;
  }
}

export const POST = withAuthParams<{ id: string }>(async (_req, _session, { id }) => {
  const oid = parseId(id);
  if (!oid) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const db = await getDb();
  const cards = await db
    .collection<AppraiserCardDoc>(COL_APPRAISER_CARDS)
    .find({ collectionId: oid })
    .toArray();

  let refreshed = 0;
  let failed = 0;
  for (const card of cards) {
    try {
      const resolved = await resolveScryfall({
        name: card.name,
        set: card.set,
        collectorNumber: card.collectorNumber,
        foil: card.foil,
      });
      await db
        .collection<AppraiserCardDoc>(COL_APPRAISER_CARDS)
        .updateOne(
          { _id: card._id },
          {
            $set: {
              trendPrice: resolved.trendPrice,
              fromPrice: null,
              cm_prices: null,
              pricedAt: null,
              scryfallId: resolved.scryfallId,
              cardmarket_id: resolved.cardmarketId,
              cardmarketUrl: resolved.cardmarketUrl,
              imageUrl: resolved.imageUrl,
              status: "pending",
            },
          }
        );
      refreshed++;
    } catch {
      await db
        .collection<AppraiserCardDoc>(COL_APPRAISER_CARDS)
        .updateOne({ _id: card._id }, { $set: { status: "error" } });
      failed++;
    }
  }

  await db
    .collection<AppraiserCollectionDoc>(COL_APPRAISER_COLLECTIONS)
    .updateOne({ _id: oid }, { $set: { updatedAt: new Date() } });

  return { refreshed, failed, total: cards.length };
}, "appraiser-collection-refresh");
