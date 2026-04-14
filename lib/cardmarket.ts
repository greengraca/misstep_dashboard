import { getDb } from "@/lib/mongodb";
import { COLLECTION_PREFIX } from "@/lib/constants";
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
  transactions: `${COLLECTION_PREFIX}cm_transactions`,
  syncLog: `${COLLECTION_PREFIX}sync_log`,
} as const;

// ── Index management ────────────────────────────────────────────────

let indexesEnsured = false;

async function ensureIndexes() {
  if (indexesEnsured) return;
  try {
    const db = await getDb();
    await Promise.all([
      db.collection(COL.balance).createIndex({ extractedAt: -1 }),
      db.collection(COL.orders).createIndex({ orderId: 1 }, { unique: true }),
      db.collection(COL.orders).createIndex({ status: 1, direction: 1 }),
      db.collection(COL.orders).createIndex({ orderDate: -1 }),
      db.collection(COL.orderItems).createIndex({ orderId: 1 }),
      db.collection(COL.stock).createIndex({ dedupKey: 1 }, { unique: true }),
      db.collection(COL.stock).createIndex({ source: 1 }),
      db.collection(COL.stock).createIndex({ lastSeenAt: -1 }),
      db.collection(COL.stock).createIndex({ name: 1 }),
      db.collection(COL.stock).createIndex({ set: 1, condition: 1 }),
      db.collection(COL.stock).createIndex({ price: 1 }),
      db.collection(COL.stock).createIndex(
        { articleId: 1 },
        { unique: true, sparse: true }
      ),
      db.collection(COL.stockSnapshots).createIndex({ extractedAt: -1 }),
      db.collection(COL.transactions).createIndex({ dedupKey: 1 }, { unique: true }),
      db.collection(COL.syncLog).createIndex({ receivedAt: -1 }),
    ]);
    indexesEnsured = true;
  } catch {
    indexesEnsured = true;
  }
}

// ── Rate limiting (in-memory) ───────────────────────────────────────

const lastSyncByMember = new Map<string, number>();
const SYNC_COOLDOWN_MS = 30_000;

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

  // Get the 2 most recent records
  const recent = await col.find().sort({ extractedAt: -1 }).limit(2).toArray();

  if (recent.length === 2 && recent[0].balance === balance && recent[1].balance === balance) {
    // All 3 have same value: delete the middle one (recent[0]), insert new
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

// ── Orders (upsert by orderId) ──────────────────────────────────────

const STATUS_ORDER = ["shopping_cart", "unpaid", "paid", "sent", "arrived"];

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
      const removeOps = items.map(item => ({
        deleteOne: {
          filter: {
            name: item.name as string,
            condition: item.condition as string,
            foil: item.foil as boolean,
            set: item.set as string,
            source: "stock_page",
          },
        },
      }));
      await db.collection(COL.stock).bulkWrite(removeOps, { ordered: false });
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

  // Cancelled orders: delete from DB entirely (they shouldn't count toward anything)
  if (detail.status === "cancelled") {
    const deleted = await db.collection(COL.orders).deleteOne({ orderId });
    await db.collection(COL.orderItems).deleteMany({ orderId });
    return { added: 0, updated: 0, skipped: deleted.deletedCount ? 0 : 1 };
  }

  // Check status change — allow both advance and correction (regression)
  const PAID_INDEX = STATUS_ORDER.indexOf("paid");
  const existing = await db.collection(COL.orders).findOne({ orderId }, { projection: { status: 1, direction: 1 } });
  const existingIdx = existing ? STATUS_ORDER.indexOf(existing.status as string) : -1;
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
    { $set: orderUpdates, $setOnInsert: { direction: detail.direction || "sale" } },
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

    // Remove sold items from stock only on FIRST transition to paid/sent/arrived.
    // This prevents re-deleting restocked items on subsequent re-syncs.
    if (statusAdvanced && existingIdx < PAID_INDEX && newIdx >= PAID_INDEX) {
      const removeOps = detail.items.map(item => ({
        deleteOne: {
          filter: {
            name: item.name,
            condition: item.condition,
            foil: item.foil,
            set: item.set,
            source: "stock_page",
          },
        },
      }));
      await db.collection(COL.stock).bulkWrite(removeOps, { ordered: false });
    }
    added += detail.items.length;
  }

  return { added, updated, skipped: 0 };
}

// ── Stock (upsert by dedupKey) ──────────────────────────────────────

async function processStock(
  submittedBy: string,
  data: Record<string, unknown>
): Promise<{ added: number; updated: number; skipped: number }> {
  const db = await getDb();
  const col = db.collection(COL.stock);
  const listings = data.listings as CmStockListing[];
  const now = new Date().toISOString();

  const ops = listings.map(listing => {
    const dedupKey = listing.dedupKey ||
      `${listing.name}|${listing.qty}|${listing.price}|${listing.condition}|${listing.foil}|${listing.set}`;
    return {
      updateOne: {
        filter: { dedupKey },
        update: {
          $set: { lastSeenAt: now, submittedBy },
          $setOnInsert: {
            name: listing.name, qty: listing.qty, price: listing.price,
            condition: listing.condition, language: listing.language || "English",
            foil: listing.foil || false, set: listing.set, dedupKey,
            source: "stock_page" as const, firstSeenAt: now,
          },
        },
        upsert: true,
      },
    };
  });

  if (!ops.length) return { added: 0, updated: 0, skipped: 0 };
  const result = await col.bulkWrite(ops, { ordered: false });
  return {
    added: result.upsertedCount || 0,
    updated: result.modifiedCount || 0,
    skipped: listings.length - (result.upsertedCount || 0) - (result.modifiedCount || 0),
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
  const now = new Date().toISOString();

  let added = 0, updated = 0, removed = 0;

  for (const listing of listings) {
    if (listing.qty <= 0) {
      // Quantity dropped to 0 — remove from stock
      const del = await col.deleteOne({ articleId: listing.articleId });
      if (del.deletedCount) removed++;
      continue;
    }

    const result = await col.updateOne(
      { articleId: listing.articleId },
      {
        $set: {
          name: listing.name,
          qty: listing.qty,
          price: listing.price,
          condition: listing.condition,
          language: listing.language || "English",
          foil: listing.foil || false,
          set: listing.set,
          lastSeenAt: now,
          submittedBy,
          source: "product_page" as const,
          // Also maintain a dedupKey for compatibility with stock page entries
          dedupKey: `${listing.name}|${listing.qty}|${listing.price}|${listing.condition}|${listing.foil}|${listing.set}`,
        },
        $setOnInsert: {
          articleId: listing.articleId,
          firstSeenAt: now,
        },
      },
      { upsert: true }
    );

    if (result.upsertedId) added++;
    else if (result.modifiedCount) updated++;
  }

  const details = `${cardName}${listings.length > 0 ? ` — ${listings.length} listing${listings.length !== 1 ? "s" : ""}` : ""}${removed ? `, ${removed} removed` : ""}`;

  return { added, updated, skipped: 0, removed, details };
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

  const [docs, total, valueResult] = await Promise.all([
    col.find(query).sort({ orderDate: -1, orderTime: -1, _id: -1 }).skip(skip).limit(limit).toArray(),
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
  const tracked = await db.collection(COL.stock).countDocuments();
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
    const dedupKey = doc.dedupKey ||
      `${doc.name}|${doc.qty}|${doc.price}|${doc.condition}|${doc.foil}|${doc.set}`;
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
