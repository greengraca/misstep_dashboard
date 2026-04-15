// Hand-rolled bloom filter for the Seed Stock Mode pipeline.
//
// Used to cheaply tell the extension "has this dedupKey probably been synced
// yet?" without shipping the full ~62k-entry keyset to every member's browser.
// The extension re-implements the same algorithm in plain JS (see
// misstep-ext/lib/bloom.js); the two files must stay byte-compatible so a
// bloom produced server-side deserialises and answers identically client-side.
//
// Algorithm: k hash positions derived from two FNV-1a-32 hashes using the
// Kirsch-Mitzenmacher double-hashing scheme (h_i = h1 + i*h2 mod m).  FNV-1a
// is chosen because it is trivial to port, dependency-free, deterministic
// across JS runtimes, and fast enough that hashing the ~60-byte dedupKeys
// takes nanoseconds per check.

export interface BloomFilter {
  m: number;
  k: number;
  n: number;
  bits: Uint8Array;
}

export interface SerializedBloom {
  m: number;
  k: number;
  n: number;
  bits: string;
}

const FNV_OFFSET_1 = 0x811c9dc5;
const FNV_OFFSET_2 = 0xcbf29ce4;
const FNV_PRIME = 0x01000193;

function fnv1a32(str: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h >>> 0;
}

export interface BloomSizing {
  m: number;
  k: number;
}

export function sizeBloom(expectedItems: number, falsePositiveRate: number): BloomSizing {
  const n = Math.max(1, expectedItems);
  const p = falsePositiveRate;
  const ln2 = Math.log(2);
  const mRaw = -(n * Math.log(p)) / (ln2 * ln2);
  const m = Math.ceil(mRaw / 8) * 8;
  const k = Math.max(1, Math.round((m / n) * ln2));
  return { m, k };
}

export function createBloom(m: number, k: number): BloomFilter {
  const bytes = Math.ceil(m / 8);
  return { m, k, n: 0, bits: new Uint8Array(bytes) };
}

function indices(bloom: BloomFilter, key: string): number[] {
  const h1 = fnv1a32(key, FNV_OFFSET_1);
  const h2 = fnv1a32(key, FNV_OFFSET_2);
  const out: number[] = new Array(bloom.k);
  for (let i = 0; i < bloom.k; i++) {
    const combined = (h1 + Math.imul(i, h2)) >>> 0;
    out[i] = combined % bloom.m;
  }
  return out;
}

export function addKey(bloom: BloomFilter, key: string): void {
  for (const bit of indices(bloom, key)) {
    bloom.bits[bit >>> 3] |= 1 << (bit & 7);
  }
  bloom.n++;
}

export function checkKey(bloom: BloomFilter, key: string): boolean {
  for (const bit of indices(bloom, key)) {
    if ((bloom.bits[bit >>> 3] & (1 << (bit & 7))) === 0) return false;
  }
  return true;
}

export function buildBloom(keys: Iterable<string>, m: number, k: number): BloomFilter {
  const bloom = createBloom(m, k);
  for (const key of keys) addKey(bloom, key);
  return bloom;
}

export function serializeBloom(bloom: BloomFilter): SerializedBloom {
  return {
    m: bloom.m,
    k: bloom.k,
    n: bloom.n,
    bits: Buffer.from(bloom.bits).toString("base64"),
  };
}

export function deserializeBloom(payload: SerializedBloom): BloomFilter {
  const bits = new Uint8Array(Buffer.from(payload.bits, "base64"));
  return { m: payload.m, k: payload.k, n: payload.n, bits };
}
