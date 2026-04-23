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

/** Cardmarket's slug rule: collapse runs of non-alphanumerics to a single dash. */
function cardmarketSlug(input: string): string {
  return input.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
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
  const normalizedSet = normalizeSetNameForCardmarket(setName);
  const base = `https://www.cardmarket.com/en/Magic/Products/Singles/${cardmarketSlug(normalizedSet)}/${cardmarketSlug(cardName)}`;
  return isFoil ? `${base}?isFoil=Y` : base;
}
