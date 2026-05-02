import { NextResponse } from "next/server";
import { withAuthParams } from "@/lib/api-helpers";
import { getSalesHistory } from "@/lib/investments/service";

/**
 * Sales + sealed-flip history for the investment detail page. Powers the
 * SalesHistoryChart sparkline (cumulative realized vs cost) and the
 * InvestmentTimeline strip (created → first sale → last sale → closed).
 */
export const GET = withAuthParams<{ id: string }>(async (_req, _s, { id }) => {
  const data = await getSalesHistory(id);
  if (!data) return NextResponse.json({ error: "investment not found" }, { status: 404 });
  return { data };
}, "investments-sales-history");
