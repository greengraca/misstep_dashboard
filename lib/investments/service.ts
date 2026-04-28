import { ObjectId, type Db } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { COL_PRODUCTS as COL_EV_PRODUCTS, latestPlayEvBySet } from "@/lib/ev-products";
import {
  COL_INVESTMENTS,
  COL_INVESTMENT_LOTS,
  COL_INVESTMENT_SALE_LOG,
  ensureInvestmentIndexes,
} from "./db";
import { generateUniqueInvestmentCode } from "./codes";
import { computeExpectedOpenCardCount, computeCostBasisPerUnit } from "./math";
import type {
  ConvertAppraiserToInvestmentBody,
  CreateInvestmentBody,
  Investment,
  InvestmentListItem,
  InvestmentSource,
  UpdateInvestmentBody,
} from "./types";
import type { EvProduct } from "@/lib/types";
import {
  COL_APPRAISER_CARDS,
  COL_APPRAISER_COLLECTIONS,
  type AppraiserCardDoc,
  type AppraiserCollectionDoc,
} from "@/lib/appraiser/types";

/** Sum of EvProduct.cards[*].count — total cards in one unit of the product. */
async function cardsPerProductUnit(db: Db, slug: string): Promise<number> {
  const p = await db.collection<EvProduct>(COL_EV_PRODUCTS).findOne({ slug });
  if (!p) return 0;
  return p.cards.reduce((sum, c) => sum + c.count, 0);
}

async function recomputeExpectedOpenCardCount(
  db: Db,
  investment: Investment
): Promise<number> {
  if (investment.source.kind === "product") {
    const perUnit = await cardsPerProductUnit(db, investment.source.product_slug);
    return computeExpectedOpenCardCount(investment, { cardsPerProductUnit: perUnit });
  }
  return computeExpectedOpenCardCount(investment);
}

export async function createInvestment(params: {
  body: CreateInvestmentBody;
  userId: string;
}): Promise<Investment> {
  await ensureInvestmentIndexes();
  const db = await getDb();
  const now = new Date();
  const stub: Investment = {
    _id: new ObjectId(),
    name: params.body.name.trim(),
    code: await generateUniqueInvestmentCode(db),
    created_at: now,
    created_by: params.userId,
    status: "listing",
    cost_total_eur: params.body.cost_total_eur,
    cost_notes: params.body.cost_notes?.trim() || undefined,
    source: params.body.source,
    cm_set_names: await defaultCmSetNames(db, params.body.source),
    sealed_flips: [],
    expected_open_card_count: 0,
  };
  stub.expected_open_card_count = await recomputeExpectedOpenCardCount(db, stub);
  await db.collection<Investment>(COL_INVESTMENTS).insertOne(stub);
  return stub;
}

/** Resolve default CM set-name variants for an investment's source. */
async function defaultCmSetNames(db: Db, source: InvestmentSource): Promise<string[]> {
  if (source.kind === "box") {
    const set = await db
      .collection("dashboard_ev_sets")
      .findOne({ code: source.set_code }, { projection: { name: 1 } });
    return set?.name ? [set.name as string] : [];
  }
  if (source.kind === "product") {
    const p = await db
      .collection<EvProduct>(COL_EV_PRODUCTS)
      .findOne({ slug: source.product_slug }, { projection: { parent_set_code: 1 } });
    if (!p?.parent_set_code) return [];
    const set = await db
      .collection("dashboard_ev_sets")
      .findOne({ code: p.parent_set_code }, { projection: { name: 1 } });
    return set?.name ? [set.name as string] : [];
  }
  // collection-kind: union of distinct setNames across the cards.
  const cards = await db
    .collection<AppraiserCardDoc>(COL_APPRAISER_CARDS)
    .find(
      { collectionId: new ObjectId(source.appraiser_collection_id), excluded: { $ne: true } },
      { projection: { setName: 1 } }
    )
    .toArray();
  const names = new Set<string>();
  for (const c of cards) if (c.setName) names.add(c.setName);
  return Array.from(names);
}

