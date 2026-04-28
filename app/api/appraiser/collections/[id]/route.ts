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
import { hydrateAppraiserCards, computeCollectionTotals } from "@/lib/appraiser/ev-join";

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

  const cardDocs = await db
    .collection<AppraiserCardDoc>(COL_APPRAISER_CARDS)
    .find({ collectionId: oid })
    .sort({ createdAt: 1 })
    .toArray();

  // Hydrate each card's prices from dashboard_ev_cards at read time — if the
  // extension has ever scraped this card's CM product page, the from/trend/avg
  // values live there and flow in without needing a per-card click.
  const cards = await hydrateAppraiserCards(db, cardDocs);
  const totals = computeCollectionTotals(cards);

  const payload: AppraiserCollection = {
    _id: String(c._id),
    name: c.name,
    notes: c.notes ?? "",
    cardCount: totals.cardCount,
    totalTrend: totals.totalTrend,
    totalFrom: totals.totalFrom,
    bulkExcludeEnabled: c.bulkExcludeEnabled ?? true,
    bulkThreshold: c.bulkThreshold ?? 1,
    bulkRate: c.bulkRate ?? 0,
    undercutEnabled: c.undercutEnabled ?? false,
    undercutPercent: c.undercutPercent ?? 20,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };

  return { collection: payload, cards };
}, "appraiser-collection-get");

export const PUT = withAuthParams<{ id: string }>(async (req, session, { id }) => {
  const oid = parseId(id);
  if (!oid) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = (await req.json()) as {
    name?: unknown;
    notes?: unknown;
    bulkExcludeEnabled?: unknown;
    bulkThreshold?: unknown;
    bulkRate?: unknown;
    undercutEnabled?: unknown;
    undercutPercent?: unknown;
  };
  const update: Partial<AppraiserCollectionDoc> = { updatedAt: new Date() };
  const db = await getDb();

  if (typeof body.name === "string") {
    const n = body.name.trim();
    if (!n) return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    update.name = n;
  }
  if (typeof body.notes === "string") update.notes = body.notes;

  if (body.bulkExcludeEnabled !== undefined) {
    if (typeof body.bulkExcludeEnabled !== "boolean") {
      return NextResponse.json({ error: "bulkExcludeEnabled must be a boolean" }, { status: 400 });
    }
    update.bulkExcludeEnabled = body.bulkExcludeEnabled;
  }
  if (body.bulkThreshold !== undefined) {
    if (typeof body.bulkThreshold !== "number" || !Number.isFinite(body.bulkThreshold) || body.bulkThreshold < 0 || body.bulkThreshold > 1000) {
      return NextResponse.json({ error: "bulkThreshold must be a finite number between 0 and 1000" }, { status: 400 });
    }
    update.bulkThreshold = body.bulkThreshold;
  }
  if (body.bulkRate !== undefined) {
    if (typeof body.bulkRate !== "number" || !Number.isFinite(body.bulkRate) || body.bulkRate < 0) {
      return NextResponse.json({ error: "bulkRate must be a finite non-negative number" }, { status: 400 });
    }
    const effectiveThreshold =
      update.bulkThreshold !== undefined
        ? update.bulkThreshold
        : (await db.collection<AppraiserCollectionDoc>(COL_APPRAISER_COLLECTIONS).findOne({ _id: oid }))?.bulkThreshold ?? 1;
    if (body.bulkRate > effectiveThreshold) {
      return NextResponse.json({ error: "bulkRate cannot exceed bulkThreshold" }, { status: 400 });
    }
    update.bulkRate = body.bulkRate;
  }
  if (body.undercutEnabled !== undefined) {
    if (typeof body.undercutEnabled !== "boolean") {
      return NextResponse.json({ error: "undercutEnabled must be a boolean" }, { status: 400 });
    }
    update.undercutEnabled = body.undercutEnabled;
  }
  if (body.undercutPercent !== undefined) {
    if (typeof body.undercutPercent !== "number" || !Number.isFinite(body.undercutPercent) || body.undercutPercent < 0 || body.undercutPercent > 100) {
      return NextResponse.json({ error: "undercutPercent must be a finite number between 0 and 100" }, { status: 400 });
    }
    update.undercutPercent = body.undercutPercent;
  }

  const result = await db
    .collection<AppraiserCollectionDoc>(COL_APPRAISER_COLLECTIONS)
    .updateOne({ _id: oid }, { $set: update });
  if (result.matchedCount === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updateBits = [
    update.name !== undefined ? `name="${update.name}"` : null,
    update.notes !== undefined ? `notes=${update.notes.length} chars` : null,
    update.bulkExcludeEnabled !== undefined ? `bulkExcludeEnabled=${update.bulkExcludeEnabled}` : null,
    update.bulkThreshold !== undefined ? `bulkThreshold=${update.bulkThreshold}` : null,
    update.bulkRate !== undefined ? `bulkRate=${update.bulkRate}` : null,
    update.undercutEnabled !== undefined ? `undercutEnabled=${update.undercutEnabled}` : null,
    update.undercutPercent !== undefined ? `undercutPercent=${update.undercutPercent}` : null,
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
