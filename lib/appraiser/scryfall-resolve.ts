import type { ScryfallPrinting, ScryfallResolveResult } from "./types";

const SCRYFALL_DELAY_MS = 150;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface ScryfallCard {
  id: string;
  name: string;
  set: string;
  set_name: string;
  collector_number?: string;
  cardmarket_id?: number | null;
  purchase_uris?: { cardmarket?: string };
  image_uris?: { normal?: string };
  card_faces?: Array<{ image_uris?: { normal?: string } }>;
  prices?: { eur?: string | null; eur_foil?: string | null };
}

async function scryfallFetch<T>(url: string, retries = 2): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    await sleep(SCRYFALL_DELAY_MS);
    const res = await fetch(url);
    if (res.ok) return (await res.json()) as T;
    if (res.status === 404) throw new Error(`Card not found on Scryfall (${res.status})`);
    if (res.status === 429 && i < retries) { await sleep(1000); continue; }
    if (i >= retries) throw new Error(`Scryfall error ${res.status}`);
  }
  throw new Error("Scryfall retries exhausted");
}

function getImage(card: ScryfallCard): string {
  return card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal || "";
}

function parsePrice(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const n = parseFloat(raw);
  return isNaN(n) ? null : n;
}

function buildResult(
  selected: ScryfallCard,
  foil: boolean,
  allPrintings: ScryfallCard[],
): ScryfallResolveResult {
  const priceKey: "eur" | "eur_foil" = foil ? "eur_foil" : "eur";
  const fallbackKey: "eur" | "eur_foil" = foil ? "eur" : "eur_foil";

  const printings: ScryfallPrinting[] = allPrintings.map((p) => ({
    set: p.set,
    setName: p.set_name,
    scryfallId: p.id,
    collectorNumber: p.collector_number ?? "",
    cardmarketId: p.cardmarket_id ?? null,
    cardmarketUrl: p.purchase_uris?.cardmarket ?? "",
    imageUrl: getImage(p),
    trendPrice: parsePrice(p.prices?.[priceKey]) ?? parsePrice(p.prices?.[fallbackKey]),
  }));

  const primary = parsePrice(selected.prices?.[priceKey]);
  const fallback = parsePrice(selected.prices?.[fallbackKey]);
  const trendPrice = primary ?? fallback;
  const foilOnly = primary === null && fallback !== null && priceKey === "eur";

  return {
    name: selected.name,
    set: selected.set,
    setName: selected.set_name,
    collectorNumber: selected.collector_number ?? "",
    scryfallId: selected.id,
    cardmarketId: selected.cardmarket_id ?? null,
    cardmarketUrl: selected.purchase_uris?.cardmarket ?? "",
    imageUrl: getImage(selected),
    trendPrice,
    foilOnly,
    printings,
  };
}

export async function resolveScryfall(args: {
  name: string;
  set?: string;
  collectorNumber?: string;
  foil?: boolean;
  scryfallId?: string;
}): Promise<ScryfallResolveResult> {
  const { name, set, collectorNumber, foil, scryfallId } = args;

  // Fastest path: direct Scryfall ID lookup. Skips fuzzy + printings search.
  if (scryfallId) {
    const direct = await scryfallFetch<ScryfallCard>(
      `https://api.scryfall.com/cards/${encodeURIComponent(scryfallId)}`
    );
    return buildResult(direct, foil ?? false, [direct]);
  }

  const trimmed = name.trim();
  if (!trimmed) throw new Error("Card name is required");

  let card: ScryfallCard | null = null;

  // Fast path: direct lookup by set + collector number — verify name matches
  if (set && collectorNumber) {
    try {
      const direct = await scryfallFetch<ScryfallCard>(
        `https://api.scryfall.com/cards/${encodeURIComponent(set.toLowerCase())}/${encodeURIComponent(collectorNumber)}`
      );
      if (direct.name.toLowerCase() === trimmed.toLowerCase()) card = direct;
      // name mismatch: fall through to fuzzy — user likely typed the wrong CN
    } catch (err) {
      // Only 404 (wrong set/CN combo) is an expected fall-through case.
      // Propagate everything else (429 exhaustion, network errors, etc).
      if (!(err instanceof Error && /\(404\)/.test(err.message))) throw err;
    }
  }

  if (!card) {
    try {
      card = await scryfallFetch<ScryfallCard>(
        `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(trimmed)}`
      );
    } catch (err) {
      if (err instanceof Error && /\(404\)/.test(err.message)) {
        throw new Error(`Card not found on Scryfall: "${trimmed}" (404)`);
      }
      throw err;
    }
  }

  const q = encodeURIComponent(`!"${card.name}"`);
  const printingsRes = await scryfallFetch<{ data: ScryfallCard[] }>(
    `https://api.scryfall.com/cards/search?q=${q}&unique=prints&order=released&dir=desc`
  ).catch(() => ({ data: [card as ScryfallCard] }));

  let selected: ScryfallCard = card;
  if (set && card.set.toLowerCase() !== set.toLowerCase()) {
    const match = printingsRes.data.find((p) => p.set.toLowerCase() === set.toLowerCase());
    if (match) selected = match;
  } else if (!set && collectorNumber) {
    const match = printingsRes.data.find((p) => p.collector_number === collectorNumber);
    if (match) selected = match;
  }

  return buildResult(selected, foil ?? false, printingsRes.data);
}
