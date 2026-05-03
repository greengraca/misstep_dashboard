import { after } from "next/server";
import { getDb } from "@/lib/mongodb";
import { COLLECTION_PREFIX } from "@/lib/constants";
import { logError } from "@/lib/error-log";
import {
  maybeGrowLot,
  consumeSale,
  reverseSale,
} from "@/lib/investments/attribution";
import { parseInvestmentTag } from "@/lib/investments/codes";
import type {
  CmBalanceSnapshot,
  CmOrder,
  CmOrderDetail,
  CmOrderItem,
  CmStockListing,
  CmStockSnapshot,
  CmTransactionSummary,
  CmProductStockListing,
  CmSyncLogEntry,
  ExtSyncBatchItem,
} from "@/lib/types";

// ── Collection names ────────────────────────────────────────────────

const COL = {
  balance: `${COLLECTION_PREFIX}cm_balance`,
  orders: `${COLLECTION_PREFIX}cm_orders`,
  orderItems: `${COLLECTION_PREFIX}cm_order_items`,
  stock: `${COLLECTION_PREFIX}cm_stock`,
  stockSnapshots: `${COLLECTION_PREFIX}cm_stock_snapshots`,
  pipelineSnapshots: `${COLLECTION_PREFIX}cm_pipeline_snapshots`,
  transactions: `${COLLECTION_PREFIX}cm_transactions`,
  syncLog: `${COLLECTION_PREFIX}sync_log`,
} as const;

// ── Index management ────────────────────────────────────────────────

let indexesEnsured = false;

/**
 * Ensure all cardmarket indexes exist. Each index is built independently
 * so a single failure (e.g. a unique index blocked by pre-existing
 * duplicates) doesn't prevent the others. Failures are logged — the
 * previous version swallowed them silently, leaving stale state invisible.
 */
async function ensureIndexes() {
  if (indexesEnsured) return;
  const db = await getDb();

  type Spec = {
    col: string;
    key: Record<string, 1 | -1>;
    options?: { unique?: boolean; sparse?: boolean; name?: string };
  };

  const specs: Spec[] = [
    { col: COL.balance, key: { extractedAt: -1 } },
    { col: COL.orders, key: { orderId: 1 }, options: { unique: true } },
    { col: COL.orders, key: { status: 1, direction: 1 } },
    { col: COL.orders, key: { orderDate: -1 } },
    { col: COL.orderItems, key: { orderId: 1 } },
    { col: COL.stock, key: { dedupKey: 1 }, options: { unique: true, name: "dedupKey_1" } },
    { col: COL.stock, key: { source: 1 } },
    { col: COL.stock, key: { lastSeenAt: -1 } },
    { col: COL.stock, key: { name: 1 } },
    { col: COL.stock, key: { set: 1, condition: 1 } },
    { col: COL.stock, key: { price: 1 } },
    { col: COL.stock, key: { articleId: 1 }, options: { unique: true, sparse: true } },
    { col: COL.stock, key: { productId: 1, foil: 1, condition: 1 }, options: { name: "productId_foil_condition" } },
    { col: COL.stockSnapshots, key: { extractedAt: -1 } },
    { col: COL.pipelineSnapshots, key: { extractedAt: -1 } },
    { col: COL.transactions, key: { dedupKey: 1 }, options: { unique: true } },
    { col: COL.syncLog, key: { receivedAt: -1 } },
  ];

  const results = await Promise.allSettled(
    specs.map(async (s) => {
      try {
        await db.collection(s.col).createIndex(s.key, s.options ?? {});
      } catch (err) {
        // Rethrow so Promise.allSettled marks this spec as rejected;
        // we'll log the failure below rather than silently ignoring.
        throw new Error(
          `${s.col} ${JSON.stringify(s.key)}${s.options?.unique ? " unique" : ""}: ${(err as Error).message}`
        );
      }
    })
  );

  for (const r of results) {
    if (r.status === "rejected") {
      // Non-fatal — rest of the module still works without this index.
      // Surfaces into error log so we can spot silent index failures
      // (e.g. a unique index blocked by pre-existing duplicates).
      console.warn("[cardmarket indexes]", r.reason);
      logError("warn", "cardmarket-indexes", String(r.reason), null);
    }
  }

  indexesEnsured = true;
}

// ── Rate limiting (in-memory) ───────────────────────────────────────

const lastSyncByMember = new Map<string, number>();
const SYNC_COOLDOWN_MS = 10_000;

export function checkRateLimit(memberName: string): { ok: boolean; retryAfter?: number } {
  const last = lastSyncByMember.get(memberName) || 0;
  const elapsed = Date.now() - last;
  if (elapsed < SYNC_COOLDOWN_MS) {
    return { ok: false, retryAfter: Math.ceil((SYNC_COOLDOWN_MS - elapsed) / 1000) };
  }
  lastSyncByMember.set(memberName, Date.now());
  return { ok: true };
}

// ── Price parsing ───────────────────────────────────────────────────

export function parseEurPrice(str: string): number | null {
  if (!str) return null;
  const m = str.match(/([\d.,]+)\s*€/);
  if (!m) return null;
  return parseFloat(m[1].replace(".", "").replace(",", "."));
}

// ── Sync processing ─────────────────────────────────────────────────

export async function processSync(
  submittedBy: string,
  batch: ExtSyncBatchItem[]
): Promise<Record<string, { added: number; updated: number; skipped: number; removed?: number }>> {
  await ensureIndexes();
  // Stable sort: ensure "stock" items run before "stock_overview" so the
  // overview snapshot reflects the freshly-synced stock state (see T6).
  const orderedBatch = [...batch].sort((a, b) => {
    const priority = (t: string) =>
      t === "stock" ? 0 : t === "stock_overview" ? 1 : 2;
    return priority(a.type) - priority(b.type);
  });
  const results: Record<string, { added: number; updated: number; skipped: number; removed?: number }> = {};
  const details: Record<string, string> = {};

  // Deduplicate orderIds across multiple "orders" batch items.
  // The extension queues batches from different tabs in order visited;
  // during SPA tab navigation, a race condition can produce a duplicate
  // batch where the DOM hasn't updated but the URL has, tagging stale
  // orders with the wrong status. First-seen orderId wins.
  const seenOrderIds = new Set<string>();

  for (const item of orderedBatch) {
    switch (item.type) {
      case "balance": {
        results.balance = await processBalance(submittedBy, item.data);
        const bal = item.data.balance as number;
        details.balance = `\u20AC${bal?.toFixed(2) ?? "?"}`;
        break;
      }
      case "orders": {
        const data = item.data as Record<string, unknown>;
        const orders = data.orders as CmOrder[];
        const fresh = orders.filter(o => !seenOrderIds.has(o.orderId));
        fresh.forEach(o => seenOrderIds.add(o.orderId));
        if (fresh.length > 0) {
          const r = await processOrders(submittedBy, { ...data, orders: fresh });
          // Accumulate stats across multiple orders batches
          if (results.orders) {
            results.orders.added += r.added;
            results.orders.updated += r.updated;
            results.orders.skipped += r.skipped;
          } else {
            results.orders = r;
          }
        }
        // Build descriptive details for orders
        const dir = (data.direction as string) || "sale";
        const st = (data.status as string) || "?";
        const totalCount = (data.totalCount as number) || 0;
        const currentPage = (data.currentPage as number) || 1;
        const totalPages = (data.totalPages as number) || 1;
        const syncedCount = (data.orders as CmOrder[])?.length || 0;
        // Compare: how many does the dashboard have for this status/direction?
        const dbCount = await getOrderCountForStatus(st, dir);
        const pageInfo = totalPages > 1 ? ` (pg ${currentPage}/${totalPages})` : "";
        const cmVsDb = totalCount > 0 ? ` | CM: ${totalCount}, DB: ${dbCount}` : "";
        const prev = details.orders || "";
        details.orders = prev
          ? `${prev}; ${dir}/${st} ${syncedCount}${pageInfo}${cmVsDb}`
          : `${dir}/${st} ${syncedCount}${pageInfo}${cmVsDb}`;
        break;
      }
      case "order_detail": {
        results.order_detail = await processOrderDetail(submittedBy, item.data);
        const od = item.data as unknown as CmOrderDetail;
        const itemCount = od.items?.length || 0;
        details.order_detail = `#${od.orderId} \u2192 ${od.status || "?"} (${itemCount} item${itemCount !== 1 ? "s" : ""})`;
        break;
      }
      case "stock": {
        results.stock = await processStock(submittedBy, item.data);
        const listings = item.data.listings as CmStockListing[];
        const page = (item.data.page as string) || "";
        details.stock = `${listings?.length || 0} listings${page ? ` ${page}` : ""}`;
        break;
      }
      case "stock_overview":
        results.stock_overview = await processStockOverview(submittedBy, item.data);
        details.stock_overview = `${(item.data.totalListings as number) || 0} total listings`;
        break;
      case "transactions": {
        results.transactions = await processTransactions(submittedBy, item.data);
        const tx = item.data as Record<string, unknown>;
        details.transactions = `${tx.periodStart || "?"} to ${tx.periodEnd || "?"}`;
        break;
      }
      case "product_stock": {
        const psr = await processProductStock(submittedBy, item.data);
        results.product_stock = psr;
        details.product_stock = psr.details;
        break;
      }
      case "card_prices": {
        const cpr = await processCardPrices(item.data);
        results.card_prices = cpr;
        details.card_prices = cpr.details;
        break;
      }
    }
  }

  // Pipeline snapshot: passively capture U/P/S/T totals whenever orders or
  // order_detail or balance moved through this batch. Order_detail changes
  // can flip an order between status buckets without a corresponding orders
  // entry, so it counts. Failure here is non-fatal — pipeline snapshots are
  // additive observability, not part of the order-processing contract.
  if (results.orders || results.order_detail || results.balance) {
    try {
      await processPipelineSnapshot(submittedBy);
    } catch (err) {
      logError(
        "warn",
        "ext-sync-pipeline-snapshot",
        err instanceof Error ? err.message : "unknown error",
        {}
      );
    }
  }

  // Log sync with descriptive details
  const db = await getDb();
  for (const [dataType, stats] of Object.entries(results)) {
    await db.collection(COL.syncLog).insertOne({
      dataType,
      itemCount: stats.added + stats.updated,
      submittedBy,
      receivedAt: new Date().toISOString(),
      stats,
      details: details[dataType] || "",
    });
  }

  return results;
}

// ── Balance (time-series with compression) ──────────────────────────

async function processBalance(
  submittedBy: string,
  data: Record<string, unknown>
): Promise<{ added: number; updated: number; skipped: number }> {
  const db = await getDb();
  const col = db.collection(COL.balance);
  const balance = data.balance as number;
  const now = new Date().toISOString();

  // Get the 3 most recent records for compression logic
  const recent = await col.find().sort({ extractedAt: -1 }).limit(3).toArray();

  if (recent.length >= 2 && recent[0].balance === balance && recent[1].balance === balance) {
    // Same value continuing: delete the middle one, insert new (keeps first + latest)
    await col.deleteOne({ _id: recent[0]._id });
  } else if (recent.length >= 2 && recent[0].balance !== balance &&
             recent[0].balance === recent[1].balance) {
    // Value changed: the previous value had 2 records. Collapse to 1 — keep the
    // earlier one (when that value started), delete the "last confirmed" record.
    await col.deleteOne({ _id: recent[0]._id });
  }

  await col.insertOne({
    balance,
    extractedAt: now,
    submittedBy,
    pageUrl: (data.pageUrl as string) || "",
    createdAt: now,
  });

  return { added: 1, updated: 0, skipped: 0 };
}

// ── Pipeline snapshot (U + P + S totals, time-series compressed) ────

/**
 * Capture a snapshot of the current sales pipeline. Components match the
 * Balance stat-card on the cardmarket page (Balance + U + P + S where
 * S is trustee-sent ONLY — non-trustee sent has already paid into the
 * wallet balance and would double-count). Called passively on every ext
 * sync that processes orders or balance.
 *
 * Compression mirrors processBalance: when the latest 3 snapshots match
 * on the full tuple, drop the middle one so we only keep the boundaries
 * of unchanged stretches.
 */
async function processPipelineSnapshot(submittedBy: string): Promise<void> {
  const db = await getDb();
  const col = db.collection(COL.pipelineSnapshots);

  const [orderValues, trusteeSent, latestBalance] = await Promise.all([
    getOrderValuesByStatus(),
    getTrusteeSentValue(),
    getLatestBalance(),
  ]);
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const balance = round2(latestBalance?.balance || 0);
  const u = round2(orderValues.unpaid || 0);
  const p = round2(orderValues.paid || 0);
  const s = round2(trusteeSent || 0);
  const total = round2(balance + u + p + s);

  const recent = await col.find().sort({ extractedAt: -1 }).limit(2).toArray();
  const sameTuple = (snap: Record<string, unknown>) =>
    round2((snap.balance as number) || 0) === balance &&
    round2((snap.unpaid as number) || 0) === u &&
    round2((snap.paid as number) || 0) === p &&
    round2((snap.sent as number) || 0) === s;

  if (recent.length === 2 && sameTuple(recent[0]) && sameTuple(recent[1])) {
    await col.deleteOne({ _id: recent[0]._id });
  }

  await col.insertOne({
    balance,
    unpaid: u,
    paid: p,
    sent: s,
    total,
    extractedAt: new Date().toISOString(),
    submittedBy,
  });
}

