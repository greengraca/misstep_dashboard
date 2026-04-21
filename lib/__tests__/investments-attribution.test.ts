import { describe, it, expect, vi, beforeEach } from "vitest";
import { ObjectId } from "mongodb";
import { maybeGrowLot } from "../investments/attribution";

type Doc = Record<string, unknown>;

function col(docs: Doc[]) {
  return {
    docs,
    find: (filter: Doc) => {
      const rows = docs.filter((d) => matches(d, filter));
      return {
        sort: () => ({
          toArray: async () => rows,
        }),
        project: () => ({ toArray: async () => rows }),
        toArray: async () => rows,
      };
    },
    findOne: async (filter: Doc) => docs.find((d) => matches(d, filter)) ?? null,
    aggregate: () => ({
      next: async () => null,
      toArray: async () => [],
    }),
    updateOne: vi.fn(
      async (
        filter: Doc,
        update: { $inc?: Doc; $set?: Doc; $setOnInsert?: Doc },
        opts?: { upsert?: boolean }
      ) => {
        const existing = docs.find((d) => matches(d, filter));
        if (existing) {
          if (update.$inc)
            for (const [k, v] of Object.entries(update.$inc))
              existing[k] = ((existing[k] as number) ?? 0) + (v as number);
          if (update.$set) Object.assign(existing, update.$set);
          return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
        }
        if (opts?.upsert) {
          const newDoc: Doc = {
            ...filter,
            ...(update.$setOnInsert ?? {}),
            ...(update.$set ?? {}),
          };
          if (update.$inc)
            for (const [k, v] of Object.entries(update.$inc)) newDoc[k] = v as number;
          docs.push(newDoc);
          return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
        }
        return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
      }
    ),
  };
}