/**
 * Convert an appraiser collection into a fully-populated investment:
 *   - Generates a code.
 *   - Creates the investment with `kind: "collection"`.
 *   - Creates one lot per (cardmarket_id, foil, condition, language) tuple
 *     with qty_opened summed from the collection's non-excluded cards.
 *   - Status starts at "listing" — no baseline phase, no opening to do.
 *
 * Cards without a cardmarket_id are skipped (can't attribute via tag without
 * a CM product key) — surfaced in the API response so the user can fix
 * them with the per-card "set ID" override before re-converting.
 */
export async function createInvestmentFromAppraiser(params: {
  collectionId: string;
  body: ConvertAppraiserToInvestmentBody;
  userId: string;
}): Promise<{
  investment: Investment;
  lotCount: number;
  cardCount: number;
  skippedNoCmId: number;
} | null> {
  await ensureInvestmentIndexes();
  if (!ObjectId.isValid(params.collectionId)) return null;
  const db = await getDb();
  const collectionOid = new ObjectId(params.collectionId);
  const collection = await db
    .collection<AppraiserCollectionDoc>(COL_APPRAISER_COLLECTIONS)
    .findOne({ _id: collectionOid });
  if (!collection) return null;

  const cards = await db
    .collection<AppraiserCardDoc>(COL_APPRAISER_CARDS)
    .find({ collectionId: collectionOid, excluded: { $ne: true } })
    .toArray();

  // Group by tuple. Cards lacking a cardmarket_id can't be tagged-and-tracked
  // (the extension's stock + order-detail scrape match comments back via
  // productId), so they're skipped and reported.
  type Tuple = { cardmarket_id: number; foil: boolean; condition: string; language: string };
  const tupleKey = (t: Tuple) => `${t.cardmarket_id}|${t.foil}|${t.condition}|${t.language}`;
  const grouped = new Map<string, { tuple: Tuple; qty: number }>();
  let skippedNoCmId = 0;
  let cardCount = 0;
  for (const c of cards) {
    if (c.cardmarket_id == null) {
      skippedNoCmId += c.qty;
      continue;
    }
    const t: Tuple = {
      cardmarket_id: c.cardmarket_id,
      foil: !!c.foil,
      condition: c.condition || "NM",
      language: c.language || "English",
    };
    const k = tupleKey(t);
    const existing = grouped.get(k);
    if (existing) existing.qty += c.qty;
    else grouped.set(k, { tuple: t, qty: c.qty });
    cardCount += c.qty;
  }

  const now = new Date();
  const investment: Investment = {
    _id: new ObjectId(),
    name: (params.body.name?.trim() || collection.name || `Collection — ${collection._id}`),
    code: await generateUniqueInvestmentCode(db),
    created_at: now,
    created_by: params.userId,
    status: "listing",
    cost_total_eur: params.body.cost_total_eur,
    cost_notes: params.body.cost_notes?.trim() || undefined,
    source: {
      kind: "collection",
      appraiser_collection_id: params.collectionId,
      card_count: cardCount,
    },
    cm_set_names: await defaultCmSetNames(db, {
      kind: "collection",
      appraiser_collection_id: params.collectionId,
      card_count: cardCount,
    }),
    sealed_flips: [],
    expected_open_card_count: cardCount,
  };
  await db.collection<Investment>(COL_INVESTMENTS).insertOne(investment);

  // Bulk insert lots — one per tuple. qty_opened reflects the collection's
  // recorded qty for that tuple at conversion time. Sales of those tuples
  // matching this investment's tag will decrement qty_remaining.
  if (grouped.size > 0) {
    const lotDocs = Array.from(grouped.values()).map((g) => ({
      _id: new ObjectId(),
      investment_id: investment._id,
      cardmarket_id: g.tuple.cardmarket_id,
      foil: g.tuple.foil,
      condition: g.tuple.condition,
      language: g.tuple.language,
      qty_opened: g.qty,
      qty_sold: 0,
      qty_remaining: g.qty,
      cost_basis_per_unit: null,
      proceeds_eur: 0,
      last_grown_at: now,
    }));
    await db.collection(COL_INVESTMENT_LOTS).insertMany(lotDocs);
  }

  return {
    investment,
    lotCount: grouped.size,
    cardCount,
    skippedNoCmId,
  };
}