// ── Orders (upsert by orderId) ──────────────────────────────────────

const STATUS_ORDER = ["shopping_cart", "unpaid", "paid", "sent", "arrived"];

// Items that could not be matched against any stock row when we tried to
// remove them on paid-transition. Exposed for logging so the sync_log
// details line can surface diagnostic info ("3 of 5 items matched").
interface SoldItemLike {
  articleId?: string;
  name: string;
  set: string;
  condition: string;
  foil: boolean;
  language?: string;
  qty?: number;
}

/**
 * Decrement stock for sold items. Matching strategy:
 *   1. Exact match by articleId when present (authoritative — product_page
 *      entries carry it).
 *   2. Fallback match by { name, set, condition, foil, language } — NOT
 *      price, since prices on a listing change over time.
 * Decrements qty by item.qty (default 1); deletes the stock row only when
 * the resulting qty is ≤ 0. Returns counts so the caller can log them.
 */
async function removeSoldItemsFromStock(
  items: SoldItemLike[]
): Promise<{ matched: number; unmatched: SoldItemLike[]; decremented: number; deleted: number }> {
  if (!items.length) {
    return { matched: 0, unmatched: [], decremented: 0, deleted: 0 };
  }
  const db = await getDb();
  const col = db.collection(COL.stock);
  const unmatched: SoldItemLike[] = [];
  let matched = 0;
  let decremented = 0;
  let deleted = 0;
  const now = new Date().toISOString();

  for (const item of items) {
    // Try articleId first — exact match when the ext has synced the
    // product page for this listing.
    let stockRow = null;
    if (item.articleId) {
      stockRow = await col.findOne({ articleId: item.articleId });
    }
    // Fall back to tuple match — stock_page entries pre-v1.22.0 don't have
    // articleId until a product_page or v1.22.0+ stock_page sync claims
    // them. When multiple rows match the tuple, pick deterministically
    // instead of relying on Mongo's insertion-order findOne — CM tends to
    // fulfil from the cheapest matching listing, so we rank:
    //   1. articleId-bearing rows last (preserve them for future syncs)
    //   2. price ascending (cheapest first — matches CM fulfilment order)
    //   3. qty closest to the order item's qty
    //   4. oldest firstSeenAt (FIFO under all-else-equal)
    if (!stockRow) {
      const tupleFilter: Record<string, unknown> = {
        name: item.name,
        set: item.set,
        condition: item.condition,
        foil: item.foil,
      };
      if (item.language) tupleFilter.language = item.language;
      const candidates = await col.find(tupleFilter).toArray();
      if (candidates.length === 1) {
        stockRow = candidates[0];
      } else if (candidates.length > 1) {
        const soldQty = Math.max(1, item.qty ?? 1);
        candidates.sort((a, b) => {
          const aHasArticle = a.articleId ? 1 : 0;
          const bHasArticle = b.articleId ? 1 : 0;
          if (aHasArticle !== bHasArticle) return aHasArticle - bHasArticle;
          const ap = Number(a.price) || 0;
          const bp = Number(b.price) || 0;
          if (ap !== bp) return ap - bp;
          const aDist = Math.abs((Number(a.qty) || 0) - soldQty);
          const bDist = Math.abs((Number(b.qty) || 0) - soldQty);
          if (aDist !== bDist) return aDist - bDist;
          return (a.firstSeenAt as string || "").localeCompare(b.firstSeenAt as string || "");
        });
        stockRow = candidates[0];
      }
    }
    if (!stockRow) {
      unmatched.push(item);
      continue;
    }

    matched++;
    const soldQty = Math.max(1, item.qty ?? 1);
    const currentQty = Number(stockRow.qty) || 0;
    const remaining = currentQty - soldQty;

    if (remaining <= 0) {
      await col.deleteOne({ _id: stockRow._id });
      deleted++;
    } else {
      await col.updateOne(
        { _id: stockRow._id },
        { $set: { qty: remaining, lastSeenAt: now } }
      );
      decremented++;
    }
  }

  return { matched, unmatched, decremented, deleted };
}

/**
 * Restock items from a cancelled order. Inverse of removeSoldItemsFromStock —
 * increments qty on a matching row, or re-inserts when the row is gone.
 * Used only on cancellations of orders that had already passed paid.
 */
async function restockCancelledItems(
  items: CmOrderItem[]
): Promise<{ incremented: number; reinserted: number }> {
  if (!items.length) return { incremented: 0, reinserted: 0 };
  const db = await getDb();
  const col = db.collection(COL.stock);
  const now = new Date().toISOString();
  let incremented = 0;
  let reinserted = 0;

  for (const item of items) {
    let stockRow = null;
    if (item.articleId) {
      stockRow = await col.findOne({ articleId: item.articleId });
    }
    // Mirror the deterministic tuple-pick used in removeSoldItemsFromStock
    // — when multiple rows match, prefer the one most likely to be the
    // listing the buyer was originally fulfilled from, so the restock
    // bumps the same row that got decremented.
    if (!stockRow) {
      const candidates = await col
        .find({
          name: item.name,
          set: item.set,
          condition: item.condition,
          foil: !!item.foil,
          language: item.language,
        })
        .toArray();
      if (candidates.length === 1) {
        stockRow = candidates[0];
      } else if (candidates.length > 1) {
        const restoreQty = Math.max(1, item.qty || 1);
        candidates.sort((a, b) => {
          const aHasArticle = a.articleId ? 1 : 0;
          const bHasArticle = b.articleId ? 1 : 0;
          if (aHasArticle !== bHasArticle) return aHasArticle - bHasArticle;
          const ap = Number(a.price) || 0;
          const bp = Number(b.price) || 0;
          if (ap !== bp) return ap - bp;
          const aDist = Math.abs((Number(a.qty) || 0) - restoreQty);
          const bDist = Math.abs((Number(b.qty) || 0) - restoreQty);
          if (aDist !== bDist) return aDist - bDist;
          return (a.firstSeenAt as string || "").localeCompare(b.firstSeenAt as string || "");
        });
        stockRow = candidates[0];
      }
    }
    const addQty = Math.max(1, item.qty || 1);
    if (stockRow) {
      const current = Number(stockRow.qty) || 0;
      await col.updateOne(
        { _id: stockRow._id },
        { $set: { qty: current + addQty, lastSeenAt: now } }
      );
      incremented++;
    } else {
      // Mirror the formula in processStock — see note there about `language`.
      const dedupKey = item.articleId
        ? `article:${item.articleId}`
        : `${item.name}|${addQty}|${item.price || 0}|${item.condition}|${!!item.foil}|${item.set}|${item.language || "English"}`;
      await col.insertOne({
        articleId: item.articleId || undefined,
        name: item.name,
        set: item.set,
        qty: addQty,
        price: item.price || 0,
        condition: item.condition,
        language: item.language || "English",
        foil: !!item.foil,
        dedupKey,
        source: item.articleId ? "product_page" : "stock_page",
        firstSeenAt: now,
        lastSeenAt: now,
      });
      reinserted++;
    }
  }

  return { incremented, reinserted };
}

async function processOrders(
  submittedBy: string,
  data: Record<string, unknown>
): Promise<{ added: number; updated: number; skipped: number }> {
  const db = await getDb();
  const col = db.collection(COL.orders);
  const orders = data.orders as CmOrder[];
  const direction = (data.direction as string) || "sale";
  const status = data.status as string;
  const now = new Date().toISOString();
  const newIdx = STATUS_ORDER.indexOf(status);

  // Batch-read existing orders to determine status changes
  const orderIds = orders.map(o => o.orderId);
  const existingDocs = await col.find({ orderId: { $in: orderIds } }).toArray();
  const existingMap = new Map(existingDocs.map(d => [d.orderId as string, d]));

  // Status changes come from POSITIVE signals only: we saw this order on
  // a specific status tab, so we set it to that status. This works in both
  // directions — advancing (paid→sent) and correcting (sent→paid).
  // We never infer status from an order's ABSENCE on a tab.
  const ops = orders.map(order => {
    const existing = existingMap.get(order.orderId);
    if (existing) {
      const existingIdx = STATUS_ORDER.indexOf(existing.status as string);
      const updates: Record<string, unknown> = { lastSeenAt: now, submittedBy };
      if (!existing.direction) updates.direction = direction;
      if (newIdx !== existingIdx) {
        updates.status = status;
        if (order.orderDate) updates.orderDate = order.orderDate;
        if (order.orderTime) updates.orderTime = order.orderTime;
      }
      if (order.lastName) updates.lastName = order.lastName;
      if (order.trustee != null) updates.trustee = order.trustee;
      if (order.countryFlagPos) updates.countryFlagPos = order.countryFlagPos;
      return { updateOne: { filter: { orderId: order.orderId }, update: { $set: updates } } };
    }
    return {
      updateOne: {
        filter: { orderId: order.orderId },
        update: {
          $set: { lastSeenAt: now, submittedBy },
          $setOnInsert: {
            orderId: order.orderId, direction, status,
            counterparty: order.counterparty || "", country: order.country || "",
            countryFlagPos: order.countryFlagPos || "", lastName: order.lastName || "",
            trustee: order.trustee || false, itemCount: order.itemCount || 0,
            totalPrice: order.totalPrice || 0, orderDate: order.orderDate || "",
            orderTime: order.orderTime || "",
          },
        },
        upsert: true,
      },
    };
  });

  let result = { upsertedCount: 0, modifiedCount: 0 };
  if (ops.length) {
    const bulkResult = await col.bulkWrite(ops, { ordered: false });
    result = { upsertedCount: bulkResult.upsertedCount || 0, modifiedCount: bulkResult.modifiedCount || 0 };
  }

  // Ghost cleanup for shopping_cart: when we have the COMPLETE list of orders
  // for a status (single page or last page covers totalCount), delete any DB
  // orders with that status that weren't in the incoming set.
  // Buyers can remove orders from shopping cart — those ghosts never appear
  // on any other tab, so positive-signal-only logic can't clean them up.
  const totalCount = (data.totalCount as number) || 0;
  const currentPage = (data.currentPage as number) || 1;
  const totalPages = (data.totalPages as number) || 1;
  const pageComplete = !!data.pageComplete;
  // Require either a non-empty incoming list OR the new affirmative
  // pageComplete signal (ext ≥1.6.1) so truly-empty carts clean up their
  // last ghost without risking a spurious wipe from an SPA mid-transition
  // read on older extensions that don't send the flag.
  if (status === "shopping_cart" && totalPages === 1 && (totalCount > 0 || pageComplete)) {
    const incomingIds = orders.map(o => o.orderId);
    const deleted = await col.deleteMany({
      status: "shopping_cart",
      direction: { $in: [direction, null] },
      orderId: { $nin: incomingIds },
    });
    if (deleted.deletedCount) {
      result.modifiedCount += deleted.deletedCount;
    }
  }

  // Remove sold items from stock when orders first reach paid.
  // Uses items from cm_order_items (if the detail was previously synced).
  const PAID_INDEX = STATUS_ORDER.indexOf("paid");
  const newlyPaidIds = orders
    .filter(o => {
      const existing = existingMap.get(o.orderId);
      if (!existing) return newIdx >= PAID_INDEX; // new order inserted at paid+
      const existingIdx = STATUS_ORDER.indexOf(existing.status as string);
      return existingIdx < PAID_INDEX && newIdx >= PAID_INDEX;
    })
    .map(o => o.orderId);

  if (newlyPaidIds.length) {
    const items = await db.collection(COL.orderItems)
      .find({ orderId: { $in: newlyPaidIds } }).toArray();
    if (items.length) {
      const soldItems: SoldItemLike[] = items.map((i) => ({
        articleId: i.articleId as string | undefined,
        name: i.name as string,
        set: i.set as string,
        condition: i.condition as string,
        foil: !!i.foil,
        language: i.language as string | undefined,
        qty: Number(i.qty) || 1,
      }));
      const removal = await removeSoldItemsFromStock(soldItems);
      if (removal.unmatched.length) {
        logError(
          "warn",
          "ext-sync-sold-cleanup",
          `Unmatched sold items during orders sync: ${removal.unmatched.length} of ${items.length}`,
          { unmatched: removal.unmatched.slice(0, 20), orderIds: newlyPaidIds }
        );
      }
      // Mark these orders as stock-processed so the catch-up branch in
      // processOrderDetail (and the cancellation handler) can tell that a
      // decrement DID run for them. Without this flag, an order could end
      // up double-decremented or — for orders cancelled later — restocked
      // when there was nothing to give back.
      const decrementedOrderIds = Array.from(
        new Set(items.map((i) => i.orderId as string))
      );
      await col.updateMany(
        { orderId: { $in: decrementedOrderIds } },
        { $set: { stockProcessed: true } }
      );

      // Fire consumeSale AFTER stock removal so lots aren't consumed while
      // the stock row is still present (would double-count). Only fires on
      // the paid-transition — the `newlyPaidIds` filter above guards against
      // re-firing on subsequent syncs of already-paid orders.
      // Trustee flag comes from the persisted DB doc (I2) — the incoming
      // batch payload may arrive with `trustee: null` on later syncs when
      // the CM list view doesn't re-render the icon, so the freshly-updated
      // DB row is the authoritative source.
      const persistedOrders = await col
        .find<{ orderId: string; trustee?: boolean }>(
          { orderId: { $in: newlyPaidIds } },
          { projection: { orderId: 1, trustee: 1 } }
        )
        .toArray();
      const trusteeByOrderId = new Map<string, boolean>();
      for (const po of persistedOrders) {
        trusteeByOrderId.set(po.orderId, !!po.trustee);
      }
      for (const item of items) {
        const orderId = item.orderId as string;
        const productIdStr = item.productId as string | undefined;
        const cardmarketId = productIdStr ? Number(productIdStr) : NaN;
        if (!Number.isFinite(cardmarketId) || cardmarketId <= 0) continue;
        const snapshot = {
          cardmarketId,
          foil: !!item.foil,
          condition: item.condition as string,
          language: (item.language as string) || "English",
          qtySold: Number(item.qty) || 1,
          unitPriceEur: Number(item.price) || 0,
          trustee: trusteeByOrderId.get(orderId) ?? false,
          orderId,
          articleId: item.articleId as string | undefined,
          // Tag-based attribution: the CM listing's comment (when scraped
          // by the extension) carries the investment's MS-XXXX code.
          // Untagged sales no-op in consumeSale; tagged sales attribute
          // exactly to the investment matching the code.
          comment: typeof item.comment === "string" ? item.comment : null,
        };
        after(async () => {
          try {
            const dbInner = await getDb();
            await consumeSale({ db: dbInner, ...snapshot });
          } catch (err) {
            logError(
              "error",
              "attribution-consumeSale-orders",
              err instanceof Error ? err.message : "unknown error",
              { orderId: snapshot.orderId, cardmarketId: snapshot.cardmarketId }
            );
          }
        });
      }
    }
  }

  return {
    added: result.upsertedCount,
    updated: result.modifiedCount,
    skipped: 0,
  };
}

