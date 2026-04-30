import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/api-helpers";
import { withExtAuthRead } from "@/lib/api-ext-helpers";
import { logActivity } from "@/lib/activity";
import {
  createInvestment,
  listInvestmentSummaries,
} from "@/lib/investments/service";
import type { CreateInvestmentBody, Investment } from "@/lib/investments/types";

const ALLOWED_STATUSES = ["listing", "closed", "archived"] as const;

function validateSource(src: unknown): string | null {
  if (!src || typeof src !== "object") return "source is required";
  const kind = (src as { kind?: unknown }).kind;
  if (kind === "box") {
    const s = src as Record<string, unknown>;
    if (typeof s.set_code !== "string" || !s.set_code) return "source.set_code required";
    if (!["play", "collector", "jumpstart", "set"].includes(s.booster_type as string))
      return "source.booster_type invalid";
    if (typeof s.packs_per_box !== "number" || !Number.isFinite(s.packs_per_box) || s.packs_per_box <= 0)
      return "source.packs_per_box must be positive";
    if (typeof s.cards_per_pack !== "number" || !Number.isFinite(s.cards_per_pack) || s.cards_per_pack <= 0)
      return "source.cards_per_pack must be positive";
    if (typeof s.box_count !== "number" || !Number.isFinite(s.box_count) || s.box_count <= 0)
      return "source.box_count must be positive";
    return null;
  }
  if (kind === "product") {
    const s = src as Record<string, unknown>;
    if (typeof s.product_slug !== "string" || !s.product_slug)
      return "source.product_slug required";
    if (typeof s.unit_count !== "number" || !Number.isFinite(s.unit_count) || s.unit_count <= 0)
      return "source.unit_count must be positive";
    return null;
  }
  if (kind === "collection") {
    const s = src as Record<string, unknown>;
    if (typeof s.appraiser_collection_id !== "string" || !s.appraiser_collection_id)
      return "source.appraiser_collection_id required";
    if (typeof s.card_count !== "number" || !Number.isFinite(s.card_count) || s.card_count < 0)
      return "source.card_count must be a non-negative number";
    return null;
  }
  if (kind === "customer_bulk") {
    const s = src as Record<string, unknown>;
    if (typeof s.estimated_card_count !== "number"
      || !Number.isFinite(s.estimated_card_count)
      || s.estimated_card_count <= 0)
      return "source.estimated_card_count must be positive";
    if (s.acquired_at !== undefined && typeof s.acquired_at !== "string")
      return "source.acquired_at must be an ISO date string";
    return null;
  }
  return "source.kind must be 'box', 'product', 'collection', or 'customer_bulk'";
}

export const GET = withExtAuthRead(async (req) => {
  const url = new URL(req.url);
  const raw = url.searchParams.get("status");
  if (raw !== null && !(ALLOWED_STATUSES as readonly string[]).includes(raw)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }
  const statusQ = (raw ?? undefined) as Investment["status"] | undefined;
  const summaries = await listInvestmentSummaries({ status: statusQ });
  return { investments: summaries };
}, "investments-list");

export const POST = withAuth(async (req: NextRequest, session) => {
  const body = (await req.json()) as CreateInvestmentBody;
  if (typeof body.name !== "string" || !body.name.trim())
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (typeof body.cost_total_eur !== "number" || !Number.isFinite(body.cost_total_eur) || body.cost_total_eur < 0)
    return NextResponse.json(
      { error: "cost_total_eur must be a non-negative number" },
      { status: 400 }
    );
  if (body.cost_notes !== undefined && typeof body.cost_notes !== "string")
    return NextResponse.json({ error: "cost_notes must be a string" }, { status: 400 });
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
