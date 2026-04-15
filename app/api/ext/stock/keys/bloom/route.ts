import { withExtAuthRead } from "@/lib/api-ext-helpers";
import { getDb } from "@/lib/mongodb";
import { COLLECTION_PREFIX } from "@/lib/constants";
import { buildBloom, serializeBloom, sizeBloom } from "@/lib/bloom";

const COL_STOCK = `${COLLECTION_PREFIX}cm_stock`;

// Sized for the Seed Stock Mode cold start: ~62k cm_stock docs today with
// headroom to 100k at a 0.1% false-positive rate.  See lib/bloom.ts.
const BLOOM_EXPECTED_ITEMS = 100_000;
const BLOOM_FP_RATE = 0.001;

export const GET = withExtAuthRead(async () => {
  const db = await getDb();
  const col = db.collection(COL_STOCK);

  const [docs, totalServerStock] = await Promise.all([
    col
      .find({}, { projection: { dedupKey: 1, _id: 0 } })
      .toArray(),
    col.countDocuments({}),
  ]);

  const keys = docs
    .map((d) => d.dedupKey as string | undefined)
    .filter((k): k is string => typeof k === "string" && k.length > 0);

  const { m, k } = sizeBloom(BLOOM_EXPECTED_ITEMS, BLOOM_FP_RATE);
  const payload = serializeBloom(buildBloom(keys, m, k));

  return {
    data: {
      asOf: new Date().toISOString(),
      m: payload.m,
      k: payload.k,
      n: payload.n,
      bits: payload.bits,
      totalServerStock,
    },
  };
}, "ext-stock-keys-bloom");