export async function getInvestment(id: string): Promise<Investment | null> {
  await ensureInvestmentIndexes();
  if (!ObjectId.isValid(id)) return null;
  const db = await getDb();
  return db
    .collection<Investment>(COL_INVESTMENTS)
    .findOne({ _id: new ObjectId(id) });
}

export async function listInvestments(params: {
  status?: Investment["status"];
}): Promise<Investment[]> {
  await ensureInvestmentIndexes();
  const db = await getDb();
  const filter: Record<string, unknown> = {};
  if (params.status) filter.status = params.status;
  return db
    .collection<Investment>(COL_INVESTMENTS)
    .find(filter)
    .sort({ created_at: -1 })
    .toArray();
}

export async function updateInvestment(params: {
  id: string;
  body: UpdateInvestmentBody;
}): Promise<Investment | null> {
  await ensureInvestmentIndexes();
  if (!ObjectId.isValid(params.id)) return null;
  const db = await getDb();
  const $set: Record<string, unknown> = {};
  if (params.body.name !== undefined) $set.name = params.body.name.trim();
  if (params.body.cost_total_eur !== undefined)
    $set.cost_total_eur = params.body.cost_total_eur;
  if (params.body.cost_notes !== undefined)
    $set.cost_notes = params.body.cost_notes.trim() || undefined;
  if (params.body.cm_set_names !== undefined) $set.cm_set_names = params.body.cm_set_names;
  if (Object.keys($set).length === 0) return getInvestment(params.id);
  const res = await db
    .collection<Investment>(COL_INVESTMENTS)
    .findOneAndUpdate(
      { _id: new ObjectId(params.id) },
      { $set },
      { returnDocument: "after" }
    );
  return res ?? null;
}

export async function archiveInvestment(id: string): Promise<boolean> {
  await ensureInvestmentIndexes();
  if (!ObjectId.isValid(id)) return false;
  const db = await getDb();
  const res = await db
    .collection<Investment>(COL_INVESTMENTS)
    .updateOne({ _id: new ObjectId(id) }, { $set: { status: "archived" } });
  return res.matchedCount > 0;
}

/** Hard-delete the investment and every row that references it. */
export async function deleteInvestmentPermanent(id: string): Promise<
  | { deleted: true; counts: { investment: number; lots: number; sale_log: number } }
  | { deleted: false }
> {
  await ensureInvestmentIndexes();
  if (!ObjectId.isValid(id)) return { deleted: false };
  const db = await getDb();
  const invId = new ObjectId(id);
  const [lots, saleLog, inv] = await Promise.all([
    db.collection(COL_INVESTMENT_LOTS).deleteMany({ investment_id: invId }),
    db.collection(COL_INVESTMENT_SALE_LOG).deleteMany({ investment_id: invId }),
    db.collection(COL_INVESTMENTS).deleteOne({ _id: invId }),
  ]);
  if (inv.deletedCount === 0) return { deleted: false };
  return {
    deleted: true,
    counts: {
      investment: inv.deletedCount,
      lots: lots.deletedCount ?? 0,
      sale_log: saleLog.deletedCount ?? 0,
    },
  };
}

/** Summary aggregates for list view: total listed value + realized per investment. */
export async function listInvestmentSummaries(params: {
  status?: Investment["status"];
}): Promise<InvestmentListItem[]> {
  await ensureInvestmentIndexes();
  const db = await getDb();
  const investments = await listInvestments(params);
  const ids = investments.map((i) => i._id);
  const lots = await db
    .collection(COL_INVESTMENT_LOTS)
    .aggregate<{ _id: ObjectId; proceeds: number }>([
      { $match: { investment_id: { $in: ids } } },
      { $group: { _id: "$investment_id", proceeds: { $sum: "$proceeds_eur" } } },
    ])
    .toArray();
  const proceedsByInv = new Map<string, number>();
  for (const row of lots) proceedsByInv.set(String(row._id), row.proceeds);
  return Promise.all(
    investments.map(async (inv) => ({
      id: String(inv._id),
      name: inv.name,
      code: inv.code,
      status: inv.status,
      created_at: inv.created_at.toISOString(),
      source: inv.source,
      cost_total_eur: inv.cost_total_eur,
      listed_value_eur: await computeListedValue(inv._id),
      realized_eur: proceedsByInv.get(String(inv._id)) ?? 0,
      sealed_flips_total_eur: inv.sealed_flips.reduce((s, f) => s + f.proceeds_eur, 0),
    }))
  );
}

