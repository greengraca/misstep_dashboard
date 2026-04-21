import { NextResponse } from "next/server";
import { withAuthParams } from "@/lib/api-helpers";
import { logActivity } from "@/lib/activity";
import { buildInvestmentDetail, closeInvestment } from "@/lib/investments/service";

export const POST = withAuthParams<{ id: string }>(async (_req, session, { id }) => {
  const inv = await closeInvestment({ id });
  if (!inv) return NextResponse.json({ error: "not found" }, { status: 404 });
  logActivity(
    "update",
    "investment",
    id,
    `Closed investment "${inv.name}"`,
    session.user?.id ?? "system",
    session.user?.name ?? "unknown"
  );
  const detail = await buildInvestmentDetail(inv);
  return { investment: detail };
}, "investments-close");