// ── Order Detail (enrich order + save items) ────────────────────────

async function processOrderDetail(
  submittedBy: string,
  data: Record<string, unknown>
): Promise<{ added: number; updated: number; skipped: number }> {
  const db = await getDb();
  const detail = data as unknown as CmOrderDetail;
  const orderId = detail.orderId;
  let added = 0, updated = 0;

  // Check status change — allow both advance and correction (regression)
  const PAID_INDEX = STATUS_ORDER.indexOf("paid");
  const existing = await db.collection(COL.orders).findOne(
    { orderId },
    { projection: { status: 1, direction: 1, stockProcessed: 1 } }
  );
  const existingIdx = existing ? STATUS_ORDER.indexOf(existing.status as string) : -1;

  // Cancelled orders: delete from DB entirely (they shouldn't count toward anything).
  // If the order had already been advanced past paid AND stock was actually
  // decremented, restock the items to keep inventory honest. The
  // stockProcessed gate is critical: an order can be `wasPastPaid` without
  // ever having been decremented (orders-list sync flipped status before
  // items were synced — see processOrders' items.length guard). Restocking
  // such an order would silently inflate stock by qty without any prior
  // matching decrement.
  if (detail.status === "cancelled") {
    const wasPastPaid = existingIdx >= PAID_INDEX;
    const wasStockProcessed = existing?.stockProcessed === true;
    const shouldRestock = wasPastPaid && wasStockProcessed;
    if (shouldRestock) {
      const prevItems = (await db
        .collection(COL.orderItems)
        .find({ orderId })
        .toArray()) as unknown as CmOrderItem[];
      if (prevItems.length) {
        const restock = await restockCancelledItems(prevItems);
        logError(
          "info",
          "ext-sync-cancel-restock",
          `Cancelled order ${orderId} was past paid; restocked ${
            restock.incremented + restock.reinserted
          } items`,
          { orderId, ...restock }
        );
      }
    } else if (wasPastPaid && !wasStockProcessed) {
      logError(
        "info",
        "ext-sync-cancel-no-restock",
        `Cancelled order ${orderId} was past paid but stock was never decremented (stockProcessed missing); skipping restock to avoid spurious inventory bump`,
        { orderId }
      );
    }
    const deleted = await db.collection(COL.orders).deleteOne({ orderId });
    await db.collection(COL.orderItems).deleteMany({ orderId });
    // Fire reverseSale AFTER restock completes. Only fires when the order
    // was previously past paid AND stockProcessed=true (otherwise there's
    // nothing to reverse — no consumeSale ever ran). Exact-once per
    // cancellation: after this handler, the order doc is deleted, so a
    // subsequent cancellation detail sync for the same orderId would
    // `return { skipped: 1 }` via `deleted.deletedCount === 0` without
    // re-entering this branch.
    if (shouldRestock) {
      const snapshotOrderId = orderId;
      after(async () => {
        try {
          const dbInner = await getDb();
          await reverseSale({ db: dbInner, orderId: snapshotOrderId });
        } catch (err) {
          logError(
            "error",
            "attribution-reverseSale",
            err instanceof Error ? err.message : "unknown error",
            { orderId: snapshotOrderId }
          );
        }
      });
    }
    return { added: 0, updated: 0, skipped: deleted.deletedCount ? 0 : 1 };
  }
  const newIdx = detail.status ? STATUS_ORDER.indexOf(detail.status) : -1;
  const statusAdvanced = detail.status ? newIdx > existingIdx : false;
  const statusChanged = detail.status ? newIdx !== existingIdx : false;

  // Enrich the parent order
  const orderUpdates: Record<string, unknown> = {
    lastSeenAt: new Date().toISOString(),
    submittedBy,
  };
  if (detail.shippingAddress) orderUpdates.shippingAddress = detail.shippingAddress;
  if (detail.shippingMethod) orderUpdates.shippingMethod = detail.shippingMethod;
  if (detail.shippingPrice != null) orderUpdates.shippingPrice = detail.shippingPrice;
  if (detail.itemValue != null) orderUpdates.itemValue = detail.itemValue;
  if (detail.totalPrice != null) orderUpdates.totalPrice = detail.totalPrice;
  if (detail.timeline) {
    orderUpdates.timeline = detail.timeline;
    // Use the current status timestamp from the timeline as the order's display date
    if (detail.status && detail.timeline[detail.status]) {
      const parts = detail.timeline[detail.status].split(" ");
      if (parts[0]) orderUpdates.orderDate = parts[0];
      if (parts[1]) orderUpdates.orderTime = parts[1];
    }
  }
  if (statusChanged) orderUpdates.status = detail.status;
  else if (!existing && detail.status) orderUpdates.status = detail.status; // new order, set initial status
  if (!existing?.direction) orderUpdates.direction = detail.direction || "sale";
  if (detail.counterparty) orderUpdates.counterparty = detail.counterparty;
  if (detail.country) orderUpdates.country = detail.country;

  await db.collection(COL.orders).updateOne(
    { orderId },
    { $set: orderUpdates },
    { upsert: true }
  );
  updated++;

  // Save order items (separate collection, not mixed into stock)
  if (detail.items?.length) {
    const itemOps = detail.items.map(item => ({
      updateOne: {
        filter: { orderId, articleId: item.articleId },
        update: { $set: { ...item, orderId, submittedBy } },
        upsert: true,
      },
    }));
    await db.collection(COL.orderItems).bulkWrite(itemOps, { ordered: false });

    // Remove sold items from stock once per order. The decrement is gated
    // by the persisted `stockProcessed` flag so it runs exactly once across
    // BOTH the first-crossing case (statusAdvanced past paid) AND the
    // catch-up case (orders-list flipped status to paid earlier without
    // items in DB; this is the first detail sync, so items are present
    // now). Without the flag, the catch-up path used to be silent because
    // existing.status was already paid by then and statusAdvanced=false.
    const stockProcessed = existing?.stockProcessed === true;
    const shouldDecrement =
      newIdx >= PAID_INDEX && !stockProcessed && detail.items.length > 0;
    if (shouldDecrement) {
      const soldItems: SoldItemLike[] = detail.items.map((i) => ({
        articleId: i.articleId,
        name: i.name,
        set: i.set,
        condition: i.condition,
        foil: !!i.foil,
        language: i.language,
        qty: i.qty || 1,
      }));
      const removal = await removeSoldItemsFromStock(soldItems);
      if (removal.unmatched.length) {
        logError(
          "warn",
          "ext-sync-sold-cleanup",
          `Unmatched sold items during order_detail sync: ${removal.unmatched.length} of ${detail.items.length}`,
          { unmatched: removal.unmatched.slice(0, 20), orderId }
        );
      }
      // Mark stock as processed so future syncs (orders-list or detail)
      // don't re-decrement. The cancellation handler above also keys off
      // this flag so it only restocks orders that were actually decremented.
      await db.collection(COL.orders).updateOne(
        { orderId },
        { $set: { stockProcessed: true } }
      );

      // Fire consumeSale for each item AFTER stock removal completes.
      // Same single-fire gate as the decrement: stockProcessed flips to
      // true above, so subsequent syncs of the same order skip this path.
      // Trustee flag comes from the parent order; detail.direction is the
      // best proxy but not equivalent — fetch the trustee flag from the
      // orders doc we just updated.
      const parent = await db.collection(COL.orders).findOne<{ trustee?: boolean }>(
        { orderId },
        { projection: { trustee: 1 } }
      );
      const trustee = !!parent?.trustee;
      for (const item of detail.items) {
        const productIdStr = item.productId;
        const cardmarketId = productIdStr ? Number(productIdStr) : NaN;
        if (!Number.isFinite(cardmarketId) || cardmarketId <= 0) continue;
        const snapshot = {
          cardmarketId,
          foil: !!item.foil,
          condition: item.condition,
          language: item.language || "English",
          qtySold: item.qty || 1,
          unitPriceEur: item.price || 0,
          trustee,
          orderId,
          articleId: item.articleId,
          // Tag-based attribution — the comment field carries the
          // investment's MS-XXXX code when the user pasted it.
          comment: item.comment ?? null,
        };
        after(async () => {
          try {
            const dbInner = await getDb();
            await consumeSale({ db: dbInner, ...snapshot });
          } catch (err) {
            logError(
              "error",
              "attribution-consumeSale-orderDetail",
              err instanceof Error ? err.message : "unknown error",
              { orderId: snapshot.orderId, cardmarketId: snapshot.cardmarketId }
            );
          }
        });
      }
    }
    added += detail.items.length;
  }

  return { added, updated, skipped: 0 };
}

// ── Stock (upsert by visual tuple, not just dedupKey) ────────────────

/**
 * Match a stock_page listing against any existing row with the same visual
 * fields (name, set, condition, foil, language, qty, price) — regardless
 * of source or articleId. This is the tuple a user would read off the row;
 * if a product_page row already exists for this listing, we refresh it
 * instead of creating a sibling stock_page row (avoids soft duplicates
 * when the product page was scraped first).
 */
