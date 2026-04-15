import { withExtAuthRead } from "@/lib/api-ext-helpers";
import { getDb } from "@/lib/mongodb";
import { COLLECTION_PREFIX } from "@/lib/constants";

const COL_STOCK = `${COLLECTION_PREFIX}cm_stock`;
const COL_SNAPSHOTS = `${COLLECTION_PREFIX}cm_stock_snapshots`;

// Compares our captured stock count against the most recent totalListings
// reported by Cardmarket's Stock Overview page.  Surfaces a 'coverage
// gap' number the Seed Stock Mode HUD uses to flag when a tour is
// actually complete vs. just close enough.

export const GET = withExtAuthRead(async () => {
  const db = await getDb();

  const [serverTotal, latestSnapshot] = await Promise.all([
    db.collection(COL_STOCK).countDocuments({}),
    db.collection(COL_SNAPSHOTS).findOne({}, { sort: { extractedAt: -1 } }),
  ]);

  const cmReported = (latestSnapshot?.totalListings as number | undefined) ?? null;
  const snapshotAt = latestSnapshot?.extractedAt
    ? new Date(latestSnapshot.extractedAt as string).toISOString()
    : null;
  const gap = cmReported !== null ? cmReported - serverTotal : null;
  const coveragePct =
    cmReported && cmReported > 0
      ? Math.max(0, Math.min(100, (serverTotal / cmReported) * 100))
      : null;

  return {
    data: {
      serverTotal,
      cmReported,
      gap,
      coveragePct,
      snapshotAt,
    },
  };
}, "ext-stock-integrity");