function getByPath(doc: Doc, path: string): unknown {
  if (!path.includes(".")) return doc[path];
  const parts = path.split(".");
  let cur: unknown = doc;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function matches(doc: Doc, filter: Doc): boolean {
  for (const [k, v] of Object.entries(filter)) {
    if (k === "$or" && Array.isArray(v)) {
      if (!v.some((sub) => matches(doc, sub as Doc))) return false;
      continue;
    }
    const docVal = getByPath(doc, k);
    // ObjectId equality
    if (v instanceof ObjectId && docVal instanceof ObjectId) {
      if (!docVal.equals(v)) return false;
      continue;
    }
    // Operator object (e.g. { $in: [...] })
    if (
      v !== null &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      !(v instanceof ObjectId) &&
      !(v instanceof Date)
    ) {
      const op = v as Record<string, unknown>;
      if ("$in" in op) {
        const arr = op.$in as unknown[];
        if (!arr.includes(docVal)) return false;
        continue;
      }
    }
    // Array "contains" match (e.g. cm_set_names: "Foundations: Jumpstart")
    if (Array.isArray(docVal) && !Array.isArray(v)) {
      if (!docVal.includes(v)) return false;
      continue;
    }
    if (docVal !== v) return false;
  }
  return true;
}

type Collections = {
  investments: Doc[];
  baseline: Doc[];
  lots: Doc[];
  stock: Doc[];
  ev_cards: Doc[];
  ev_products: Doc[];
};

function makeDb(state: Collections) {
  const stockCol = col(state.stock);
  const lotsCol = col(state.lots);
  const baselineCol = col(state.baseline);
  const lookup: Record<string, ReturnType<typeof col>> = {
    dashboard_investments: col(state.investments),
    dashboard_investment_baseline: {
      ...baselineCol,
      // Baseline v2: multiple rows can share the same tuple (different
      // article_ids / price buckets). maybeGrowLot aggregates qty_baseline
      // across them. Mock handler mirrors production: match on the
      // pipeline's $match stage, then sum the qty_baseline field.
      aggregate: (pipeline: Record<string, unknown>[]) => ({
        next: async () => {
          const matchStage = pipeline.find((s) => "$match" in s);
          const filter = (matchStage?.$match as Doc | undefined) ?? {};
          const filtered = state.baseline.filter((b) => matches(b, filter));
          if (filtered.length === 0) return null;
          const total = filtered.reduce(
            (s, b) => s + ((b.qty_baseline as number) ?? 0),
            0
          );
          return { total };
        },
        toArray: async () => [],
      }),
    } as ReturnType<typeof col>,
    dashboard_investment_lots: {
      ...lotsCol,
      aggregate: (pipeline: Record<string, unknown>[]) => ({
        next: async () => {
          // Extract investment_id filter from pipeline's $match stage.
          const matchStage = pipeline.find((s) => "$match" in s);
          const invIdFilter = (matchStage?.$match as Doc | undefined)?.investment_id;
          const filtered = state.lots.filter(
            (l) =>
              !invIdFilter ||
              (l.investment_id as ObjectId).equals(invIdFilter as ObjectId)
          );
          const total = filtered.reduce(
            (s, l) => s + ((l.qty_opened as number) ?? 0),
            0
          );
          return total > 0 ? { total } : null;
        },
        toArray: async () => [],
      }),
    } as ReturnType<typeof col>,
    dashboard_cm_stock: {
      ...stockCol,
      aggregate: () => ({
        next: async () => {
          // Sum qty of all stock rows (test cases use a single matching row).
          const total = state.stock
            .filter((d) => d.productId != null)
            .reduce((s, d) => s + (d.qty as number), 0);
          return total > 0 ? { total } : null;
        },
        toArray: async () => [],
      }),
    } as ReturnType<typeof col>,
    dashboard_ev_cards: col(state.ev_cards),
    dashboard_ev_products: col(state.ev_products),
  };
  return { collection: (name: string) => lookup[name] ?? col([]) };
}

describe("maybeGrowLot (box-kind)", () => {
  let state: Collections;
  const invAId = new ObjectId();
  const invBId = new ObjectId();

  beforeEach(() => {
    state = {
      investments: [
        {
          _id: invAId,
          status: "listing",
          source: {
            kind: "box",
            set_code: "fdn",
            booster_type: "jumpstart",
            packs_per_box: 24,
            cards_per_pack: 20,
            box_count: 1,
          },
          cm_set_names: ["Foundations: Jumpstart"],
          expected_open_card_count: 480,
          sealed_flips: [],
          created_at: new Date("2026-01-01"),
        },
        {
          _id: invBId,
          status: "listing",
          source: {
            kind: "box",
            set_code: "fdn",
            booster_type: "jumpstart",
            packs_per_box: 24,
            cards_per_pack: 20,
            box_count: 1,
          },
          cm_set_names: ["Foundations: Jumpstart"],
          expected_open_card_count: 480,
          sealed_flips: [],
          created_at: new Date("2026-02-01"),
        },
      ],
      baseline: [],
      lots: [],
      stock: [
        {
          productId: 555123,
          foil: false,
          condition: "NM",
          language: "English",
          qty: 4,
        },
      ],
      ev_cards: [],
      ev_products: [],
    };
  });

  it("grows the oldest investment's lot first (FIFO)", async () => {
    const db = makeDb(state) as never;
    await maybeGrowLot({
      db,
      cardmarketId: 555123,
      foil: false,
      condition: "NM",
      language: "English",
      qtyDelta: 4,
      cardSetCode: "fdn",
    });
    expect(state.lots.length).toBe(1);
    expect(state.lots[0].investment_id).toEqual(invAId);
    expect(state.lots[0].qty_opened).toBe(4);
  });

  it("skips an investment whose budget is exhausted", async () => {
    state.lots.push({
      investment_id: invAId,
      cardmarket_id: 777,
      foil: false,
      condition: "NM",
      language: "English",
      qty_opened: 480,
      qty_sold: 0,
      qty_remaining: 480,
      proceeds_eur: 0,
      cost_basis_per_unit: null,
      last_grown_at: new Date(),
    });
    const db = makeDb(state) as never;
    await maybeGrowLot({
      db,
      cardmarketId: 555123,
      foil: false,
      condition: "NM",
      language: "English",
      qtyDelta: 4,
      cardSetCode: "fdn",
    });
    const grown = state.lots.find((l) => l.cardmarket_id === 555123);
    expect(grown?.investment_id).toEqual(invBId);
    expect(grown?.qty_opened).toBe(4);
  });

  it("respects baseline offset (only delta attributed)", async () => {
    state.baseline.push({
      investment_id: invAId,
      cardmarket_id: 555123,
      foil: false,
      condition: "NM",
      language: "English",
      qty_baseline: 3,
    });
    // stock is 4, baseline was 3 — only 1 should be attributable
    const db = makeDb(state) as never;
    await maybeGrowLot({
      db,
      cardmarketId: 555123,
      foil: false,
      condition: "NM",
      language: "English",
      qtyDelta: 4,
      cardSetCode: "fdn",
    });
    const grown = state.lots.find(
      (l) => l.investment_id === invAId && l.cardmarket_id === 555123
    );
    expect(grown?.qty_opened).toBe(1);
  });

  it("splits delta across two investments when A's remaining budget is smaller than delta (FIFO overflow)", async () => {
    // Pre-seed A with an unrelated lot so A's budget remaining is exactly 3
    // (expected_open_card_count=480, qty_opened so far=477 → 3 left).
    state.lots.push({
      investment_id: invAId,
      cardmarket_id: 777,
      foil: false,
      condition: "NM",
      language: "English",
      qty_opened: 477,
      qty_sold: 0,
      qty_remaining: 477,
      proceeds_eur: 0,
      cost_basis_per_unit: null,
      last_grown_at: new Date(),
    });
    // Stock for the card we're attributing is 10.
    state.stock = [
      {
        productId: 555123,
        foil: false,
        condition: "NM",
        language: "English",
        qty: 10,
      },
    ];
    const db = makeDb(state) as never;
    await maybeGrowLot({
      db,
      cardmarketId: 555123,
      foil: false,
      condition: "NM",
      language: "English",
      qtyDelta: 10,
      cardSetCode: "fdn",
    });
    const lotA = state.lots.find(
      (l) =>
        (l.investment_id as ObjectId).equals(invAId) &&
        l.cardmarket_id === 555123
    );
    const lotB = state.lots.find(
      (l) =>
        (l.investment_id as ObjectId).equals(invBId) &&
        l.cardmarket_id === 555123
    );
    expect(lotA?.qty_opened).toBe(3);
    expect(lotB?.qty_opened).toBe(7);
  });
});

describe("maybeGrowLot (product-kind)", () => {
  it("attributes to a product-kind investment via scryfall→cardmarket resolution", async () => {
    const productInvId = new ObjectId();
    const state: Collections = {
      investments: [
        {
          _id: productInvId,
          status: "listing",
          source: { kind: "product", product_slug: "prod-1", unit_count: 1 },
          cm_set_names: [],
          expected_open_card_count: 1,
          sealed_flips: [],
          created_at: new Date("2026-03-01"),
        },
      ],
      baseline: [],
      lots: [],
      stock: [
        {
          productId: 888,
          foil: false,
          condition: "NM",
          language: "English",
          qty: 1,
        },
      ],
      ev_cards: [{ scryfall_id: "scry-a", cardmarket_id: 888 }],
      ev_products: [
        {
          _id: new ObjectId(),
          slug: "prod-1",
          cards: [
            {
              scryfall_id: "scry-a",
              count: 1,
              is_foil: false,
              name: "Test Card",
              set_code: "xyz",
            },
          ],
        },
      ],
    };
    const db = makeDb(state) as never;
    await maybeGrowLot({
      db,
      cardmarketId: 888,
      foil: false,
      condition: "NM",
      language: "English",
      qtyDelta: 1,
      cardSetCode: "xyz",
    });
    expect(state.lots.length).toBe(1);
    expect((state.lots[0].investment_id as ObjectId).equals(productInvId)).toBe(true);
    expect(state.lots[0].qty_opened).toBe(1);
  });
});
