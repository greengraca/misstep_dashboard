import { NextResponse } from "next/server";
import { withAuthParams } from "@/lib/api-helpers";
import { logActivity } from "@/lib/activity";
import { createInvestmentFromAppraiser } from "@/lib/investments/service";
import type { ConvertAppraiserToInvestmentBody } from "@/lib/investments/types";

/**
 * Convert an appraiser collection into a tag-based investment.
 *   - Reads non-excluded cards from the collection.
 *   - Groups by `{cardmarket_id, foil, condition, language}` tuple.
 *   - Creates one investment with `kind: "collection"`, status `listing`,
 *     a generated provenance code, and one lot per tuple.
 *   - Cards without a `cardmarket_id` are skipped (can't tag-attribute
 *     without a CM product key) — the count is returned so the user
 *     can fix them via the appraiser's per-card "set ID" override.
 */
export const POST = withAuthParams<{ id: string }>(async (req, session, { id }) => {
  const body = (await req.json()) as ConvertAppraiserToInvestmentBody;

  if (typeof body.cost_total_eur !== "number" || !Number.isFinite(body.cost_total_eur) || body.cost_total_eur < 0) {
    return NextResponse.json(
      { error: "cost_total_eur must be a non-negative number" },
      { status: 400 },
    );
  }
  if (body.name !== undefined && typeof body.name !== "string") {
    return NextResponse.json({ error: "name must be a string" }, { status: 400 });
  }
  if (body.cost_notes !== undefined && typeof body.cost_notes !== "string") {
    return NextResponse.json({ error: "cost_notes must be a string" }, { status: 400 });
  }

  const result = await createInvestmentFromAppraiser({
    collectionId: id,
    body,
    userId: session.user?.id ?? "system",
  });
  if (!result) {
    return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  }

  logActivity(
    "create",
    "investment",
    String(result.investment._id),
    `Converted appraiser collection to investment "${result.investment.name}" — code ${result.investment.code} · ${result.lotCount} lots / ${result.cardCount} cards · cost €${result.investment.cost_total_eur}${result.skippedNoCmId ? ` · ${result.skippedNoCmId} cards skipped (no cardmarket_id)` : ""}`,
    session.user?.id ?? "system",
    session.user?.name ?? "unknown",
  );

  return {
    investment: { ...result.investment, _id: String(result.investment._id) },
    lotCount: result.lotCount,
    cardCount: result.cardCount,
    skippedNoCmId: result.skippedNoCmId,
  };
}, "appraiser-convert-to-investment");
