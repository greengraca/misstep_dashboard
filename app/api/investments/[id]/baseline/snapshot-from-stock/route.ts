import { NextResponse, type NextRequest } from "next/server";
import { withExtAuthParams } from "@/lib/api-ext-helpers";
import { snapshotBaselineFromStock } from "@/lib/investments/service";

/**
 * POST — ext-auth. Body: { total_expected: number }.
 * Copies dashboard_cm_stock rows that belong to the investment's
 * expansion into dashboard_investment_baseline, stamps total_expected
 * on the investment. Called by the extension when diagnose returns
 * db_stock_count == cm_total — no walk needed, everything we need is
 * already in stock.
 */
export const POST = withExtAuthParams<{ id: string }>(
  async (req: NextRequest, _memberName, { id }) => {
    let body: { total_expected?: unknown };
    try {
      body = (await req.json()) as { total_expected?: unknown };
    } catch {
      return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
    }
    if (!Number.isInteger(body.total_expected) || (body.total_expected as number) < 0) {
      return NextResponse.json(
        { error: "total_expected must be a non-negative integer" },
        { status: 400 }
      );
    }
    const result = await snapshotBaselineFromStock({
      id,
      total_expected: body.total_expected as number,
    });
    if (!result) return NextResponse.json({ error: "not found" }, { status: 404 });
    return { ok: true, ...result };
  },
  "investments-baseline-snapshot-from-stock"
);
