import { NextResponse } from "next/server";
import { withAuthParams } from "@/lib/api-helpers";
import { getDb } from "@/lib/mongodb";
import { getInvestment } from "@/lib/investments/service";
import { listSaleLog } from "@/lib/investments/manual-sales";

export const GET = withAuthParams<{ id: string }>(async (req, _s, { id }) => {
  const inv = await getInvestment(id);
  if (!inv) return NextResponse.json({ error: "investment not found" }, { status: 404 });
  const url = new URL(req.url);
  const pageStr = url.searchParams.get("page");
  const pageSizeStr = url.searchParams.get("pageSize");
  const page = pageStr && !Number.isNaN(Number(pageStr)) ? Number(pageStr) : undefined;
  const pageSize = pageSizeStr && !Number.isNaN(Number(pageSizeStr)) ? Number(pageSizeStr) : undefined;
  const db = await getDb();
  const result = await listSaleLog({ db, investmentId: id, page, pageSize });
  return result;
}, "investments-sale-log-list");
