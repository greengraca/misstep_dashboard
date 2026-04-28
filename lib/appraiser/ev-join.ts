// Joins appraiser card docs with the matching `dashboard_ev_cards` rows so
// live CM prices (from/trend/avg*) captured by the extension become visible
// on the appraiser without waiting for a per-card click-through.
//
// Recency rule for trend: we reuse `getEffectivePrice` from lib/ev-prices.ts,
// which picks the newer of Scryfall bulk (`price_eur`/`price_eur_foil`) and
// CM scrape (`cm_prices.{variant}.trend`). Matches the convention used by
// the Stock overpriced-listing pipeline.
//
// From price has no Scryfall equivalent — when ev_cards.cm_prices.{variant}.from
// exists, we surface it. Otherwise the appraiser card's own fromPrice (null
// by default, or whatever the legacy fan-out wrote) stays.

import type { Db } from "mongodb";
import { getEffectivePrice, type EffectivePriceInput } from "@/lib/ev-prices";
import { buildCardmarketUrl } from "@/lib/cardmarket-url";
import type {
  AppraiserCard,
  AppraiserCardDoc,
  CmPricesSnapshot,
  VelocityInfo,
} from "./types";

/**
 * Compute sales-cadence info from a CM chart. The chart is one entry per day
 * with ≥1 sale (CM's published "Avg Sell Price" series), so this counts
 * *active days*, not sale volume.
 *
 * Tier rules (informed by trader behavior — fast = move within a week
 * confidently; slow = capital lock-up risk):
 *   - fast    : ≥20 active days in the window AND last sale ≤2d ago
 *   - slow    : <5 active days   OR last sale ≥8d ago
 *   - medium  : everything between
 *   - unknown : variant has no chart at all (likely never scraped)
 *
 * Window is fixed at 30 days. CM's chart always represents the last 30
 * days regardless of how sparse the entries are — gaps mean "no sales that
 * day", not "outside the observable window". So a card with 2 sale-days
 * out of CM's 30-day window reads as `2/30`, communicating "very slow"
 * accurately rather than the misleading `2/6` you'd get from spanning only
 * the entries' date range.
 */
function computeVelocity(
  variant: { chart?: Array<{ date: string; avg_sell: number }>; updatedAt?: string } | undefined,
  variantKind: "foil" | "nonfoil",
  now: Date = new Date(),
): VelocityInfo | null {
  if (!variant) return null;
  const chartScrapedAt = variant.updatedAt ?? null;
  const chart = variant.chart ?? [];

  // Parse "DD.MM.YYYY" → ms timestamp at UTC midnight
  const parseEntry = (s: string): number | null => {
    const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!m) return null;
    const t = Date.parse(`${m[3]}-${m[2]}-${m[1]}T00:00:00Z`);
    return Number.isFinite(t) ? t : null;
  };

  const todayMs = now.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const cutoffMs = todayMs - 30 * dayMs;

  const inWindow: number[] = [];
  for (const e of chart) {
    const t = parseEntry(e.date);
    if (t != null && t >= cutoffMs && t <= todayMs) inWindow.push(t);
  }

  if (inWindow.length === 0) {
    // Variant exists but no chart entries in the window — could be "scraped,
    // genuinely zero sales in last 30d" or "never scraped" (no chart array).
    if (chart.length === 0 && !chartScrapedAt) {
      return null;
    }
    return {
      activeDays: 0,
      windowDays: 30,
      daysSinceLastSale: null,
      tier: "slow",
      chartScrapedAt,
      variant: variantKind,
    };
  }

  inWindow.sort((a, b) => a - b);
  const latest = inWindow[inWindow.length - 1];
  const activeDays = inWindow.length;
  const windowDays = 30;
  const daysSinceLastSale = Math.max(0, Math.round((todayMs - latest) / dayMs));

  let tier: "fast" | "medium" | "slow";
  if (activeDays >= 20 && daysSinceLastSale <= 2) {
    tier = "fast";
  } else if (activeDays < 5 || daysSinceLastSale >= 8) {
    tier = "slow";
  } else {
    tier = "medium";
  }

  return {
    activeDays,
    windowDays,
    daysSinceLastSale,
    tier,
    chartScrapedAt,
    variant: variantKind,
  };
}

