import type { ObjectId } from "mongodb";

export type InvestmentStatus = "baseline_captured" | "listing" | "closed" | "archived";
export type BoosterType = "play" | "collector" | "jumpstart" | "set";

export interface InvestmentSourceBox {
  kind: "box";
  set_code: string;              // Scryfall set code
  booster_type: BoosterType;
  packs_per_box: number;
  cards_per_pack: number;
  box_count: number;
}

export interface InvestmentSourceProduct {
  kind: "product";
  product_slug: string;          // FK to dashboard_ev_products.slug
  unit_count: number;
}

export type InvestmentSource = InvestmentSourceBox | InvestmentSourceProduct;

export interface SealedFlip {
  recorded_at: Date;
  unit_count: number;
  proceeds_eur: number;
  note?: string;
}

export interface Investment {
  _id: ObjectId;
  name: string;
  created_at: Date;
  created_by: string;            // session.user.id
  status: InvestmentStatus;
  cost_total_eur: number;
  cost_notes?: string;
  source: InvestmentSource;
  cm_set_names: string[];
  sealed_flips: SealedFlip[];
  expected_open_card_count: number;
  baseline_completed_at?: Date;
  closed_at?: Date;
  /** Legacy — baseline v1 walker's visited-product-page tracking. Kept for
   *  backward compat; baseline v2 doesn't use it. */
  baseline_visited_cardmarket_ids?: number[];
  /** Total row-count advertised by Cardmarket's `.bracketed` badge on the
   *  expansion-scoped stock page at the time of the last baseline batch.
   *  Baseline is "complete" when the row count stored equals this. Updated
   *  on every baseline batch so it tracks the most recent walk filter. */
  baseline_total_expected?: number | null;
}

export interface InvestmentBaseline {
  _id: ObjectId;
  investment_id: ObjectId;
  /** Cardmarket article id — unique per stock row within a seller. Key of
   *  the baseline record in v2 (instead of the {cardmarket_id, foil, ...}
   *  tuple used in v1). Allows multiple rows per tuple when the seller has
   *  the same card at different prices. */
  article_id: string;
  cardmarket_id: number;
  foil: boolean;
  condition: string;
  language: string;
  qty_baseline: number;
  /** Listed price per card at baseline capture time. Used to compute
   *  "total listings value at baseline" on the investment detail page. */
  price_eur: number;
  captured_at: Date;
}

export interface InvestmentLot {
  _id: ObjectId;
  investment_id: ObjectId;
  cardmarket_id: number;
  foil: boolean;
  condition: string;
  language: string;
  qty_opened: number;
  qty_sold: number;
  qty_remaining: number;
  cost_basis_per_unit: number | null;  // null while listing, set at close
  proceeds_eur: number;
  last_grown_at: Date;
  frozen_at?: Date;
}

export interface InvestmentSaleLog {
  _id: ObjectId;
  lot_id: ObjectId;
  investment_id: ObjectId;
  order_id: string;
  article_id?: string;
  cardmarket_id: number;
  foil: boolean;
  condition: string;
  language: string;
  qty: number;
  unit_price_eur: number;
  net_per_unit_eur: number;
  attributed_at: Date;
}

// DTOs used by API routes

export interface InvestmentListItem {
  id: string;
  name: string;
  status: InvestmentStatus;
  created_at: string;
  source: InvestmentSource;
  cost_total_eur: number;
  listed_value_eur: number;
  realized_eur: number;
  sealed_flips_total_eur: number;
}

export interface InvestmentDetail {
  id: string;
  name: string;
  status: InvestmentStatus;
  created_at: string;
  created_by: string;
  cost_total_eur: number;
  cost_notes?: string;
  source: InvestmentSource;
  cm_set_names: string[];
  sealed_flips: SealedFlip[];
  expected_open_card_count: number;
  baseline_completed_at?: string;
  closed_at?: string;
  kpis: {
    cost_eur: number;
    expected_ev_eur: number | null;
    listed_value_eur: number;
    realized_net_eur: number;
    net_pl_blended_eur: number;
    break_even_pct: number;   // 0..∞ (>1 = profit)
  };
  baseline_progress?: {
    captured_count: number;
    expected_total_count: number | null;
    complete: boolean;
  };
  /** Aggregate of all baseline rows for this investment — shown on the
   *  detail page so the user can see "at baseline time I had N cards
   *  listed worth €X". Undefined when there are no baseline rows. */
  baseline_totals?: BaselineTotals;
}

export interface CreateInvestmentBody {
  name: string;
  cost_total_eur: number;
  cost_notes?: string;
  source: InvestmentSource;
}

export interface UpdateInvestmentBody {
  name?: string;
  cost_total_eur?: number;
  cost_notes?: string;
  cm_set_names?: string[];
}

export interface SealedFlipBody {
  unit_count: number;
  proceeds_eur: number;
  note?: string;
}

export interface BaselineBatchBody {
  listings: Array<{
    /** Cardmarket article id — required. Unique baseline key. */
    article_id: string;
    cardmarket_id: number;
    foil: boolean;
    condition: string;
    language: string;
    qty: number;
    price_eur: number;
  }>;
  /** Total row-count advertised by Cardmarket's `.bracketed` badge on the
   *  current expansion-scoped stock page view. Used for progress; updated
   *  on the investment doc each time a batch is received. */
  total_expected?: number;
  /** Optional — URL query string the extension is currently on (e.g.
   *  "maxPrice=1"). Stored in the sync_log for debugging; not persisted
   *  on the investment. */
  filter_hash?: string;
}

export interface BaselineTargetsResponse {
  /** Cardmarket's numeric expansion id, if we've captured it yet via the
   *  opportunistic mapping on product pages. null → popup falls back to
   *  the paste-URL input. */
  cm_expansion_id: number | null;
  cm_set_names: string[];
  /** Number of distinct article_ids captured in the baseline collection. */
  captured_count: number;
  /** Most recent CM page-header total for this investment's walk. null
   *  until the first batch carries total_expected. */
  expected_total_count: number | null;
  complete: boolean;
}

export interface BaselineTotals {
  total_cards: number;
  total_value_eur: number;
}
