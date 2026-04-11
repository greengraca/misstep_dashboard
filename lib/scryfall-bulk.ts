// lib/scryfall-bulk.ts
//
// Pure helpers for Scryfall bulk-data ingestion. The functions in this file do
// not touch MongoDB — they accept a `fetch`-like callable and return plain
// data, which keeps them unit-testable without network or DB.

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface EvCardDoc {
  scryfall_id: string;
  set: string;
  name: string;
  collector_number: string;
  rarity: string;
  price_eur: number | null;
  price_eur_foil: number | null;
  finishes: string[];
  booster: boolean;
  image_uri: string | null;
  cardmarket_id: number | null;
  type_line: string;
  frame_effects: string[];
  promo_types: string[];
  border_color: string;
  treatment: string;
  colors: string[];
  color_identity: string[];
  cmc: number;
  released_at: string;
  layout: string;
  prices_updated_at: string;
  synced_at: string;
}

function deriveCardTreatment(card: any): string {
  if (card.border_color === "borderless") return "borderless";
  const fe: string[] = card.frame_effects || [];
  if (fe.includes("showcase")) return "showcase";
  if (fe.includes("extendedart")) return "extended_art";
  const pt: string[] = card.promo_types || [];
  if (pt.includes("textured")) return "textured";
  if (pt.includes("serialized")) return "serialized";
  if (pt.includes("galaxyfoil")) return "galaxy_foil";
  if (pt.includes("surgefoil")) return "surge_foil";
  return "normal";
}

export interface ScryfallBulkEntry {
  object: "bulk_data";
  id: string;
  type: string;
  updated_at: string;
  size: number;
  download_uri: string;
}

export interface ScryfallBulkIndex {
  data: ScryfallBulkEntry[];
}

export function findDefaultCardsEntry(index: ScryfallBulkIndex): ScryfallBulkEntry {
  const entry = index.data.find((e) => e.type === "default_cards");
  if (!entry) throw new Error("Scryfall bulk-data index has no default_cards entry");
  return entry;
}

export function parseScryfallCardToDoc(card: any, nowIso: string): EvCardDoc {
  const imageUri =
    card.image_uris?.small ??
    card.card_faces?.[0]?.image_uris?.small ??
    null;

  const priceEur = card.prices?.eur ? parseFloat(card.prices.eur) : null;
  const priceEurFoil = card.prices?.eur_foil ? parseFloat(card.prices.eur_foil) : null;

  return {
    scryfall_id: card.id,
    set: card.set,
    name: card.name,
    collector_number: card.collector_number,
    rarity: card.rarity,
    price_eur: priceEur,
    price_eur_foil: priceEurFoil,
    finishes: card.finishes ?? [],
    booster: card.booster ?? false,
    image_uri: imageUri,
    cardmarket_id: card.cardmarket_id ?? null,
    type_line: card.type_line ?? "",
    frame_effects: card.frame_effects ?? [],
    promo_types: card.promo_types ?? [],
    border_color: card.border_color ?? "black",
    treatment: deriveCardTreatment(card),
    colors: card.colors ?? [],
    color_identity: card.color_identity ?? [],
    cmc: typeof card.cmc === "number" ? card.cmc : 0,
    released_at: card.released_at ?? "9999-12-31",
    layout: card.layout ?? "normal",
    prices_updated_at: nowIso,
    synced_at: nowIso,
  };
}

const SCRYFALL_BASE = "https://api.scryfall.com";
const SCRYFALL_UA = "MISSTEP/1.0";

export async function fetchBulkDataIndex(
  fetchFn: typeof fetch = fetch
): Promise<ScryfallBulkIndex> {
  const res = await fetchFn(`${SCRYFALL_BASE}/bulk-data`, {
    headers: { "User-Agent": SCRYFALL_UA, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Scryfall bulk-data index fetch failed: ${res.status}`);
  }
  return (await res.json()) as ScryfallBulkIndex;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const StreamArray = require("stream-json/streamers/StreamArray");
import { Readable } from "node:stream";

export interface StreamBulkCardsOptions {
  batchSize: number;
  onBatch: (batch: EvCardDoc[]) => Promise<void>;
  now?: string;
}

export async function streamBulkCards(
  body: ReadableStream<Uint8Array>,
  opts: StreamBulkCardsOptions
): Promise<{ processed: number }> {
  const nowIso = opts.now ?? new Date().toISOString();
  // Adapt the Web ReadableStream (from fetch().body) to a Node Readable.
  // Node 18+ provides Readable.fromWeb. The cast silences a variance error
  // between lib.dom and node stream types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodeStream = Readable.fromWeb(body as any);

  // StreamArray.withParser() returns a single transform that includes the
  // JSON tokenizer AND the array-element streamer — do NOT chain a separate
  // parser() before it or each element will be double-parsed.
  const pipeline = nodeStream.pipe(StreamArray.withParser());

  let batch: EvCardDoc[] = [];
  let processed = 0;

  for await (const chunk of pipeline as AsyncIterable<{ key: number; value: unknown }>) {
    const doc = parseScryfallCardToDoc(chunk.value, nowIso);
    batch.push(doc);
    processed++;
    if (batch.length >= opts.batchSize) {
      await opts.onBatch(batch);
      batch = [];
    }
  }
  if (batch.length > 0) {
    await opts.onBatch(batch);
  }
  return { processed };
}
