import { NextResponse } from "next/server";
import { withAuthRead } from "@/lib/api-helpers";
import { getStockHistory, type HistoryRange } from "@/lib/stock";

const VALID_RANGES: HistoryRange[] = ["7d", "30d", "90d", "all"];

export const GET = withAuthRead(async (req) => {
  const rangeRaw = req.nextUrl.searchParams.get("range") || "30d";
  if (!(VALID_RANGES as string[]).includes(rangeRaw)) {
    return NextResponse.json({ error: "invalid range" }, { status: 400 });
  }
  const points = await getStockHistory(rangeRaw as HistoryRange);
  return { points };
}, "stock-history");