/** Sum of stock.price * stock.qty across rows matching open lots for this investment. */
export async function computeListedValue(investmentId: ObjectId): Promise<number> {
  const db = await getDb();
  const lots = await db
    .collection(COL_INVESTMENT_LOTS)
    .find({ investment_id: investmentId, qty_remaining: { $gt: 0 } })
    .project<{ cardmarket_id: number; foil: boolean; condition: string; language: string }>({
      cardmarket_id: 1,
      foil: 1,
      condition: 1,
      language: 1,
    })
    .toArray();
  if (lots.length === 0) return 0;
  const cursor = db.collection("dashboard_cm_stock").aggregate<{ total: number }>([
    {
      $match: {
        $or: lots.map((l) => ({
          productId: l.cardmarket_id,
          foil: l.foil,
          condition: l.condition,
          language: l.language,
        })),
      },
    },
    { $group: { _id: null, total: { $sum: { $multiply: ["$qty", "$price"] } } } },
  ]);
  const row = await cursor.next();
  return row?.total ?? 0;
}

/**
 * Tag-audit: count distinct stock listings whose comment carries this
 * investment's code, vs the expected lot count. Powers the detail-page
 * "X tagged of Y" widget so the user can spot listings that need their
 * comment updated.
 */
export async function computeTagAudit(investment: Investment): Promise<{
  tagged_listings: number;
  expected_lots: number;
}> {
  const db = await getDb();
  const expectedAgg = await db
    .collection(COL_INVESTMENT_LOTS)
    .countDocuments({ investment_id: investment._id });
  const taggedAgg = await db
    .collection("dashboard_cm_stock")
    .countDocuments({
      // Word-boundary regex is `\bMS-XXXX\b`, anchored on this investment's code.
      // CASE-INSENSITIVE because users may paste in lowercase.
      comment: { $regex: `\\b${investment.code.replace("-", "\\-")}\\b`, $options: "i" },
    });
  return { tagged_listings: taggedAgg, expected_lots: expectedAgg };
}

/** Expected EV for display. Best-effort; returns null if unavailable. */
export async function computeExpectedEv(investment: Investment): Promise<number | null> {
  const db = await getDb();
  if (investment.source.kind === "box") {
    const map = await latestPlayEvBySet([investment.source.set_code]);
    const perPackEv = map[investment.source.set_code];
    if (perPackEv == null) return null;
    return perPackEv * investment.source.packs_per_box * investment.source.box_count;
  }
  if (investment.source.kind === "product") {
    const snap = await db
      .collection("dashboard_ev_snapshots")
      .find({ product_slug: investment.source.product_slug })
      .sort({ date: -1 })
      .limit(1)
      .next();
    const evPerUnit =
      (snap?.ev_net_opened as number | null) ??
      (snap?.ev_net_sealed as number | null) ??
      (snap?.ev_net_cards_only as number | null) ??
      null;
    if (evPerUnit == null) return null;
    return evPerUnit * investment.source.unit_count;
  }
  // collection-kind: no published EV concept — the cost is what it is.
  return null;
}

export async function buildInvestmentDetail(
  inv: Investment
): Promise<import("./types").InvestmentDetail> {
  const listed = await computeListedValue(inv._id);
  const expected = await computeExpectedEv(inv);
  const proceedsAgg = await (await getDb())
    .collection(COL_INVESTMENT_LOTS)
    .aggregate<{ total: number }>([
      { $match: { investment_id: inv._id } },
      { $group: { _id: null, total: { $sum: "$proceeds_eur" } } },
    ])
    .next();
  const lotProceeds = proceedsAgg?.total ?? 0;
  const sealedProceeds = inv.sealed_flips.reduce((s, f) => s + f.proceeds_eur, 0);
  const realized = lotProceeds + sealedProceeds;
  const tagAudit = await computeTagAudit(inv);
  return {
    id: String(inv._id),
    name: inv.name,
    code: inv.code,
    status: inv.status,
    created_at: inv.created_at.toISOString(),
    created_by: inv.created_by,
    cost_total_eur: inv.cost_total_eur,
    cost_notes: inv.cost_notes,
    source: inv.source,
    cm_set_names: inv.cm_set_names,
    sealed_flips: inv.sealed_flips,
    expected_open_card_count: inv.expected_open_card_count,
    closed_at: inv.closed_at?.toISOString(),
    kpis: {
      cost_eur: inv.cost_total_eur,
      expected_ev_eur: expected,
      listed_value_eur: listed,
      realized_net_eur: realized,
      net_pl_blended_eur: realized + listed - inv.cost_total_eur,
      break_even_pct: inv.cost_total_eur > 0 ? realized / inv.cost_total_eur : 0,
    },
    tag_audit: tagAudit,
  };
}

