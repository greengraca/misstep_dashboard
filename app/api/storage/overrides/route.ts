import { withAuth, withAuthRead } from "@/lib/api-helpers";
import { listOverrides, createOverride } from "@/lib/storage-db";
import { logActivity } from "@/lib/activity";

export const GET = withAuthRead(async (req) => {
  const status = req.nextUrl.searchParams.get("status") as "all" | "applied" | "stale" | null;
  const data = await listOverrides(status ?? "all");
  return { data };
}, "storage-overrides-list");

export const POST = withAuth(async (req, session) => {
  const body = (await req.json()) as {
    anchorSlotKey?: string;
    targetBoxId?: string;
    targetBoxRowIndex?: number;
    note?: string;
  };
  if (!body?.anchorSlotKey || !body?.targetBoxId || typeof body.targetBoxRowIndex !== "number") {
    return Response.json(
      { error: "anchorSlotKey, targetBoxId, targetBoxRowIndex required" },
      { status: 400 }
    );
  }
  const created = await createOverride({
    anchorSlotKey: body.anchorSlotKey,
    targetBoxId: body.targetBoxId,
    targetBoxRowIndex: body.targetBoxRowIndex,
    note: body.note,
    createdBy: session.user?.name ?? "unknown",
  });
  logActivity(
    "create",
    "storage_override",
    created.id,
    `anchor=${created.anchorSlotKey} target=${created.targetBoxId}/${created.targetBoxRowIndex}`,
    "system",
    session.user?.name ?? "unknown"
  );
  return { data: created };
}, "storage-overrides-create");
