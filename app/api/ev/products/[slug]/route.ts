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

async function setNamesByCode(codes: string[]): Promise<Record<string, string>> {
  if (codes.length === 0) return {};
  const db = await getDb();
  const docs = await db
    .collection("dashboard_ev_sets")
    .find({ code: { $in: codes } }, { projection: { code: 1, name: 1 } })
    .toArray();
  const out: Record<string, string> = {};
  for (const d of docs) out[d.code as string] = d.name as string;
  return out;
}

export const GET = withAuthReadParams<{ slug: string }>(async (_req, { slug }) => {
  const product = await getProductBySlug(slug);
  if (!product) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const cards = await fetchCardsByScryfallIds(product.cards.map((c) => c.scryfall_id));
  const boosterCodes = (product.included_boosters ?? []).map((b) => b.set_code);
  const boosterEvBySet = await latestPlayEvBySet([...new Set(boosterCodes)]);
  const feeRate = await getFeeRate();
  const ev = calculateProductEv(product, cards, { feeRate, boosterEvBySet });

  const uniqueSetCodes = [...new Set(product.cards.map((c) => c.set_code))];
  const set_names = await setNamesByCode(uniqueSetCodes);

  return { data: { product, ev, set_names } };
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
