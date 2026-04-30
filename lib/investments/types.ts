import type { ObjectId } from "mongodb";

export type InvestmentStatus = "listing" | "closed" | "archived";
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

/**
 * Bought a heterogeneous bag of singles (an appraiser collection). Lots
 * are pre-populated at creation from the collection's cards — there's
 * no opening to do, so unlike box/product the lots exist on day one.
 */
export interface InvestmentSourceCollection {
  kind: "collection";
  appraiser_collection_id: string;
  card_count: number;            // sum(qty) of non-excluded cards at creation
}

/**
 * Bought a heterogeneous bag of singles in a single transaction (e.g. a
 * customer's whole binder). No per-card data — just total cost and an
 * estimate of how many cards are in the bag. Lots grow lazily from
 * MS-tag attribution as the user lists individual cards on Cardmarket
 * (same flow as `box`/`product`). Sealed flips are not allowed (no
 * sealed product to flip).
 */
export interface InvestmentSourceCustomerBulk {
  kind: "customer_bulk";
  /** User's estimate of the total card count in the bag. Used as
   *  `expected_open_card_count` while listing for display purposes only;
   *  at close, per-unit cost basis is computed from `sum(qty_opened)`
   *  across actual lots, not from this estimate. */
  estimated_card_count: number;
  /** Optional ISO date string — when the bag was acquired. */
  acquired_at?: string;
}

export type InvestmentSource =
  | InvestmentSourceBox
  | InvestmentSourceProduct
  | InvestmentSourceCollection
  | InvestmentSourceCustomerBulk;

export interface SealedFlip {
  recorded_at: Date;
  unit_count: number;
  proceeds_eur: number;
  note?: string;
}

export interface Investment {
  _id: ObjectId;
  name: string;
  /** Provenance code — short tag (`MS-XXXX`) the user pastes into a CM
   *  listing's comment field so the listing and its eventual sale
   *  attribute back to this investment. Always set at creation. */
  code: string;
  created_at: Date;
  created_by: string;            // session.user.id
  status: InvestmentStatus;
  cost_total_eur: number;
  cost_notes?: string;
  source: InvestmentSource;
  cm_set_names: string[];
  sealed_flips: SealedFlip[];
  expected_open_card_count: number;
  closed_at?: Date;
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
  code: string;
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
  code: string;
  status: InvestmentStatus;
  created_at: string;
  created_by: string;
  cost_total_eur: number;
  cost_notes?: string;
  source: InvestmentSource;
  cm_set_names: string[];
  sealed_flips: SealedFlip[];
  expected_open_card_count: number;
  closed_at?: string;
  kpis: {
    cost_eur: number;
    expected_ev_eur: number | null;
    listed_value_eur: number;
    realized_net_eur: number;
    net_pl_blended_eur: number;
    break_even_pct: number;   // 0..∞ (>1 = profit)
  };
  /** Tag-based listing audit — how many distinct stock listings carry
   *  this investment's code. Compared against the expected lot count to
   *  show "X tagged of Y". Both numbers may be undefined when stock has
   *  not yet been re-scraped post-conversion. */
  tag_audit?: {
    tagged_listings: number;
    expected_lots: number;
  };
}

export interface CreateInvestmentBody {
  name: string;
  cost_total_eur: number;
  cost_notes?: string;
  source: InvestmentSource;
}

export interface ConvertAppraiserToInvestmentBody {
  name?: string;
  cost_total_eur: number;
  cost_notes?: string;
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
