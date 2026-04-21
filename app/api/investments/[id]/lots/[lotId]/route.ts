import { NextResponse, type NextRequest } from "next/server";
import { withAuthParams } from "@/lib/api-helpers";
import { logActivity } from "@/lib/activity";
import { adjustLot } from "@/lib/investments/service";

export const PATCH = withAuthParams<{ id: string; lotId: string }>(
  async (req: NextRequest, session, { id, lotId }) => {
    const body = (await req.json()) as { qty_opened?: number };
    if (typeof body.qty_opened !== "number" || !Number.isFinite(body.qty_opened) || body.qty_opened < 0)
      return NextResponse.json(
        { error: "qty_opened must be a non-negative finite number" },
        { status: 400 }
      );
    const result = await adjustLot({ id, lotId, qtyOpened: body.qty_opened });
    if (result === "not_found")
      return NextResponse.json({ error: "lot not found" }, { status: 404 });
    if (result === "frozen")
      return NextResponse.json(
        { error: "cannot adjust a frozen (closed) lot" },
        { status: 400 }
      );
    if (result === "below_sold")
      return NextResponse.json(
        { error: "qty_opened cannot be less than qty_sold" },
        { status: 400 }
      );
    if (result === "invalid_input")
      return NextResponse.json({ error: "invalid input" }, { status: 400 });
    // result === "ok"
    logActivity(
      "update",
      "investment",
      id,
      `Adjusted lot ${lotId} qty_opened to ${body.qty_opened}`,
      session.user?.id ?? "system",
      session.user?.name ?? "unknown"
    );
    return { ok: true };
  },
  "investments-lots-adjust"
);
