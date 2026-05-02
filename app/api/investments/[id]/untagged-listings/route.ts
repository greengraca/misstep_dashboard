import { NextResponse } from "next/server";
import { withAuthParams } from "@/lib/api-helpers";
import { findUntaggedListings, getInvestment } from "@/lib/investments/service";

/**
 * Tag-audit drilldown — returns one row per remaining lot whose
 * Cardmarket listings (matched by productId + condition + language + foil)
 * don't carry this investment's code in their comment field. Powers the
 * "X / Y tagged" click-through on the investment detail page.
 */
export const GET = withAuthParams<{ id: string }>(async (_req, _s, { id }) => {
  const inv = await getInvestment(id);
  if (!inv) return NextResponse.json({ error: "investment not found" }, { status: 404 });
  const rows = await findUntaggedListings(id);
  return { code: inv.code ?? null, rows };
}, "investments-untagged-listings");
