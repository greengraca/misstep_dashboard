import { NextResponse } from "next/server";
import { withExtAuthReadParams } from "@/lib/api-ext-helpers";
import { getBaselineTargets } from "@/lib/investments/service";

export const GET = withExtAuthReadParams<{ id: string }>(async (_req, _identity, { id }) => {
  const targets = await getBaselineTargets({ id });
  if (!targets) return NextResponse.json({ error: "not found" }, { status: 404 });
  return targets;
}, "investments-baseline-targets");
