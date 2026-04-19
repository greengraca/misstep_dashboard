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
  extra?: string;
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
  // Signed listings carry a huge legitimate premium over the Scryfall trend.
  // `signed` is the structured boolean for filtering; `comment` is the
  // free-form seller note ("Signed by X", "color misprint", binder slot,
  // etc.) that explains off-trend pricing. Captured by the ext (v1.7.0+
  // for signed, v1.7.2+ for comment).
  signed?: boolean;
  comment?: string | null;
  // Cardmarket productId — the specific art variant's product ID (matches
  // ev_cards.cardmarket_id). Needed to pick the right ev_cards doc when
  // multiple printings share (name, set) — basic lands, reprints. Captured
  // by the ext (v1.7.1+); older syncs leave it absent and the join falls
  // back to "only match if unique".
  productId?: number | null;
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
  signed?: boolean;
  comment?: string | null;
  productId?: number | null;
}

export interface ExtSyncBatchItem {
  type: "balance" | "orders" | "order_detail" | "stock" | "stock_overview" | "transactions" | "product_stock" | "card_prices";
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

// Per-variant market-price snapshot captured by the extension's card_prices
// sync. One branch per variant under `cm_prices`. `trend` is Cardmarket's
// Trend Price at the time we last visited the product page; `updatedAt` lets
// downstream code compare against the Scryfall bulk (`prices_updated_at`)
// and use whichever is fresher (see lib/ev-prices.ts#getEffectivePrice).
export interface EvCardCmPriceSnapshot {
  from?: number;
  trend?: number;
  avg30d?: number;
  avg7d?: number;
  avg1d?: number;
  available?: number;
  chart?: Array<{ date: string; avg_sell: number }>;
  updatedAt: string;
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
  cm_prices?: {
    nonfoil?: EvCardCmPriceSnapshot;
    foil?: EvCardCmPriceSnapshot;
  } | null;
  pull_rate_per_box?: number;
  ev_contribution?: number;
}

// Price history snapshots — stored with short field names to keep the
// high-volume collection compact on free-tier MongoDB (see
// `lib/ev-price-history.ts`). One doc per (scryfall_id, date) but only
// inserted when the price actually changed vs the previous snapshot.
export interface EvCardPriceSnapshot {
  _id?: string;
  s: string;          // scryfall_id
  d: Date;            // snapshot date (used for TTL)
  e: number | null;   // price_eur
  f: number | null;   // price_eur_foil
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
  /**
   * Restrict this outcome's pool to cards from these Scryfall set codes.
   * Used for cross-set pools like Masterpieces (e.g. ["mp2"] for Amonkhet
   * Invocations while the rest of the booster pulls from "akh"). When
   * omitted, all in-scope cards match (no set restriction at the filter
   * level — callers pre-filter to the intended set).
   */
  set_codes?: string[];
  /**
   * Inclusive lower bound on collector_number (parsed as integer). Used to
   * segment Masterpiece sets that span multiple parent expansions — e.g.
   * mp2 collector numbers 31-54 are Hour of Devastation Invocations; 1-30
   * are Amonkhet. Cards with non-numeric collector_numbers fail the bound.
   */
  collector_number_min?: number;
  /** Inclusive upper bound on collector_number (parsed as integer). See collector_number_min. */
  collector_number_max?: number;
  booster?: boolean;
  mono_color?: boolean;
  colors?: string[];
  custom_pool?: string[];
}

export interface EvSlotOutcome {
  probability: number;
  filter: EvCardFilter;
  /**
   * Override the slot's is_foil flag for this specific outcome. Use when a
   * single slot can produce either a non-foil or a foil card (e.g. the 10th
   * common in pre-2024 draft boosters is a foil only 1/6 packs). When
   * omitted, the slot's is_foil applies.
   */
  is_foil?: boolean;
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
  /** From the effective config (saved or default fallback). UI surfaces these. */
  packs_per_box: number;
  cards_per_pack: number;
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
  uid: string;
  scryfall_id: string;
  name: string;
  set: string;
  collector_number: string;
  rarity: string;
  treatment: string;
  /** True when this contribution came from a foil slot/outcome. */
  is_foil: boolean;
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
  _id?: string;
  date: string;
  set_code?: string;                // one of set_code/product_slug is set per doc
  product_slug?: string;            // product path (new)
  play_ev_gross?: number | null;
  play_ev_net?: number | null;
  /** Per-pack net EV. Used by the EV-product calc for "opened booster" valuation. */
  play_pack_ev_net?: number | null;
  collector_ev_gross?: number | null;
  collector_ev_net?: number | null;
  collector_pack_ev_net?: number | null;
  ev_net_sealed?: number;           // products only
  ev_net_opened?: number;           // products only
  ev_net_cards_only?: number;       // products only
  card_count_total?: number;
  card_count_priced?: number;
  sift_floor?: number;
  fee_rate?: number;
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
  lead_card: string;  // first card in the theme's source list — the signature rare/mythic of the pack
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
  weights_source?: "default" | "empirical";
  weights_sample_size?: number;
}

export interface EvJumpstartWeights {
  _id?: string;
  set_code: string;
  tier_counts: { common: number; rare: number; mythic: number };
  theme_counts: Record<string, number>;   // key = "name|variant"
  sample_size: number;                    // total packs observed
  tier_weights: { common: number; rare: number; mythic: number };
  theme_weights: Record<string, number>;  // absolute probability per theme, sums to 1
  sessions: {
    date: string;
    packs: number;
    tier_counts: { common: number; rare: number; mythic: number };
    theme_counts: Record<string, number>;
  }[];
  updated_at: string;
}

export interface EvJumpstartSessionSubmit {
  tier_counts: { common: number; rare: number; mythic: number };
  theme_counts: Record<string, number>;
  packs: number;
}

// ── EV Products (fixed-pool products — PW decks, precons, etc.) ─────

export type EvProductType =
  | "planeswalker_deck"
  | "commander"
  | "starter"
  | "welcome"
  | "duel"
  | "challenger"
  | "other";

export type EvProductCardRole =
  | "foil_premium_pw"
  | "commander"
  | "key_card";

export interface EvProductCard {
  scryfall_id: string;
  name: string;
  set_code: string;
  count: number;
  is_foil: boolean;
  role?: EvProductCardRole;
}

export interface EvIncludedBooster {
  set_code: string;
  count: number;
  sealed_price_eur?: number;
}

export interface EvProduct {
  _id?: string;
  slug: string;
  name: string;
  product_type: EvProductType;
  release_year: number;
  parent_set_code?: string;
  cards: EvProductCard[];
  included_boosters?: EvIncludedBooster[];
  image_uri?: string;
  notes?: string;
  /**
   * When false/undefined (default behavior), basic lands (Plains, Island,
   * Swamp, Mountain, Forest, Wastes) are treated as €0 in the EV calc.
   * Set true to include their market price (rarely meaningful for precons).
   */
  count_basic_lands?: boolean;
  seeded_at: string;
}

export interface EvProductCardBreakdown extends EvProductCard {
  unit_price: number | null;
  line_total: number;
  /**
   * When set, this card's value was NOT added to `cards_subtotal_gross`.
   * The displayed unit_price / line_total still reflect the card's real
   * market value so the decklist shows the price; the totals just exclude
   * it. Use to render a "sifted" indicator in the UI.
   */
  excluded_reason?: "basic_land" | "below_sift_floor";
}

export interface EvProductBoosterBreakdown extends EvIncludedBooster {
  opened_unit_ev: number | null;
}

export interface EvProductResult {
  slug: string;
  name: string;
  product_type: EvProductType;
  card_count_total: number;
  unique_card_count: number;
  cards_subtotal_gross: number;
  boosters: {
    count_total: number;
    sealed: { available: boolean; gross: number; net: number };
    opened: { available: boolean; gross: number; net: number };
  } | null;
  totals: {
    sealed: { gross: number; net: number } | null;
    opened: { gross: number; net: number } | null;
    cards_only: { gross: number; net: number };
  };
  fee_rate: number;
  card_breakdown: EvProductCardBreakdown[];
  booster_breakdown: EvProductBoosterBreakdown[];
  missing_scryfall_ids: string[];
}
