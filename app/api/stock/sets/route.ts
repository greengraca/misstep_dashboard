import { withAuthRead } from "@/lib/api-helpers";
import { getDistinctStockSets } from "@/lib/stock";
import { resolveStockSets } from "@/lib/scryfall-sets";

export const GET = withAuthRead(async () => {
  const names = await getDistinctStockSets();
  const sets = await resolveStockSets(names);
  return { sets };
}, "stock-sets");
