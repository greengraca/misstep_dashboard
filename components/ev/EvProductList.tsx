"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { EvProduct } from "@/lib/types";
import EvProductCard from "./EvProductCard";
import { Layers } from "lucide-react";

type ProductWithSnap = EvProduct & {
  latest_snapshot?: {
    ev_net_cards_only: number | null;
    ev_net_sealed: number | null;
    ev_net_opened: number | null;
  } | null;
  parent_set_icon?: string | null;
  parent_set_name?: string | null;
};

export default function EvProductList() {
  const { data, isLoading, error } = useSWR<{ data: ProductWithSnap[] }>(
    "/api/ev/products",
    fetcher
  );

  if (isLoading) {
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: "16px",
        }}
      >
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton" style={{ height: "200px" }} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm" style={{ color: "var(--error)" }}>
        Failed to load products: {String(error)}
      </div>
    );
  }

  const products = data?.data ?? [];

  if (products.length === 0) {
    return (
      <div
        className="flex flex-col items-center text-center py-16 gap-3"
        style={{ color: "var(--text-muted)" }}
      >
        <div
          className="p-3 rounded-xl"
          style={{ background: "var(--accent-light)" }}
        >
          <Layers size={28} style={{ color: "var(--accent)" }} />
        </div>
        <div className="text-base font-medium" style={{ color: "var(--text-primary)" }}>
          No fixed-pool products seeded yet
        </div>
        <div className="text-[13px] max-w-md">
          Products are commander precons, planeswalker decks, starter decks — anything with a known card list.
          Run <code style={{ background: "rgba(0,0,0,0.35)", padding: "1px 6px", borderRadius: 4, fontFamily: "var(--font-mono)", color: "var(--accent)" }}>npm run seed:ev-product &lt;slug&gt;</code> from <code style={{ background: "rgba(0,0,0,0.35)", padding: "1px 6px", borderRadius: 4, fontFamily: "var(--font-mono)", color: "var(--accent)" }}>scripts/</code> to seed one.
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
        gap: "16px",
      }}
    >
      {products.map((p) => (
        <EvProductCard key={p.slug} product={p} />
      ))}
    </div>
  );
}
