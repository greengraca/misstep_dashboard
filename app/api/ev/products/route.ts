import { NextResponse } from "next/server";
import { withAuthRead, withAuth } from "@/lib/api-helpers";
import { listProducts, upsertProduct } from "@/lib/ev-products";
import { getDb } from "@/lib/mongodb";
import { logActivity } from "@/lib/activity";
import type { EvProduct } from "@/lib/types";

async function latestProductSnapshotsMap(slugs: string[]) {
  if (slugs.length === 0) return new Map<string, Record<string, number | null>>();
  const db = await getDb();
  const docs = await db
    .collection("dashboard_ev_snapshots")
    .aggregate([
      { $match: { product_slug: { $in: slugs } } },
      { $sort: { date: -1 } },
      {
        $group: {
          _id: "$product_slug",
          ev_net_cards_only: { $first: "$ev_net_cards_only" },
          ev_net_sealed: { $first: "$ev_net_sealed" },
          ev_net_opened: { $first: "$ev_net_opened" },
          date: { $first: "$date" },
        },
      },
    ])
    .toArray();
  const map = new Map<string, Record<string, number | null>>();
  for (const d of docs) {
    map.set(d._id as string, {
      ev_net_cards_only: (d.ev_net_cards_only ?? null) as number | null,
      ev_net_sealed: (d.ev_net_sealed ?? null) as number | null,
      ev_net_opened: (d.ev_net_opened ?? null) as number | null,
    });
  }
  return map;
}

export const GET = withAuthRead(async () => {
  const products = await listProducts();
  const slugs = products.map((p) => p.slug);
  const snaps = await latestProductSnapshotsMap(slugs);
  const data = products.map((p) => ({
    ...p,
    latest_snapshot: snaps.get(p.slug) ?? null,
  }));
  return { data };
}, "ev-products-list");

export const POST = withAuth(async (req, session) => {
  const body = (await req.json()) as Partial<EvProduct> & { overwrite?: boolean };
  const overwrite = body.overwrite === true;
  const required: (keyof EvProduct)[] = ["slug", "name", "product_type", "release_year", "cards"];
  for (const k of required) {
    if (body[k] === undefined) {
      return NextResponse.json({ error: `Missing field: ${k}` }, { status: 400 });
    }
  }
  if (!Array.isArray(body.cards) || body.cards.length === 0) {
    return NextResponse.json({ error: "cards must be a non-empty array" }, { status: 400 });
  }
  const { overwrite: _drop, ...rest } = body as EvProduct & { overwrite?: boolean };
  void _drop;

  try {
    const res = await upsertProduct(rest as Omit<EvProduct, "_id" | "seeded_at">, { overwrite });
    logActivity(
      res.created ? "create" : "update",
      "ev_product",
      rest.slug,
      res.created ? `Created product ${rest.name}` : `Overwrote product ${rest.name}`,
      session.user?.id ?? "system",
      session.user?.name ?? "unknown"
    );
    return NextResponse.json(
      { data: { slug: res.slug, created: res.created } },
      { status: res.created ? 201 : 200 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = /already exists/i.test(msg) ? 409 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}, "ev-products-upsert");
