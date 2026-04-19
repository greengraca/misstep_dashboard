import { NextResponse } from "next/server";
import { withAuthParams } from "@/lib/api-helpers";
import { generateProductSnapshot } from "@/lib/ev-products";
import { logActivity } from "@/lib/activity";

export const POST = withAuthParams<{ slug: string }>(async (_req, session, { slug }) => {
  const res = await generateProductSnapshot(slug);
  if (!res.written) {
    return NextResponse.json({ error: res.reason ?? "unknown" }, { status: 404 });
  }
  logActivity(
    "sync",
    "ev_product_snapshot",
    slug,
    `Generated snapshot for product ${slug}`,
    session.user?.id ?? "system",
    session.user?.name ?? "unknown"
  );
  return { data: { written: true, slug } };
}, "ev-product-snapshot");
