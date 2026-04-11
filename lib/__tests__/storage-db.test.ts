import { describe, it, expect } from "vitest";
import { projectStockRow, projectCardMeta, projectSetMeta } from "../storage-db";

describe("projectStockRow", () => {
  it("reduces a CmStockListing to (name, set, qty)", () => {
    const cm = {
      _id: "abc",
      name: "Sol Ring",
      set: "cmr",
      qty: 3,
      price: 1.5,
      condition: "NM",
      language: "English",
      foil: false,
      dedupKey: "Sol Ring|3|1.5|NM|false|cmr",
      source: "stock_page" as const,
    };
    expect(projectStockRow(cm)).toEqual({ name: "Sol Ring", set: "cmr", qty: 3 });
  });
});

describe("projectCardMeta", () => {
  it("reduces an EvCard to the sort-critical fields", () => {
    const ev = {
      _id: "abc",
      scryfall_id: "x",
      set: "dmu",
      name: "Liliana",
      collector_number: "97",
      rarity: "mythic",
      price_eur: null,
      price_eur_foil: null,
      finishes: ["nonfoil"],
      booster: true,
      image_uri: "https://example.com/x.jpg",
      cardmarket_id: null,
      type_line: "Legendary Planeswalker — Liliana",
      frame_effects: [],
      promo_types: [],
      border_color: "black",
      treatment: "normal",
      prices_updated_at: "2026-04-11T00:00:00Z",
      synced_at: "2026-04-11T00:00:00Z",
      colors: ["B"],
      color_identity: ["B"],
      cmc: 3,
      released_at: "2022-09-09",
      layout: "normal",
    };
    expect(projectCardMeta(ev)).toEqual({
      name: "Liliana",
      set: "dmu",
      collector_number: "97",
      rarity: "mythic",
      type_line: "Legendary Planeswalker — Liliana",
      colors: ["B"],
      color_identity: ["B"],
      cmc: 3,
      layout: "normal",
      image_uri: "https://example.com/x.jpg",
      released_at: "2022-09-09",
    });
  });

  it("defaults missing optional fields safely", () => {
    const ev = {
      _id: "abc",
      scryfall_id: "x",
      set: "old",
      name: "Ancient",
      collector_number: "1",
      rarity: "common",
      price_eur: null,
      price_eur_foil: null,
      finishes: [],
      booster: false,
      image_uri: null,
      cardmarket_id: null,
      type_line: "Creature",
      frame_effects: [],
      promo_types: [],
      border_color: "black",
      treatment: "normal",
      prices_updated_at: "2026-04-11T00:00:00Z",
      synced_at: "2026-04-11T00:00:00Z",
      colors: [],
      color_identity: [],
      cmc: 0,
      released_at: "1993-08-05",
      layout: "normal",
    };
    expect(projectCardMeta(ev).image_uri).toBeNull();
    expect(projectCardMeta(ev).color_identity).toEqual([]);
  });
});

describe("projectSetMeta", () => {
  it("reduces an EvSet to (code, name, released_at, set_type, parent_set_code)", () => {
    const ev = {
      _id: "abc",
      code: "dmu",
      name: "Dominaria United",
      released_at: "2022-09-09",
      card_count: 281,
      icon_svg_uri: "https://example.com/dmu.svg",
      set_type: "expansion",
      scryfall_id: "ss",
      parent_set_code: null,
      synced_at: "2026-04-11T00:00:00Z",
    };
    expect(projectSetMeta(ev)).toEqual({
      code: "dmu",
      name: "Dominaria United",
      released_at: "2022-09-09",
      set_type: "expansion",
      parent_set_code: null,
    });
  });

  it("preserves parent_set_code when present (token sets)", () => {
    const ev = {
      _id: "abc",
      code: "tdmu",
      name: "Dominaria United Tokens",
      released_at: "2022-09-09",
      card_count: 12,
      icon_svg_uri: "https://example.com/tdmu.svg",
      set_type: "token",
      scryfall_id: "ss",
      parent_set_code: "dmu",
      synced_at: "2026-04-11T00:00:00Z",
    };
    expect(projectSetMeta(ev).parent_set_code).toBe("dmu");
  });
});
