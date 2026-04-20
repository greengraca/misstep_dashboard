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
  try { return new ObjectId(id); } catch { return null; }
}

export const POST = withAuthParams<{ id: string }>(async (_req, _session, { id }) => {
  const oid = parseId(id);
  if (!oid) {
    return new Response(JSON.stringify({ error: "Invalid id" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      };

      try {
        const db = await getDb();
        const cards = await db
          .collection<AppraiserCardDoc>(COL_APPRAISER_CARDS)
          .find({ collectionId: oid })
          .toArray();

        const total = cards.length;
        send({ total, processed: 0 });

        let refreshed = 0;
        let failed = 0;
        let processed = 0;
        for (const card of cards) {
          try {
            const resolved = await resolveScryfall({
              name: card.name,
              set: card.set,
              collectorNumber: card.collectorNumber,
              foil: card.foil,
              scryfallId: card.scryfallId || undefined,
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
          processed++;
          send({ total, processed });
        }

        await db
          .collection<AppraiserCollectionDoc>(COL_APPRAISER_COLLECTIONS)
          .updateOne({ _id: oid }, { $set: { updatedAt: new Date() } });

        send({ done: true, refreshed, failed, total });
      } catch (err) {
        send({ error: err instanceof Error ? err.message : "refresh failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" },
  });
}, "appraiser-collection-refresh");
