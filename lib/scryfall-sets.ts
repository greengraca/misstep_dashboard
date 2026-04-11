const SCRYFALL_SETS_URL = "https://api.scryfall.com/sets";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface ScryfallSetMeta {
  code: string;
  name: string;
  iconSvgUri: string;
}

interface RawScryfallSet {
  code: string;
  name: string;
  icon_svg_uri: string;
}

interface ScryfallSetsResponse {
  data: RawScryfallSet[];
}

let cache: {
  byNormalizedName: Map<string, ScryfallSetMeta>;
  loadedAt: number;
} | null = null;

function normalize(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

async function loadSets(): Promise<void> {
  const res = await fetch(SCRYFALL_SETS_URL, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Scryfall /sets failed: ${res.status}`);
  const json = (await res.json()) as ScryfallSetsResponse;

  const byNormalizedName = new Map<string, ScryfallSetMeta>();
  for (const s of json.data) {
    const meta: ScryfallSetMeta = {
      code: s.code,
      name: s.name,
      iconSvgUri: s.icon_svg_uri,
    };
    byNormalizedName.set(normalize(s.name), meta);
  }
  cache = { byNormalizedName, loadedAt: Date.now() };
}

async function ensureCache(): Promise<void> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return;
  await loadSets();
}

export async function getSetByCardmarketName(
  name: string
): Promise<ScryfallSetMeta | null> {
  if (!name) return null;
  try {
    await ensureCache();
  } catch {
    return null;
  }
  return cache?.byNormalizedName.get(normalize(name)) ?? null;
}

export async function resolveStockSets(
  cardmarketNames: string[]
): Promise<Record<string, ScryfallSetMeta>> {
  try {
    await ensureCache();
  } catch {
    return {};
  }
  if (!cache) return {};
  const out: Record<string, ScryfallSetMeta> = {};
  for (const name of cardmarketNames) {
    const meta = cache.byNormalizedName.get(normalize(name));
    if (meta) out[name] = meta;
  }
  return out;
}
