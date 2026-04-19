import type {
  EvProduct,
  EvProductResult,
  EvProductCardBreakdown,
  EvProductBoosterBreakdown,
} from "./types";
import { getDb } from "./mongodb";

// The calc only reads these fields from ev_cards. Accepting a structural
// subset keeps the function trivially mockable in tests.
export interface EvCardPriceRef {
  scryfall_id: string;
  name?: string;
  price_eur: number | null;
  price_eur_foil: number | null;
}

export interface CalculateProductEvOptions {
  feeRate: number;
  /** Opened-box EV per included booster's parent set (e.g. { akh: 3.75 }). */
  boosterEvBySet?: Record<string, number>;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function calculateProductEv(
  product: EvProduct,
  cards: EvCardPriceRef[],
  options: CalculateProductEvOptions
): EvProductResult {
  const { feeRate, boosterEvBySet = {} } = options;

  const cardById = new Map<string, EvCardPriceRef>();
  for (const c of cards) cardById.set(c.scryfall_id, c);

  let cardsTotal = 0;
  let cardCountTotal = 0;
  const cardBreakdown: EvProductCardBreakdown[] = [];
  const missing: string[] = [];

  for (const pc of product.cards) {
    const c = cardById.get(pc.scryfall_id);
    const unit = c ? (pc.is_foil ? c.price_eur_foil : c.price_eur) : null;
    if (!c) missing.push(pc.scryfall_id);
    const price = unit ?? 0;
    const line = price * pc.count;
    cardsTotal += line;
    cardCountTotal += pc.count;
    cardBreakdown.push({ ...pc, unit_price: unit, line_total: round2(line) });
  }

  cardBreakdown.sort((a, b) => b.line_total - a.line_total);

  const ib = product.included_boosters ?? [];
  const hasBoosters = ib.length > 0;

  let sealedTotal = 0;
  let sealedAvailable = hasBoosters;
  let openedTotal = 0;
  let openedAvailable = hasBoosters;
  let boosterCountTotal = 0;
  const boosterBreakdown: EvProductBoosterBreakdown[] = [];

  for (const b of ib) {
    boosterCountTotal += b.count;
    if (b.sealed_price_eur !== undefined) {
      sealedTotal += b.sealed_price_eur * b.count;
    } else {
      sealedAvailable = false;
    }

    const openedUnit = boosterEvBySet[b.set_code];
    if (openedUnit !== undefined) {
      openedTotal += openedUnit * b.count;
    } else {
      openedAvailable = false;
    }

    boosterBreakdown.push({ ...b, opened_unit_ev: openedUnit ?? null });
  }

  const cardsOnlyGross = round2(cardsTotal);
  const cardsOnlyNet = round2(cardsTotal * (1 - feeRate));

  const boosters = hasBoosters
    ? {
        count_total: boosterCountTotal,
        sealed: {
          available: sealedAvailable,
          gross: round2(sealedTotal),
          net: round2(sealedTotal * (1 - feeRate)),
        },
        opened: {
          available: openedAvailable,
          gross: round2(openedTotal),
          net: round2(openedTotal * (1 - feeRate)),
        },
      }
    : null;

  const totals = {
    cards_only: { gross: cardsOnlyGross, net: cardsOnlyNet },
    sealed:
      hasBoosters && sealedAvailable
        ? {
            gross: round2(cardsTotal + sealedTotal),
            net: round2((cardsTotal + sealedTotal) * (1 - feeRate)),
          }
        : null,
    opened:
      hasBoosters && openedAvailable
        ? {
            gross: round2(cardsTotal + openedTotal),
            net: round2((cardsTotal + openedTotal) * (1 - feeRate)),
          }
        : null,
  };

  return {
    slug: product.slug,
    name: product.name,
    product_type: product.product_type,
    card_count_total: cardCountTotal,
    unique_card_count: product.cards.length,
    cards_subtotal_gross: cardsOnlyGross,
    boosters,
    totals,
    fee_rate: feeRate,
    card_breakdown: cardBreakdown,
    booster_breakdown: boosterBreakdown,
    missing_scryfall_ids: missing,
  };
}

export const COL_PRODUCTS = "dashboard_ev_products";
export const COL_EV_SNAPSHOTS = "dashboard_ev_snapshots";

let productIndexesEnsured = false;

export async function ensureProductIndexes(): Promise<void> {
  if (productIndexesEnsured) return;
  try {
    const db = await getDb();
    await Promise.all([
      db.collection(COL_PRODUCTS).createIndex({ slug: 1 }, { unique: true, name: "slug_unique" }),
      db.collection(COL_PRODUCTS).createIndex({ parent_set_code: 1 }, { name: "parent_set_code" }),
      db.collection(COL_PRODUCTS).createIndex({ product_type: 1 }, { name: "product_type" }),
      db.collection(COL_EV_SNAPSHOTS).createIndex({ product_slug: 1, date: -1 }, { name: "product_slug_date" }),
    ]);
    productIndexesEnsured = true;
  } catch {
    productIndexesEnsured = true;
  }
}

export async function listProducts(): Promise<EvProduct[]> {
  await ensureProductIndexes();
  const db = await getDb();
  const docs = await db
    .collection(COL_PRODUCTS)
    .find({})
    .sort({ release_year: -1, name: 1 })
    .toArray();
  return docs.map((d) => ({ ...d, _id: d._id.toString() }) as EvProduct);
}

export async function getProductBySlug(slug: string): Promise<EvProduct | null> {
  await ensureProductIndexes();
  const db = await getDb();
  const doc = await db.collection(COL_PRODUCTS).findOne({ slug });
  if (!doc) return null;
  return { ...doc, _id: doc._id.toString() } as EvProduct;
}

export interface UpsertProductInput extends Omit<EvProduct, "_id" | "seeded_at"> {}

export async function upsertProduct(
  input: UpsertProductInput,
  { overwrite }: { overwrite: boolean } = { overwrite: false }
): Promise<{ created: boolean; slug: string }> {
  await ensureProductIndexes();
  const db = await getDb();
  const existing = await db
    .collection(COL_PRODUCTS)
    .findOne({ slug: input.slug }, { projection: { _id: 1 } });
  if (existing && !overwrite) {
    throw new Error(`Product already exists: ${input.slug} (pass overwrite=true to replace)`);
  }
  const now = new Date().toISOString();
  await db.collection(COL_PRODUCTS).updateOne(
    { slug: input.slug },
    { $set: { ...input, seeded_at: now } },
    { upsert: true }
  );
  return { created: !existing, slug: input.slug };
}

export async function deleteProduct(slug: string): Promise<{ deleted: boolean }> {
  await ensureProductIndexes();
  const db = await getDb();
  const res = await db.collection(COL_PRODUCTS).deleteOne({ slug });
  return { deleted: res.deletedCount === 1 };
}

/**
 * Reads the latest `play_ev_net` snapshot for each booster set referenced
 * by products. Used to populate `boosterEvBySet` for the "opened" valuation.
 */
async function latestPlayEvBySet(codes: string[]): Promise<Record<string, number>> {
  if (codes.length === 0) return {};
  const db = await getDb();
  const docs = await db
    .collection(COL_EV_SNAPSHOTS)
    .aggregate([
      { $match: { set_code: { $in: codes }, play_ev_net: { $ne: null } } },
      { $sort: { date: -1 } },
      { $group: { _id: "$set_code", play_ev_net: { $first: "$play_ev_net" } } },
    ])
    .toArray();
  const out: Record<string, number> = {};
  for (const d of docs) {
    if (typeof d.play_ev_net === "number") out[d._id as string] = d.play_ev_net;
  }
  return out;
}

async function fetchCardsByScryfallIds(ids: string[]): Promise<EvCardPriceRef[]> {
  if (ids.length === 0) return [];
  const db = await getDb();
  const docs = await db
    .collection("dashboard_ev_cards")
    .find(
      { scryfall_id: { $in: ids } },
      { projection: { scryfall_id: 1, name: 1, price_eur: 1, price_eur_foil: 1 } }
    )
    .toArray();
  return docs.map((d) => ({
    scryfall_id: d.scryfall_id as string,
    name: d.name as string | undefined,
    price_eur: (d.price_eur ?? null) as number | null,
    price_eur_foil: (d.price_eur_foil ?? null) as number | null,
  }));
}

async function getFeeRate(): Promise<number> {
  const db = await getDb();
  const cfg = await db.collection("dashboard_ev_config").findOne({}, { projection: { fee_rate: 1 } });
  return (cfg?.fee_rate as number | undefined) ?? 0.05;
}

export async function generateProductSnapshot(slug: string): Promise<{ written: boolean; reason?: string }> {
  await ensureProductIndexes();
  const product = await getProductBySlug(slug);
  if (!product) return { written: false, reason: "not_found" };

  const ids = product.cards.map((c) => c.scryfall_id);
  const cards = await fetchCardsByScryfallIds(ids);

  const boosterSetCodes = (product.included_boosters ?? []).map((b) => b.set_code);
  const boosterEvBySet = await latestPlayEvBySet([...new Set(boosterSetCodes)]);

  const feeRate = await getFeeRate();
  const result = calculateProductEv(product, cards, { feeRate, boosterEvBySet });

  const date = new Date().toISOString().slice(0, 10);
  const db = await getDb();
  await db.collection(COL_EV_SNAPSHOTS).updateOne(
    { product_slug: slug, date },
    {
      $set: {
        product_slug: slug,
        date,
        ev_net_cards_only: result.totals.cards_only.net,
        ev_net_sealed: result.totals.sealed?.net ?? null,
        ev_net_opened: result.totals.opened?.net ?? null,
        fee_rate: feeRate,
        created_at: new Date(),
      },
    },
    { upsert: true }
  );

  return { written: true };
}

export async function generateAllProductSnapshots(): Promise<{ generated: number; errors: string[] }> {
  const products = await listProducts();
  let generated = 0;
  const errors: string[] = [];
  for (const p of products) {
    try {
      const res = await generateProductSnapshot(p.slug);
      if (res.written) generated++;
    } catch (err) {
      errors.push(`${p.slug}: ${String(err)}`);
    }
  }
  return { generated, errors };
}

export async function getProductSnapshots(slug: string, days: number = 180) {
  const db = await getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const docs = await db
    .collection(COL_EV_SNAPSHOTS)
    .find({ product_slug: slug, date: { $gte: cutoffStr } })
    .sort({ date: 1 })
    .toArray();
  return docs.map((d) => ({ ...d, _id: d._id.toString() }));
}
