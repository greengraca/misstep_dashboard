import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { withAuthParams } from "@/lib/api-helpers";
import { getDb } from "@/lib/mongodb";
import { resolveScryfall } from "@/lib/appraiser/scryfall-resolve";
import {
  COL_APPRAISER_CARDS,
  COL_APPRAISER_COLLECTIONS,
  type AppraiserCard,
  type AppraiserCardDoc,
  type AppraiserCollectionDoc,
} from "@/lib/appraiser/types";

function parseId(id: string): ObjectId | null {
  try { return new ObjectId(id); } catch { return null; }
}

function cardDocToPayload(d: AppraiserCardDoc): AppraiserCard {
  return {
    _id: String(d._id),
    collectionId: String(d.collectionId),
    name: d.name,
    set: d.set,
    setName: d.setName,
    collectorNumber: d.collectorNumber,
    language: d.language,
    foil: d.foil,
    qty: d.qty,
    scryfallId: d.scryfallId,
    cardmarket_id: d.cardmarket_id,
    cardmarketUrl: d.cardmarketUrl,
    imageUrl: d.imageUrl,
    trendPrice: d.trendPrice,
    fromPrice: d.fromPrice,
    pricedAt: d.pricedAt ? d.pricedAt.toISOString() : null,
    cm_prices: d.cm_prices,
    status: d.status,
    createdAt: d.createdAt.toISOString(),
  };
}

// Fields the client may send. Some trigger a Scryfall re-resolve.
interface PutBody {
  qty?: number;
  foil?: boolean;
  language?: string;
  set?: string;              // re-resolve
  collectorNumber?: string;  // re-resolve
  manualFromPrice?: number | null;
  manualTrendPrice?: number | null;
}

export const PUT = withAuthParams<{ id: string; cardId: string }>(
  async (req, _session, { id, cardId }) => {
    const collectionOid = parseId(id);
    const cardOid = parseId(cardId);
    if (!collectionOid || !cardOid) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const body = (await req.json()) as PutBody;
    const db = await getDb();
    const card = await db
      .collection<AppraiserCardDoc>(COL_APPRAISER_CARDS)
      .findOne({ _id: cardOid, collectionId: collectionOid });
    if (!card) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const update: Partial<AppraiserCardDoc> = {};
    const needsResolve =
      (body.set !== undefined && body.set !== card.set) ||
      (body.collectorNumber !== undefined && body.collectorNumber !== card.collectorNumber) ||
      (body.foil !== undefined && body.foil !== card.foil);

    if (typeof body.qty === "number" && body.qty > 0) update.qty = Math.floor(body.qty);
    if (typeof body.language === "string" && body.language.trim()) update.language = body.language.trim();

    if (body.manualFromPrice !== undefined) {
      update.fromPrice = body.manualFromPrice;
      update.status = "manual";
    }
    if (body.manualTrendPrice !== undefined) {
      update.trendPrice = body.manualTrendPrice;
      update.status = "manual";
    }

    if (needsResolve) {
      const newFoil = body.foil ?? card.foil;
      try {
        const resolved = await resolveScryfall({
          name: card.name,
          set: body.set ?? card.set,
          collectorNumber: body.collectorNumber ?? card.collectorNumber,
          foil: newFoil,
        });
        Object.assign(update, {
          set: resolved.set,
          setName: resolved.setName,
          collectorNumber: resolved.collectorNumber,
          scryfallId: resolved.scryfallId,
          cardmarket_id: resolved.cardmarketId,
          cardmarketUrl: resolved.cardmarketUrl,
          imageUrl: resolved.imageUrl,
          trendPrice: resolved.trendPrice,
          fromPrice: null,
          cm_prices: null,
          pricedAt: null,
          foil: resolved.foilOnly ? true : newFoil,
          status: "priced",
        } satisfies Partial<AppraiserCardDoc>);
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "resolve failed" },
          { status: 502 }
        );
      }
    }

    await db
      .collection<AppraiserCardDoc>(COL_APPRAISER_CARDS)
      .updateOne({ _id: cardOid }, { $set: update });
    await db
      .collection<AppraiserCollectionDoc>(COL_APPRAISER_COLLECTIONS)
      .updateOne({ _id: collectionOid }, { $set: { updatedAt: new Date() } });

    const updated = await db
      .collection<AppraiserCardDoc>(COL_APPRAISER_CARDS)
      .findOne({ _id: cardOid });

    return { card: updated ? cardDocToPayload(updated) : null };
  },
  "appraiser-card-update"
);

export const DELETE = withAuthParams<{ id: string; cardId: string }>(
  async (_req, _session, { id, cardId }) => {
    const collectionOid = parseId(id);
    const cardOid = parseId(cardId);
    if (!collectionOid || !cardOid) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const db = await getDb();
    const result = await db
      .collection<AppraiserCardDoc>(COL_APPRAISER_CARDS)
      .deleteOne({ _id: cardOid, collectionId: collectionOid });
    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await db
      .collection<AppraiserCollectionDoc>(COL_APPRAISER_COLLECTIONS)
      .updateOne({ _id: collectionOid }, { $set: { updatedAt: new Date() } });

    return { ok: true };
  },
  "appraiser-card-delete"
);
