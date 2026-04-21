import { NextResponse, type NextRequest } from "next/server";
import { withExtAuthParams } from "@/lib/api-ext-helpers";
import { upsertBaselineBatch } from "@/lib/investments/service";
import type { BaselineBatchBody } from "@/lib/investments/types";

export const POST = withExtAuthParams<{ id: string }>(
  async (req: NextRequest, _memberName, { id }) => {
    const body = (await req.json()) as BaselineBatchBody;
    if (!Array.isArray(body.listings) || !Array.isArray(body.visited_cardmarket_ids))
      return NextResponse.json(
        { error: "listings and visited_cardmarket_ids arrays required" },
        { status: 400 }
      );
    if (body.visited_cardmarket_ids.length > 10000)
      return NextResponse.json({ error: "visited_cardmarket_ids too large" }, { status: 400 });
    if (body.listings.length > 500)
      return NextResponse.json({ error: "listings batch too large" }, { status: 400 });
    const result = await upsertBaselineBatch({ id, body });
    if (!result) return NextResponse.json({ error: "not found" }, { status: 404 });
    return { ok: true, ...result };
  },
  "investments-baseline-batch"
);
