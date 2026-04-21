import { NextResponse } from "next/server";
import { withExtAuthReadParams } from "@/lib/api-ext-helpers";
import { computeBaselineDiagnosis } from "@/lib/investments/service";

/**
 * GET — dual-auth. Returns per-investment counts the extension needs to
 * decide whether to walk the expansion or short-circuit via snapshot-
 * from-stock. See computeBaselineDiagnosis for field semantics.
 */
export const GET = withExtAuthReadParams<{ id: string }>(
  async (_req, _identity, { id }) => {
    const result = await computeBaselineDiagnosis({ id });
    if (!result) return NextResponse.json({ error: "not found" }, { status: 404 });
    return result;
  },
  "investments-baseline-diagnose"
);
