import { NextResponse } from "next/server";
import { withAuthParams } from "@/lib/api-helpers";
import { getDb } from "@/lib/mongodb";
import { getInvestment } from "@/lib/investments/service";
import { listSellableCards } from "@/lib/investments/manual-sales";

export const GET = withAuthParams<{ id: string }>(async (req, _s, { id }) => {
  const inv = await getInvestment(id);
  if (!inv) return NextResponse.json({ error: "investment not found" }, { status: 404 });
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? undefined;
  const db = await getDb();
  const result = await listSellableCards({ db, investmentId: id, q });
  return result;
}, "investments-sellable-cards");
