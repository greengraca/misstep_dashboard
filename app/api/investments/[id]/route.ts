import { NextResponse, type NextRequest } from "next/server";
import { withAuthParams } from "@/lib/api-helpers";
import { withExtAuthReadParams } from "@/lib/api-ext-helpers";
import { logActivity } from "@/lib/activity";
import {
  archiveInvestment,
  buildInvestmentDetail,
  getInvestment,
  updateInvestment,
} from "@/lib/investments/service";
import type { UpdateInvestmentBody } from "@/lib/investments/types";

function validatePatch(body: unknown): string | null {
  if (!body || typeof body !== "object") return "body must be an object";
  const b = body as Record<string, unknown>;
  if (b.name !== undefined) {
    if (typeof b.name !== "string" || !b.name.trim()) return "name must be a non-empty string";
  }
  if (b.cost_total_eur !== undefined) {
    if (typeof b.cost_total_eur !== "number" || !Number.isFinite(b.cost_total_eur) || b.cost_total_eur < 0)
      return "cost_total_eur must be a non-negative finite number";
  }
  if (b.cost_notes !== undefined && typeof b.cost_notes !== "string")
    return "cost_notes must be a string";
  if (b.cm_set_names !== undefined) {
    if (!Array.isArray(b.cm_set_names) || !b.cm_set_names.every((x) => typeof x === "string"))
      return "cm_set_names must be an array of strings";
  }
  return null;
}

// Dual-auth so the extension popup can read the investment's code and
// source for the listing-tag UX. PATCH/DELETE stay session-only below.
export const GET = withExtAuthReadParams<{ id: string }>(async (_req, _identity, { id }) => {
  const inv = await getInvestment(id);
  if (!inv) return NextResponse.json({ error: "not found" }, { status: 404 });
  const detail = await buildInvestmentDetail(inv);
  return { investment: detail };
}, "investments-detail");

export const PATCH = withAuthParams<{ id: string }>(async (req: NextRequest, session, { id }) => {
  const body = (await req.json()) as UpdateInvestmentBody;
  const err = validatePatch(body);
  if (err) return NextResponse.json({ error: err }, { status: 400 });
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
