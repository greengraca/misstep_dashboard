import { describe, it, expect } from "vitest";
import {
  sizeBloom,
  createBloom,
  addKey,
  checkKey,
  buildBloom,
  serializeBloom,
  deserializeBloom,
} from "../bloom";

// Fixtures also consumed by the extension-side mirror (misstep-ext/lib/bloom.js).
// If you change these, mirror the change on the extension side and verify the
// extension still passes its own fixture test.
const FIXTURE_KEYS = [
  "Vela the Night-Clad|1|1.85|LP|true|Commander's Arsenal",
  "Anger|1|0.25|NM|false|Torment",
  "Lightning Bolt|4|0.50|NM|false|Magic 2011",
  "Sol Ring|1|1.20|EX|false|Commander 2020",
  "Bayou|1|420.00|LP|false|Revised Edition",
];

describe("sizeBloom", () => {
  it("sizes for 100k items at 0.1% FP rate to ~1.44M bits with k=10", () => {
    const { m, k } = sizeBloom(100_000, 0.001);
    expect(m).toBeGreaterThanOrEqual(1_437_000);
    expect(m).toBeLessThan(1_500_000);
    expect(m % 8).toBe(0);
    expect(k).toBe(10);
  });

  it("rounds m to a byte boundary", () => {
    for (const n of [1, 100, 1000, 62_000]) {
      expect(sizeBloom(n, 0.01).m % 8).toBe(0);
    }
  });

  it("sizes defensively when expectedItems is 0", () => {
    const { m, k } = sizeBloom(0, 0.01);
    expect(m).toBeGreaterThan(0);
    expect(k).toBeGreaterThanOrEqual(1);
  });
});

describe("bloom membership", () => {
  it("empty bloom rejects everything", () => {
    const { m, k } = sizeBloom(100, 0.01);
    const bloom = createBloom(m, k);
    for (const key of FIXTURE_KEYS) {
      expect(checkKey(bloom, key)).toBe(false);
    }
  });

  it("added keys are always found (no false negatives)", () => {
    const { m, k } = sizeBloom(100, 0.01);
    const bloom = createBloom(m, k);
    for (const key of FIXTURE_KEYS) addKey(bloom, key);
    for (const key of FIXTURE_KEYS) {
      expect(checkKey(bloom, key)).toBe(true);
    }
    expect(bloom.n).toBe(FIXTURE_KEYS.length);
  });

  it("buildBloom is equivalent to createBloom + addKey loop", () => {
    const { m, k } = sizeBloom(100, 0.01);
    const built = buildBloom(FIXTURE_KEYS, m, k);
    const manual = createBloom(m, k);
    for (const key of FIXTURE_KEYS) addKey(manual, key);
    expect(built.bits).toEqual(manual.bits);
    expect(built.n).toBe(manual.n);
  });

  it("unseen keys are rejected (small fixture, no collisions expected)", () => {
    const { m, k } = sizeBloom(100, 0.001);
    const bloom = buildBloom(FIXTURE_KEYS, m, k);
    const unseen = [
      "Black Lotus|1|99999.99|NM|false|Alpha",
      "Island|100|0.05|NM|false|Core Set 2020",
      "Forest|100|0.05|NM|false|Core Set 2020",
    ];
    for (const key of unseen) {
      expect(checkKey(bloom, key)).toBe(false);
    }
  });

  it("empirical FP rate at 0.1% stays under 1% on a 10k-item build", () => {
    const n = 10_000;
    const { m, k } = sizeBloom(n, 0.001);
    const inSet: string[] = [];
    for (let i = 0; i < n; i++) inSet.push(`in|${i}|0.10|NM|false|Set`);
    const bloom = buildBloom(inSet, m, k);

    let falsePositives = 0;
    const probes = 5_000;
    for (let i = 0; i < probes; i++) {
      if (checkKey(bloom, `out|${i}|0.10|NM|false|Set`)) falsePositives++;
    }
    expect(falsePositives / probes).toBeLessThan(0.01);
  });
});

describe("serialize / deserialize", () => {
  it("round-trips with identical membership answers", () => {
    const { m, k } = sizeBloom(100, 0.01);
    const bloom = buildBloom(FIXTURE_KEYS, m, k);
    const payload = serializeBloom(bloom);
    const restored = deserializeBloom(payload);
    expect(restored.m).toBe(bloom.m);
    expect(restored.k).toBe(bloom.k);
    expect(restored.n).toBe(bloom.n);
    expect(restored.bits).toEqual(bloom.bits);
    for (const key of FIXTURE_KEYS) {
      expect(checkKey(restored, key)).toBe(true);
    }
  });

  it("serialized bits are valid base64 of the raw Uint8Array", () => {
    const { m, k } = sizeBloom(10, 0.01);
    const bloom = buildBloom(["only-one-key"], m, k);
    const payload = serializeBloom(bloom);
    const decoded = new Uint8Array(Buffer.from(payload.bits, "base64"));
    expect(decoded).toEqual(bloom.bits);
  });
});

describe("determinism (extension parity)", () => {
  // If these snapshots ever change, the extension-side bloom.js is out of
  // sync and must be updated in lockstep.
  it("produces a stable bit pattern for the fixture keys", () => {
    const bloom = buildBloom(FIXTURE_KEYS, 128, 3);
    // Collect set-bit indices so the snapshot is readable.
    const setBits: number[] = [];
    for (let i = 0; i < bloom.m; i++) {
      if ((bloom.bits[i >>> 3] & (1 << (i & 7))) !== 0) setBits.push(i);
    }
    expect(setBits).toMatchInlineSnapshot(`
      [
        2,
        3,
        9,
        18,
        39,
        51,
        53,
        75,
        81,
        88,
        100,
        103,
        125,
      ]
    `);
  });
});
