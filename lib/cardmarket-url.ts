// Cardmarket URL builder. Their slug rules differ from Scryfall's set names
// in a few systematic ways — most notably they put "Commander-" as a PREFIX
// instead of suffix for commander supplemental sets, so Scryfall's
// "Aetherdrift Commander" becomes Cardmarket's "Commander-Aetherdrift".
//
// Use buildCardmarketUrl() everywhere we link to a CM single. Direct slug
// usage (e.g. inline in a component) loses the normalisation and produces
// 404s for commander-set cards.

/**
 * Apply Cardmarket-specific naming quirks before slugification:
 *   - "<X> Commander" → "Commander <X>" (commander supplemental sets)
 * Add new rules here as they're discovered; one source of truth.
 */
function normalizeSetNameForCardmarket(setName: string): string {
  const m = setName.match(/^(.+) Commander$/);
  if (m) return `Commander ${m[1]}`;
  return setName;
}

/**
 * Cardmarket's slug rule: collapse runs of non-alphanumerics to a single dash.
 * Apostrophes are an exception — CM drops them entirely rather than replacing
 * with a dash, so `Proft's` becomes `Profts` not `Proft-s`. Strip those before
 * the dash-collapse pass.
 */
function cardmarketSlug(input: string): string {
  return input
    .replace(/['’]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Promo-set collector numbers carry a trailing letter that tells you which
 * variant: `s` = stamped/prerelease (CM `-V1`), `p` = promo-pack (CM `-V2`).
 * This holds across PONE/PMKM/PXLN/etc. promo supplements.
 *
 * Returns the suffix to append to a CM slug URL ("-V1", "-V2", or "" when
 * the CN doesn't match a known suffix).
 */
function inferCardmarketVariantSuffix(collectorNumber?: string): string {
  if (!collectorNumber) return "";
  const m = collectorNumber.match(/(\d+)([a-zA-Z])$/);
  if (!m) return "";
  switch (m[2].toLowerCase()) {
    case "s": return "-V1";
    case "p": return "-V2";
    default: return "";
  }
}

/**
 * Sets where a slug-built URL can never be right because the cards route to
 * heterogeneous parent CM products (e.g. PLST cards may go to Mystery
 * Booster, Multiverse Legends, or various reprint sets — there's no single
 * `/Singles/<plst-slug>/` page on CM). For these, only an `idProduct` URL
 * is trustworthy; without one, fall back to leaving Scryfall's search URL.
 */
const KNOWN_CM_BAD_SET_CODES = new Set<string>([
  "plst", // The List
]);

/**
 * True when Scryfall's `purchase_uris.cardmarket` is the search-page fallback
 * (Scryfall doesn't know the CM product, so it hands off to a search). We
 * treat these as "no useful URL" and try to build a slug ourselves.
 */
export function isCardmarketSearchUrl(raw: string | undefined | null): boolean {
  if (!raw) return false;
  try {
    const u = new URL(raw);
    return /\/Products\/Search/i.test(u.pathname);
  } catch {
    return false;
  }
}

/**
 * Per-card `cardmarket_id` overrides for cases where Scryfall's mapping
 * points to the wrong Cardmarket product page. Applied at sync time
 * (`lib/ev.ts:syncCards` and `lib/scryfall-bulk.ts:parseScryfallCardToDoc`)
 * so the corrected ID persists in MongoDB — this lets the browser extension
 * match against the right card when it scrapes a Cardmarket page.
 *
 * Keyed by `set_code:collector_number`. Also exposed alongside the matching
 * URL override below — fixing both at once is a belt-and-suspenders approach
 * so the UI link AND the extension-sync both route to the correct printing.
 *
 * Canonical case: mh3 #381 — Scryfall gives `cardmarket_id=774085` which
 * resolves on Cardmarket to `/Extras/Emrakul-the-World-Anew-V4` (the
 * serialized 1-of-250 version, Collector Booster exclusive). The real
 * non-serialized V1 page has `idProduct=759807`. See notes/ev/mh3.md for
 * the full cross-printing misattribution story.
 */
export const MANUAL_CARDMARKET_ID_OVERRIDES: Record<string, number> = {
  "mh3:381": 759807,
};

/**
 * Returns the corrected `cardmarket_id` for a card, or `undefined` when no
 * override exists (caller falls through to Scryfall's value).
 */
export function getCardmarketIdOverride(setCode: string | undefined | null, collectorNumber: string | undefined | null): number | undefined {
  if (!setCode || !collectorNumber) return undefined;
  return MANUAL_CARDMARKET_ID_OVERRIDES[`${setCode}:${collectorNumber}`];
}

/**
 * Per-card URL overrides — used by `buildCardmarketUrl` as a defense-in-depth
 * short-circuit. Redundant once `MANUAL_CARDMARKET_ID_OVERRIDES` has an entry
 * (the corrected idProduct would already redirect to the right slug), but
 * kept explicit so the UI link doesn't silently depend on Cardmarket's
 * server-side redirect behaviour.
 */
const MANUAL_CARDMARKET_URLS: Record<string, string> = {
  "mh3:381": "https://www.cardmarket.com/en/Magic/Products/Singles/Modern-Horizons-3-Extras/Emrakul-the-World-Anew-V1",
};

export function buildCardmarketUrl(
  setName: string | undefined,
  cardName: string,
  isFoil: boolean,
  cardmarketId?: number | null,
  setCode?: string,
  collectorNumber?: string,
): string | null {
  // Per-card override takes precedence — used when Scryfall's cardmarket_id
  // is known-wrong for a specific printing.
  if (setCode && collectorNumber) {
    const override = MANUAL_CARDMARKET_URLS[`${setCode}:${collectorNumber}`];
    if (override) return isFoil ? `${override}?isFoil=Y` : override;
  }
  // Preferred: deep-link to the exact printing via Cardmarket's idProduct
  // query. The set/name slug only resolves to the base printing — borderless,
  // retro frame, extras, etc. live at different URLs (e.g. "...-Extras/Card-V1")
  // that we can't reliably guess. cardmarket_id is the unique key Scryfall
  // exposes for this purpose.
  if (cardmarketId != null) {
    // Mirrors Scryfall's `purchase_uris.cardmarket` format. The `idProduct`
    // lookup is what makes the URL deep-link to the exact printing.
    const base = `https://www.cardmarket.com/en/Magic/Products?idProduct=${cardmarketId}`;
    return isFoil ? `${base}&isFoil=Y` : base;
  }
  if (!setName) return null;
  // Sets in KNOWN_CM_BAD_SET_CODES have no reliable slug — without an
  // idProduct (handled above) we can't build a working URL. Return null so
  // the caller keeps Scryfall's search-URL fallback rather than producing a
  // broken `/Singles/The-List/...` link that 404s.
  if (setCode && KNOWN_CM_BAD_SET_CODES.has(setCode.toLowerCase())) return null;
  const normalizedSet = normalizeSetNameForCardmarket(setName);
  const variantSuffix = inferCardmarketVariantSuffix(collectorNumber);
  const base = `https://www.cardmarket.com/en/Magic/Products/Singles/${cardmarketSlug(normalizedSet)}/${cardmarketSlug(cardName)}${variantSuffix}`;
  return isFoil ? `${base}?isFoil=Y` : base;
}
