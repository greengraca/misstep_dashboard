import { NextResponse } from "next/server";
import { withAuthReadParams, withAuthParams } from "@/lib/api-helpers";
import {
  calculateProductEv,
  deleteProduct,
  getProductBySlug,
  fetchCardsByScryfallIds,
  latestPlayEvBySet,
  getFeeRate,
} from "@/lib/ev-products";
import { getDb } from "@/lib/mongodb";
import { logActivity } from "@/lib/activity";

async function setMetaByCode(codes: string[]): Promise<{
  names: Record<string, string>;
  icons: Record<string, string | null>;
}> {
  if (codes.length === 0) return { names: {}, icons: {} };
  const db = await getDb();
  const docs = await db
    .collection("dashboard_ev_sets")
    .find({ code: { $in: codes } }, { projection: { code: 1, name: 1, icon_svg_uri: 1 } })
    .toArray();
  const names: Record<string, string> = {};
  const icons: Record<string, string | null> = {};
  for (const d of docs) {
    names[d.code as string] = d.name as string;
    icons[d.code as string] = (d.icon_svg_uri as string | null) ?? null;
  }
  return { names, icons };
}

export const GET = withAuthReadParams<{ slug: string }>(async (req, { slug }) => {
  const product = await getProductBySlug(slug);
  if (!product) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Sift toggle — defaults to on (excludes sub-€0.25 cards). Pass `?sift=off`
  // to see raw EV including unsellable cards.
  const siftFloor = req.nextUrl.searchParams.get("sift") === "off" ? 0 : 0.25;

  const cards = await fetchCardsByScryfallIds(product.cards.map((c) => c.scryfall_id));
  const boosterCodes = (product.included_boosters ?? []).map((b) => b.set_code);
  const boosterEvBySet = await latestPlayEvBySet([...new Set(boosterCodes)]);
  const feeRate = await getFeeRate();
  const ev = calculateProductEv(product, cards, { feeRate, boosterEvBySet, siftFloor });

  const uniqueSetCodes = [...new Set(product.cards.map((c) => c.set_code))];
  const { names: set_names, icons: set_icons } = await setMetaByCode(uniqueSetCodes);

  return { data: { product, ev, set_names, set_icons } };
}, "ev-product-detail");

export const DELETE = withAuthParams<{ slug: string }>(async (_req, session, { slug }) => {
  const res = await deleteProduct(slug);
  if (!res.deleted) return NextResponse.json({ error: "not_found" }, { status: 404 });
  logActivity(
    "delete",
    "ev_product",
    slug,
    `Deleted product ${slug}`,
    session.user?.id ?? "system",
    session.user?.name ?? "unknown"
  );
  return { data: { deleted: true } };
}, "ev-product-delete");
