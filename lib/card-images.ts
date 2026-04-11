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

// The stock collection stores Cardmarket's long set name (e.g. "Commander 2014"),
// but Scryfall's API and the local dashboard_cards cache both key by the short
// set code (e.g. "c14"). Matching on set would always miss, so we look up by
// name only and accept the default printing — fine for a hover preview.
export async function getCardImage(name: string): Promise<CardImageResult> {
  if (!name) return { image: null, source: "notfound" };
  const db = await getDb();
  const col = db.collection<CachedCardDoc>(COL_CARDS);

  const cached = await col.findOne({ name, image_uri: { $ne: null } });
  if (cached?.image_uri) {
    return { image: cached.image_uri, source: "cache" };
  }

  try {
    const url = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`;
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

    if (card.id && card.set) {
      await col.updateOne(
        { scryfall_id: card.id },
        {
          $set: {
            scryfall_id: card.id,
            name: card.name || name,
            set: card.set,
            collector_number: card.collector_number,
            image_uri: image,
            synced_at: new Date().toISOString(),
          },
        },
        { upsert: true }
      );
    }

    return { image, source: "scryfall" };
  } catch {
    return { image: null, source: "notfound" };
  }
}
