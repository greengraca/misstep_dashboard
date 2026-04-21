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
  baseline_visited_cardmarket_ids?: number[];
}

export interface InvestmentBaseline {
  _id: ObjectId;
  investment_id: ObjectId;
  cardmarket_id: number;
  foil: boolean;
  condition: string;
  language: string;
  qty_baseline: number;
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
    captured_cardmarket_ids: number;
    target_cardmarket_ids: number;
  };
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
    cardmarket_id: number;
    foil: boolean;
    condition: string;
    language: string;
    qty: number;
  }>;
  // cardmarket_ids the extension visited (even if empty) — so dashboard can
  // mark them captured even when no listings exist on that page.
  visited_cardmarket_ids: number[];
}

export interface BaselineTargetsResponse {
  cardmarket_ids: number[];
  cm_set_names: string[];
  captured_cardmarket_ids: number[];   // for resume / progress
}
