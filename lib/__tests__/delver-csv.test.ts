import { describe, it, expect } from "vitest";
import { parseDelverCsv, DelverCsvError } from "../appraiser/delver-csv";

const FILE1_SAMPLE = [
  "QuantityX\tName\tEdition\tFoil\t(Condition,Language)\tEdition (code)\tScryfall ID\tCardMarket ID",
  "1x\tAbrade\tDouble Masters\t\t(, )\t(2xm)\t24da9431-7e52-44f5-bc18-2f2d8a4ca81e\t486484",
  "3x\tBloom Tender\tEventide\tFoil\t(, Portuguese)\t(eve)\t5c7bb22c-55b0-43e1-b52c-8bb4e75daaf6\t12345",
].join("\n");

const FILE2_SAMPLE = [
  "QuantityX\tName\tEdition\tFoil\tPrice\t(Condition,Language)\tCardMarket ID\tScryfall ID",
  "1x\tArbor Elf\tWorldwake\t\t0,39 €\t(, )\t22189\t6d32a4ed-6b43-4473-91ec-08cd5414f2f0",
  "4x\tDark Ritual\tIce Age\t\t1,50 €\t(, Japanese)\t99999\tdeadbeef-0000-0000-0000-000000000000",
].join("\n");

describe("parseDelverCsv", () => {
  it("throws DelverCsvError on empty input", () => {
    expect(() => parseDelverCsv("")).toThrow(DelverCsvError);
    expect(() => parseDelverCsv("   \n  ")).toThrow(DelverCsvError);
  });

  it("throws DelverCsvError when Scryfall ID column is missing", () => {
    const moxfield =
      "Count,Tradelist Count,Name,Edition,Condition\n4,0,Lightning Bolt,mh2,Near Mint";
    expect(() => parseDelverCsv(moxfield)).toThrow(/Scryfall ID/);
  });

  it("parses file1 format (Edition (code), no Price)", () => {
    const cards = parseDelverCsv(FILE1_SAMPLE);
    expect(cards).toHaveLength(2);
    expect(cards[0]).toEqual({
      name: "Abrade",
      scryfallId: "24da9431-7e52-44f5-bc18-2f2d8a4ca81e",
      cardmarket_id: 486484,
      qty: 1,
      foil: false,
      language: "English",
    });
    expect(cards[1]).toEqual({
      name: "Bloom Tender",
      scryfallId: "5c7bb22c-55b0-43e1-b52c-8bb4e75daaf6",
      cardmarket_id: 12345,
      qty: 3,
      foil: true,
      language: "Portuguese",
    });
  });

  it("parses file2 format (Price column, swapped ID order)", () => {
    const cards = parseDelverCsv(FILE2_SAMPLE);
    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({
      name: "Arbor Elf",
      scryfallId: "6d32a4ed-6b43-4473-91ec-08cd5414f2f0",
      cardmarket_id: 22189,
      qty: 1,
      foil: false,
      language: "English",
    });
    expect(cards[1]).toMatchObject({
      scryfallId: "deadbeef-0000-0000-0000-000000000000",
      qty: 4,
      foil: false,
      language: "Japanese",
    });
  });

  it("treats missing/blank CardMarket ID as null", () => {
    const csv = [
      "QuantityX\tName\tEdition\tFoil\t(Condition,Language)\tEdition (code)\tScryfall ID\tCardMarket ID",
      "1x\tCard\tSet\t\t(, )\t(set)\tsome-uuid\t",
    ].join("\n");
    const cards = parseDelverCsv(csv);
    expect(cards[0].cardmarket_id).toBeNull();
  });

  it("skips rows with missing Scryfall ID but preserves others", () => {
    const csv = [
      "QuantityX\tName\tEdition\tFoil\t(Condition,Language)\tEdition (code)\tScryfall ID\tCardMarket ID",
      "1x\tGood\tA\t\t(, )\t(a)\tgood-uuid\t1",
      "1x\tBad\tB\t\t(, )\t(b)\t\t2",
    ].join("\n");
    const cards = parseDelverCsv(csv);
    expect(cards).toHaveLength(1);
    expect(cards[0].scryfallId).toBe("good-uuid");
  });

  it("throws when CSV has headers but no resolvable rows", () => {
    const csv = [
      "QuantityX\tName\tEdition\tFoil\t(Condition,Language)\tEdition (code)\tScryfall ID\tCardMarket ID",
      "1x\tBad\tB\t\t(, )\t(b)\t\t2",
    ].join("\n");
    expect(() => parseDelverCsv(csv)).toThrow(/No rows with Scryfall ID/);
  });

  it("parses NEW format with separate Condition and Language columns (empty values)", () => {
    const csv = [
      "QuantityX\tName\tEdition\tFoil\tPrice\tCardMarket ID\tCondition\tLanguage\tScryfall ID",
      "1x\tChamber Sentry\tGuilds of Ravnica\t\t0,26 €\t364310\t\t\t15dfd5f2-5298-4cf4-80fe-43db9be24f57",
    ].join("\n");
    const cards = parseDelverCsv(csv);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toEqual({
      name: "Chamber Sentry",
      scryfallId: "15dfd5f2-5298-4cf4-80fe-43db9be24f57",
      cardmarket_id: 364310,
      qty: 1,
      foil: false,
      language: "English",
    });
    expect(cards[0]).not.toHaveProperty("condition");
  });

  it("parses NEW format with populated Condition and Language", () => {
    const csv = [
      "QuantityX\tName\tEdition\tFoil\tPrice\tCardMarket ID\tCondition\tLanguage\tScryfall ID",
      "2x\tFoo\tSet\tFoil\t1,00 €\t12345\tHeavily Played\tPortuguese\tabc-uuid",
    ].join("\n");
    const cards = parseDelverCsv(csv);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toEqual({
      name: "Foo",
      scryfallId: "abc-uuid",
      cardmarket_id: 12345,
      qty: 2,
      foil: true,
      language: "Portuguese",
      condition: "Heavily Played",
    });
  });

  it("parses OLD combined-column format with populated Condition and Language", () => {
    const csv = [
      "QuantityX\tName\tEdition\tFoil\tPrice\t(Condition,Language)\tCardMarket ID\tScryfall ID",
      "1x\tBar\tSet\t\t0,50 €\t(NM, Japanese)\t999\tdef-uuid",
    ].join("\n");
    const cards = parseDelverCsv(csv);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      name: "Bar",
      qty: 1,
      foil: false,
      language: "Japanese",
      condition: "NM",
    });
  });
});
