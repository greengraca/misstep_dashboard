import { NextResponse, type NextRequest } from "next/server";
import { withAuthParams } from "@/lib/api-helpers";
import { logActivity } from "@/lib/activity";
import { recordSealedFlip, buildInvestmentDetail } from "@/lib/investments/service";
import type { SealedFlipBody } from "@/lib/investments/types";

export const POST = withAuthParams<{ id: string }>(async (req: NextRequest, session, { id }) => {
  const body = (await req.json()) as SealedFlipBody;
  if (typeof body.unit_count !== "number" || !Number.isFinite(body.unit_count) || body.unit_count <= 0)
    return NextResponse.json({ error: "unit_count must be a positive finite number" }, { status: 400 });
  if (typeof body.proceeds_eur !== "number" || !Number.isFinite(body.proceeds_eur) || body.proceeds_eur < 0)
    return NextResponse.json(
      { error: "proceeds_eur must be a non-negative finite number" },
      { status: 400 }
    );
  if (body.note !== undefined && typeof body.note !== "string")
    return NextResponse.json({ error: "note must be a string" }, { status: 400 });

  const inv = await recordSealedFlip({ id, body });
  if (!inv) return NextResponse.json({ error: "not found" }, { status: 404 });
  logActivity(
    "update",
    "investment",
    id,
    `Recorded sealed flip: ${body.unit_count} unit(s) for €${body.proceeds_eur}`,
    session.user?.id ?? "system",
    session.user?.name ?? "unknown"
  );
  const detail = await buildInvestmentDetail(inv);
  return { investment: detail };
}, "investments-sealed-flip");
