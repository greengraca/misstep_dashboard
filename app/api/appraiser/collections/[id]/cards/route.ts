import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { withAuthParams } from "@/lib/api-helpers";
import { getDb } from "@/lib/mongodb";
import { logActivity } from "@/lib/activity";
import { resolveScryfall } from "@/lib/appraiser/scryfall-resolve";
import {
  COL_APPRAISER_COLLECTIONS,
  COL_APPRAISER_CARDS,
  type AppraiserCard,
  type AppraiserCardDoc,
  type AppraiserCollectionDoc,
  type CardInput,
} from "@/lib/appraiser/types";

function parseId(id: string): ObjectId | null {
  try {
    return new ObjectId(id);
  } catch {
    return null;
  }
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

export const POST = withAuthParams<{ id: string }>(async (req, session, { id }) => {
  const oid = parseId(id);
  if (!oid) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = (await req.json()) as { cards?: unknown };
  if (!Array.isArray(body.cards) || body.cards.length === 0) {
    return NextResponse.json({ error: "cards array is required" }, { status: 400 });
  }
  const inputs = body.cards as CardInput[];

  const db = await getDb();
  const collectionExists = await db
    .collection<AppraiserCollectionDoc>(COL_APPRAISER_COLLECTIONS)
    .findOne({ _id: oid }, { projection: { _id: 1 } });
  if (!collectionExists) return NextResponse.json({ error: "Collection not found" }, { status: 404 });

  const now = new Date();
  const insertedCards: AppraiserCardDoc[] = [];
  const mergedCardIds: string[] = [];
  const errors: Array<{ input: CardInput; error: string }> = [];

  for (const input of inputs) {
    const name = (input.name ?? "").trim();
    if (!name) {
      errors.push({ input, error: "empty name" });
      continue;
    }
    const qty = Math.max(1, Number(input.qty) || 1);
    const foil = !!input.foil;
    const language = (input.language ?? "English").trim() || "English";

    let resolved;
    try {
      resolved = await resolveScryfall({
        name,
        set: input.set,
        collectorNumber: input.collectorNumber,
        foil,
      });
    } catch (err) {
      errors.push({ input, error: err instanceof Error ? err.message : "resolve failed" });
      continue;
    }

    const dedupFilter = {
      collectionId: oid,
      name: resolved.name,
      set: resolved.set,
      collectorNumber: resolved.collectorNumber,
      foil,
    };
    const existing = await db
      .collection<AppraiserCardDoc>(COL_APPRAISER_CARDS)
      .findOne(dedupFilter);

    if (existing) {
      await db
        .collection<AppraiserCardDoc>(COL_APPRAISER_CARDS)
        .updateOne({ _id: existing._id }, { $inc: { qty } });
      mergedCardIds.push(String(existing._id));
      continue;
    }

    const doc: Omit<AppraiserCardDoc, "_id"> = {
      collectionId: oid,
      name: resolved.name,
      set: resolved.set,
      setName: resolved.setName,
      collectorNumber: resolved.collectorNumber,
      language,
      foil: resolved.foilOnly ? true : foil,
      qty,
      scryfallId: resolved.scryfallId,
      cardmarket_id: resolved.cardmarketId,
      cardmarketUrl: resolved.cardmarketUrl,
      imageUrl: resolved.imageUrl,
      trendPrice: resolved.trendPrice,
      fromPrice: null,
      pricedAt: null,
      cm_prices: null,
      status: "priced",
      createdAt: now,
    };

    const res = await db
      .collection<Omit<AppraiserCardDoc, "_id">>(COL_APPRAISER_CARDS)
      .insertOne(doc);
    insertedCards.push({ _id: res.insertedId, ...doc } as AppraiserCardDoc);
  }

  // Bump collection updatedAt if anything landed
  if (insertedCards.length || mergedCardIds.length) {
    await db
      .collection<AppraiserCollectionDoc>(COL_APPRAISER_COLLECTIONS)
      .updateOne({ _id: oid }, { $set: { updatedAt: now } });
  }

  logActivity(
    "update",
    "appraiser_collection",
    id,
    {
      event: "cards.add",
      added: insertedCards.length,
      merged: mergedCardIds.length,
      errors: errors.length,
    },
    session.user?.id ?? "system",
    session.user?.name ?? "unknown",
  );

  return {
    cards: insertedCards.map(cardDocToPayload),
    mergedCardIds,
    errors,
  };
}, "appraiser-cards-add");
