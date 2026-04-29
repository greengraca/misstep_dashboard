import { describe, it, expect } from "vitest";
import {
  projectStockRow,
  projectCardMeta,
  projectSetMeta,
  cleanCardName,
  resolveSetCode,
} from "../storage-db";

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
      frame: "2015",
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
      frame: "1993",
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

describe("cleanCardName", () => {
  it("strips trailing parenthetical variant suffix", () => {
    expect(cleanCardName("Ornithopter of Paradise (V.1)")).toBe("Ornithopter of Paradise");
  });

  it("strips embedded parens between DFC halves (token color/PT info)", () => {
    expect(cleanCardName("Germ Token (B 0/0) // Stoneforged Blade Token"))
      .toBe("Germ Token // Stoneforged Blade Token");
    expect(cleanCardName("Demon Token (B */*) // Zombie Token"))
      .toBe("Demon Token // Zombie Token");
    expect(cleanCardName("Construct Token (A */*) // Treasure Token"))
      .toBe("Construct Token // Treasure Token");
  });

  it("strips a trailing parenthetical even when there's no DFC half", () => {
    expect(cleanCardName("Eldrazi Spawn Token (Colorless 0/1)")).toBe("Eldrazi Spawn Token");
  });

  it("converts single-slash DFC to double-slash", () => {
    expect(cleanCardName("Thaumatic Compass / Spires of Orazca"))
      .toBe("Thaumatic Compass // Spires of Orazca");
  });

  it("leaves an already-doubled separator alone", () => {
    expect(cleanCardName("Hanweir Battlements // Hanweir, the Writhing Township"))
      .toBe("Hanweir Battlements // Hanweir, the Writhing Township");
  });

  it("collapses multiple parens + extra whitespace to a single space", () => {
    expect(cleanCardName("Foo (a) (b) Bar")).toBe("Foo Bar");
  });

  it("preserves Art Series: prefix (handled later in fallback chain, not here)", () => {
    expect(cleanCardName("Art Series: Cloud, Ex-SOLDIER")).toBe("Art Series: Cloud, Ex-SOLDIER");
  });
});

describe("resolveSetCode", () => {
  // Build a realistic lookup map (lowercased name → set code, plus code → code).
  const lookup = new Map<string, string>();
  function add(code: string, name: string) {
    lookup.set(code.toLowerCase(), code);
    lookup.set(name.toLowerCase(), code);
  }
  add("dmu", "Dominaria United");
  add("c14", "Commander 2014");
  add("clb", "Commander Legends: Battle for Baldur's Gate");
  add("stx", "Strixhaven: School of Mages");
  add("cstx", "Strixhaven Commander");
  add("3ed", "Revised Edition");
  add("m19", "Core Set 2019");
  add("ikorianc", "Ikoria: Lair of Behemoths Commander");
  add("fdn", "Magic: The Gathering Foundations");

  it("direct code lookup passes through", () => {
    expect(resolveSetCode("dmu", lookup)).toBe("dmu");
  });

  it("direct name lookup", () => {
    expect(resolveSetCode("Dominaria United", lookup)).toBe("dmu");
  });

  it("alias map: 'Revised' → 3ed", () => {
    expect(resolveSetCode("Revised", lookup)).toBe("3ed");
  });

  it("alias map: 'Magic: The Gathering Foundations' → fdn", () => {
    expect(resolveSetCode("Magic: The Gathering Foundations", lookup)).toBe("fdn");
  });

  it("strips ': Extras' suffix", () => {
    expect(resolveSetCode("Dominaria United: Extras", lookup)).toBe("dmu");
  });

  it("strips ': Promos' suffix", () => {
    expect(resolveSetCode("Dominaria United: Promos", lookup)).toBe("dmu");
  });

  it("strips ': Tokens' suffix (NEW — was previously unmatched)", () => {
    expect(resolveSetCode("Dominaria United: Tokens", lookup)).toBe("dmu");
  });

  it("recurses through nested suffixes: 'Commander: X: Extras' (NEW)", () => {
    expect(resolveSetCode("Commander: Strixhaven: Extras", lookup)).toBe("cstx");
  });

  it("'Core N' → 'Core Set N'", () => {
    expect(resolveSetCode("Core 2019", lookup)).toBe("m19");
  });

  it("'Commander: X' → 'X Commander'", () => {
    expect(resolveSetCode("Commander: Ikoria: Lair of Behemoths", lookup)).toBe("ikorianc");
  });

  it("returns null when nothing matches", () => {
    expect(resolveSetCode("Made-Up Set That Does Not Exist", lookup)).toBeNull();
  });
});
