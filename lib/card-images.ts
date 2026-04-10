import { getDb } from "@/lib/mongodb";
import { COLLECTION_PREFIX } from "@/lib/constants";

const COL_CARDS = `${COLLECTION_PREFIX}cards`;

export interface CardImageResult {
  image: string | null;
  source: "cache" | "scryfall" | "notfound";
}

interface CachedCardDoc {
  scryfall_id?: string;
  name?: string;
  set?: string;
  image_uri?: string | null;
  collector_number?: string;
  synced_at?: string;
}

/**
 * Look up a card image for the stock tab hover preview.
 * Tries the local dashboard_cards cache first, falls back to Scryfall.
 */
export async function getCardImage(name: string, set: string): Promise<CardImageResult> {
  if (!name || !set) return { image: null, source: "notfound" };
  const db = await getDb();
  const col = db.collection<CachedCardDoc>(COL_CARDS);

  const cached = await col.findOne({ name, set });
  if (cached?.image_uri) {
    return { image: cached.image_uri, source: "cache" };
  }

  try {
    const url = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&set=${encodeURIComponent(set)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return { image: null, source: "notfound" };
    const card = (await res.json()) as {
      id?: string;
      name?: string;
      set?: string;
      collector_number?: string;
      image_uris?: { small?: string };
      card_faces?: Array<{ image_uris?: { small?: string } }>;
    };
    const image =
      card.image_uris?.small ||
      card.card_faces?.[0]?.image_uris?.small ||
      null;
    if (!image) return { image: null, source: "notfound" };

    await col.updateOne(
      { name, set },
      {
        $set: {
          scryfall_id: card.id,
          name: card.name || name,
          set: card.set || set,
          collector_number: card.collector_number,
          image_uri: image,
          synced_at: new Date().toISOString(),
        },
      },
      { upsert: true }
    );

    return { image, source: "scryfall" };
  } catch {
    return { image: null, source: "notfound" };
  }
}
