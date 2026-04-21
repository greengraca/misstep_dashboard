import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { requireExtAuth } from "@/lib/ext-auth";
import { logApiError } from "@/lib/error-log";
import { logActivity } from "@/lib/activity";
import { markBaselineComplete } from "@/lib/investments/service";

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const sess = await requireAuth(request);
    let userId = "system";
    let userName = "unknown";
    if (sess.error) {
      const ext = await requireExtAuth(request);
      if (ext.error) return ext.error;
      userName = ext.memberName;
      userId = ext.memberName;
    } else {
      userId = sess.session.user?.id ?? "system";
      userName = sess.session.user?.name ?? "unknown";
    }
    const { id } = await ctx.params;
    const result = await markBaselineComplete({ id });
    if (!result)
      return NextResponse.json(
        { error: "not found or already complete" },
        { status: 404 }
      );
    const { investment, cleaned, cleanup_skipped } = result;
    const activitySuffix =
      cleanup_skipped
        ? ` (cleanup skipped: ${cleanup_skipped})`
        : cleaned > 0
          ? ` (removed ${cleaned} stale stock row${cleaned === 1 ? "" : "s"})`
          : "";
    logActivity(
      "update",
      "investment",
      id,
      `Baseline captured; listing started${activitySuffix}`,
      userId,
      userName
    );
    return NextResponse.json({
      ok: true,
      id: String(investment._id),
      status: investment.status,
      cleaned,
      cleanup_skipped,
    });
  } catch (err) {
    console.error("investments-baseline-complete error:", err);
    logApiError("investments-baseline-complete", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