/**
 * Sets where Scryfall reports both `price_eur` and `price_eur_foil` but
 * Cardmarket has only ONE product page (the parent reprint, e.g. PLST cards
 * route to their Mystery Booster / Multiverse Legends / etc. CM entry).
 *
 * Consequences:
 *   - The CM page has no foil mode, so the extension never writes
 *     `cm_prices.foil` — foil scrapes always land on `nonfoil`.
 *   - Scryfall's `price_eur_foil` for these is a TCGplayer-derived estimate,
 *     not a real CM price — using it gives a fictitious value that no scrape
 *     can ever correct.
 *
 * For these sets, the appraiser collapses both finish flags to nonfoil so
 * a foil row tracks the actual CM scrape (single-variant) instead of a
 * stuck Scryfall estimate.
 *
 * Add new sets here when their foil rows show prices that never refresh
 * after a CM scrape — that's the diagnostic.
 */
const CM_LIST_STYLE_SETS = new Set<string>([
  "plst", // The List
]);

function isCmListStyleSet(setCode: string | undefined | null): boolean {
  if (!setCode) return false;
  return CM_LIST_STYLE_SETS.has(setCode.toLowerCase());
}

/**
 * Returns true when a Cardmarket-style condition string indicates the card is
 * "heavily played" enough that trend price won't apply — buyers price these to
 * the floor (the `from` ask), not the trend midpoint.
 *
 * Matched as: Heavily Played / HP, Poor / PO, Damaged, Played / PL,
 * Moderately Played / MP. Lightly Played (LP) is intentionally NOT included —
 * those still trade close to NM. Case-insensitive.
 *
 * Returns false for null/undefined/empty.
 */
export function isHeavilyPlayedCondition(condition: string | undefined | null): boolean {
  if (!condition) return false;
  const c = condition.trim().toLowerCase();
  // Lightly Played / LP is NOT heavily played — buyer expectations match NM.
  if (c === "lightly played" || c === "lp") return false;
  return /^(hp|po|pl|mp|heavily played|moderately played|played|poor|damaged)$/.test(c);
}

function cardDocToPayload(d: AppraiserCardDoc): AppraiserCard {
  // Always recompute cardmarketUrl from authoritative fields. This way:
  //   - Manual cardmarket_id overrides set via the UI flow into the URL
  //     automatically without any per-doc URL rewrite step.
  //   - MANUAL_CARDMARKET_URLS (cross-printing fixes) take effect.
  //   - Old docs with stored search-page URLs upgrade to slug URLs when
  //     possible.
  // Falls back to the stored URL only when the builder returns null
  // (PLST without an idProduct, etc.) so we don't replace a search URL
  // with nothing.
  const built = buildCardmarketUrl(
    d.setName,
    d.name,
    d.foil,
    d.cardmarket_id,
    d.set,
    d.collectorNumber,
  );
  const cardmarketUrl = built ?? d.cardmarketUrl;
  return {
    _id: String(d._id),
    collectionId: String(d.collectionId),
    name: d.name,
    set: d.set,
    setName: d.setName,
    collectorNumber: d.collectorNumber,
    language: d.language,
    condition: d.condition,
    foil: d.foil,
    qty: d.qty,
    scryfallId: d.scryfallId,
    cardmarket_id: d.cardmarket_id,
    cardmarketUrl,
    imageUrl: d.imageUrl,
    trendPrice: d.trendPrice,
    fromPrice: d.fromPrice,
    pricedAt: d.pricedAt ? d.pricedAt.toISOString() : null,
    cm_prices: d.cm_prices,
    status: d.status,
    excluded: d.excluded ?? false,
    createdAt: d.createdAt.toISOString(),
  };
}

interface EvCardPriceRow {
  cardmarket_id: number | null;
  set: string;
  collector_number: string;
  price_eur: number | null;
  price_eur_foil: number | null;
  prices_updated_at: string | null;
  cm_prices: EffectivePriceInput["cm_prices"] | null;
}

/**
 * Returns the appraiser cards with their fromPrice / trendPrice / cm_prices /
 * pricedAt / status hydrated from `dashboard_ev_cards` when that collection
 * has a matching row with fresher CM data. No-op for cards without a
 * cardmarket_id or without any matching ev_cards row.
 */
