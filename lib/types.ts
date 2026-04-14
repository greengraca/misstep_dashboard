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

export type TransactionType = "income" | "expense" | "withdrawal";
export type TransactionCategory = "shipping" | "operational" | "other" | "direct";

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
  printed?: boolean;
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
  articleId?: string;
  name: string;
  qty: number;
  price: number;
  condition: string;
  language: string;
  foil: boolean;
  set: string;
  dedupKey: string;
  source: "stock_page" | "import" | "product_page";
  firstSeenAt?: string;
  lastSeenAt?: string;
  submittedBy?: string;
}

export interface CmStockSnapshot {
  _id?: string;
  totalListings: number;
  totalQty?: number;
  totalValue?: number;
  distinctNameSet?: number;
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
  stats: { added: number; updated: number; skipped: number; removed?: number };
  details?: string;
}

export interface CmProductStockListing {
  articleId: string;
  name: string;
  set: string;
  qty: number;
  price: number;
  condition: string;
  language: string;
  foil: boolean;
}

export interface ExtSyncBatchItem {
  type: "balance" | "orders" | "order_detail" | "stock" | "stock_overview" | "transactions" | "product_stock";
  data: Record<string, unknown>;
}

export interface ExtSyncPayload {
  submittedBy: string;
  batch: ExtSyncBatchItem[];
}

// ── EV Calculator Types ────────────────────────────────────────

export interface EvSet {
  _id: string;
  code: string;
  name: string;
  released_at: string;
  card_count: number;
  icon_svg_uri: string;
  set_type: string;
  scryfall_id: string;
  synced_at: string;
  parent_set_code?: string | null;
  digital?: boolean | null;
  play_ev_net?: number | null;
  collector_ev_net?: number | null;
  cards_priced?: number;
  config_exists?: boolean;
}

export interface EvCard {
  _id: string;
  scryfall_id: string;
  set: string;
  name: string;
  collector_number: string;
  rarity: string;
  price_eur: number | null;
  price_eur_foil: number | null;
  finishes: string[];
  booster: boolean;
  image_uri: string | null;
  cardmarket_id: number | null;
  type_line: string;
  frame_effects: string[];
  promo_types: string[];
  border_color: string;
  treatment: string;
  prices_updated_at: string;
  synced_at: string;
  colors: string[];
  color_identity: string[];
  cmc: number;
  released_at: string;
  layout: string;
  frame: string;
  pull_rate_per_box?: number;
  ev_contribution?: number;
}

export interface EvCardFilter {
  rarity?: string[];
  treatment?: string[];
  border_color?: string[];
  frame_effects?: string[];
  frame?: string[];
  promo_types?: string[];
  type_line_contains?: string;
  type_line_not_contains?: string;
  finishes?: string[];
  booster?: boolean;
  mono_color?: boolean;
  colors?: string[];
  custom_pool?: string[];
}

export interface EvSlotOutcome {
  probability: number;
  filter: EvCardFilter;
}

export interface EvSlotDefinition {
  slot_number: number;
  label: string;
  is_foil: boolean;
  outcomes: EvSlotOutcome[];
}

export interface EvBoosterConfig {
  packs_per_box: number;
  cards_per_pack: number;
  slots: EvSlotDefinition[];
}

export interface EvConfig {
  _id: string;
  set_code: string;
  updated_at: string;
  updated_by: string;
  sift_floor: number;
  fee_rate: number;
  play_booster: EvBoosterConfig | null;
  collector_booster: EvBoosterConfig | null;
}

export type EvConfigInput = Omit<EvConfig, "_id" | "set_code" | "updated_at" | "updated_by">;

export interface EvCalculationResult {
  set_code: string;
  booster_type: "play" | "collector";
  pack_ev: number;
  box_ev_gross: number;
  box_ev_net: number;
  fee_rate: number;
  sift_floor: number;
  cards_counted: number;
  cards_above_floor: number;
  cards_total: number;
  slot_breakdown: {
    slot_number: number;
    label: string;
    slot_ev: number;
    top_cards: { name: string; price: number; pull_rate: number; ev: number }[];
  }[];
  top_ev_cards: EvTopCard[];
  top_price_cards: EvTopCard[];
}

export interface EvTopCard {
  name: string;
  set: string;
  collector_number: string;
  rarity: string;
  treatment: string;
  price: number;
  pull_rate_per_box: number;
  ev_contribution: number;
  image_uri: string | null;
}

export interface EvSimulationResult {
  iterations: number;
  mean: number;
  median: number;
  stddev: number;
  min: number;
  max: number;
  percentiles: {
    p2_5: number; p5: number; p16: number; p25: number;
    p75: number; p84: number; p95: number; p97_5: number;
  };
  histogram: { bin_min: number; bin_max: number; count: number }[];
  roi: {
    box_cost: number;
    quantity: number;
    roi_percent: number;
    profit_per_box: number;
    total_profit: number;
    profit_probability: number;
  } | null;
  duration_ms: number;
}

export interface EvSnapshot {
  _id: string;
  date: string;
  set_code: string;
  play_ev_gross: number | null;
  play_ev_net: number | null;
  collector_ev_gross: number | null;
  collector_ev_net: number | null;
  card_count_total: number;
  card_count_priced: number;
  sift_floor: number;
  created_at: string;
}

// ── Jumpstart Theme Types ──────────────────────────────────────

export interface EvJumpstartTheme {
  name: string;
  variant: number;
  color: string;
  tier: "common" | "rare" | "mythic";  // theme rarity: common=4 variants, rare=2, mythic=1
  cards: string[];   // card names (non-land, matched against EvCard.name)
}

export interface EvJumpstartThemeResult {
  name: string;
  variant: number;
  color: string;
  tier: "common" | "rare" | "mythic";
  ev_gross: number;
  ev_net: number;
  rare_count: number;
  cards: { name: string; rarity: string; price: number; image_uri: string | null }[];
}

export interface EvJumpstartResult {
  set_code: string;
  packs_per_box: number;
  theme_count: number;
  themes: EvJumpstartThemeResult[];
  avg_theme_ev_gross: number;
  avg_theme_ev_net: number;
  box_ev_gross: number;
  box_ev_net: number;
  fee_rate: number;
  sift_floor: number;
}