export async function recordSealedFlip(params: {
  id: string;
  body: import("./types").SealedFlipBody;
}): Promise<Investment | null> {
  await ensureInvestmentIndexes();
  if (!ObjectId.isValid(params.id)) return null;
  const db = await getDb();
  const inv = await db
    .collection<Investment>(COL_INVESTMENTS)
    .findOne({ _id: new ObjectId(params.id) });
  if (!inv) return null;
  if (inv.source.kind === "collection") {
    // No sealed product to flip on a collection-kind investment.
    return inv;
  }

  const flip = {
    recorded_at: new Date(),
    unit_count: params.body.unit_count,
    proceeds_eur: params.body.proceeds_eur,
    note: params.body.note?.trim() || undefined,
  };

  let expectedExpr: Record<string, unknown>;
  if (inv.source.kind === "box") {
    expectedExpr = {
      $multiply: [
        inv.source.packs_per_box,
        inv.source.cards_per_pack,
        {
          $max: [
            0,
            {
              $subtract: [
                inv.source.box_count,
                { $sum: "$sealed_flips.unit_count" },
              ],
            },
          ],
        },
      ],
    };
  } else {
    const perUnit = await cardsPerProductUnit(db, inv.source.product_slug);
    expectedExpr = {
      $multiply: [
        perUnit,
        {
          $max: [
            0,
            {
              $subtract: [
                inv.source.unit_count,
                { $sum: "$sealed_flips.unit_count" },
              ],
            },
          ],
        },
      ],
    };
  }

  const res = await db
    .collection<Investment>(COL_INVESTMENTS)
    .findOneAndUpdate(
      { _id: new ObjectId(params.id) },
      [
        { $set: { sealed_flips: { $concatArrays: ["$sealed_flips", [flip]] } } },
        { $set: { expected_open_card_count: expectedExpr } },
      ],
      { returnDocument: "after" }
    );
  return res ?? null;
}

export async function closeInvestment(params: { id: string }): Promise<Investment | null> {
  await ensureInvestmentIndexes();
  if (!ObjectId.isValid(params.id)) return null;
  const db = await getDb();
  const invId = new ObjectId(params.id);
  const inv = await db.collection<Investment>(COL_INVESTMENTS).findOne({ _id: invId });
  if (!inv) return null;
  if (inv.status !== "listing") {
    return inv;
  }

  const now = new Date();
  const locked = await db.collection<Investment>(COL_INVESTMENTS).findOneAndUpdate(
    { _id: invId, status: "listing" },
    { $set: { status: "closed", closed_at: now } },
    { returnDocument: "after" }
  );
  if (!locked) {
    return db.collection<Investment>(COL_INVESTMENTS).findOne({ _id: invId });
  }

  const totalOpenedAgg = await db
    .collection(COL_INVESTMENT_LOTS)
    .aggregate<{ total: number }>([
      { $match: { investment_id: invId } },
      { $group: { _id: null, total: { $sum: "$qty_opened" } } },
    ])
    .next();
  const totalOpened = totalOpenedAgg?.total ?? 0;
  const basis = computeCostBasisPerUnit(locked, totalOpened);
  await db
    .collection(COL_INVESTMENT_LOTS)
    .updateMany(
      { investment_id: invId },
      { $set: { frozen_at: now, cost_basis_per_unit: basis } }
    );

  return locked;
}

