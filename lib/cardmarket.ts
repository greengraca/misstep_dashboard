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
): Promise<Record<string, { added: number; updated: number; skipped: number }>> {
  await ensureIndexes();
  const results: Record<string, { added: number; updated: number; skipped: number }> = {};

  for (const item of batch) {
    switch (item.type) {
      case "balance":
        results.balance = await processBalance(submittedBy, item.data);
        break;
      case "orders":
        results.orders = await processOrders(submittedBy, item.data);
        break;
      case "order_detail":
        results.order_detail = await processOrderDetail(submittedBy, item.data);
        break;
      case "stock":
        results.stock = await processStock(submittedBy, item.data);
        break;
      case "stock_overview":
        results.stock_overview = await processStockOverview(submittedBy, item.data);
        break;
      case "transactions":
        results.transactions = await processTransactions(submittedBy, item.data);
        break;
    }
  }

  // Log sync
  const db = await getDb();
  for (const [dataType, stats] of Object.entries(results)) {
    await db.collection(COL.syncLog).insertOne({
      dataType,
      itemCount: stats.added + stats.updated,
      submittedBy,
      receivedAt: new Date().toISOString(),
      stats,
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
  let added = 0, updated = 0, skipped = 0;

  for (const order of orders) {
    const existing = await col.findOne({ orderId: order.orderId });
    if (existing) {
      // Only update if status moves forward
      const existingIdx = STATUS_ORDER.indexOf(existing.status);
      const newIdx = STATUS_ORDER.indexOf(status);
      const updates: Record<string, unknown> = { lastSeenAt: new Date().toISOString(), submittedBy };
      if (newIdx > existingIdx) {
        updates.status = status;
      }
      await col.updateOne({ orderId: order.orderId }, { $set: updates });
      updated++;
    } else {
      await col.insertOne({
        orderId: order.orderId,
        direction,
        status,
        counterparty: order.counterparty || "",
        country: order.country || "",
        itemCount: order.itemCount || 0,
        totalPrice: order.totalPrice || 0,
        orderDate: order.orderDate || "",
        orderTime: order.orderTime || "",
        lastSeenAt: new Date().toISOString(),
        submittedBy,
      });
      added++;
    }
  }

  return { added, updated, skipped };
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
  if (detail.timeline) orderUpdates.timeline = detail.timeline;
  if (detail.status) orderUpdates.status = detail.status;
  if (detail.counterparty) orderUpdates.counterparty = detail.counterparty;
  if (detail.country) orderUpdates.country = detail.country;

  await db.collection(COL.orders).updateOne(
    { orderId },
    { $set: orderUpdates, $setOnInsert: { direction: detail.direction || "sale" } },
    { upsert: true }
  );
  updated++;

  // Save order items
  if (detail.items?.length) {
    const itemCol = db.collection(COL.orderItems);
    const stockCol = db.collection(COL.stock);

    for (const item of detail.items) {
      await itemCol.updateOne(
        { orderId, articleId: item.articleId },
        { $set: { ...item, orderId, submittedBy } },
        { upsert: true }
      );

      // Also add to stock as order_item source
      const dedupKey = `${item.name}|${item.qty}|${item.price}|${item.condition}|${item.foil}|${item.set}`;
      const now = new Date().toISOString();
      await stockCol.updateOne(
        { dedupKey },
        {
          $set: { lastSeenAt: now, sold: true, orderId, submittedBy },
          $setOnInsert: {
            name: item.name,
            qty: item.qty,
            price: item.price,
            condition: item.condition,
            language: item.language,
            foil: item.foil,
            set: item.set,
            dedupKey,
            source: "order_item" as const,
            firstSeenAt: now,
          },
        },
        { upsert: true }
      );
      added++;
    }
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
  let added = 0, updated = 0, skipped = 0;
  const now = new Date().toISOString();

  for (const listing of listings) {
    const dedupKey = listing.dedupKey ||
      `${listing.name}|${listing.qty}|${listing.price}|${listing.condition}|${listing.foil}|${listing.set}`;

    const result = await col.updateOne(
      { dedupKey },
      {
        $set: { lastSeenAt: now, submittedBy },
        $setOnInsert: {
          name: listing.name,
          qty: listing.qty,
          price: listing.price,
          condition: listing.condition,
          language: listing.language || "English",
          foil: listing.foil || false,
          set: listing.set,
          dedupKey,
          source: "stock_page" as const,
          sold: false,
          firstSeenAt: now,
        },
      },
      { upsert: true }
    );

    if (result.upsertedId) added++;
    else if (result.modifiedCount) updated++;
    else skipped++;
  }

  return { added, updated, skipped };
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

  // Time-series compression: keep at most 2 with same value
  const recent = await col.find().sort({ extractedAt: -1 }).limit(2).toArray();
  if (
    recent.length === 2 &&
    recent[0].totalListings === totalListings &&
    recent[1].totalListings === totalListings
  ) {
    await col.deleteOne({ _id: recent[0]._id });
  }

  await col.insertOne({ totalListings, extractedAt: now, submittedBy });
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
} = {}): Promise<{ orders: CmOrder[]; total: number }> {
  const db = await getDb();
  const col = db.collection(COL.orders);
  const query: Record<string, unknown> = {};
  if (filters.status) query.status = filters.status;
  if (filters.direction) query.direction = filters.direction;

  const limit = filters.limit || 20;
  const skip = ((filters.page || 1) - 1) * limit;

  const [docs, total] = await Promise.all([
    col.find(query).sort({ orderDate: -1, orderTime: -1 }).skip(skip).limit(limit).toArray(),
    col.countDocuments(query),
  ]);

  return { orders: docs as unknown as CmOrder[], total };
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

  let imported = 0, skipped = 0;
  const now = new Date().toISOString();

  for (const doc of sourceDocs) {
    const dedupKey = `${doc.name}|${doc.qty}|${doc.price}|${doc.condition}|${doc.foil}|${doc.set}`;
    const result = await col.updateOne(
      { dedupKey },
      {
        $setOnInsert: {
          name: doc.name,
          qty: doc.qty,
          price: doc.price,
          condition: doc.condition,
          language: "English",
          foil: doc.foil || false,
          set: doc.set,
          dedupKey,
          source: "import" as const,
          sold: false,
          firstSeenAt: doc.importedAt?.toISOString?.() || now,
          lastSeenAt: now,
          submittedBy: "migration",
        },
      },
      { upsert: true }
    );

    if (result.upsertedId) imported++;
    else skipped++;
  }

  return { imported, skipped };
}