export async function hydrateAppraiserCards(
  db: Db,
  cards: AppraiserCardDoc[]
): Promise<AppraiserCard[]> {
  const cmIds = Array.from(
    new Set(
      cards
        .map((c) => c.cardmarket_id)
        .filter((x): x is number => x != null)
    )
  );
  // Helper: derive from_source / from_updated_at for a payload that wasn't
  // hydrated from a fresh CM scrape (no cmIds, or no matching ev_cards row).
  // Manual edits leave pricedAt unchanged but flip status to "manual" — in
  // that case we don't have a reliable date, so source = null.
  function fallbackFromMeta(payload: AppraiserCard): {
    from_source: "cm_ext" | null;
    from_updated_at: string | null;
  } {
    if (payload.fromPrice == null || payload.status === "manual") {
      return { from_source: null, from_updated_at: null };
    }
    const updatedAt =
      payload.cm_prices?.updatedAt ?? payload.pricedAt ?? null;
    return { from_source: "cm_ext", from_updated_at: updatedAt };
  }

  // Two lookup paths into ev_cards:
  //   - By cardmarket_id (preferred — exact CM product match).
  //   - By {set, collector_number} fallback for cards whose appraiser doc
  //     has no cardmarket_id yet. Covers a real case: a card was added
  //     before Scryfall mapped the printing's idProduct, then Scryfall's
  //     daily bulk sync filled in ev_cards.cardmarket_id, but the
  //     appraiser doc was never re-resolved. Without this fallback, the
  //     join would miss and the user sees no prices even though ev_cards
  //     has them.
  const setCnLookups = Array.from(
    new Set(
      cards
        .filter((c) => c.cardmarket_id == null && c.set && c.collectorNumber)
        .map((c) => `${c.set.toLowerCase()}::${c.collectorNumber}`)
    )
  ).map((k) => {
    const [set, collector_number] = k.split("::");
    return { set, collector_number };
  });

  if (cmIds.length === 0 && setCnLookups.length === 0) {
    return cards.map((c) => {
      const payload = cardDocToPayload(c);
      const fromMeta = fallbackFromMeta(payload);
      // No ev_cards row to consult, but the appraiser doc may carry its own
      // `cm_prices` snapshot from a prior fan-out — feed that through.
      const velocity = computeVelocity(
        payload.cm_prices ?? undefined,
        c.foil ? "foil" : "nonfoil",
      );
      const isHp = isHeavilyPlayedCondition(c.condition);
      if (isHp && payload.fromPrice != null) {
        return { ...payload, ...fromMeta, velocity, trendPrice: payload.fromPrice, trend_hp_override: true };
      }
      return { ...payload, ...fromMeta, velocity };
    });
  }

  const orClauses: Record<string, unknown>[] = [];
  if (cmIds.length) orClauses.push({ cardmarket_id: { $in: cmIds } });
  if (setCnLookups.length) {
    orClauses.push({ $or: setCnLookups });
  }

  const evCards = (await db
    .collection("dashboard_ev_cards")
    .find(
      orClauses.length === 1 ? orClauses[0] : { $or: orClauses },
      {
        projection: {
          cardmarket_id: 1,
          set: 1,
          collector_number: 1,
          price_eur: 1,
          price_eur_foil: 1,
          prices_updated_at: 1,
          cm_prices: 1,
        },
      }
    )
    .toArray()) as unknown as EvCardPriceRow[];

  const evByCmId = new Map<number, EvCardPriceRow>();
  const evBySetCn = new Map<string, EvCardPriceRow>();
  for (const ev of evCards) {
    if (ev.cardmarket_id != null) evByCmId.set(ev.cardmarket_id, ev);
    if (ev.set && ev.collector_number) {
      evBySetCn.set(`${ev.set.toLowerCase()}::${ev.collector_number}`, ev);
    }
  }

  // Self-heal: appraiser docs with cardmarket_id=null whose matching ev_cards
  // row HAS one — backfill the appraiser doc so the next CM scrape's
  // fan-out (`{cardmarket_id, foil}` filter in processCardPrices) actually
  // matches. Without this, the user has to manually re-add the card or
  // set an override even though Scryfall already knows the right ID.
  const backfillOps: Array<{
    updateOne: { filter: Record<string, unknown>; update: Record<string, unknown> };
  }> = [];
  for (const c of cards) {
    if (c.cardmarket_id != null || !c.set || !c.collectorNumber) continue;
    const ev = evBySetCn.get(`${c.set.toLowerCase()}::${c.collectorNumber}`);
    if (ev?.cardmarket_id != null) {
      backfillOps.push({
        updateOne: {
          filter: { _id: c._id },
          update: { $set: { cardmarket_id: ev.cardmarket_id } },
        },
      });
    }
  }
  if (backfillOps.length > 0) {
    // Fire-and-forget — failure is non-fatal. The in-memory override below
    // makes the current request's response correct regardless.
    db.collection("dashboard_appraiser_cards")
      .bulkWrite(backfillOps, { ordered: false })
      .catch(() => {});
  }

  return cards.map((c) => {
    const payload = cardDocToPayload(c);
    const isHpEarly = isHeavilyPlayedCondition(c.condition);
    const applyEarlyHp = (p: AppraiserCard): AppraiserCard => {
      const fromMeta = fallbackFromMeta(p);
      const velocity = computeVelocity(
        p.cm_prices ?? undefined,
        c.foil ? "foil" : "nonfoil",
      );
      const base = { ...p, ...fromMeta, velocity };
      return isHpEarly && p.fromPrice != null
        ? { ...base, trendPrice: p.fromPrice, trend_hp_override: true }
        : base;
    };

    // Resolve ev_cards row: by cardmarket_id when known, else by set/cn.
    let ev: EvCardPriceRow | undefined =
      c.cardmarket_id != null ? evByCmId.get(c.cardmarket_id) : undefined;
    if (!ev && c.set && c.collectorNumber) {
      ev = evBySetCn.get(`${c.set.toLowerCase()}::${c.collectorNumber}`);
    }
    if (!ev) return applyEarlyHp(payload);

    // If we resolved via set/cn AND ev_cards has a cardmarket_id we didn't,
    // patch the in-memory payload so this request renders the correct
    // idProduct URL (the persisted backfill above takes care of next time).
    if (payload.cardmarket_id == null && ev.cardmarket_id != null) {
      payload.cardmarket_id = ev.cardmarket_id;
      const built = buildCardmarketUrl(
        c.setName,
        c.name,
        c.foil,
        ev.cardmarket_id,
        c.set,
        c.collectorNumber,
      );
      if (built) payload.cardmarketUrl = built;
    }

    // Variant fallback on the CM side is deliberately conservative. A
    // cross-variant fallback is only valid when the card is single-variant
    // on CM — otherwise we'd surface a foil scrape on a non-foil appraiser
    // card just because the user scraped foil but hasn't scraped non-foil
    // yet (both variants genuinely exist with different prices).
    //
    // Scryfall's price_eur / price_eur_foil nullability reflects whether CM
    // lists that variant at all. If the opposite variant's Scryfall price is
    // null, the card is single-variant on CM — classic case is foil-only
    // promos (PLG21, G11, V13, FTV, etc.) whose product page has no foil
    // toggle, so the extension reads foilMode:false and writes to
    // cm_prices.nonfoil even though the listings ARE foil.
    //
    // Special case for "list-style" sets (PLST and similar): Scryfall reports
    // BOTH price_eur and price_eur_foil as non-null, but Cardmarket has only
    // ONE product page (the parent reprint, e.g. Mystery Booster) — that
    // page has no foil mode, so foil scrapes never land. price_eur_foil for
    // these is a TCGplayer-derived estimate, not a real CM price. Treat
    // these as nonfoil-only on CM regardless of c.foil so the displayed
    // value tracks the actual CM scrape.
    const cmCollapsedToNonfoil = isCmListStyleSet(c.set);
    const effectiveFoil = cmCollapsedToNonfoil ? false : c.foil;

    const requestedVariant = effectiveFoil ? ev.cm_prices?.foil : ev.cm_prices?.nonfoil;
    const fallbackVariant = effectiveFoil ? ev.cm_prices?.nonfoil : ev.cm_prices?.foil;
    const oppositeScryfall = effectiveFoil ? ev.price_eur : ev.price_eur_foil;
    const isSingleVariantOnCm = cmCollapsedToNonfoil || oppositeScryfall == null;
    const requestedHasData =
      !!requestedVariant && (requestedVariant.from != null || requestedVariant.trend != null);
    const variant = requestedHasData
      ? requestedVariant
      : isSingleVariantOnCm
      ? fallbackVariant
      : undefined;
    const fromFromCm = variant?.from ?? null;

    // Scryfall bulk fallback follows the same rule: only substitute the
    // opposite finish's price when Scryfall confirms the requested one
    // doesn't exist (the null one IS the signal that the finish isn't on CM).
    const requestedScryfall = effectiveFoil ? ev.price_eur_foil : ev.price_eur;
    const scryfallPrice = requestedScryfall ?? (isSingleVariantOnCm ? oppositeScryfall : null);

    const eff = getEffectivePrice(
      {
        price_eur: scryfallPrice,
        price_eur_foil: null,
        prices_updated_at: ev.prices_updated_at,
        // Feed the picked variant under `nonfoil` so getEffectivePrice uses it
        // regardless of the `foil` flag we pass in below.
        cm_prices: variant ? { nonfoil: variant } : null,
      },
      false
    );

    // Prefer ev_cards' full CM snapshot so the UI sees avg30d/avg7d/chart too.
    const cm_prices: CmPricesSnapshot | null = variant
      ? {
          from: variant.from,
          trend: variant.trend,
          avg30d: variant.avg30d,
          avg7d: variant.avg7d,
          avg1d: variant.avg1d,
          available: variant.available,
          chart: variant.chart,
          updatedAt: variant.updatedAt,
        }
      : payload.cm_prices;

    const baseTrendPrice = eff.price ?? payload.trendPrice;
    const fromPrice = fromFromCm ?? payload.fromPrice;
    const pricedAt = variant?.updatedAt ?? payload.pricedAt;

    // HP swap — for heavily-played cards, the realistic price is the floor
    // (lowest current ask), not the trend midpoint. We only override when
    // we actually have a `fromPrice` to substitute; otherwise we leave the
    // trend value as-is and don't flag the override.
    const isHp = isHeavilyPlayedCondition(c.condition);
    const trendHpOverride = isHp && fromPrice != null;
    const trendPrice = trendHpOverride ? fromPrice : baseTrendPrice;

    const status: AppraiserCard["status"] =
      fromPrice != null || trendPrice != null ? "priced" : payload.status;

    // From-price provenance: when the live CM variant scrape contributed
    // `from`, surface that variant's updatedAt. Otherwise fall back to the
    // saved doc — null for manual entries (no reliable date), pricedAt or
    // cm_prices.updatedAt otherwise.
    const fromMeta: { from_source: "cm_ext" | null; from_updated_at: string | null } =
      fromFromCm != null
        ? { from_source: "cm_ext", from_updated_at: variant?.updatedAt ?? null }
        : fromPrice != null && c.status !== "manual"
        ? {
            from_source: "cm_ext",
            from_updated_at: cm_prices?.updatedAt ?? payload.pricedAt ?? null,
          }
        : { from_source: null, from_updated_at: null };

    // Velocity: derived from the same `variant` we used for prices, so the
    // chart matches the displayed numbers (foil/nonfoil consistency). Use
    // `effectiveFoil` (after the list-style collapse) rather than raw c.foil
    // so PLST foil rows correctly read as "nonfoil" in the tooltip — that's
    // the chart they actually use.
    const variantUsedKind: "foil" | "nonfoil" =
      variant === requestedVariant
        ? effectiveFoil
          ? "foil"
          : "nonfoil"
        : effectiveFoil
          ? "nonfoil"
          : "foil";
    const velocity = computeVelocity(variant, variantUsedKind);

    return {
      ...payload,
      trendPrice,
      fromPrice,
      cm_prices,
      pricedAt,
      status,
      trend_source: eff.price != null ? eff.source : null,
      trend_updated_at: eff.price != null ? eff.updatedAt : null,
      trend_ascending: eff.price != null ? eff.ascending : false,
      trend_hp_override: trendHpOverride,
      velocity,
      ...fromMeta,
    };
  });
}

/** Per-card totals — uses the hydrated values so collection cards counts line up with what's displayed. */
export function computeCollectionTotals(cards: AppraiserCard[]): {
  cardCount: number;
  totalTrend: number;
  totalFrom: number;
} {
  return cards.reduce(
    (acc, c) => ({
      cardCount: acc.cardCount + c.qty,
      totalTrend: acc.totalTrend + (c.trendPrice ?? 0) * c.qty,
      totalFrom: acc.totalFrom + (c.fromPrice ?? 0) * c.qty,
    }),
    { cardCount: 0, totalTrend: 0, totalFrom: 0 }
  );
}
