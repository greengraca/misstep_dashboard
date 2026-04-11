import { describe, it, expect } from "vitest";
import fixture from "./fixtures/scryfall-cards-sample.json";
import { parseScryfallCardToDoc } from "../scryfall-bulk";

describe("parseScryfallCardToDoc", () => {
  it("maps a standard single-face card with prices", () => {
    const now = "2026-04-11T00:00:00.000Z";
    const doc = parseScryfallCardToDoc(fixture[0], now);

    expect(doc.scryfall_id).toBe("aaaaaaaa-0000-0000-0000-000000000001");
    expect(doc.name).toBe("Lightning Bolt");
    expect(doc.set).toBe("mh2");
    expect(doc.collector_number).toBe("134");
    expect(doc.rarity).toBe("uncommon");
    expect(doc.cmc).toBe(1);
    expect(doc.colors).toEqual(["R"]);
    expect(doc.color_identity).toEqual(["R"]);
    expect(doc.type_line).toBe("Instant");
    expect(doc.layout).toBe("normal");
    expect(doc.released_at).toBe("2021-09-24");
    expect(doc.price_eur).toBe(0.85);
    expect(doc.price_eur_foil).toBe(2.50);
    expect(doc.image_uri).toBe("https://example.com/bolt-small.jpg");
    expect(doc.cardmarket_id).toBe(123456);
    expect(doc.finishes).toEqual(["nonfoil", "foil"]);
    expect(doc.booster).toBe(true);
    expect(doc.treatment).toBe("normal");
    expect(doc.synced_at).toBe(now);
    expect(doc.prices_updated_at).toBe(now);
  });

  it("falls back to card_faces[0].image_uris for DFC cards", () => {
    const doc = parseScryfallCardToDoc(fixture[1], "2026-04-11T00:00:00.000Z");
    expect(doc.image_uri).toBe("https://example.com/delver-front.jpg");
    expect(doc.layout).toBe("transform");
  });

  it("handles missing prices as null", () => {
    const doc = parseScryfallCardToDoc(fixture[1], "2026-04-11T00:00:00.000Z");
    expect(doc.price_eur).toBeNull();
    expect(doc.price_eur_foil).toBeNull();
  });

  it("parses a token card", () => {
    const doc = parseScryfallCardToDoc(fixture[2], "2026-04-11T00:00:00.000Z");
    expect(doc.layout).toBe("token");
    expect(doc.set).toBe("tdmu");
    expect(doc.type_line).toContain("Token");
  });

  it("parses a colorless artifact with empty colors arrays", () => {
    const doc = parseScryfallCardToDoc(fixture[3], "2026-04-11T00:00:00.000Z");
    expect(doc.colors).toEqual([]);
    expect(doc.color_identity).toEqual([]);
    expect(doc.type_line).toBe("Artifact");
  });

  it("parses a basic land with color_identity but empty colors", () => {
    const doc = parseScryfallCardToDoc(fixture[4], "2026-04-11T00:00:00.000Z");
    expect(doc.colors).toEqual([]);
    expect(doc.color_identity).toEqual(["G"]);
    expect(doc.type_line).toContain("Basic Land");
  });

  it("defaults missing array fields to empty arrays", () => {
    const stripped = {
      ...fixture[0],
      frame_effects: undefined,
      promo_types: undefined,
      colors: undefined,
      color_identity: undefined,
      finishes: undefined,
    };
    const doc = parseScryfallCardToDoc(stripped, "2026-04-11T00:00:00.000Z");
    expect(doc.frame_effects).toEqual([]);
    expect(doc.promo_types).toEqual([]);
    expect(doc.colors).toEqual([]);
    expect(doc.color_identity).toEqual([]);
    expect(doc.finishes).toEqual([]);
  });

  it("defaults missing cmc to 0", () => {
    const stripped = { ...fixture[0], cmc: undefined };
    const doc = parseScryfallCardToDoc(stripped, "2026-04-11T00:00:00.000Z");
    expect(doc.cmc).toBe(0);
  });
});
