import { withAuthRead } from "@/lib/api-helpers";
import { getDistinctStockLanguages } from "@/lib/stock";

export const GET = withAuthRead(async () => {
  const languages = await getDistinctStockLanguages();
  return { languages };
}, "stock-languages");