export interface LotListItem {
  id: string;
  cardmarket_id: number;
  foil: boolean;
  condition: string;
  language: string;
  name: string | null;
  set_code: string | null;
  qty_opened: number;
  qty_sold: number;
  qty_remaining: number;
  cost_basis_per_unit: number | null;
  proceeds_eur: number;
  live_price_eur: number | null;
}

export async function listLots(params: {
  id: string;
  search?: string;
  foil?: boolean;
  language?: string;
  minRemaining?: number;
}): Promise<LotListItem[]> {
  await ensureInvestmentIndexes();
  if (!ObjectId.isValid(params.id)) return [];
  const db = await getDb();
  const filter: Record<string, unknown> = { investment_id: new ObjectId(params.id) };
  if (params.foil !== undefined) filter.foil = params.foil;
  if (params.language !== undefined) filter.language = params.language;
  if (params.minRemaining !== undefined) filter.qty_remaining = { $gte: params.minRemaining };
  const lots = await db
    .collection(COL_INVESTMENT_LOTS)
    .find(filter)
    .toArray();
  if (lots.length === 0) return [];
  const cmIds = Array.from(new Set(lots.map((l) => l.cardmarket_id as number)));
  const cards = await db
    .collection("dashboard_ev_cards")
    .find({ cardmarket_id: { $in: cmIds } })
    .project<{ cardmarket_id: number; name: string; set: string; cm_prices?: Record<string, { trend?: number }> }>({
      cardmarket_id: 1,
      name: 1,
      set: 1,
      cm_prices: 1,
    })
    .toArray();
  const cardByCmId = new Map<number, (typeof cards)[number]>();
  for (const c of cards) cardByCmId.set(c.cardmarket_id, c);
  const rows: LotListItem[] = lots.map((l) => {
    const card = cardByCmId.get(l.cardmarket_id as number);
    const priceKey = l.foil ? "foil" : "nonfoil";
    const trend =
      (card?.cm_prices?.[priceKey]?.trend as number | undefined) ?? null;
    return {
      id: String(l._id),
      cardmarket_id: l.cardmarket_id as number,
      foil: l.foil as boolean,
      condition: l.condition as string,
      language: (l.language as string) ?? "English",
      name: card?.name ?? null,
      set_code: card?.set ?? null,
      qty_opened: l.qty_opened as number,
      qty_sold: l.qty_sold as number,
      qty_remaining: l.qty_remaining as number,
      cost_basis_per_unit: (l.cost_basis_per_unit as number | null) ?? null,
      proceeds_eur: l.proceeds_eur as number,
      live_price_eur: trend,
    };
  });
  if (params.search) {
    const q = params.search.toLowerCase();
    return rows.filter((r) => r.name?.toLowerCase().includes(q));
  }
  return rows;
}

export type AdjustLotResult = "ok" | "not_found" | "below_sold" | "frozen" | "invalid_input";

export async function adjustLot(params: {
  id: string;
  lotId: string;
  qtyOpened: number;
}): Promise<AdjustLotResult> {
  await ensureInvestmentIndexes();
  if (!ObjectId.isValid(params.id) || !ObjectId.isValid(params.lotId)) return "invalid_input";
  if (!Number.isFinite(params.qtyOpened) || params.qtyOpened < 0) return "invalid_input";
  const db = await getDb();
  const lotId = new ObjectId(params.lotId);

  const res = await db.collection(COL_INVESTMENT_LOTS).updateOne(
    {
      _id: lotId,
      investment_id: new ObjectId(params.id),
      frozen_at: { $exists: false },
      qty_sold: { $lte: params.qtyOpened },
    },
    [
      {
        $set: {
          qty_opened: params.qtyOpened,
          qty_remaining: { $subtract: [params.qtyOpened, "$qty_sold"] },
        },
      },
    ]
  );
  if (res.matchedCount > 0) return "ok";

  const lot = await db.collection(COL_INVESTMENT_LOTS).findOne({
    _id: lotId,
    investment_id: new ObjectId(params.id),
  });
  if (!lot) return "not_found";
  if (lot.frozen_at) return "frozen";
  if ((lot.qty_sold as number) > params.qtyOpened) return "below_sold";
  return "not_found";
}
