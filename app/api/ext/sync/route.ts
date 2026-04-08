import { NextResponse } from "next/server";
import { withExtAuth } from "@/lib/api-ext-helpers";
import { processSync, checkRateLimit } from "@/lib/cardmarket";
import type { ExtSyncPayload } from "@/lib/types";

export const POST = withExtAuth(async (request, memberName) => {
  const rateCheck = checkRateLimit(memberName);
  if (!rateCheck.ok) {
    return NextResponse.json(
      { error: "Too many requests", retryAfter: rateCheck.retryAfter },
      { status: 429, headers: { "Retry-After": String(rateCheck.retryAfter) } }
    );
  }

  const body: ExtSyncPayload = await request.json();

  if (!body.batch?.length) {
    return NextResponse.json({ error: "Empty batch" }, { status: 400 });
  }

  const results = await processSync(body.submittedBy || memberName, body.batch);
  return { data: { processed: body.batch.length, results } };
}, "ext-sync");
