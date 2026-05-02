import { NextResponse } from "next/server";
import { withAuthParams, withAuthReadParams } from "@/lib/api-helpers";
import { generateProductSnapshot, getProductSnapshots } from "@/lib/ev-products";
import { logActivity } from "@/lib/activity";

/**
 * Read product EV snapshot history. Powers the snapshot chart on the
 * EV product detail page. Same shape as the per-set snapshots endpoint.
 */
export const GET = withAuthReadParams<{ slug: string }>(async (req, { slug }) => {
  const days = parseInt(req.nextUrl.searchParams.get("days") || "180", 10);
  const data = await getProductSnapshots(slug, days);
  return { data };
}, "ev-product-snapshots-read");

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
