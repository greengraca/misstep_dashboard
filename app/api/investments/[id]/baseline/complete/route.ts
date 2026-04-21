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
    const inv = await markBaselineComplete({ id });
    if (!inv)
      return NextResponse.json(
        { error: "not found or already complete" },
        { status: 404 }
      );
    logActivity(
      "update",
      "investment",
      id,
      "Baseline captured; listing started",
      userId,
      userName
    );
    return NextResponse.json({ ok: true, id: String(inv._id), status: inv.status });
  } catch (err) {
    console.error("investments-baseline-complete error:", err);
    logApiError("investments-baseline-complete", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
