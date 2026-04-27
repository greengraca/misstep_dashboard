import { describe, it, expect } from "vitest";
import { expandPoolToBuckets, VIRTUAL_POOLS } from "../ev-virtual-pools";

describe("expandPoolToBuckets", () => {
  it("expands a cn_range spec into a set+collector_number filter", () => {
    const buckets = expandPoolToBuckets({
      extensions: [{ type: "cn_range", set: "tla", cnFrom: 1, cnTo: 3 }],
    });
    expect(buckets).toHaveLength(1);
    expect(buckets[0]).toEqual({
      filter: { set: "tla", collector_number: { $in: ["1", "2", "3"] } },
    });
  });

  it("expands a name_list spec with dedupeBy: 'name'", () => {
    const buckets = expandPoolToBuckets({
      extensions: [{ type: "name_list", set: "plst", names: ["Llanowar Elves", "Counterspell"] }],
    });
    expect(buckets).toHaveLength(1);
    expect(buckets[0]).toEqual({
      filter: { set: "plst", name: { $in: ["Llanowar Elves", "Counterspell"] } },
      dedupeBy: "name",
    });
  });

  it("emits a native bucket when native is set, before extensions", () => {
    const buckets = expandPoolToBuckets({
      native: "mb2",
      extensions: [{ type: "name_list", set: "plst", names: ["Aerial Responder"] }],
    });
    expect(buckets).toHaveLength(2);
    expect(buckets[0]).toEqual({ filter: { set: "mb2" } });
    expect(buckets[1]).toMatchObject({ filter: { set: "plst" }, dedupeBy: "name" });
  });

  it("preserves Jumpstart-style multi-spec ordering for priority", () => {
    const buckets = expandPoolToBuckets({
      extensions: [
        { type: "cn_range", set: "tla", cnFrom: 1, cnTo: 281 },
        { type: "cn_range", set: "tle", cnFrom: 74, cnTo: 170 },
      ],
    });
    expect(buckets).toHaveLength(2);
    expect(buckets[0].filter).toMatchObject({ set: "tla" });
    expect(buckets[1].filter).toMatchObject({ set: "tle" });
  });
});

describe("VIRTUAL_POOLS registry", () => {
  it("defines mb2 with a native set + plst name_list extension", () => {
    const mb2 = VIRTUAL_POOLS.mb2;
    expect(mb2).toBeDefined();
    expect(mb2.native).toBe("mb2");
    expect(mb2.extensions).toHaveLength(1);
    const ext = mb2.extensions[0];
    expect(ext.type).toBe("name_list");
    if (ext.type === "name_list") {
      expect(ext.set).toBe("plst");
      // The pickup list should cover ~1447 reprints per notes/ev/mb2.md
      expect(ext.names.length).toBeGreaterThan(1400);
      expect(ext.names.length).toBeLessThan(1500);
    }
  });

  it("defines jtla with cn_range specs in priority order (tle 74-170 last = highest priority)", () => {
    const jtla = VIRTUAL_POOLS.jtla;
    expect(jtla).toBeDefined();
    expect(jtla.native).toBeUndefined();
    const last = jtla.extensions[jtla.extensions.length - 1];
    expect(last).toMatchObject({ type: "cn_range", set: "tle", cnFrom: 74, cnTo: 170 });
  });
});
