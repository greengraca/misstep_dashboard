import { withAuthReadParams } from "@/lib/api-helpers";
import { getCardsForSet } from "@/lib/ev";

export const GET = withAuthReadParams<{ code: string }>(async (req, params) => {
  const boosterOnly = req.nextUrl.searchParams.get("booster") === "true";
  const page = parseInt(req.nextUrl.searchParams.get("page") || "1", 10);
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "200", 10);
  const data = await getCardsForSet(params.code, { boosterOnly, page, limit });
  return { data };
}, "ev-set-cards");
