import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { withAuthParams, withAuthReadParams } from "@/lib/api-helpers";
import { getDb } from "@/lib/mongodb";
import { logActivity } from "@/lib/activity";
import {
  COL_APPRAISER_COLLECTIONS,
  COL_APPRAISER_CARDS,
  type AppraiserCard,
  type AppraiserCardDoc,
  type AppraiserCollection,
  type AppraiserCollectionDoc,
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

export const GET = withAuthReadParams<{ id: string }>(async (_req, { id }) => {
  const oid = parseId(id);
  if (!oid) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const db = await getDb();
  const c = await db
    .collection<AppraiserCollectionDoc>(COL_APPRAISER_COLLECTIONS)
    .findOne({ _id: oid });
  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const cards = await db
    .collection<AppraiserCardDoc>(COL_APPRAISER_CARDS)
    .find({ collectionId: oid })
    .sort({ createdAt: 1 })
    .toArray();

  const totals = cards.reduce(
    (acc, card) => {
      acc.totalTrend += (card.trendPrice ?? 0) * card.qty;
      acc.totalFrom += (card.fromPrice ?? 0) * card.qty;
      acc.cardCount += card.qty;
      return acc;
    },
    { cardCount: 0, totalTrend: 0, totalFrom: 0 }
  );

  const payload: AppraiserCollection = {
    _id: String(c._id),
    name: c.name,
    notes: c.notes ?? "",
    cardCount: totals.cardCount,
    totalTrend: totals.totalTrend,
    totalFrom: totals.totalFrom,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };

  return { collection: payload, cards: cards.map(cardDocToPayload) };
}, "appraiser-collection-get");

export const PUT = withAuthParams<{ id: string }>(async (req, session, { id }) => {
  const oid = parseId(id);
  if (!oid) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = (await req.json()) as { name?: unknown; notes?: unknown };
  const update: Partial<AppraiserCollectionDoc> = { updatedAt: new Date() };
  if (typeof body.name === "string") {
    const n = body.name.trim();
    if (!n) return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    update.name = n;
  }
  if (typeof body.notes === "string") update.notes = body.notes;

  const db = await getDb();
  const result = await db
    .collection<AppraiserCollectionDoc>(COL_APPRAISER_COLLECTIONS)
    .updateOne({ _id: oid }, { $set: update });
  if (result.matchedCount === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updateBits = [
    update.name !== undefined ? `name="${update.name}"` : null,
    update.notes !== undefined ? `notes=${update.notes.length} chars` : null,
  ].filter(Boolean).join(", ");
  logActivity(
    "update",
    "appraiser_collection",
    id,
    `Updated appraiser collection (${updateBits || "no-op"})`,
    session.user?.id ?? "system",
    session.user?.name ?? "unknown",
  );

  return { ok: true };
}, "appraiser-collection-update");

export const DELETE = withAuthParams<{ id: string }>(async (_req, session, { id }) => {
  const oid = parseId(id);
  if (!oid) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const db = await getDb();
  const collection = await db
    .collection<AppraiserCollectionDoc>(COL_APPRAISER_COLLECTIONS)
    .findOne({ _id: oid });
  if (!collection) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const cardsResult = await db
    .collection(COL_APPRAISER_CARDS)
    .deleteMany({ collectionId: oid });
  await db
    .collection<AppraiserCollectionDoc>(COL_APPRAISER_COLLECTIONS)
    .deleteOne({ _id: oid });

  logActivity(
    "delete",
    "appraiser_collection",
    id,
    `Deleted appraiser collection "${collection.name}" (${cardsResult.deletedCount ?? 0} cards cascaded)`,
    session.user?.id ?? "system",
    session.user?.name ?? "unknown",
  );

  return { ok: true, cardsRemoved: cardsResult.deletedCount ?? 0 };
}, "appraiser-collection-delete");
