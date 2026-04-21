import { NextResponse, type NextRequest } from "next/server";
import { withAuthParams } from "@/lib/api-helpers";
import { logActivity } from "@/lib/activity";
import {
  archiveInvestment,
  buildInvestmentDetail,
  getInvestment,
  updateInvestment,
} from "@/lib/investments/service";
import type { UpdateInvestmentBody } from "@/lib/investments/types";

export const GET = withAuthParams<{ id: string }>(async (_req, _session, { id }) => {
  const inv = await getInvestment(id);
  if (!inv) return NextResponse.json({ error: "not found" }, { status: 404 });
  const detail = await buildInvestmentDetail(inv);
  return { investment: detail };
}, "investments-detail");

export const PATCH = withAuthParams<{ id: string }>(async (req: NextRequest, session, { id }) => {
  const body = (await req.json()) as UpdateInvestmentBody;
  const inv = await updateInvestment({ id, body });
  if (!inv) return NextResponse.json({ error: "not found" }, { status: 404 });
  logActivity(
    "update",
    "investment",
    id,
    `Edited investment "${inv.name}"`,
    session.user?.id ?? "system",
    session.user?.name ?? "unknown"
  );
  const detail = await buildInvestmentDetail(inv);
  return { investment: detail };
}, "investments-update");

export const DELETE = withAuthParams<{ id: string }>(async (_req, session, { id }) => {
  const ok = await archiveInvestment(id);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  logActivity(
    "delete",
    "investment",
    id,
    "Archived investment",
    session.user?.id ?? "system",
    session.user?.name ?? "unknown"
  );
  return { archived: true };
}, "investments-archive");
