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
import { logActivity } from "@/lib/activity";

export const GET = withAuthReadParams<{ slug: string }>(async (_req, { slug }) => {
  const product = await getProductBySlug(slug);
  if (!product) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const cards = await fetchCardsByScryfallIds(product.cards.map((c) => c.scryfall_id));
  const boosterCodes = (product.included_boosters ?? []).map((b) => b.set_code);
  const boosterEvBySet = await latestPlayEvBySet([...new Set(boosterCodes)]);
  const feeRate = await getFeeRate();
  const ev = calculateProductEv(product, cards, { feeRate, boosterEvBySet });

  return { data: { product, ev } };
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
