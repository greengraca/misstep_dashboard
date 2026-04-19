"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { EvProduct } from "@/lib/types";
import EvProductCard from "./EvProductCard";

type ProductWithSnap = EvProduct & {
  latest_snapshot?: {
    ev_net_cards_only: number | null;
    ev_net_sealed: number | null;
    ev_net_opened: number | null;
  } | null;
  parent_set_icon?: string | null;
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
        className="text-center py-12"
        style={{ color: "var(--text-muted)" }}
      >
        <div className="text-base mb-2">No products yet.</div>
        <div className="text-[13px]">
          Ask Claude to &quot;add an EV product&quot; to seed one.
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
