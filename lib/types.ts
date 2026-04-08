import type { Session } from "next-auth";

export interface DashboardSession extends Session {
  user: Session["user"] & {
    id: string;
  };
}

export interface ActivityLogEntry {
  action: string;
  entity_type: string;
  entity_id?: string;
  details?: string;
  user_id: string;
  user_name: string;
  timestamp: Date;
}

export interface ErrorLogEntry {
  level: "error" | "warn" | "info";
  source: string;
  message: string;
  details?: unknown;
  timestamp: Date;
}

export type TransactionType = "income" | "expense";
export type TransactionCategory = "shipping" | "operational" | "other";

export interface Transaction {
  _id: string;
  month: string;
  date: string;
  type: TransactionType;
  category: TransactionCategory;
  description: string;
  amount: number;
  paid_by?: string | null;
  reimbursed: boolean;
  reimbursed_at?: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface PendingReimbursement {
  id: string;
  description: string;
  amount: number;
  paid_by: string;
  date: string;
}

// ── Cardmarket Extension Types ──────────────────────────────────────

export interface CmBalanceSnapshot {
  _id?: string;
  balance: number;
  extractedAt: string;
  submittedBy: string;
  pageUrl: string;
  createdAt?: string;
}

export interface CmOrder {
  _id?: string;
  orderId: string;
  direction: "sale" | "purchase";
  status: string;
  counterparty: string;
  country: string;
  countryFlagPos?: string;
  lastName?: string;
  trustee?: boolean;
  itemCount: number;
  totalPrice: number;
  orderDate: string;
  orderTime?: string;
  lastSeenAt?: string;
  submittedBy?: string;
}

export interface CmShippingAddress {
  name: string;
  street: string;
  city: string;
  country: string;
}

export interface CmOrderItem {
  articleId: string;
  name: string;
  set: string;
  collectorNumber: string;
  condition: string;
  language: string;
  foil: boolean;
  price: number;
  qty: number;
  rarity?: string;
  productId?: string;
  expansionPos?: string;
  langPos?: string;
}

export interface CmOrderDetail {
  orderId: string;
  direction?: "sale" | "purchase";
  status?: string;
  counterparty?: string;
  country?: string;
  items: CmOrderItem[];
  shippingAddress?: CmShippingAddress;
  shippingMethod?: string;
  shippingPrice?: number;
  itemValue?: number;
  totalPrice?: number;
  timeline?: Record<string, string>;
}

export interface CmStockListing {
  _id?: string;
  name: string;
  qty: number;
  price: number;
  condition: string;
  language: string;
  foil: boolean;
  set: string;
  dedupKey: string;
  source: "stock_page" | "import";
  firstSeenAt?: string;
  lastSeenAt?: string;
  submittedBy?: string;
}

export interface CmStockSnapshot {
  _id?: string;
  totalListings: number;
  extractedAt: string;
  submittedBy: string;
}

export interface CmTransactionSummary {
  _id?: string;
  periodStart: string;
  periodEnd: string;
  sales: number;
  fees: number;
  withdrawals: number;
  refunds: number;
  extractedAt?: string;
  submittedBy?: string;
  dedupKey: string;
}

export interface CmSyncLogEntry {
  _id?: string;
  dataType: string;
  itemCount: number;
  submittedBy: string;
  receivedAt: string;
  stats: { added: number; updated: number; skipped: number };
}

export interface ExtSyncBatchItem {
  type: "balance" | "orders" | "order_detail" | "stock" | "stock_overview" | "transactions";
  data: Record<string, unknown>;
}

export interface ExtSyncPayload {
  submittedBy: string;
  batch: ExtSyncBatchItem[];
}
