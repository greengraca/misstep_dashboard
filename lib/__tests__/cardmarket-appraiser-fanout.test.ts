// lib/__tests__/cardmarket-appraiser-fanout.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";

// Minimal in-memory mock for MongoDB calls used by processCardPrices.
type Doc = Record<string, unknown>;

interface MockCollection {
  docs: Doc[];
  updateOne: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
}

function makeCollection(docs: Doc[]): MockCollection {
  return {
    docs,
    updateOne: vi.fn(async (filter: Doc, update: { $set: Doc }) => {
      let matched = 0;
      for (const d of docs) {
        if (Object.entries(filter).every(([k, v]) => d[k] === v)) {
          Object.assign(d, update.$set);
          matched++;
          break;
        }
      }
      return { matchedCount: matched, modifiedCount: matched };
    }),
    updateMany: vi.fn(async (filter: Doc, update: { $set: Doc }) => {
      let matched = 0;
      for (const d of docs) {
        if (Object.entries(filter).every(([k, v]) => d[k] === v)) {
          Object.assign(d, update.$set);
          matched++;
        }
      }
      return { matchedCount: matched, modifiedCount: matched };
    }),
  };
}

const evCards = makeCollection([
  { cardmarket_id: 555123, name: "Lightning Bolt" },
]);
const appraiserCards = makeCollection([
  { cardmarket_id: 555123, foil: false, name: "Lightning Bolt", fromPrice: null, trendPrice: 0.65 },
  { cardmarket_id: 555123, foil: false, name: "Lightning Bolt", fromPrice: null, trendPrice: 0.65 }, // second collection
  { cardmarket_id: 555123, foil: true, name: "Lightning Bolt", fromPrice: null, trendPrice: 2.00 }, // foil variant not targeted
]);

// Permissive no-op collection for anything processSync touches that isn't
// under test (index creation on many collections + sync_log insert at the
// end of processSync). Keeps the test scoped to the fan-out behaviour.
const noopCollection = {
  createIndex: vi.fn(async () => undefined),
  insertOne: vi.fn(async () => ({ insertedId: "noop" })),
  updateOne: vi.fn(async () => ({ matchedCount: 0, modifiedCount: 0 })),
  updateMany: vi.fn(async () => ({ matchedCount: 0, modifiedCount: 0 })),
  find: vi.fn(() => ({
    sort: () => ({ limit: () => ({ toArray: async () => [] }) }),
  })),
  deleteOne: vi.fn(async () => ({ deletedCount: 0 })),
  deleteMany: vi.fn(async () => ({ deletedCount: 0 })),
};

vi.mock("../mongodb", () => ({
  getDb: async () => ({
    collection: (name: string) => {
      if (name === "dashboard_ev_cards") return evCards;
      if (name === "dashboard_appraiser_cards") return appraiserCards;
      return noopCollection;
    },
  }),
}));

import { processSync } from "../cardmarket";

describe("processCardPrices — appraiser fan-out", () => {
  beforeEach(() => {
    evCards.updateOne.mockClear();
    appraiserCards.updateMany.mockClear();
  });

  it("updates ev_cards AND fans out to appraiser cards with matching cardmarket_id + foil", async () => {
    await processSync("tester", [
      {
        type: "card_prices",
        data: {
          productId: 555123,
          cardName: "Lightning Bolt",
          isFoil: false,
          prices: { from: 0.50, trend: 0.70, avg30d: 0.65, avg7d: 0.68, avg1d: 0.71 },
          available: 1200,
          chart: null,
          pageUrl: "https://cardmarket.example/bolt",
        },
      },
    ]);

    expect(evCards.updateOne).toHaveBeenCalledOnce();

    expect(appraiserCards.updateMany).toHaveBeenCalledOnce();
    const [filter, update] = appraiserCards.updateMany.mock.calls[0];
    expect(filter).toEqual({ cardmarket_id: 555123, foil: false });
    const set = (update as { $set: Doc }).$set;
    expect(set.fromPrice).toBe(0.50);
    expect(set.trendPrice).toBe(0.70);
    expect(set.status).toBe("priced");
    expect(set.cm_prices).toMatchObject({
      from: 0.50, trend: 0.70, avg30d: 0.65, avg7d: 0.68, avg1d: 0.71, available: 1200,
    });

    // Only the two non-foil docs should have been touched
    expect(appraiserCards.docs[0].fromPrice).toBe(0.50);
    expect(appraiserCards.docs[1].fromPrice).toBe(0.50);
    expect(appraiserCards.docs[2].fromPrice).toBe(null);
  });

  it("fan-out on isFoil=true touches only foil appraiser docs", async () => {
    // Reset fromPrice so the prior test's writes don't contaminate this one
    appraiserCards.docs[0].fromPrice = null;
    appraiserCards.docs[1].fromPrice = null;
    appraiserCards.docs[2].fromPrice = null;

    await processSync("tester", [
      {
        type: "card_prices",
        data: {
          productId: 555123,
          cardName: "Lightning Bolt",
          isFoil: true,
          prices: { from: 1.80, trend: 2.20 },
          available: 30,
          chart: null,
          pageUrl: "https://cardmarket.example/bolt?isFoil=Y",
        },
      },
    ]);

    expect(appraiserCards.updateMany).toHaveBeenCalledOnce();
    const [filter] = appraiserCards.updateMany.mock.calls[0];
    expect(filter).toEqual({ cardmarket_id: 555123, foil: true });

    // Only the foil doc (index 2) should have been updated
    expect(appraiserCards.docs[0].fromPrice).toBe(null);
    expect(appraiserCards.docs[1].fromPrice).toBe(null);
    expect(appraiserCards.docs[2].fromPrice).toBe(1.80);
  });

  it("skips both ev_cards and appraiser writes when no useful prices parsed", async () => {
    await processSync("tester", [
      {
        type: "card_prices",
        data: {
          productId: 555123,
          cardName: "Lightning Bolt",
          isFoil: false,
          prices: {}, // no from/trend/avg*
          available: null,
          chart: null,
          pageUrl: "https://cardmarket.example/bolt",
        },
      },
    ]);

    // Early-return in processCardPrices prevents both writes when no
    // parseable prices made it into the snapshot.
    expect(evCards.updateOne).not.toHaveBeenCalled();
    expect(appraiserCards.updateMany).not.toHaveBeenCalled();
  });
});
