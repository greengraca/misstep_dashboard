import { withExtAuth } from "@/lib/api-ext-helpers";
import { migrateFromHuntinggrounds } from "@/lib/cardmarket";
import { logActivity } from "@/lib/activity";

export const POST = withExtAuth(async (request, memberName) => {
  const { sourceUri } = await request.json();
  const uri = sourceUri || process.env.HUNTINGGROUNDS_MONGODB_URI;

  if (!uri) {
    return { error: "No source URI provided. Set HUNTINGGROUNDS_MONGODB_URI or pass sourceUri in body." };
  }

  const result = await migrateFromHuntinggrounds(uri);

  logActivity(
    "sync",
    "cm_stock",
    "migration",
    `Migrated ${result.imported} listings from huntinggrounds (${result.skipped} skipped)`,
    "ext",
    memberName
  );

  return { data: result };
}, "ext-migrate");
