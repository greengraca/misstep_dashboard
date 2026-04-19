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

export function buildCardmarketUrl(setName: string | undefined, cardName: string, isFoil: boolean): string | null {
  if (!setName) return null;
  const normalizedSet = normalizeSetNameForCardmarket(setName);
  const base = `https://www.cardmarket.com/en/Magic/Products/Singles/${cardmarketSlug(normalizedSet)}/${cardmarketSlug(cardName)}`;
  return isFoil ? `${base}?isFoil=Y` : base;
}
