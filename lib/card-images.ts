import { getDb } from "@/lib/mongodb";
import { COLLECTION_PREFIX } from "@/lib/constants";
import { getSetByCardmarketName } from "@/lib/scryfall-sets";

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

interface ScryfallCardResult {
  id: string;
  name: string;
  set: string;
  image: string;
  collector_number?: string;
}

async function fetchFromScryfall(
  name: string,
  setCode?: string
): Promise<ScryfallCardResult | null> {
  try {
    const params = new URLSearchParams({ exact: name });
    if (setCode) params.set("set", setCode);
    const res = await fetch(
      `https://api.scryfall.com/cards/named?${params.toString()}`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) return null;
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
    if (!image || !card.id || !card.set) return null;
    return {
      id: card.id,
      name: card.name || name,
      set: card.set,
      image,
      collector_number: card.collector_number,
    };
  } catch {
    return null;
  }
}

// Stock listings carry the Cardmarket long set name ("Commander 2014"),
// while Scryfall and the local dashboard_cards cache key by the short code
// ("c14"). Resolve the code first, fall back to name-only lookup when the
// Cardmarket name doesn't match any Scryfall set.
export async function getCardImage(
  name: string,
  set?: string
): Promise<CardImageResult> {
  if (!name) return { image: null, source: "notfound" };
  const db = await getDb();
  const col = db.collection<CachedCardDoc>(COL_CARDS);

  const setMeta = set ? await getSetByCardmarketName(set) : null;
  const setCode = setMeta?.code;

  const cached = setCode
    ? await col.findOne({ name, set: setCode, image_uri: { $ne: null } })
    : await col.findOne({ name, image_uri: { $ne: null } });
  if (cached?.image_uri) {
    return { image: cached.image_uri, source: "cache" };
  }

  let card = setCode ? await fetchFromScryfall(name, setCode) : null;
  if (!card) card = await fetchFromScryfall(name);
  if (!card) return { image: null, source: "notfound" };

  await col.updateOne(
    { scryfall_id: card.id },
    {
      $set: {
        scryfall_id: card.id,
        name: card.name,
        set: card.set,
        collector_number: card.collector_number,
        image_uri: card.image,
        synced_at: new Date().toISOString(),
      },
    },
    { upsert: true }
  );

  return { image: card.image, source: "scryfall" };
}