async function processStock(
  submittedBy: string,
  data: Record<string, unknown>
): Promise<{ added: number; updated: number; skipped: number }> {
  const db = await getDb();
  const col = db.collection(COL.stock);
  const listings = data.listings as CmStockListing[];
  const now = new Date().toISOString();

  if (!listings.length) return { added: 0, updated: 0, skipped: 0 };

  // Pre-fetch by articleId (ext v1.22.0+ reads it from the row's `id`
  // attribute on /Stock/Offers/Singles). Authoritative match: when the row
  // exists with the same articleId we can update qty/price in place even
  // when those have changed since last sync — without articleId, a qty or
  // price change misses the tuple match below and creates an orphan row.
  const articleIds = listings
    .map((l) => l.articleId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  const existingByArticleId = new Map<string, { _id: unknown }>();
  if (articleIds.length > 0) {
    const rows = await col
      .find({ articleId: { $in: articleIds } })
      .toArray();
    for (const r of rows) {
      const id = r.articleId as string | undefined;
      if (id) existingByArticleId.set(id, { _id: r._id });
    }
  }

  // Pre-fetch every row that matches any listing tuple so we can decide
  // insert vs. refresh without per-listing roundtrips.
  const tupleFilters = listings.map((l) => ({
    name: l.name,
    set: l.set,
    condition: l.condition,
    foil: l.foil || false,
    language: l.language || "English",
    qty: l.qty,
    price: l.price,
  }));
  const existingRows = await col.find({ $or: tupleFilters }).toArray();
  const byTupleKey = new Map<string, { _id: unknown }>();
  const tupleKey = (t: {
    name: string;
    set: string;
    condition: string;
    foil: boolean;
    language: string;
    qty: number;
    price: number;
  }) =>
    `${t.name}\u241F${t.set}\u241F${t.condition}\u241F${t.foil}\u241F${t.language}\u241F${t.qty}\u241F${t.price}`;
  for (const r of existingRows) {
    byTupleKey.set(
      tupleKey({
        name: r.name as string,
        set: r.set as string,
        condition: r.condition as string,
        foil: !!r.foil,
        language: (r.language as string) || "English",
        qty: Number(r.qty),
        price: Number(r.price),
      }),
      { _id: r._id }
    );
  }

  let added = 0;
  let updated = 0;
  type StockBulkOp = Parameters<typeof col.bulkWrite>[0][number];
  const updateOps: StockBulkOp[] = [];

  // Collect attribution tuple keys from incoming listings. We do the
  // grow attribution based on a before/after tuple-level qty diff instead
  // of per-op upsert flags — dedupKey embeds qty, so a qty bump (e.g.
  // 2→4) produces a TRUE insert even though only 2 new units entered
  // stock. Diffing the aggregated qty across the {productId, foil,
  // condition, language} tuple gives the correct delta AND collapses
  // multiple firings per tuple in a single batch (C1 + C2 fix).
  const tupleKeys = new Set<string>();
  const cmSetNameByTuple = new Map<string, string | undefined>();
  // Tag-bearing comment per tuple. maybeGrowLot needs the listing's
  // comment (it parses the MS-XXXX tag from it) — without this map the
  // post-aggregation snapshot below sends `comment: undefined`, which
  // makes parseInvestmentTag return null and silently no-ops every
  // grow attribution from the stock path. Only cache tag-bearing
  // comments — untagged ones add nothing.
  const commentByTuple = new Map<string, string>();
  for (const l of listings) {
    if (typeof l.productId === "number") {
      const key = `${l.productId}|${l.foil || false}|${l.condition}|${l.language || "English"}`;
      tupleKeys.add(key);
      if (!cmSetNameByTuple.has(key)) cmSetNameByTuple.set(key, l.set);
      if (l.comment && !commentByTuple.has(key) && parseInvestmentTag(l.comment)) {
        commentByTuple.set(key, l.comment);
      }
    }
  }

  // Pre-bulkWrite: aggregate current qty per tuple so we can diff after.
  const priorQtyByTuple = new Map<string, number>();
  if (tupleKeys.size > 0) {
    const orFilters = Array.from(tupleKeys).map((k) => {
      const [productId, foil, condition, language] = k.split("|");
      return {
        productId: Number(productId),
        foil: foil === "true",
        condition,
        language,
      };
    });
    const priorAgg = await col
      .aggregate<{
        _id: { productId: number; foil: boolean; condition: string; language: string };
        total: number;
      }>([
        { $match: { $or: orFilters } },
        {
          $group: {
            _id: {
              productId: "$productId",
              foil: "$foil",
              condition: "$condition",
              language: "$language",
            },
            total: { $sum: "$qty" },
          },
        },
      ])
      .toArray();
    for (const row of priorAgg) {
      const key = `${row._id.productId}|${row._id.foil}|${row._id.condition}|${row._id.language}`;
      priorQtyByTuple.set(key, row.total);
    }
  }

  for (const listing of listings) {
    // articleId-first: when the ext sent an articleId for this listing AND
    // we already have a row with that articleId, update qty/price/etc. on
    // the existing row regardless of whether the tuple still matches. Fixes
    // the "orphan rows on qty/price change" bug — without this, a qty bump
    // (e.g. 4→6) misses the qty-bearing tuple match and the dedupKey upsert
    // inserts a new row, leaving the old qty=4 row to double-count until
    // sweep-stale runs.
    if (typeof listing.articleId === "string" && listing.articleId.length > 0) {
      const articleHit = existingByArticleId.get(listing.articleId);
      if (articleHit) {
        const updateSet: Record<string, unknown> = {
          name: listing.name,
          qty: listing.qty,
          price: listing.price,
          condition: listing.condition,
          language: listing.language || "English",
          foil: listing.foil || false,
          set: listing.set,
          lastSeenAt: now,
          submittedBy,
        };
        if (typeof listing.signed === "boolean") updateSet.signed = listing.signed;
        if (listing.comment !== undefined) updateSet.comment = listing.comment;
        if (typeof listing.productId === "number") updateSet.productId = listing.productId;
        updateOps.push({
          updateOne: {
            filter: { _id: articleHit._id as never },
            update: { $set: updateSet },
          },
        });
        updated++;
        continue;
      }
    }

    const t = {
      name: listing.name,
      set: listing.set,
      condition: listing.condition,
      foil: listing.foil || false,
      language: listing.language || "English",
      qty: listing.qty,
      price: listing.price,
    };
    const hit = byTupleKey.get(tupleKey(t));
    if (hit) {
      // Row already exists (product_page or prior stock_page) — refresh
      // lastSeenAt and any fields that can change (signed was added in ext
      // v1.7.0 and may now be present on previously-unsigned rows).
      const refreshSet: Record<string, unknown> = { lastSeenAt: now, submittedBy };
      if (typeof listing.signed === "boolean") refreshSet.signed = listing.signed;
      if (listing.comment !== undefined) refreshSet.comment = listing.comment;
      if (typeof listing.productId === "number") refreshSet.productId = listing.productId;
      // Stamp articleId on tuple-matched rows that don't have one yet (legacy
      // stock_page rows synced before ext v1.22.0). This converts an
      // unclaimed row into an articleId-keyed one in place; the next time
      // qty/price changes, the articleId-first branch above catches it
      // instead of inserting an orphan.
      if (typeof listing.articleId === "string" && listing.articleId.length > 0) {
        refreshSet.articleId = listing.articleId;
      }
      updateOps.push({
        updateOne: {
          filter: { _id: hit._id as never },
          update: { $set: refreshSet },
        },
      });
      updated++;
      continue;
    }
    // dedupKey formula MUST match misstep-ext/content/seed/dedup-key.js.
    // Includes `language` since v1.22.0 — without it, two listings of the
    // same card differing only in language collided on the unique
    // `dedupKey` index and the second was silently dropped.
    const dedupKey =
      listing.dedupKey ||
      (listing.articleId
        ? `article:${listing.articleId}`
        : `${listing.name}|${listing.qty}|${listing.price}|${listing.condition}|${listing.foil}|${listing.set}|${listing.language || "English"}`);
    const setOnInsert: Record<string, unknown> = {
      name: listing.name,
      qty: listing.qty,
      price: listing.price,
      condition: listing.condition,
      language: listing.language || "English",
      foil: listing.foil || false,
      set: listing.set,
      dedupKey,
      source: "stock_page" as const,
      firstSeenAt: now,
    };
    if (typeof listing.signed === "boolean") setOnInsert.signed = listing.signed;
    if (listing.comment !== undefined) setOnInsert.comment = listing.comment;
    if (typeof listing.productId === "number") setOnInsert.productId = listing.productId;
    if (typeof listing.articleId === "string" && listing.articleId.length > 0) {
      setOnInsert.articleId = listing.articleId;
    }
    updateOps.push({
      updateOne: {
        filter: { dedupKey },
        update: {
          $set: { lastSeenAt: now, submittedBy },
          $setOnInsert: setOnInsert,
        },
        upsert: true,
      },
    });
    added++;
  }

  if (!updateOps.length) return { added: 0, updated: 0, skipped: 0 };
  const result = await col.bulkWrite(updateOps, { ordered: false });

  // Post-bulkWrite: re-aggregate per tuple and fire one hook per tuple
  // with the true qty delta. Also pre-fetch ev_cards.set once per batch
  // to avoid N findOne() calls inside the after() callbacks (I1).
  if (tupleKeys.size > 0) {
    const orFilters = Array.from(tupleKeys).map((k) => {
      const [productId, foil, condition, language] = k.split("|");
      return {
        productId: Number(productId),
        foil: foil === "true",
        condition,
        language,
      };
    });
    const postAgg = await col
      .aggregate<{
        _id: { productId: number; foil: boolean; condition: string; language: string };
        total: number;
      }>([
        { $match: { $or: orFilters } },
        {
          $group: {
            _id: {
              productId: "$productId",
              foil: "$foil",
              condition: "$condition",
              language: "$language",
            },
            total: { $sum: "$qty" },
          },
        },
      ])
      .toArray();

    const productIds = Array.from(new Set(postAgg.map((r) => r._id.productId)));
    const cardSetCodeByProductId = new Map<number, string | null>();
    if (productIds.length > 0) {
      const cards = await db
        .collection("dashboard_ev_cards")
        .find<{ cardmarket_id: number; set: string }>(
          { cardmarket_id: { $in: productIds } },
          { projection: { cardmarket_id: 1, set: 1 } }
        )
        .toArray();
      for (const c of cards) {
        cardSetCodeByProductId.set(c.cardmarket_id, c.set);
      }
    }

    for (const row of postAgg) {
      const key = `${row._id.productId}|${row._id.foil}|${row._id.condition}|${row._id.language}`;
      const priorQty = priorQtyByTuple.get(key) ?? 0;
      const qtyDelta = row.total - priorQty;
      if (qtyDelta <= 0) continue;
      const snapshot = {
        cardmarketId: row._id.productId,
        foil: row._id.foil,
        condition: row._id.condition,
        language: row._id.language,
        qtyDelta,
        comment: commentByTuple.get(key) ?? null,
        cmSetName: cmSetNameByTuple.get(key),
        cardSetCode: cardSetCodeByProductId.get(row._id.productId) ?? null,
      };
      after(async () => {
        try {
          const dbInner = await getDb();
          await maybeGrowLot({ db: dbInner, ...snapshot });
        } catch (err) {
          logError(
            "error",
            "attribution-maybeGrowLot-stock",
            err instanceof Error ? err.message : "unknown error",
            { cardmarketId: snapshot.cardmarketId, qtyDelta: snapshot.qtyDelta }
          );
        }
      });
    }
  }

  return {
    added: result.upsertedCount || 0,
    updated: (result.modifiedCount || 0) + updated,
    skipped: Math.max(0, listings.length - added - updated),
  };
}

// ── Product Stock (upsert by articleId from card detail pages) ──────

async function processProductStock(
  submittedBy: string,
  data: Record<string, unknown>
): Promise<{ added: number; updated: number; skipped: number; removed: number; details: string }> {
  const db = await getDb();
  const col = db.collection(COL.stock);
  const listings = data.listings as CmProductStockListing[];
  const cardName = (data.cardName as string) || "";
  const setName = (data.setName as string) || "";
  const now = new Date().toISOString();

  let added = 0, updated = 0, removed = 0;

  // Collect attribution tuple keys from incoming listings with qty > 0.
  // Same rationale as processStock: use a tuple-level before/after qty
  // diff to compute the true attributable delta and fire a single
  // maybeGrowLot per tuple. qty <= 0 listings are deletes only — they
  // reduce stock and MUST NOT trigger grow attribution.
  const tupleKeys = new Set<string>();
  const cmSetNameByTuple = new Map<string, string | undefined>();
  // See processStock for why this map exists. Same bug shape: without
  // it, the snapshot below sends `comment: undefined` and tag-based
  // grow attribution silently no-ops on every product-page sync.
  const commentByTuple = new Map<string, string>();
  for (const l of listings) {
    if (l.qty > 0 && typeof l.productId === "number") {
      const key = `${l.productId}|${l.foil || false}|${l.condition}|${l.language || "English"}`;
      tupleKeys.add(key);
      if (!cmSetNameByTuple.has(key)) cmSetNameByTuple.set(key, l.set);
      if (l.comment && !commentByTuple.has(key) && parseInvestmentTag(l.comment)) {
        commentByTuple.set(key, l.comment);
      }
    }
  }

  // Pre-write: aggregate current qty per tuple.
  const priorQtyByTuple = new Map<string, number>();
  if (tupleKeys.size > 0) {
    const orFilters = Array.from(tupleKeys).map((k) => {
      const [productId, foil, condition, language] = k.split("|");
      return {
        productId: Number(productId),
        foil: foil === "true",
        condition,
        language,
      };
    });
    const priorAgg = await col
      .aggregate<{
        _id: { productId: number; foil: boolean; condition: string; language: string };
        total: number;
      }>([
        { $match: { $or: orFilters } },
        {
          $group: {
            _id: {
              productId: "$productId",
              foil: "$foil",
              condition: "$condition",
              language: "$language",
            },
            total: { $sum: "$qty" },
          },
        },
      ])
      .toArray();
    for (const row of priorAgg) {
      const key = `${row._id.productId}|${row._id.foil}|${row._id.condition}|${row._id.language}`;
      priorQtyByTuple.set(key, row.total);
    }
  }

  for (const listing of listings) {
    if (listing.qty <= 0) {
      // Quantity dropped to 0 — remove from stock (by articleId or matching stock_page entry)
      const del = await col.deleteOne({ articleId: listing.articleId });
      if (del.deletedCount) { removed++; continue; }
      // Also try removing a matching stock_page entry
      const del2 = await col.deleteOne({
        name: listing.name, condition: listing.condition,
        foil: listing.foil || false, set: listing.set, source: "stock_page",
      });
      if (del2.deletedCount) removed++;
      continue;
    }

    const signedFields: Record<string, unknown> = {};
    if (typeof listing.signed === "boolean") signedFields.signed = listing.signed;
    if (listing.comment !== undefined) signedFields.comment = listing.comment;
    if (typeof listing.productId === "number") signedFields.productId = listing.productId;

    // First check if we already track this by articleId
    const existing = await col.findOne({ articleId: listing.articleId });
    if (existing) {
      await col.updateOne(
        { _id: existing._id },
        {
          $set: {
            qty: listing.qty,
            price: listing.price,
            lastSeenAt: now,
            submittedBy,
            ...signedFields,
          },
        }
      );
      updated++;
      continue;
    }

    // Claim any unclaimed row for this card — regardless of source. Matches
    // by name/set/condition/foil/language only (not qty/price) because the
    // stock_page row's qty/price may be mid-sync and we want to reconcile
    // both sources to a single authoritative product_page entry.
    const unclaimedMatch = await col.findOne({
      name: listing.name,
      condition: listing.condition,
      foil: listing.foil || false,
      set: listing.set,
      language: listing.language || "English",
      articleId: { $exists: false },
    });
    if (unclaimedMatch) {
      await col.updateOne(
        { _id: unclaimedMatch._id },
        {
          $set: {
            articleId: listing.articleId,
            qty: listing.qty,
            price: listing.price,
            lastSeenAt: now,
            submittedBy,
            source: "product_page" as const,
            ...signedFields,
          },
        }
      );
      updated++;
      continue;
    }

    // New listing — insert with article-scoped dedupKey to avoid conflicts
    await col.insertOne({
      articleId: listing.articleId,
      name: listing.name, qty: listing.qty, price: listing.price,
      condition: listing.condition, language: listing.language || "English",
      foil: listing.foil || false, set: listing.set,
      ...signedFields,
      dedupKey: `article:${listing.articleId}`,
      source: "product_page" as const,
      firstSeenAt: now, lastSeenAt: now, submittedBy,
    });
    added++;
  }

  // Post-write: re-aggregate per tuple and fire one hook per tuple with
  // the true qty delta. Must run BEFORE the ghost-cleanup deleteMany
  // below, otherwise the post-agg would reflect the cleanup too and
  // under-count delta. (Cleanup only removes product_page rows NOT in
  // the current batch — their qty was never part of this batch's delta,
  // but they'd still shrink the aggregate if we measured after.)
  if (tupleKeys.size > 0) {
    const orFilters = Array.from(tupleKeys).map((k) => {
      const [productId, foil, condition, language] = k.split("|");
      return {
        productId: Number(productId),
        foil: foil === "true",
        condition,
        language,
      };
    });
    const postAgg = await col
      .aggregate<{
        _id: { productId: number; foil: boolean; condition: string; language: string };
        total: number;
      }>([
        { $match: { $or: orFilters } },
        {
          $group: {
            _id: {
              productId: "$productId",
              foil: "$foil",
              condition: "$condition",
              language: "$language",
            },
            total: { $sum: "$qty" },
          },
        },
      ])
      .toArray();

    const productIds = Array.from(new Set(postAgg.map((r) => r._id.productId)));
    const cardSetCodeByProductId = new Map<number, string | null>();
    if (productIds.length > 0) {
      const cards = await db
        .collection("dashboard_ev_cards")
        .find<{ cardmarket_id: number; set: string }>(
          { cardmarket_id: { $in: productIds } },
          { projection: { cardmarket_id: 1, set: 1 } }
        )
        .toArray();
      for (const c of cards) {
        cardSetCodeByProductId.set(c.cardmarket_id, c.set);
      }
    }

    for (const row of postAgg) {
      const key = `${row._id.productId}|${row._id.foil}|${row._id.condition}|${row._id.language}`;
      const priorQty = priorQtyByTuple.get(key) ?? 0;
      const qtyDelta = row.total - priorQty;
      if (qtyDelta <= 0) continue;
      const snapshot = {
        cardmarketId: row._id.productId,
        foil: row._id.foil,
        condition: row._id.condition,
        language: row._id.language,
        qtyDelta,
        comment: commentByTuple.get(key) ?? null,
        cmSetName: cmSetNameByTuple.get(key),
        cardSetCode: cardSetCodeByProductId.get(row._id.productId) ?? null,
      };
      after(async () => {
        try {
          const dbInner = await getDb();
          await maybeGrowLot({ db: dbInner, ...snapshot });
        } catch (err) {
          logError(
            "error",
            "attribution-maybeGrowLot-productStock",
            err instanceof Error ? err.message : "unknown error",
            { cardmarketId: snapshot.cardmarketId, qtyDelta: snapshot.qtyDelta }
          );
        }
      });
    }
  }

  // Ghost cleanup: the product page shows ALL of the user's listings for this
  // specific product. Any DB entry for the same name+set with an articleId
  // that's NOT in the current batch was delisted on CM — remove it.
  //
  // DFC/split-card asymmetry: the page H1 for a double-faced or split card
  // renders the canonical `Front // Back` form, but legacy stock rows may
  // carry only the front face (inserted before the DFC name fix). Run the
  // cleanup against BOTH forms so legacy rows get caught:
  //   - exact match on the H1 cardName (handles canonical rows)
  //   - if cardName contains ` // `, also match on the front face alone
  //     (handles legacy rows from before DFC names propagated)
  if (cardName && setName) {
    const incomingArticleIds = listings
      .map(l => l.articleId)
      .filter((id): id is string => !!id);
    const nameVariants = new Set<string>([cardName]);
    const dfcSep = cardName.indexOf(" // ");
    if (dfcSep > 0) {
      nameVariants.add(cardName.slice(0, dfcSep));
    }
    const cleanupResult = await col.deleteMany({
      name: { $in: Array.from(nameVariants) },
      set: setName,
      articleId: { $exists: true, $nin: incomingArticleIds },
    });
    if (cleanupResult.deletedCount) removed += cleanupResult.deletedCount;
  }

  const details = `${cardName}${listings.length > 0 ? ` — ${listings.length} listing${listings.length !== 1 ? "s" : ""}` : listings.length === 0 && removed > 0 ? " — all delisted" : ""}${removed ? `, ${removed} removed` : ""}`;

  return { added, updated, skipped: 0, removed, details };
}

// ── Card Prices (update ev_cards by cardmarket_id, nonfoil/foil split) ──

async function processCardPrices(
  data: Record<string, unknown>
): Promise<{ added: number; updated: number; skipped: number; details: string }> {
  const db = await getDb();
  const productId = data.productId as number;
  const cardName = (data.cardName as string) || "";
  const isFoil = !!data.isFoil;
  const prices = (data.prices || {}) as Record<string, number>;
  const available = (data.available as number | null) ?? null;
  const chart = data.chart as Array<{ date: string; avg_sell: number }> | null;
  const now = new Date().toISOString();

  if (!productId) {
    return { added: 0, updated: 0, skipped: 1, details: `${cardName || "?"} — no productId` };
  }

  // Build the nested cm_prices snapshot (nonfoil or foil branch)
  const variantKey = isFoil ? "foil" : "nonfoil";
  const snapshot: Record<string, unknown> = { updatedAt: now };
  if (prices.from != null) snapshot.from = prices.from;
  if (prices.trend != null) snapshot.trend = prices.trend;
  if (prices.avg30d != null) snapshot.avg30d = prices.avg30d;
  if (prices.avg7d != null) snapshot.avg7d = prices.avg7d;
  if (prices.avg1d != null) snapshot.avg1d = prices.avg1d;
  if (available != null) snapshot.available = available;
  if (chart && chart.length) snapshot.chart = chart;

  // Only update if we have at least one useful field
  if (Object.keys(snapshot).length === 1) {
    return { added: 0, updated: 0, skipped: 1, details: `${cardName} (#${productId}) — no parseable prices` };
  }

  // Update existing ev_cards doc by cardmarket_id; don't create new entries.
  const result = await db.collection("dashboard_ev_cards").updateOne(
    { cardmarket_id: productId },
    { $set: { [`cm_prices.${variantKey}`]: snapshot } }
  );

  // Opportunistic CM expansion-id mapping. The extension scrapes idExpansion
  // from any anchor on the product page whenever one is present. If we can
  // resolve the card's set via ev_cards and the set hasn't already been
  // mapped, upsert cm_expansion_id onto dashboard_ev_sets. Fire-and-forget
  // via after() so a slow set lookup never blocks the load-bearing price
  // write. Wrapped in try/catch — mapping is a nice-to-have, not critical.
  const idExpansion = typeof data.idExpansion === "number" ? data.idExpansion : null;
  if (idExpansion != null && idExpansion > 0) {
    after(async () => {
      try {
        const dbInner = await getDb();
        const card = await dbInner
          .collection("dashboard_ev_cards")
          .findOne<{ set?: string }>(
            { cardmarket_id: productId },
            { projection: { set: 1 } }
          );
        if (!card?.set) return;
        await dbInner.collection("dashboard_ev_sets").updateOne(
          { code: card.set, cm_expansion_id: { $ne: idExpansion } },
          { $set: { cm_expansion_id: idExpansion } }
        );
      } catch (err) {
        logError(
          "error",
          "processCardPrices-expansion-mapping",
          err instanceof Error ? err.message : "unknown error",
          { productId, idExpansion },
        );
      }
    });
  }

  // Fan out to any dashboard_appraiser_cards with the same (cardmarket_id, foil).
  // Safe no-op when the collection is empty or nothing matches.
  // Wrapped in try/catch so a failure here never breaks the load-bearing
  // ev_cards sync path for the extension.
  // Reuses `snapshot` — do not mutate below this line.
  let appraiserMatched = 0;
  try {
    const appraiserSet: Record<string, unknown> = {
      cm_prices: snapshot,
      pricedAt: new Date(now),
      status: "priced",
    };
    if (prices.from != null) appraiserSet.fromPrice = prices.from;
    if (prices.trend != null) appraiserSet.trendPrice = prices.trend;

    const appraiserResult = await db.collection("dashboard_appraiser_cards").updateMany(
      { cardmarket_id: productId, foil: isFoil },
      { $set: appraiserSet }
    );
    appraiserMatched = appraiserResult.matchedCount || 0;
  } catch (err) {
    logError(
      "error",
      "processCardPrices-appraiser-fanout",
      err instanceof Error ? err.message : "unknown error",
      { productId, isFoil },
    );
  }

  const matched = result.matchedCount || 0;
  const evPart = matched
    ? `${cardName} (#${productId}) ${isFoil ? "foil" : "nonfoil"}${prices.trend != null ? ` — trend €${prices.trend.toFixed(2)}` : ""}`
    : `${cardName} (#${productId}) — card not in ev_cards`;
  // Always surface the appraiser fan-out count (even 0) so we can tell
  // whether the code path is running at all from the sync log alone.
  const appraiserPart = ` → ${appraiserMatched} appraiser doc${appraiserMatched === 1 ? "" : "s"}`;
  const detailsMsg = evPart + appraiserPart;

  return {
    added: 0,
    updated: matched,
    skipped: matched ? 0 : 1,
    details: detailsMsg,
  };
}

// ── Stock Overview (total count, time-series compressed) ────────────

async function processStockOverview(
  submittedBy: string,
  data: Record<string, unknown>
): Promise<{ added: number; updated: number; skipped: number }> {
  const db = await getDb();
  const col = db.collection(COL.stockSnapshots);
  const totalListings = data.totalListings as number;
  const now = new Date().toISOString();

  // Compute enriched snapshot counts from the current stock collection.
  // Imported dynamically to avoid a circular-ish module dependency.
  const { computeStockCounts } = await import("@/lib/stock");
  const counts = await computeStockCounts();

  // Time-series compression: delete the middle of three consecutive
  // identical snapshots. Equality is compared on the full counter tuple
  // (totalValue rounded to 2dp to avoid float drift).
  const recent = await col.find().sort({ extractedAt: -1 }).limit(2).toArray();
  const sameTuple = (a: Record<string, unknown>) =>
    a.totalListings === totalListings &&
    a.totalQty === counts.totalQty &&
    a.distinctNameSet === counts.distinctNameSet &&
    Math.round(((a.totalValue as number) || 0) * 100) ===
      Math.round(counts.totalValue * 100);

  if (recent.length === 2 && sameTuple(recent[0]) && sameTuple(recent[1])) {
    await col.deleteOne({ _id: recent[0]._id });
  }

  await col.insertOne({
    totalListings,
    totalQty: counts.totalQty,
    totalValue: counts.totalValue,
    distinctNameSet: counts.distinctNameSet,
    extractedAt: now,
    submittedBy,
  });
  return { added: 1, updated: 0, skipped: 0 };
}

// ── Transactions (upsert by period) ─────────────────────────────────

async function processTransactions(
  submittedBy: string,
  data: Record<string, unknown>
): Promise<{ added: number; updated: number; skipped: number }> {
  const db = await getDb();
  const col = db.collection(COL.transactions);
  const summary = data as unknown as CmTransactionSummary;
  const dedupKey = `${summary.periodStart}|${summary.periodEnd}`;
  const now = new Date().toISOString();

  const result = await col.updateOne(
    { dedupKey },
    {
      $set: {
        sales: summary.sales,
        fees: summary.fees,
        withdrawals: summary.withdrawals,
        refunds: summary.refunds,
        extractedAt: now,
        submittedBy,
      },
      $setOnInsert: {
        periodStart: summary.periodStart,
        periodEnd: summary.periodEnd,
        dedupKey,
      },
    },
    { upsert: true }
  );

  return {
    added: result.upsertedId ? 1 : 0,
    updated: result.modifiedCount ? 1 : 0,
    skipped: 0,
  };
}

// ── Read queries ────────────────────────────────────────────────────

export async function getLatestBalance(): Promise<CmBalanceSnapshot | null> {
  const db = await getDb();
  const doc = await db.collection(COL.balance).findOne({}, { sort: { extractedAt: -1 } });
  return doc as CmBalanceSnapshot | null;
}

export async function getBalanceHistory(days: number = 30): Promise<CmBalanceSnapshot[]> {
  const db = await getDb();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const docs = await db
    .collection(COL.balance)
    .find({ extractedAt: { $gte: since.toISOString() } })
    .sort({ extractedAt: 1 })
    .toArray();
  return docs as unknown as CmBalanceSnapshot[];
}

// ── Pipeline history (snapshot + reconstruction) ────────────────────

export interface CmPipelineDayPoint {
  date: string;       // YYYY-MM-DD (UTC day key)
  balance: number;    // CM wallet balance at end of day
  unpaid: number;
  paid: number;
  sent: number;       // trustee-sent only (non-trustee sent already in balance)
  total: number;      // balance + unpaid + paid + sent
  source: "snapshot" | "reconstructed";
}

/**
 * Parse a Cardmarket-formatted timestamp into epoch ms (UTC midnight of
 * the local-day component). Accepts:
 *   - "DD.MM.YYYY"
 *   - "DD.MM.YYYY HH:MM"
 * Returns null if the input is missing or malformed.
 *
 * NOTE: time-of-day is intentionally ignored. We bucket by local day to
 * keep the chart aligned with the user's intuition ("orders that were
 * paid today"). Using HH:MM would cause a sale paid at 23:50 and a sale
 * paid at 00:10 the next day to land in the wrong calendar buckets
 * relative to a UTC-of-now comparison.
 */
function parseCmDateToDayMs(s: string | undefined | null): number | null {
  if (!s) return null;
  const datePart = String(s).trim().split(" ")[0] || "";
  const m = datePart.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (!day || !month || !year) return null;
  return Date.UTC(year, month - 1, day);
}

function ymdFromMs(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Reconstruct historical U/P/S/T values per day for the last `days` days
 * (inclusive of today) from the existing order timeline data.
 *
 * For each sale order we infer state-interval boundaries:
 *   t_start  = timeline.unpaid (or earliest of paid/sent/arrived) or orderDate
 *   t_paid   = timeline.paid
 *   t_sent   = timeline.sent
 *   t_done   = timeline.arrived (drops the order out of the pipeline)
 *
 * On each day D the order contributes to:
 *   U  if t_start  <= D  AND (t_paid is null OR t_paid > D)
 *   P  if t_paid   <= D  AND (t_sent is null OR t_sent > D)
 *   S  if t_sent   <= D  AND (t_done is null OR t_done > D)
 *
 * Orders WITHOUT timeline (never had order_detail synced) only appear in
 * their CURRENT bucket on TODAY — we have no historical signal for them,
 * and projecting them backward from orderDate would be misleading because
 * orderDate is overwritten to the current-status timestamp. Pipeline
 * snapshots will eventually take over for those days going forward.
 *
 * shopping_cart orders are excluded entirely — they aren't committed.
 */
export async function reconstructPipelineHistory(days: number): Promise<CmPipelineDayPoint[]> {
  const db = await getDb();
  const todayMs = (() => {
    const n = new Date();
    return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
  })();
  const requestedStartMs = todayMs - (days - 1) * ONE_DAY_MS;

  // Clamp the window start to the day of our earliest balance snapshot.
  // Before that timestamp the ext wasn't running, so reconstruction would
  // fabricate history by projecting current orders backward into days we
  // never observed. Falling back to requestedStartMs when we have no
  // balance data preserves the old behavior for fresh installs.
  const balanceDocs = await db
    .collection(COL.balance)
    .find({})
    .sort({ extractedAt: 1 })
    .toArray();
  const balanceSamples = balanceDocs
    .map((d) => ({
      ms: Date.parse(d.extractedAt as string),
      value: Number(d.balance) || 0,
    }))
    .filter((s) => Number.isFinite(s.ms));

  let startMs = requestedStartMs;
  if (balanceSamples.length > 0) {
    const firstMs = balanceSamples[0].ms;
    const firstDayMs = Date.UTC(
      new Date(firstMs).getUTCFullYear(),
      new Date(firstMs).getUTCMonth(),
      new Date(firstMs).getUTCDate()
    );
    if (firstDayMs > startMs) startMs = firstDayMs;
  }

  // Pull all sale orders that could possibly contribute. Cheap enough — the
  // collection is bounded by CM's own order history (low thousands at most).
  const orders = await db.collection(COL.orders).find({
    direction: { $in: ["sale", null] },
    status: { $ne: "shopping_cart" },
  }).toArray();

  // Initialize the day grid.
  const points: CmPipelineDayPoint[] = [];
  for (let ms = startMs; ms <= todayMs; ms += ONE_DAY_MS) {
    points.push({
      date: ymdFromMs(ms),
      balance: 0,
      unpaid: 0,
      paid: 0,
      sent: 0,
      total: 0,
      source: "reconstructed",
    });
  }

  // Balance series: for each day in the (clamped) window, project the
  // most recent balance snapshot whose extractedAt is on or before the
  // END of that day.
  if (balanceSamples.length > 0) {
    let cursor = 0;
    for (let i = 0; i < points.length; i++) {
      const dayEndMs = startMs + i * ONE_DAY_MS + ONE_DAY_MS - 1;
      while (
        cursor + 1 < balanceSamples.length &&
        balanceSamples[cursor + 1].ms <= dayEndMs
      ) {
        cursor++;
      }
      const sample = balanceSamples[cursor];
      if (sample.ms <= dayEndMs) points[i].balance = sample.value;
    }
  }

  // Status → numeric index. Lets us tell whether the current status of an
  // order implies it has reached a state that the timeline doesn't yet
  // reflect (i.e. detail page wasn't re-synced after the order advanced).
  const STATUS_IDX: Record<string, number> = {
    shopping_cart: 0,
    unpaid: 1,
    paid: 2,
    sent: 3,
    arrived: 4,
  };

  for (const order of orders) {
    const totalPrice = Number(order.totalPrice) || 0;
    if (!totalPrice) continue;
    const trustee = !!order.trustee;
    const timeline = (order.timeline || {}) as Record<string, string>;

    let tUnpaid = parseCmDateToDayMs(timeline.unpaid);
    let tPaid = parseCmDateToDayMs(timeline.paid);
    let tSent = parseCmDateToDayMs(timeline.sent);
    let tArrived = parseCmDateToDayMs(timeline.arrived);
    const tCancelled = parseCmDateToDayMs(timeline.cancelled);

    // orderDate is overwritten to the current-status timestamp on every
    // orders-list sync (see processOrders), so it's our best estimate for
    // when the order entered its current state. We use it to backfill any
    // missing transition the timeline didn't capture — without this,
    // arrived orders whose detail wasn't re-synced after they shipped
    // stay forever in P, which inflates the bucket by orders of magnitude.
    const fallback = parseCmDateToDayMs(order.orderDate as string);
    const currentIdx = STATUS_IDX[order.status as string] ?? 0;
    if (fallback != null) {
      if (currentIdx >= 4 && tArrived == null) tArrived = fallback;
      if (currentIdx >= 3 && tSent == null) tSent = fallback;
      if (currentIdx >= 2 && tPaid == null) tPaid = fallback;
      if (currentIdx >= 1 && tUnpaid == null) tUnpaid = fallback;
    }

    // Effective start of the U-phase for this order.
    const tStart = tUnpaid ?? tPaid ?? tSent ?? tArrived ?? fallback ?? null;

    if (tStart == null) continue; // no usable timestamp at all

    // Walk the day grid. Cancellations terminate the order's contribution.
    const tEnd = tCancelled ?? null;
    for (let i = 0; i < points.length; i++) {
      const dayMs = startMs + i * ONE_DAY_MS;
      if (tEnd != null && dayMs >= tEnd) break;

      const inU =
        tStart != null && dayMs >= tStart && (tPaid == null || dayMs < tPaid);
      const inP =
        tPaid != null && dayMs >= tPaid && (tSent == null || dayMs < tSent);
      const inS =
        tSent != null && dayMs >= tSent && (tArrived == null || dayMs < tArrived);

      if (inU) points[i].unpaid += totalPrice;
      else if (inP) points[i].paid += totalPrice;
      else if (inS && trustee) points[i].sent += totalPrice;
      // non-trustee sent: skip — already in balance
    }
  }

  for (const p of points) {
    p.total = p.balance + p.unpaid + p.paid + p.sent;
  }
  return points;
}

/**
 * Combined pipeline series: reconstruction across the requested window,
 * with snapshot data overriding any day on which we have at least one
 * snapshot (the latest snapshot of that day wins). Snapshots are more
 * accurate for orders without timeline data, so they take priority.
 */
export async function getPipelineHistory(days: number = 30): Promise<{
  history: CmPipelineDayPoint[];
}> {
  const reconstructed = await reconstructPipelineHistory(days);

  const db = await getDb();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const snapshots = await db
    .collection(COL.pipelineSnapshots)
    .find({ extractedAt: { $gte: since.toISOString() } })
    .sort({ extractedAt: 1 })
    .toArray();

  if (snapshots.length === 0) {
    return { history: reconstructed };
  }

  // For each YYYY-MM-DD in the window, take the LATEST snapshot of that day.
  const byDay = new Map<string, Record<string, unknown>>();
  for (const s of snapshots) {
    const ms = Date.parse(s.extractedAt as string);
    if (!Number.isFinite(ms)) continue;
    const d = new Date(ms);
    const key = ymdFromMs(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    byDay.set(key, s);
  }

  const merged: CmPipelineDayPoint[] = reconstructed.map((p) => {
    const snap = byDay.get(p.date);
    if (!snap) return p;
    const balance = Number(snap.balance) || p.balance;
    const u = Number(snap.unpaid) || 0;
    const pd = Number(snap.paid) || 0;
    const s = Number(snap.sent) || 0;
    return {
      date: p.date,
      balance,
      unpaid: u,
      paid: pd,
      sent: s,
      total: balance + u + pd + s,
      source: "snapshot" as const,
    };
  });

  // Always derive TODAY's bar from current-status totals — same source
  // the Balance stat-card uses (getOrderValuesByStatus / getTrusteeSentValue
  // / getLatestBalance). This guarantees the rightmost bar matches the
  // stat-card numbers exactly even before the next ext sync writes a
  // snapshot, and immunizes today against any reconstruction edge case.
  if (merged.length > 0) {
    const [orderValues, trusteeSent, latestBalance] = await Promise.all([
      getOrderValuesByStatus(),
      getTrusteeSentValue(),
      getLatestBalance(),
    ]);
    const last = merged[merged.length - 1];
    const balance = Number(latestBalance?.balance) || 0;
    const u = orderValues.unpaid || 0;
    const pd = orderValues.paid || 0;
    const s = trusteeSent || 0;
    merged[merged.length - 1] = {
      date: last.date,
      balance,
      unpaid: u,
      paid: pd,
      sent: s,
      total: balance + u + pd + s,
      source: last.source,
    };
  }

  return { history: merged };
}

export async function getOrders(filters: {
  status?: string;
  direction?: string;
  page?: number;
  limit?: number;
} = {}): Promise<{ orders: CmOrder[]; total: number; totalValue: number }> {
  const db = await getDb();
  const col = db.collection(COL.orders);
  const query: Record<string, unknown> = {};
  if (filters.status) query.status = filters.status;
  if (filters.direction) {
    query.direction = filters.direction === "sale"
      ? { $in: ["sale", null] }
      : filters.direction;
  }

  const limit = filters.limit || 20;
  const skip = ((filters.page || 1) - 1) * limit;

  // Arrived and shopping_cart: newest first. All other tabs: oldest first (most urgent on top,
  // most recent on bottom — print/work-through flow).
  //
  // orderDate is a "DD.MM.YYYY" string scraped from CM, so we can't sort it as a Date directly.
  // A naive string sort scrambles cross-month order ("31.05.2026" sorts AFTER "01.06.2026"
  // because '3' > '0' lexicographically). Derive a real Date via $dateFromString in an
  // aggregation stage so the sort is chronological.
  const sortDir = filters.status === "arrived" || filters.status === "shopping_cart" ? -1 : 1;

  const [docs, total, valueResult] = await Promise.all([
    col.aggregate([
      { $match: query },
      {
        $addFields: {
          _orderDateTs: {
            $dateFromString: {
              dateString: "$orderDate",
              format: "%d.%m.%Y",
              onError: null,
              onNull: null,
            },
          },
        },
      },
      { $sort: { _orderDateTs: sortDir, orderTime: sortDir, _id: sortDir } },
      { $skip: skip },
      { $limit: limit },
      { $project: { _orderDateTs: 0 } },
    ]).toArray(),
    col.countDocuments(query),
    col.aggregate([
      { $match: query },
      { $group: { _id: null, totalValue: { $sum: "$totalPrice" } } },
    ]).toArray(),
  ]);

  return {
    orders: docs as unknown as CmOrder[],
    total,
    totalValue: valueResult[0]?.totalValue || 0,
  };
}

export async function getCmRevenueForMonth(month: string): Promise<{
  orderCount: number;
  totalSales: number;
  grossArticleValue: number;
  sellingFees: number;
  trusteeFees: number;
  shippingCosts: number;
  netRevenue: number;
}> {
  const db = await getDb();
  // month is "YYYY-MM", orderDate is "DD.MM.YYYY" — match by the MM.YYYY part
  const [year, mm] = month.split("-");
  const monthSuffix = `${mm}.${year}`; // e.g., "04.2026"

  const orders = await db.collection(COL.orders).find({
    direction: { $in: ["sale", null] },
    status: { $in: ["paid", "sent", "arrived"] },
    orderDate: { $regex: `\\.${monthSuffix}$` },
  }).toArray();

  let totalSales = 0;
  let grossArticleValue = 0;
  let shippingCosts = 0;
  let trusteeArticleValue = 0;

  for (const order of orders) {
    totalSales += (order.totalPrice as number) || 0;
    const articleVal = order.itemValue != null ? (order.itemValue as number) : (order.totalPrice as number) || 0;
    grossArticleValue += articleVal;
    shippingCosts += (order.shippingPrice as number) || 0;
    if (order.trustee) trusteeArticleValue += articleVal;
  }

  // 5% selling fee on all article value
  const sellingFees = Math.ceil(grossArticleValue * 0.05 * 100) / 100;
  // 1% trustee fee on trustee orders only
  const trusteeFees = Math.ceil(trusteeArticleValue * 0.01 * 100) / 100;
  const netRevenue = grossArticleValue - sellingFees - trusteeFees;

  return {
    orderCount: orders.length,
    totalSales: Math.round(totalSales * 100) / 100,
    grossArticleValue: Math.round(grossArticleValue * 100) / 100,
    sellingFees,
    trusteeFees,
    shippingCosts: Math.round(shippingCosts * 100) / 100,
    netRevenue: Math.round(netRevenue * 100) / 100,
  };
}

// ── Sales Economics ────────────────────────────────────────────────
//
// Aggregates paid+sent+arrived sale orders into a per-card / per-package
// economics view: average sell price per card (net of CM fees), shipping
// profit per package, and breakdowns by status / shipping method. Mirrors
// the math in `getCmRevenueForMonth` (5% selling, 1% trustee on trustee
// orders) but supports an arbitrary date window and exposes per-card and
// per-package derived figures.
//
// Date semantics: `timeline.paid` (the moment the buyer paid) is the
// truthful purchase date — `orderDate` is rewritten to the current-status
// timestamp on every status change, so it can't drive a monthly view.
// Orders without a synced timeline fall back to `orderDate`.
//
// Shipping expense source: `dashboard_transactions` where
// `type=expense` AND `category=shipping`, matched to the same window by
// `date` (ISO "YYYY-MM-DD"). This is the same source the finance tab's
// Shipping Profit card uses.

export type SalesEconomicsRange =
  | { kind: "month"; month: string }       // "YYYY-MM"
  | { kind: "range"; from: string; to: string } // ISO "YYYY-MM-DD" inclusive
  | { kind: "lifetime" };

export interface SalesEconomicsResult {
  rangeLabel: string;
  windowStart: string | null; // observed earliest paid date (YYYY-MM-DD)
  windowEnd: string | null;   // observed latest paid date
  daysInWindow: number;       // requested-range days (inclusive) when bounded,
                              // else (windowEnd − windowStart + 1)

  packages: number;
  cards: number;
  avgCardsPerPackage: number;
  avgPackagesPerDay: number;
  avgCardsPerDay: number;
  detailSyncedPct: number;       // % of pkgs with order_detail synced
  ordersMissingDetail: number;
  // Data-quality counts that mirror the order-row indicator (red/yellow/green).
  // Surfaced so the UI can show a "X need re-sync · Y partial" banner.
  ordersUnsynced: number;        // no timeline at all (red)
  ordersPartial: number;         // has timeline but missing 1+ field (yellow)
  ordersUnknownMethod: number;   // shippingMethod missing (subset of partial)

  // Money
  totalReceived: number;          // article + shipping (gross from buyers)
  articleGross: number;           // article-only revenue (gross)
  shippingIncome: number;         // shipping fees from buyers
  trusteeArticleGross: number;
  sellingFee: number;             // 5% of articleGross
  trusteeFee: number;             // 1% of trusteeArticleGross
  articleNet: number;             // articleGross − fees
  shippingExpense: number;        // real shipping cost in window
  shippingProfit: number;         // shippingIncome − shippingExpense

  // Per-card / per-package
  avgArticleGrossPerCard: number;
  avgArticleNetPerCard: number;
  avgShipIncomePerPackage: number;
  avgShipProfitPerPackage: number;
  avgShipProfitPerCard: number;   // shippingProfit / cards
  fullPerCardNet: number;         // avgArticleNetPerCard + avgShipProfitPerCard

  // Breakdowns
  byStatus: Record<"paid" | "sent" | "arrived", {
    packages: number;
    cards: number;
    articleGross: number;
    articleNet: number;
    shippingIncome: number;
    avgArticleNetPerCard: number;
  }>;
  byShippingMethod: {
    method: string;
    packages: number;
    cards: number;
    shippingIncome: number;
    avgPerPackage: number;
  }[];
  byCountry: {
    country: string;
    packages: number;
    cards: number;
    grossReceived: number;     // article + shipping
    avgGrossPerPackage: number;
  }[];

  records: {
    largest: { orderId: string; total: number; cards: number; country?: string; date?: string } | null;
    mostCards: { orderId: string; total: number; cards: number; country?: string; date?: string } | null;
    smallest: { orderId: string; total: number; cards: number; country?: string; date?: string } | null;
  };
}

function parseCmDateToISO(s: string | undefined | null): string | null {
  if (!s) return null;
  // "DD.MM.YYYY [HH:MM]"
  const m = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(s);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function rangeBounds(r: SalesEconomicsRange): { from: string | null; to: string | null; label: string } {
  if (r.kind === "month") {
    const [y, m] = r.month.split("-");
    // Build the last-day-of-month in UTC; using a local-time Date here would
    // lose the 30th in DST timezones (e.g., Lisbon WEST: local midnight on
    // the 30th = 23:00 UTC on the 29th, so getUTCDate() returns 29).
    const last = new Date(Date.UTC(Number(y), Number(m), 0)).getUTCDate();
    return {
      from: `${r.month}-01`,
      to: `${r.month}-${String(last).padStart(2, "0")}`,
      label: r.month,
    };
  }
  if (r.kind === "range") return { from: r.from, to: r.to, label: `${r.from} → ${r.to}` };
  return { from: null, to: null, label: "lifetime" };
}

export async function getCmSalesEconomics(
  range: SalesEconomicsRange = { kind: "lifetime" }
): Promise<SalesEconomicsResult> {
  const db = await getDb();
  const { from, to, label } = rangeBounds(range);

  // Pull every paid/sent/arrived sale; we filter by paid-date in JS so
  // timeline-aware date logic stays in one place. Volumes are small
  // (current scale ~500; 10× headroom is still trivial).
  const orders = await db.collection(COL.orders).find({
    direction: { $in: ["sale", null] },
    status: { $in: ["paid", "sent", "arrived"] },
  }).toArray();

  // Bucket by status helper
  const blankBucket = () => ({
    packages: 0, cards: 0, articleGross: 0, articleNet: 0,
    shippingIncome: 0, avgArticleNetPerCard: 0,
  });
  const byStatus: SalesEconomicsResult["byStatus"] = {
    paid: blankBucket(), sent: blankBucket(), arrived: blankBucket(),
  };
  const byMethodMap = new Map<string, { packages: number; cards: number; shippingIncome: number }>();
  const byCountryMap = new Map<string, { packages: number; cards: number; grossReceived: number }>();

  let pkgs = 0, cards = 0;
  let articleGross = 0, shippingIncome = 0, totalReceived = 0;
  let trusteeArticleGross = 0;
  let detailSynced = 0;
  let ordersUnsynced = 0;
  let ordersPartial = 0;
  let ordersUnknownMethod = 0;
  // For per-status fees we need to accumulate trustee-article per status too
  const trusteeArticleByStatus: Record<string, number> = { paid: 0, sent: 0, arrived: 0 };

  let earliest: string | null = null;
  let latest: string | null = null;
  type Rec = { orderId: string; total: number; cards: number; country?: string; date?: string };
  let largest: Rec | null = null;
  let mostCards: Rec | null = null;
  let smallest: Rec | null = null;

  for (const o of orders) {
    const status = o.status as "paid" | "sent" | "arrived";
    const total = (o.totalPrice as number) || 0;
    const ship = (o.shippingPrice as number) || 0;
    const ic = (o.itemCount as number) || 0;
    const hasDetail = o.itemValue != null || o.shippingPrice != null;
    const article = o.itemValue != null
      ? (o.itemValue as number)
      : Math.max(0, total - ship); // shipping is 0 when detail absent → article = total
    const trustee = !!o.trustee;

    // Date for window filter — prefer timeline.paid, fall back to orderDate
    const tl = (o.timeline as Record<string, string> | undefined) || {};
    const dateISO =
      parseCmDateToISO(tl.paid) ??
      parseCmDateToISO(tl.unpaid) ??
      parseCmDateToISO(o.orderDate as string | undefined);

    if (from && to) {
      if (!dateISO) continue;          // can't place this order — drop from windowed view
      if (dateISO < from || dateISO > to) continue;
    }

    if (dateISO) {
      if (!earliest || dateISO < earliest) earliest = dateISO;
      if (!latest || dateISO > latest) latest = dateISO;
    }

    pkgs += 1;
    cards += ic;
    totalReceived += total;
    articleGross += article;
    shippingIncome += ship;
    if (trustee) trusteeArticleGross += article;
    if (hasDetail) detailSynced += 1;

    // Quality state — same definition the OrderRow indicator uses:
    //   no timeline                  → red (unsynced)
    //   has timeline, ANY field gone → yellow (partial)
    //   all fields present           → green
    // Captured here so the panel banner can show "N need re-sync · M partial".
    const hasTimeline = !!o.timeline;
    if (!hasTimeline) {
      ordersUnsynced += 1;
    } else {
      const partial =
        !o.itemCount ||
        !o.country ||
        !o.counterparty ||
        o.itemValue == null ||
        o.shippingPrice == null ||
        !o.shippingMethod;
      if (partial) ordersPartial += 1;
    }
    if (!o.shippingMethod) ordersUnknownMethod += 1;

    const b = byStatus[status];
    if (b) {
      b.packages += 1;
      b.cards += ic;
      b.articleGross += article;
      b.shippingIncome += ship;
      if (trustee) trusteeArticleByStatus[status] += article;
    }

    const method = (o.shippingMethod as string | undefined) || "(unknown)";
    const mb = byMethodMap.get(method) ?? { packages: 0, cards: 0, shippingIncome: 0 };
    mb.packages += 1;
    mb.cards += ic;
    mb.shippingIncome += ship;
    byMethodMap.set(method, mb);

    const countryKey = (o.country as string | undefined) || "(?)";
    const cb = byCountryMap.get(countryKey) ?? { packages: 0, cards: 0, grossReceived: 0 };
    cb.packages += 1;
    cb.cards += ic;
    cb.grossReceived += total;
    byCountryMap.set(countryKey, cb);

    const cmDate = (o.orderDate as string | undefined) ?? dateISO ?? undefined;
    const orderId = o.orderId as string;
    const recCountry = o.country as string | undefined;
    if (!largest || total > largest.total) largest = { orderId, total, cards: ic, country: recCountry, date: cmDate };
    if (ic > 0 && (!mostCards || ic > mostCards.cards)) mostCards = { orderId, total, cards: ic, country: recCountry, date: cmDate };
    if (ic > 0 && (!smallest || total < smallest.total)) smallest = { orderId, total, cards: ic, country: recCountry, date: cmDate };
  }

  // CM fees (mirror getCmRevenueForMonth rounding: ceil to cents)
  const sellingFee = Math.ceil(articleGross * 0.05 * 100) / 100;
  const trusteeFee = Math.ceil(trusteeArticleGross * 0.01 * 100) / 100;
  const articleNet = articleGross - sellingFee - trusteeFee;

  // Per-status net: apply the same fee rates so the per-card net column
  // is consistent with the global articleNet.
  for (const st of ["paid", "sent", "arrived"] as const) {
    const b = byStatus[st];
    const stSelling = Math.ceil(b.articleGross * 0.05 * 100) / 100;
    const stTrustee = Math.ceil(trusteeArticleByStatus[st] * 0.01 * 100) / 100;
    b.articleNet = b.articleGross - stSelling - stTrustee;
    b.avgArticleNetPerCard = b.cards > 0 ? b.articleNet / b.cards : 0;
  }

  // Shipping expenses in window. For lifetime we sum all; for a date
  // window we filter by transaction `date` (ISO "YYYY-MM-DD").
  const txQuery: Record<string, unknown> = { type: "expense", category: "shipping" };
  if (from && to) txQuery.date = { $gte: from, $lte: to };
  const shipTxs = await db.collection("dashboard_transactions").find(txQuery).toArray();
  const shippingExpense = shipTxs.reduce((s, t) => s + ((t.amount as number) || 0), 0);
  const shippingProfit = shippingIncome - shippingExpense;

  // Per-card / per-package derived figures
  const avgArticleGrossPerCard = cards > 0 ? articleGross / cards : 0;
  const avgArticleNetPerCard = cards > 0 ? articleNet / cards : 0;
  const avgShipIncomePerPackage = pkgs > 0 ? shippingIncome / pkgs : 0;
  const avgShipProfitPerPackage = pkgs > 0 ? shippingProfit / pkgs : 0;
  const avgShipProfitPerCard = cards > 0 ? shippingProfit / cards : 0;
  const fullPerCardNet = avgArticleNetPerCard + avgShipProfitPerCard;

  const byShippingMethod = Array.from(byMethodMap.entries())
    .map(([method, v]) => ({
      method,
      packages: v.packages,
      cards: v.cards,
      shippingIncome: Math.round(v.shippingIncome * 100) / 100,
      avgPerPackage: v.packages > 0 ? v.shippingIncome / v.packages : 0,
    }))
    .sort((a, b) => b.packages - a.packages);

  const byCountry = Array.from(byCountryMap.entries())
    .map(([country, v]) => ({
      country,
      packages: v.packages,
      cards: v.cards,
      grossReceived: Math.round(v.grossReceived * 100) / 100,
      avgGrossPerPackage: v.packages > 0 ? v.grossReceived / v.packages : 0,
    }))
    .sort((a, b) => b.packages - a.packages);

  // Days-in-window: when the user picked an explicit range, honour it
  // (so partial-month "this month" gets divided by elapsed days, not 30).
  // For lifetime, span the observed first→last paid date.
  function daySpan(a: string | null, b: string | null): number {
    if (!a || !b) return 0;
    const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
    return Math.max(1, Math.floor(ms / 86400_000) + 1);
  }
  const today = new Date().toISOString().slice(0, 10);
  const daysInWindow = from && to
    // Don't count days that haven't happened yet — for "thisMonth" partway
    // through, divide by elapsed days, not the full 30.
    ? daySpan(from, to < today ? to : today)
    : daySpan(earliest, latest);

  const avgPackagesPerDay = daysInWindow > 0 ? pkgs / daysInWindow : 0;
  const avgCardsPerDay = daysInWindow > 0 ? cards / daysInWindow : 0;

  const r2 = (n: number) => Math.round(n * 100) / 100;
  const r4 = (n: number) => Math.round(n * 10000) / 10000;

  return {
    rangeLabel: label,
    windowStart: earliest,
    windowEnd: latest,
    daysInWindow,

    packages: pkgs,
    cards,
    avgCardsPerPackage: pkgs > 0 ? r2(cards / pkgs) : 0,
    avgPackagesPerDay: r2(avgPackagesPerDay),
    avgCardsPerDay: r2(avgCardsPerDay),
    detailSyncedPct: pkgs > 0 ? r2((detailSynced / pkgs) * 100) : 0,
    ordersMissingDetail: pkgs - detailSynced,
    ordersUnsynced,
    ordersPartial,
    ordersUnknownMethod,

    totalReceived: r2(totalReceived),
    articleGross: r2(articleGross),
    shippingIncome: r2(shippingIncome),
    trusteeArticleGross: r2(trusteeArticleGross),
    sellingFee: r2(sellingFee),
    trusteeFee: r2(trusteeFee),
    articleNet: r2(articleNet),
    shippingExpense: r2(shippingExpense),
    shippingProfit: r2(shippingProfit),

    avgArticleGrossPerCard: r4(avgArticleGrossPerCard),
    avgArticleNetPerCard: r4(avgArticleNetPerCard),
    avgShipIncomePerPackage: r4(avgShipIncomePerPackage),
    avgShipProfitPerPackage: r4(avgShipProfitPerPackage),
    avgShipProfitPerCard: r4(avgShipProfitPerCard),
    fullPerCardNet: r4(fullPerCardNet),

    byStatus: {
      paid: { ...byStatus.paid, articleGross: r2(byStatus.paid.articleGross), articleNet: r2(byStatus.paid.articleNet), shippingIncome: r2(byStatus.paid.shippingIncome), avgArticleNetPerCard: r4(byStatus.paid.avgArticleNetPerCard) },
      sent: { ...byStatus.sent, articleGross: r2(byStatus.sent.articleGross), articleNet: r2(byStatus.sent.articleNet), shippingIncome: r2(byStatus.sent.shippingIncome), avgArticleNetPerCard: r4(byStatus.sent.avgArticleNetPerCard) },
      arrived: { ...byStatus.arrived, articleGross: r2(byStatus.arrived.articleGross), articleNet: r2(byStatus.arrived.articleNet), shippingIncome: r2(byStatus.arrived.shippingIncome), avgArticleNetPerCard: r4(byStatus.arrived.avgArticleNetPerCard) },
    },
    byShippingMethod,
    byCountry,

    records: { largest, mostCards, smallest },
  };
}

export async function markOrdersPrinted(orderIds: string[], printed: boolean): Promise<void> {
  const db = await getDb();
  await db.collection(COL.orders).updateMany(
    { orderId: { $in: orderIds } },
    { $set: { printed } }
  );
}

export async function getOrderValuesByStatus(): Promise<Record<string, number>> {
  const db = await getDb();
  const results = await db.collection(COL.orders).aggregate([
    { $match: { direction: { $in: ["sale", null] } } },
    { $group: { _id: "$status", total: { $sum: "$totalPrice" } } },
  ]).toArray();
  return Object.fromEntries(results.map(r => [r._id as string, r.total as number]));
}

export async function getTrusteeSentValue(): Promise<number> {
  const db = await getDb();
  const results = await db.collection(COL.orders).aggregate([
    { $match: { direction: { $in: ["sale", null] }, status: "sent", trustee: true } },
    { $group: { _id: null, total: { $sum: "$totalPrice" } } },
  ]).toArray();
  return results[0]?.total || 0;
}

async function getOrderCountForStatus(status: string, direction: string): Promise<number> {
  const db = await getDb();
  const query: Record<string, unknown> = { status };
  if (direction === "purchase") query.direction = "purchase";
  else query.direction = { $in: ["sale", null] };
  return db.collection(COL.orders).countDocuments(query);
}

export async function getOrderCounts(): Promise<Record<string, { sale: number; purchase: number }>> {
  const db = await getDb();
  const pipeline = [
    { $group: { _id: { status: "$status", direction: "$direction" }, count: { $sum: 1 } } },
  ];
  const results = await db.collection(COL.orders).aggregate(pipeline).toArray();

  const counts: Record<string, { sale: number; purchase: number }> = {};
  for (const r of results) {
    const status = r._id.status as string;
    const direction = r._id.direction as string;
    if (!counts[status]) counts[status] = { sale: 0, purchase: 0 };
    counts[status][direction === "purchase" ? "purchase" : "sale"] += r.count;
  }
  return counts;
}

export async function getOrderDetail(orderId: string): Promise<{
  order: CmOrder | null;
  items: CmOrderItem[];
}> {
  const db = await getDb();
  const [order, items] = await Promise.all([
    db.collection(COL.orders).findOne({ orderId }),
    db.collection(COL.orderItems).find({ orderId }).toArray(),
  ]);
  return {
    order: order as CmOrder | null,
    items: items as unknown as CmOrderItem[],
  };
}

export async function getStockSummary(): Promise<{
  totalTracked: number;
  totalValue: number;
  byCondition: Record<string, number>;
  bySource: Record<string, number>;
}> {
  const db = await getDb();
  const col = db.collection(COL.stock);

  const [countResult, valueResult, conditionResult, sourceResult] = await Promise.all([
    col.countDocuments(),
    col.aggregate([{ $group: { _id: null, total: { $sum: { $multiply: ["$price", "$qty"] } } } }]).toArray(),
    col.aggregate([{ $group: { _id: "$condition", count: { $sum: 1 } } }]).toArray(),
    col.aggregate([{ $group: { _id: "$source", count: { $sum: 1 } } }]).toArray(),
  ]);

  return {
    totalTracked: countResult,
    totalValue: valueResult[0]?.total || 0,
    byCondition: Object.fromEntries(conditionResult.map((r) => [r._id, r.count])),
    bySource: Object.fromEntries(sourceResult.map((r) => [r._id, r.count])),
  };
}

export async function getStockCoverage(): Promise<{
  tracked: number;
  total: number | null;
  percentage: number | null;
}> {
  const db = await getDb();
  // `tracked` compares against CM's `totalListings` (the count CM displays
  // on /Stock/Offers — every individual card, qty=4 listing counts as 4).
  // We previously used countDocuments here, which counts DB rows — but a
  // row with qty=4 represents 4 CM listings, so countDocuments understated
  // coverage by ~2.5×. Sum(qty) is the right denominator-comparable
  // metric: a fully-walked stock matches CM's totalListings ~1:1.
  const trackedAgg = await db
    .collection(COL.stock)
    .aggregate<{ tracked: number }>([
      { $group: { _id: null, tracked: { $sum: "$qty" } } },
    ])
    .toArray();
  const tracked = trackedAgg[0]?.tracked ?? 0;
  const latestSnapshot = await db
    .collection(COL.stockSnapshots)
    .findOne({}, { sort: { extractedAt: -1 } });
  const total = (latestSnapshot?.totalListings as number) || null;
  return {
    tracked,
    total,
    percentage: total ? Math.round((tracked / total) * 10000) / 100 : null,
  };
}

export async function getTransactionSummary(
  periodStart?: string,
  periodEnd?: string
): Promise<CmTransactionSummary | null> {
  const db = await getDb();
  const query: Record<string, unknown> = {};
  if (periodStart) query.periodStart = periodStart;
  if (periodEnd) query.periodEnd = periodEnd;
  const doc = await db
    .collection(COL.transactions)
    .findOne(query, { sort: { extractedAt: -1 } });
  return doc as CmTransactionSummary | null;
}

export async function getSyncStatus(): Promise<{
  lastSync: Record<string, string>;
  recentLogs: CmSyncLogEntry[];
}> {
  const db = await getDb();
  const logs = await db
    .collection(COL.syncLog)
    .find()
    .sort({ receivedAt: -1 })
    .limit(20)
    .toArray();

  const lastSync: Record<string, string> = {};
  for (const log of logs) {
    if (!lastSync[log.dataType as string]) {
      lastSync[log.dataType as string] = log.receivedAt as string;
    }
  }

  return {
    lastSync,
    recentLogs: logs as unknown as CmSyncLogEntry[],
  };
}

// ── Migration helper ────────────────────────────────────────────────

export async function migrateFromHuntinggrounds(
  sourceUri: string
): Promise<{ imported: number; skipped: number }> {
  const { MongoClient } = await import("mongodb");
  const sourceClient = await MongoClient.connect(sourceUri);
  const sourceDb = sourceClient.db("huntinggrounds");
  const sourceDocs = await sourceDb.collection("cards").find().toArray();
  await sourceClient.close();

  const db = await getDb();
  const col = db.collection(COL.stock);
  await ensureIndexes();

  const now = new Date().toISOString();

  const ops = sourceDocs.map(doc => {
    // Mirror the canonical processStock formula (includes language).
    const dedupKey = doc.dedupKey ||
      `${doc.name}|${doc.qty}|${doc.price}|${doc.condition}|${doc.foil}|${doc.set}|${doc.language || "English"}`;
    return {
      updateOne: {
        filter: { dedupKey },
        update: {
          $setOnInsert: {
            name: doc.name, qty: doc.qty, price: doc.price,
            condition: doc.condition, language: "English",
            foil: doc.foil || false, set: doc.set, dedupKey,
            source: "import" as const,
            firstSeenAt: doc.importedAt?.toISOString?.() || now,
            lastSeenAt: now, submittedBy: "migration",
          },
        },
        upsert: true,
      },
    };
  });

  // Process in batches of 500 to avoid memory issues
  let imported = 0, skipped = 0;
  for (let i = 0; i < ops.length; i += 500) {
    const batch = ops.slice(i, i + 500);
    const result = await col.bulkWrite(batch, { ordered: false });
    imported += result.upsertedCount || 0;
    skipped += batch.length - (result.upsertedCount || 0);
  }

  return { imported, skipped };
}
