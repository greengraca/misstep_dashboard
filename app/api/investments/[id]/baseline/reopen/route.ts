import { NextResponse } from "next/server";
import { withAuthParams } from "@/lib/api-helpers";
import { logActivity } from "@/lib/activity";
import { reopenBaselineCapture } from "@/lib/investments/service";

/**
 * POST — session-only. Flips listing → baseline_captured so the user
 * can re-walk an investment that was prematurely marked complete.
 * Preserves baseline rows, lots, and sealed flips; the next walk + mark
 * complete picks up from wherever things stood. 404s on anything other
 * than listing (baseline_captured is already there; closed/archived are
 * immutable).
 */
export const POST = withAuthParams<{ id: string }>(async (_req, session, { id }) => {
  const inv = await reopenBaselineCapture(id);
  if (!inv) {
    return NextResponse.json(
      { error: "not found or not in listing status" },
      { status: 404 }
    );
  }
  logActivity(
    "update",
    "investment",
    id,
    `Reopened baseline capture on "${inv.name}"`,
    session.user?.id ?? "system",
    session.user?.name ?? "unknown"
  );
  return { ok: true, id: String(inv._id), status: inv.status };
}, "investments-baseline-reopen");
