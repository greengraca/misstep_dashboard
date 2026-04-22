import { NextResponse } from "next/server";
import { withAuthParams } from "@/lib/api-helpers";
import { logActivity } from "@/lib/activity";
import { reopenBaselineCapture } from "@/lib/investments/service";

/**
 * POST — session-only. Flips listing → baseline_captured AND wipes the
 * investment's baseline rows so a re-walk can't stack duplicates on
 * top of stale dedupKey-based rows. Lots + sealed flips + sale_log
 * stay intact. 404s on anything other than listing (baseline_captured
 * is already there; closed/archived are immutable).
 */
export const POST = withAuthParams<{ id: string }>(async (_req, session, { id }) => {
  const result = await reopenBaselineCapture(id);
  if (!result) {
    return NextResponse.json(
      { error: "not found or not in listing status" },
      { status: 404 }
    );
  }
  const { investment, wiped_baseline } = result;
  logActivity(
    "update",
    "investment",
    id,
    `Reopened baseline capture on "${investment.name}" (wiped ${wiped_baseline} baseline row${wiped_baseline === 1 ? "" : "s"})`,
    session.user?.id ?? "system",
    session.user?.name ?? "unknown"
  );
  return {
    ok: true,
    id: String(investment._id),
    status: investment.status,
    wiped_baseline,
  };
}, "investments-baseline-reopen");
