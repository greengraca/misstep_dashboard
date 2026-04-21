import { NextResponse, type NextRequest } from "next/server";
import { withAuth, withAuthRead } from "@/lib/api-helpers";
import { logActivity } from "@/lib/activity";
import {
  createInvestment,
  listInvestmentSummaries,
} from "@/lib/investments/service";
import type { CreateInvestmentBody, Investment } from "@/lib/investments/types";

function validateSource(src: unknown): string | null {
  if (!src || typeof src !== "object") return "source is required";
  const kind = (src as { kind?: unknown }).kind;
  if (kind === "box") {
    const s = src as Record<string, unknown>;
    if (typeof s.set_code !== "string" || !s.set_code) return "source.set_code required";
    if (!["play", "collector", "jumpstart", "set"].includes(s.booster_type as string))
      return "source.booster_type invalid";
    if (typeof s.packs_per_box !== "number" || s.packs_per_box <= 0)
      return "source.packs_per_box must be positive";
    if (typeof s.cards_per_pack !== "number" || s.cards_per_pack <= 0)
      return "source.cards_per_pack must be positive";
    if (typeof s.box_count !== "number" || s.box_count <= 0)
      return "source.box_count must be positive";
    return null;
  }
  if (kind === "product") {
    const s = src as Record<string, unknown>;
    if (typeof s.product_slug !== "string" || !s.product_slug)
      return "source.product_slug required";
    if (typeof s.unit_count !== "number" || s.unit_count <= 0)
      return "source.unit_count must be positive";
    return null;
  }
  return "source.kind must be 'box' or 'product'";
}

export const GET = withAuthRead(async (req) => {
  const url = new URL(req.url);
  const statusQ = url.searchParams.get("status") as Investment["status"] | null;
  const summaries = await listInvestmentSummaries({ status: statusQ ?? undefined });
  return { investments: summaries };
}, "investments-list");

export const POST = withAuth(async (req: NextRequest, session) => {
  const body = (await req.json()) as CreateInvestmentBody;
  if (typeof body.name !== "string" || !body.name.trim())
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (typeof body.cost_total_eur !== "number" || body.cost_total_eur < 0)
    return NextResponse.json(
      { error: "cost_total_eur must be a non-negative number" },
      { status: 400 }
    );
  const srcErr = validateSource(body.source);
  if (srcErr) return NextResponse.json({ error: srcErr }, { status: 400 });

  const inv = await createInvestment({
    body,
    userId: session.user?.id ?? "system",
  });
  logActivity(
    "create",
    "investment",
    String(inv._id),
    `Created investment "${inv.name}" (€${inv.cost_total_eur})`,
    session.user?.id ?? "system",
    session.user?.name ?? "unknown"
  );
  return { investment: { ...inv, _id: String(inv._id) } };
}, "investments-create");
