import { describe, it, expect } from "vitest";
import { parseDelverCsv, DelverCsvError } from "../appraiser/delver-csv";

describe("parseDelverCsv", () => {
  it("throws DelverCsvError on empty input", () => {
    expect(() => parseDelverCsv("")).toThrow(DelverCsvError);
    expect(() => parseDelverCsv("   \n  ")).toThrow(DelverCsvError);
  });

  it("throws DelverCsvError with 'sample' hint when format is unknown", () => {
    const fakeCsv = "unknown,columns,here\n1,2,3";
    expect(() => parseDelverCsv(fakeCsv)).toThrow(/sample/i);
  });

  it("throws DelverCsvError when headers look like a different app (Moxfield)", () => {
    const moxfield = "Count,Tradelist Count,Name,Edition,Condition\n4,0,Lightning Bolt,mh2,Near Mint";
    expect(() => parseDelverCsv(moxfield)).toThrow(DelverCsvError);
  });
});
