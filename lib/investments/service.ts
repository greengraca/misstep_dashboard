import { ObjectId, type Db } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { COL_PRODUCTS as COL_EV_PRODUCTS, latestPlayEvBySet } from "@/lib/ev-products";
import {
  COL_INVESTMENTS,
  COL_INVESTMENT_BASELINE,
  COL_INVESTMENT_LOTS,
  COL_INVESTMENT_SALE_LOG,
  ensureInvestmentIndexes,
} from "./db";
import { computeExpectedOpenCardCount, computeCostBasisPerUnit } from "./math";
import type {
  CreateInvestmentBody,
  Investment,
  InvestmentListItem,
  InvestmentSource,
  UpdateInvestmentBody,
} from "./types";
import type { EvProduct } from "@/lib/types";

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
  // Compute expected_open_card_count up front.
  const stub: Investment = {
    _id: new ObjectId(),
    name: params.body.name.trim(),
    created_at: now,
    created_by: params.userId,
    status: "baseline_captured",
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

/** Resolve default CM set-name variants for an investment's source.
 *  Looks up dashboard_ev_sets for box-kind; uses EvProduct's parent_set_code for product-kind. */
async function defaultCmSetNames(db: Db, source: InvestmentSource): Promise<string[]> {
  if (source.kind === "box") {
    const set = await db
      .collection("dashboard_ev_sets")
      .findOne({ code: source.set_code }, { projection: { name: 1 } });
    return set?.name ? [set.name as string] : [];
  }
  const p = await db
    .collection<EvProduct>(COL_EV_PRODUCTS)
    .findOne({ slug: source.product_slug }, { projection: { parent_set_code: 1 } });
  if (!p?.parent_set_code) return [];
  const set = await db
    .collection("dashboard_ev_sets")
    .findOne({ code: p.parent_set_code }, { projection: { name: 1 } });
  return set?.name ? [set.name as string] : [];
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

/**
 * Hard-delete the investment and every row that references it across the
 * four investment collections. Returns per-collection deletion counts for
 * the activity log / UI confirmation. Use archiveInvestment for soft-delete
 * — this is the "I really mean it" path and cannot be reversed.
 */
export async function deleteInvestmentPermanent(id: string): Promise<
  | {
      deleted: true;
      counts: { investment: number; baseline: number; lots: number; sale_log: number };
    }
  | { deleted: false }
> {
  await ensureInvestmentIndexes();
  if (!ObjectId.isValid(id)) return { deleted: false };
  const db = await getDb();
  const invId = new ObjectId(id);
  const [baseline, lots, saleLog, inv] = await Promise.all([
    db.collection(COL_INVESTMENT_BASELINE).deleteMany({ investment_id: invId }),
    db.collection(COL_INVESTMENT_LOTS).deleteMany({ investment_id: invId }),
    db.collection(COL_INVESTMENT_SALE_LOG).deleteMany({ investment_id: invId }),
    db.collection(COL_INVESTMENTS).deleteOne({ _id: invId }),
  ]);
  if (inv.deletedCount === 0) return { deleted: false };
  return {
    deleted: true,
    counts: {
      investment: inv.deletedCount,
      baseline: baseline.deletedCount ?? 0,
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

export async function computeBaselineProgress(investmentId: ObjectId): Promise<{
  captured_count: number;
  expected_total_count: number | null;
  complete: boolean;
}> {
  const db = await getDb();
  const [inv, capturedCount] = await Promise.all([
    db.collection<Investment>(COL_INVESTMENTS).findOne(
      { _id: investmentId },
      { projection: { baseline_total_expected: 1 } }
    ),
    db.collection(COL_INVESTMENT_BASELINE).countDocuments({ investment_id: investmentId }),
  ]);
  const expected = inv?.baseline_total_expected ?? null;
  const complete = expected != null && capturedCount >= expected;
  return { captured_count: capturedCount, expected_total_count: expected, complete };
}

/**
 * Sum qty + (qty * price) across all baseline rows for the investment.
 * Rendered on the investment detail page so the user sees "at baseline time
 * I had N cards listed worth €X" — gives context for subsequent lot growth.
 */
export async function computeBaselineTotals(investmentId: ObjectId): Promise<{
  total_cards: number;
  total_value_eur: number;
} | null> {
  const db = await getDb();
  const row = await db
    .collection(COL_INVESTMENT_BASELINE)
    .aggregate<{ total_cards: number; total_value_eur: number }>([
      { $match: { investment_id: investmentId } },
      {
        $group: {
          _id: null,
          total_cards: { $sum: "$qty_baseline" },
          total_value_eur: {
            $sum: { $multiply: ["$qty_baseline", { $ifNull: ["$price_eur", 0] }] },
          },
        },
      },
    ])
    .next();
  if (!row) return null;
  return {
    total_cards: row.total_cards ?? 0,
    total_value_eur: row.total_value_eur ?? 0,
  };
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
  // product-kind: read latest snapshot from dashboard_ev_snapshots
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
  const baseline =
    inv.status === "baseline_captured"
      ? await computeBaselineProgress(inv._id)
      : undefined;
  const baselineTotals = await computeBaselineTotals(inv._id);
  return {
    id: String(inv._id),
    name: inv.name,
    status: inv.status,
    created_at: inv.created_at.toISOString(),
    created_by: inv.created_by,
    cost_total_eur: inv.cost_total_eur,
    cost_notes: inv.cost_notes,
    source: inv.source,
    cm_set_names: inv.cm_set_names,
    sealed_flips: inv.sealed_flips,
    expected_open_card_count: inv.expected_open_card_count,
    baseline_completed_at: inv.baseline_completed_at?.toISOString(),
    closed_at: inv.closed_at?.toISOString(),
    kpis: {
      cost_eur: inv.cost_total_eur,
      expected_ev_eur: expected,
      listed_value_eur: listed,
      realized_net_eur: realized,
      net_pl_blended_eur: realized + listed - inv.cost_total_eur,
      break_even_pct: inv.cost_total_eur > 0 ? realized / inv.cost_total_eur : 0,
    },
    baseline_progress: baseline,
    baseline_totals: baselineTotals && baselineTotals.total_cards > 0
      ? baselineTotals
      : undefined,
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

  const flip = {
    recorded_at: new Date(),
    unit_count: params.body.unit_count,
    proceeds_eur: params.body.proceeds_eur,
    note: params.body.note?.trim() || undefined,
  };

  // Source-kind-specific constants captured once; MongoDB computes expected
  // cards atomically from the updated sealed_flips.unit_count sum.
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
  if (inv.status !== "listing" && inv.status !== "baseline_captured") {
    // Already closed or archived — no-op.
    return inv;
  }

  const now = new Date();

  // Atomically flip status first so attribution (which filters by
  // status: "listing") can no longer grow lots for this investment.
  // This is the load-bearing step — all subsequent lot aggregation happens
  // against a ledger that can no longer change.
  const locked = await db.collection<Investment>(COL_INVESTMENTS).findOneAndUpdate(
    { _id: invId, status: { $in: ["listing", "baseline_captured"] } },
    { $set: { status: "closed", closed_at: now } },
    { returnDocument: "after" }
  );
  if (!locked) {
    // A concurrent close already transitioned this investment; return the
    // fresh state.
    return db.collection<Investment>(COL_INVESTMENTS).findOne({ _id: invId });
  }

  // Now safely aggregate and freeze lots.
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

  // Atomic conditional update: refuse frozen, refuse qty below sold.
  // The $subtract reads the live $qty_sold at update time — no TOCTOU window.
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

  // Diagnose the failure for caller-friendly error mapping.
  const lot = await db.collection(COL_INVESTMENT_LOTS).findOne({
    _id: lotId,
    investment_id: new ObjectId(params.id),
  });
  if (!lot) return "not_found";
  if (lot.frozen_at) return "frozen";
  if ((lot.qty_sold as number) > params.qtyOpened) return "below_sold";
  return "not_found"; // fallback
}

/**
 * Baseline targets for the extension's walker:
 *   - cm_expansion_id: numeric Cardmarket expansion id (from the set doc) or
 *     null if we haven't captured the mapping yet (popup falls back to paste).
 *   - cm_set_names: array of Cardmarket-side set name variants, used by
 *     attribution fallback when stock rows lack productId.
 *   - captured_count: distinct article_ids already baselined.
 *   - expected_total_count: last CM-page `.bracketed` total we saw, or null
 *     until the first batch carries total_expected.
 *   - complete: captured_count >= expected_total_count (when known).
 */
export async function getBaselineTargets(params: { id: string }): Promise<{
  cm_expansion_id: number | null;
  cm_set_names: string[];
  captured_count: number;
  expected_total_count: number | null;
  complete: boolean;
} | null> {
  await ensureInvestmentIndexes();
  if (!ObjectId.isValid(params.id)) return null;
  const db = await getDb();
  const invId = new ObjectId(params.id);
  const inv = await db.collection<Investment>(COL_INVESTMENTS).findOne({ _id: invId });
  if (!inv) return null;

  // Resolve the Cardmarket expansion id. Box-kind: direct lookup on ev_sets.
  // Product-kind: use EvProduct.parent_set_code if any, else fall back to the
  // dominant set_code across the product's cards.
  let setCode: string | null = null;
  if (inv.source.kind === "box") {
    setCode = inv.source.set_code;
  } else {
    const p = await db
      .collection<EvProduct>(COL_EV_PRODUCTS)
      .findOne(
        { slug: inv.source.product_slug },
        { projection: { parent_set_code: 1, "cards.set_code": 1 } }
      );
    if (p?.parent_set_code) {
      setCode = p.parent_set_code;
    } else if (p?.cards?.length) {
      const counts = new Map<string, number>();
      for (const c of p.cards) counts.set(c.set_code, (counts.get(c.set_code) ?? 0) + 1);
      let best: string | null = null;
      let bestN = 0;
      for (const [code, n] of counts) {
        if (n > bestN) { best = code; bestN = n; }
      }
      setCode = best;
    }
  }
  let cmExpansionId: number | null = null;
  if (setCode) {
    const set = await db
      .collection("dashboard_ev_sets")
      .findOne<{ cm_expansion_id?: number | null }>(
        { code: setCode },
        { projection: { cm_expansion_id: 1 } }
      );
    cmExpansionId = set?.cm_expansion_id ?? null;
  }

  const capturedCount = await db
    .collection(COL_INVESTMENT_BASELINE)
    .countDocuments({ investment_id: invId });
  const expected = inv.baseline_total_expected ?? null;
  const complete = expected != null && capturedCount >= expected;
  return {
    cm_expansion_id: cmExpansionId,
    cm_set_names: inv.cm_set_names,
    captured_count: capturedCount,
    expected_total_count: expected,
    complete,
  };
}

/**
 * Three-way diagnostic of how much of the investment's expansion the
 * dashboard has already synced, so the walker can short-circuit the walk
 * when there's nothing to do and steer the user otherwise:
 *   - db_stock_count: stock rows in dashboard_cm_stock whose productId
 *     resolves (via ev_cards.cardmarket_id) to a card in the investment's
 *     set. This is "what we think we have on CM for this expansion."
 *   - baseline_captured_count: rows already written to baseline for this
 *     investment. Used to tell "walked once" from "fresh start."
 *   - expected_total_count: stamped on the investment by the last walker
 *     batch. Null for a fresh investment — extension will fill it by
 *     reading the idExpansion dropdown on the CM page.
 * The caller compares db_stock_count to the CM-reported count to decide
 * whether to snapshot-from-stock, walk for missing rows, or walk to prune.
 */
export async function computeBaselineDiagnosis(params: {
  id: string;
}): Promise<
  | {
      cm_expansion_id: number | null;
      set_code: string | null;
      db_stock_count: number;
      baseline_captured_count: number;
      expected_total_count: number | null;
    }
  | null
> {
  await ensureInvestmentIndexes();
  if (!ObjectId.isValid(params.id)) return null;
  const db = await getDb();
  const invId = new ObjectId(params.id);
  const inv = await db.collection<Investment>(COL_INVESTMENTS).findOne({ _id: invId });
  if (!inv) return null;

  // Resolve set_code (identical logic to getBaselineTargets — small enough
  // to duplicate; extracting further would ripple into a 3rd caller).
  let setCode: string | null = null;
  if (inv.source.kind === "box") {
    setCode = inv.source.set_code;
  } else {
    const p = await db
      .collection<EvProduct>(COL_EV_PRODUCTS)
      .findOne(
        { slug: inv.source.product_slug },
        { projection: { parent_set_code: 1, "cards.set_code": 1 } }
      );
    if (p?.parent_set_code) {
      setCode = p.parent_set_code;
    } else if (p?.cards?.length) {
      const counts = new Map<string, number>();
      for (const c of p.cards) counts.set(c.set_code, (counts.get(c.set_code) ?? 0) + 1);
      let best: string | null = null;
      let bestN = 0;
      for (const [code, n] of counts) {
        if (n > bestN) { best = code; bestN = n; }
      }
      setCode = best;
    }
  }

  let cmExpansionId: number | null = null;
  let dbStockCount = 0;
  if (setCode) {
    const [set, cardIds] = await Promise.all([
      db
        .collection("dashboard_ev_sets")
        .findOne<{ cm_expansion_id?: number | null }>(
          { code: setCode },
          { projection: { cm_expansion_id: 1 } }
        ),
      db
        .collection("dashboard_ev_cards")
        .find(
          { set: setCode, cardmarket_id: { $ne: null } },
          { projection: { cardmarket_id: 1 } }
        )
        .toArray(),
    ]);
    cmExpansionId = set?.cm_expansion_id ?? null;
    const productIds = cardIds.map((c) => c.cardmarket_id as number);
    // Match stock rows two ways, unioned:
    //   1. productId ∈ ev_cards.cardmarket_id for this set (clean match —
    //      exists for any row captured by ext ≥ v1.7.1).
    //   2. set (CM name) ∈ cm_set_names on the investment — catches older
    //      stock rows synced before productId capture was added, which
    //      often have productId=null for whole expansions.
    // Without (2) we were missing 580/589 of this user's Foundations
    // Jumpstart rows. db_stock_count is a card count (sum qty) so the
    // unit matches what Cardmarket shows in its idExpansion dropdown.
    const orClauses = [];
    if (productIds.length > 0) orClauses.push({ productId: { $in: productIds } });
    if (inv.cm_set_names && inv.cm_set_names.length > 0) {
      orClauses.push({ set: { $in: inv.cm_set_names } });
    }
    if (orClauses.length > 0) {
      const agg = await db
        .collection("dashboard_cm_stock")
        .aggregate<{ total: number }>([
          { $match: orClauses.length === 1 ? orClauses[0] : { $or: orClauses } },
          { $group: { _id: null, total: { $sum: "$qty" } } },
        ])
        .next();
      dbStockCount = agg?.total ?? 0;
    }
  }

  const baselineCaptured = await db
    .collection(COL_INVESTMENT_BASELINE)
    .countDocuments({ investment_id: invId });

  return {
    cm_expansion_id: cmExpansionId,
    set_code: setCode,
    db_stock_count: dbStockCount,
    baseline_captured_count: baselineCaptured,
    expected_total_count: inv.baseline_total_expected ?? null,
  };
}

/**
 * Short-circuit the baseline walk when dashboard stock for the expansion
 * already equals the Cardmarket total. Copies every matching stock row
 * into dashboard_investment_baseline using dedupKey as a synthetic
 * article_id (real article_ids come from the walker; dedupKey keys a
 * unique stock row just as reliably for baseline purposes). Stamps
 * total_expected on the investment so the detail-page progress bar
 * reads "complete". Returns the number of baseline rows written.
 *
 * Caller requirements:
 *   - Should have verified via computeBaselineDiagnosis that db_stock_count
 *     is consistent with the CM-reported total before calling, otherwise
 *     the snapshot will be incomplete.
 *   - Pass total_expected = CM-reported count (from the idExpansion
 *     dropdown) so the progress indicator matches what Cardmarket shows.
 */
export async function snapshotBaselineFromStock(params: {
  id: string;
  total_expected: number;
}): Promise<{ snapshotted: number } | null> {
  await ensureInvestmentIndexes();
  if (!ObjectId.isValid(params.id)) return null;
  if (!Number.isInteger(params.total_expected) || params.total_expected < 0) {
    return null;
  }
  const db = await getDb();
  const invId = new ObjectId(params.id);
  const inv = await db.collection<Investment>(COL_INVESTMENTS).findOne({ _id: invId });
  if (!inv) return null;

  // Same set_code resolution as computeBaselineDiagnosis. Could extract
  // but the code is short enough to inline here and avoid cross-function
  // coupling.
  let setCode: string | null = null;
  if (inv.source.kind === "box") {
    setCode = inv.source.set_code;
  } else {
    const p = await db
      .collection<EvProduct>(COL_EV_PRODUCTS)
      .findOne(
        { slug: inv.source.product_slug },
        { projection: { parent_set_code: 1, "cards.set_code": 1 } }
      );
    if (p?.parent_set_code) setCode = p.parent_set_code;
    else if (p?.cards?.length) {
      const counts = new Map<string, number>();
      for (const c of p.cards) counts.set(c.set_code, (counts.get(c.set_code) ?? 0) + 1);
      let best: string | null = null;
      let bestN = 0;
      for (const [code, n] of counts) {
        if (n > bestN) { best = code; bestN = n; }
      }
      setCode = best;
    }
  }
  if (!setCode) return { snapshotted: 0 };

  const cards = await db
    .collection("dashboard_ev_cards")
    .find<{ cardmarket_id: number | null }>(
      { set: setCode, cardmarket_id: { $ne: null } },
      { projection: { cardmarket_id: 1 } }
    )
    .toArray();
  const productIds = cards.map((c) => c.cardmarket_id).filter((x): x is number => x != null);
  if (productIds.length === 0) return { snapshotted: 0 };

  const stockRows = await db
    .collection("dashboard_cm_stock")
    .find<{
      productId: number;
      foil?: boolean;
      condition?: string;
      language?: string;
      qty?: number;
      price?: number;
      dedupKey?: string;
      articleId?: string;
    }>({ productId: { $in: productIds } })
    .toArray();

  const now = new Date();
  let snapshotted = 0;
  for (const r of stockRows) {
    // Prefer real articleId when present (product_page source rows); fall
    // back to dedupKey for stock_page rows that never had an article id.
    // Both are unique per stock row, which is all baseline_v3_unique needs.
    const articleId = r.articleId || r.dedupKey;
    if (!articleId) continue;
    const qty = Number.isInteger(r.qty) ? (r.qty as number) : 0;
    const price = Number.isFinite(r.price) ? (r.price as number) : 0;
    const condition = typeof r.condition === "string" ? r.condition : "NM";
    const language = typeof r.language === "string" ? r.language : "English";
    const foil = !!r.foil;
    const res = await db.collection(COL_INVESTMENT_BASELINE).updateOne(
      { investment_id: invId, article_id: articleId },
      {
        $set: {
          qty_baseline: qty,
          price_eur: price,
          cardmarket_id: r.productId,
          foil,
          condition,
          language,
          captured_at: now,
        },
        $setOnInsert: { investment_id: invId, article_id: articleId },
      },
      { upsert: true }
    );
    if (res.upsertedCount > 0 || res.modifiedCount > 0) snapshotted++;
  }

  // Stamp the total expected (from CM) so progress reads as complete.
  await db.collection(COL_INVESTMENTS).updateOne(
    { _id: invId },
    { $set: { baseline_total_expected: params.total_expected } }
  );

  return { snapshotted };
}

export async function upsertBaselineBatch(params: {
  id: string;
  body: import("./types").BaselineBatchBody;
}): Promise<{ upserted: number; skipped: number; captured_count: number } | null> {
  await ensureInvestmentIndexes();
  if (!ObjectId.isValid(params.id)) return null;
  const db = await getDb();
  const invId = new ObjectId(params.id);
  const inv = await db
    .collection<Investment>(COL_INVESTMENTS)
    .findOne({ _id: invId });
  if (!inv) return null;

  // Resolve the investment's Scryfall set_code for fallback
  // cardmarket_id lookups — see below.
  let setCodeForResolve: string | null = null;
  if (inv.source.kind === "box") {
    setCodeForResolve = inv.source.set_code;
  } else {
    const p = await db
      .collection<EvProduct>(COL_EV_PRODUCTS)
      .findOne(
        { slug: inv.source.product_slug },
        { projection: { parent_set_code: 1, "cards.set_code": 1 } }
      );
    if (p?.parent_set_code) setCodeForResolve = p.parent_set_code;
    else if (p?.cards?.length) {
      const counts = new Map<string, number>();
      for (const c of p.cards) counts.set(c.set_code, (counts.get(c.set_code) ?? 0) + 1);
      let best: string | null = null;
      let bestN = 0;
      for (const [code, n] of counts) {
        if (n > bestN) { best = code; bestN = n; }
      }
      setCodeForResolve = best;
    }
  }

  // Pre-fetch the name → cardmarket_id map for this set so we don't hit
  // ev_cards per missing-cardmarket_id listing (the common case — CM
  // /Stock/Offers/Singles rows often lack an idProduct anchor). One
  // query covers the whole batch.
  const nameToCmId = new Map<string, number>();
  if (setCodeForResolve) {
    const cards = await db
      .collection("dashboard_ev_cards")
      .find<{ name: string; cardmarket_id: number | null }>(
        { set: setCodeForResolve, cardmarket_id: { $ne: null } },
        { projection: { name: 1, cardmarket_id: 1 } }
      )
      .toArray();
    for (const c of cards) {
      if (c.cardmarket_id != null && c.name) {
        nameToCmId.set(c.name, c.cardmarket_id);
      }
    }
  }

  const now = new Date();
  let upserted = 0;
  let skipped = 0;
  for (const l of params.body.listings) {
    // Resolve cardmarket_id: prefer client-supplied, fall back to
    // ev_cards lookup by name+set. Leaving it null is acceptable for
    // baseline visibility; attribution simply won't match those rows
    // later (see maybeGrowLot's tuple filter).
    let cardmarketId: number | null = null;
    if (typeof l.cardmarket_id === "number" && Number.isSafeInteger(l.cardmarket_id) && l.cardmarket_id > 0) {
      cardmarketId = l.cardmarket_id;
    } else if (typeof l.name === "string" && l.name.length > 0) {
      cardmarketId = nameToCmId.get(l.name) ?? null;
    }

    if (
      typeof l.article_id !== "string" || l.article_id.length === 0 || l.article_id.length > 128 ||
      typeof l.foil !== "boolean" ||
      typeof l.condition !== "string" || l.condition.length === 0 || l.condition.length > 8 ||
      typeof l.language !== "string" || l.language.length === 0 || l.language.length > 16 ||
      !Number.isFinite(l.qty) || !Number.isInteger(l.qty) || l.qty < 0 ||
      !Number.isFinite(l.price_eur) || l.price_eur < 0
    ) {
      skipped++;
      continue;
    }
    const res = await db.collection(COL_INVESTMENT_BASELINE).updateOne(
      { investment_id: invId, article_id: l.article_id },
      {
        $set: {
          qty_baseline: l.qty,
          price_eur: l.price_eur,
          cardmarket_id: cardmarketId,
          foil: l.foil,
          condition: l.condition,
          language: l.language,
          captured_at: now,
        },
        $setOnInsert: {
          investment_id: invId,
          article_id: l.article_id,
        },
      },
      { upsert: true }
    );
    if (res.upsertedCount > 0 || res.modifiedCount > 0) upserted++;
  }

  // Stamp the latest CM page-header total so progress reporting reflects
  // the newest walk filter. Only overwrite when the batch actually sent
  // one; partial batches without a header read shouldn't clobber prior.
  if (typeof params.body.total_expected === "number" && params.body.total_expected >= 0) {
    await db.collection(COL_INVESTMENTS).updateOne(
      { _id: invId },
      { $set: { baseline_total_expected: params.body.total_expected } }
    );
  }

  if (skipped > 0) {
    console.warn("investments-baseline-batch: skipped invalid items", { id: params.id, skipped });
  }

  const capturedCount = await db
    .collection(COL_INVESTMENT_BASELINE)
    .countDocuments({ investment_id: invId });
  return { upserted, skipped, captured_count: capturedCount };
}

/**
 * Remove stock rows that match the investment's expansion but have no
 * corresponding baseline tuple. Used by markBaselineComplete when the
 * walker's coverage is sufficient to treat missing rows as genuinely
 * stale (as opposed to "the walker just didn't reach that bucket").
 *
 * Tuple match is on {productId, foil, condition, language} (ignoring
 * article_id + price) so stock rows from stock_page source — which
 * often lack article_id — still get matched against baseline rows that
 * share the same card variant.
 */
export async function cleanupStaleStockForInvestment(
  id: string
): Promise<{ deleted: number } | null> {
  await ensureInvestmentIndexes();
  if (!ObjectId.isValid(id)) return null;
  const db = await getDb();
  const invId = new ObjectId(id);
  const inv = await db.collection<Investment>(COL_INVESTMENTS).findOne({ _id: invId });
  if (!inv) return null;

  // Resolve set_code (same logic as computeBaselineDiagnosis — kept
  // inline to avoid tight cross-helper coupling).
  let setCode: string | null = null;
  if (inv.source.kind === "box") {
    setCode = inv.source.set_code;
  } else {
    const p = await db
      .collection<EvProduct>(COL_EV_PRODUCTS)
      .findOne(
        { slug: inv.source.product_slug },
        { projection: { parent_set_code: 1, "cards.set_code": 1 } }
      );
    if (p?.parent_set_code) setCode = p.parent_set_code;
    else if (p?.cards?.length) {
      const counts = new Map<string, number>();
      for (const c of p.cards) counts.set(c.set_code, (counts.get(c.set_code) ?? 0) + 1);
      let best: string | null = null;
      let bestN = 0;
      for (const [code, n] of counts) {
        if (n > bestN) { best = code; bestN = n; }
      }
      setCode = best;
    }
  }
  if (!setCode) return { deleted: 0 };

  const cards = await db
    .collection("dashboard_ev_cards")
    .find<{ cardmarket_id: number | null }>(
      { set: setCode, cardmarket_id: { $ne: null } },
      { projection: { cardmarket_id: 1 } }
    )
    .toArray();
  const productIds = cards.map((c) => c.cardmarket_id).filter((x): x is number => x != null);
  const cmSetNames = inv.cm_set_names ?? [];
  if (productIds.length === 0 && cmSetNames.length === 0) return { deleted: 0 };

  // Build the valid-tuple set from baseline. Each baseline row contributes
  // a single tuple string; multiple article_ids collapsing to one tuple
  // is fine (Set dedups).
  const baselineTuples = await db
    .collection(COL_INVESTMENT_BASELINE)
    .aggregate<{ _id: { productId: number; foil: boolean; condition: string; language: string } }>([
      { $match: { investment_id: invId } },
      {
        $group: {
          _id: {
            productId: "$cardmarket_id",
            foil: "$foil",
            condition: "$condition",
            language: "$language",
          },
        },
      },
    ])
    .toArray();
  const valid = new Set<string>();
  for (const t of baselineTuples) {
    valid.add(`${t._id.productId}|${t._id.foil}|${t._id.condition}|${t._id.language}`);
  }
  if (valid.size === 0) return { deleted: 0 };

  // Pull every stock row for the expansion (same UNION semantics as
  // computeBaselineDiagnosis — productId join OR CM-name match). The
  // CM-name branch catches pre-v1.7.1 rows with productId=null that
  // the join-only branch would miss entirely.
  const stockOrClauses = [];
  if (productIds.length > 0) stockOrClauses.push({ productId: { $in: productIds } });
  if (cmSetNames.length > 0) stockOrClauses.push({ set: { $in: cmSetNames } });
  const stockRows = await db
    .collection("dashboard_cm_stock")
    .find<{
      _id: ObjectId;
      productId?: number | null;
      foil?: boolean;
      condition?: string;
      language?: string;
    }>(stockOrClauses.length === 1 ? stockOrClauses[0] : { $or: stockOrClauses })
    .project({ _id: 1, productId: 1, foil: 1, condition: 1, language: 1 })
    .toArray();
  const staleIds: ObjectId[] = [];
  for (const r of stockRows) {
    // Rows with productId=null never appear in the baseline collection
    // (baseline keys require a real cardmarket_id), so the tuple lookup
    // will always miss and they'll be pruned as stale. That's the
    // intended behaviour — those rows are pre-v1.7.1 cruft that can't
    // be joined to attribution anyway.
    const pid = r.productId ?? null;
    const key = `${pid}|${!!r.foil}|${r.condition ?? "NM"}|${r.language ?? "English"}`;
    if (!valid.has(key)) staleIds.push(r._id);
  }
  if (staleIds.length === 0) return { deleted: 0 };

  const res = await db
    .collection("dashboard_cm_stock")
    .deleteMany({ _id: { $in: staleIds } });
  return { deleted: res.deletedCount ?? 0 };
}

export async function markBaselineComplete(params: {
  id: string;
}): Promise<{ investment: Investment; cleaned: number; cleanup_skipped?: string } | null> {
  await ensureInvestmentIndexes();
  if (!ObjectId.isValid(params.id)) return null;
  const db = await getDb();
  const invId = new ObjectId(params.id);

  // Coverage guard: only run cleanup when baseline cards ≥ expected (from
  // the CM dropdown via the walker/snapshot). Otherwise a partial walk +
  // mark-complete would treat legitimate un-walked stock as stale and
  // delete it. At 0 expected we also skip — can't trust the coverage
  // signal if we never heard from the walker.
  const invBefore = await db
    .collection<Investment>(COL_INVESTMENTS)
    .findOne(
      { _id: invId },
      { projection: { baseline_total_expected: 1, status: 1 } }
    );
  if (!invBefore) return null;

  const expected = invBefore.baseline_total_expected ?? null;
  const capturedAgg = await db
    .collection(COL_INVESTMENT_BASELINE)
    .aggregate<{ total: number }>([
      { $match: { investment_id: invId } },
      { $group: { _id: null, total: { $sum: "$qty_baseline" } } },
    ])
    .next();
  const capturedCards = capturedAgg?.total ?? 0;

  // Flip status first so attribution/consumeSale stop considering this
  // investment as a growth target between here and the cleanup write.
  const res = await db
    .collection<Investment>(COL_INVESTMENTS)
    .findOneAndUpdate(
      { _id: invId, status: "baseline_captured" },
      { $set: { status: "listing", baseline_completed_at: new Date() } },
      { returnDocument: "after" }
    );
  if (!res) return null;

  let cleaned = 0;
  let skipped: string | undefined;
  if (expected == null || expected === 0) {
    skipped = "no_expected_total";
  } else if (capturedCards < expected) {
    skipped = "insufficient_coverage";
  } else {
    const cleanup = await cleanupStaleStockForInvestment(params.id);
    cleaned = cleanup?.deleted ?? 0;
  }

  return { investment: res, cleaned, cleanup_skipped: skipped };
}
