import { NextResponse } from "next/server";
import { withAuthParams } from "@/lib/api-helpers";
import { logActivity } from "@/lib/activity";
import { deleteInvestmentPermanent, getInvestment } from "@/lib/investments/service";

/**
 * Hard-delete an investment and all its lot / sale-log rows. Session-only
 * — destructive, no ext caller should trigger this. Unlike DELETE
 * /api/investments/[id] which archives (soft-delete), this removes the
 * document and cascades. Activity log preserves the name.
 */
export const DELETE = withAuthParams<{ id: string }>(async (_req, session, { id }) => {
  const inv = await getInvestment(id);
  const name = inv?.name ?? "(unknown)";

  const result = await deleteInvestmentPermanent(id);
  if (!result.deleted) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  logActivity(
    "delete",
    "investment",
    id,
    `Permanently deleted investment "${name}" (${result.counts.lots} lots, ${result.counts.sale_log} sale-log rows removed)`,
    session.user?.id ?? "system",
    session.user?.name ?? "unknown"
  );
  return { ok: true, ...result };
}, "investments-delete-permanent");
