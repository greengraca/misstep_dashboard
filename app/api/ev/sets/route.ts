import { withAuthRead } from "@/lib/api-helpers";
import { getSets, syncSets } from "@/lib/ev";

export const GET = withAuthRead(async (req) => {
  const refresh = req.nextUrl.searchParams.get("refresh") === "true";
  if (refresh) await syncSets();
  const data = await getSets();
  return { data };
}, "ev-sets-list");
