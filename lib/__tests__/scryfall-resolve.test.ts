import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolveScryfall } from "../appraiser/scryfall-resolve";

const mockCard = {
  id: "abc-123",
  name: "Lightning Bolt",
  set: "mh2",
  set_name: "Modern Horizons 2",
  collector_number: "134",
  cardmarket_id: 555123,
  purchase_uris: { cardmarket: "https://www.cardmarket.com/en/Magic/Products/Singles/Modern-Horizons-2/Lightning-Bolt?idProduct=555123" },
  image_uris: { normal: "https://scry.example/bolt.jpg" },
  prices: { eur: "0.85", eur_foil: "2.50" },
};

const mockPrintings = {
  data: [
    { ...mockCard, id: "abc-123" },
    {
      id: "def-456", name: "Lightning Bolt", set: "fdn", set_name: "Foundations",
      collector_number: "280", cardmarket_id: 900001,
      purchase_uris: { cardmarket: "https://cm.example/fdn-bolt" },
      image_uris: { normal: "https://scry.example/fdn.jpg" },
      prices: { eur: "0.65", eur_foil: null },
    },
  ],
};

function mockFetch(sequence: Array<{ ok: boolean; status?: number; body?: unknown }>) {
  let i = 0;
  return vi.fn(async () => {
    const r = sequence[i++];
    return {
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 404),
      json: async () => r.body,
    } as Response;
  });
}

describe("resolveScryfall", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it("resolves a single printing by fuzzy name", async () => {
    const fetchMock = mockFetch([
      { ok: true, body: mockCard },
      { ok: true, body: mockPrintings },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const promise = resolveScryfall({ name: "Lightning Bolt" });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.name).toBe("Lightning Bolt");
    expect(result.set).toBe("mh2");
    expect(result.cardmarketId).toBe(555123);
    expect(result.trendPrice).toBe(0.85);
    expect(result.cardmarketUrl).toContain("idProduct=555123");
    expect(result.printings).toHaveLength(2);
  });

  it("picks the requested set when multiple printings exist", async () => {
    const fetchMock = mockFetch([
      { ok: true, body: mockCard },
      { ok: true, body: mockPrintings },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const promise = resolveScryfall({ name: "Lightning Bolt", set: "fdn" });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.set).toBe("fdn");
    expect(result.cardmarketId).toBe(900001);
    expect(result.trendPrice).toBe(0.65);
  });

  it("returns eur_foil when foil=true", async () => {
    const fetchMock = mockFetch([
      { ok: true, body: mockCard },
      { ok: true, body: mockPrintings },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const promise = resolveScryfall({ name: "Lightning Bolt", foil: true });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.trendPrice).toBe(2.50);
    expect(result.foilOnly).toBe(false);
  });

  it("flags foilOnly when non-foil price is missing but foil exists", async () => {
    const foilOnlyCard = { ...mockCard, prices: { eur: null, eur_foil: "3.00" } };
    const foilOnlyPrintings = { data: [foilOnlyCard] };
    const fetchMock = mockFetch([
      { ok: true, body: foilOnlyCard },
      { ok: true, body: foilOnlyPrintings },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const promise = resolveScryfall({ name: "Lightning Bolt" });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.trendPrice).toBe(3.00);
    expect(result.foilOnly).toBe(true);
  });

  it("throws when Scryfall returns 404", async () => {
    const fetchMock = mockFetch([{ ok: false, status: 404 }]);
    vi.stubGlobal("fetch", fetchMock);

    const promise = resolveScryfall({ name: "Jace Nonexistent" });
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toThrow(/not found/i);
  });

  it("fast-path: direct set + CN lookup when both provided", async () => {
    const fetchMock = mockFetch([
      { ok: true, body: mockCard },            // direct /cards/mh2/134
      { ok: true, body: mockPrintings },       // prints search
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const promise = resolveScryfall({ name: "Lightning Bolt", set: "mh2", collectorNumber: "134" });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(fetchMock.mock.calls[0][0]).toContain("/cards/mh2/134");
    expect(result.set).toBe("mh2");
  });
});
