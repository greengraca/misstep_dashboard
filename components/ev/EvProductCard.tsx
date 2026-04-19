"use client";

import Link from "next/link";
import type { EvProduct } from "@/lib/types";

interface Props {
  product: EvProduct & {
    latest_snapshot?: {
      ev_net_cards_only: number | null;
      ev_net_sealed: number | null;
      ev_net_opened: number | null;
    } | null;
  };
}

const TYPE_LABEL: Record<EvProduct["product_type"], string> = {
  planeswalker_deck: "PW DECK",
  commander: "COMMANDER",
  starter: "STARTER",
  welcome: "WELCOME",
  duel: "DUEL",
  challenger: "CHALLENGER",
  other: "OTHER",
};

function fmt(eur: number | null | undefined): string {
  if (eur == null) return "—";
  return `€${eur.toFixed(2)}`;
}

export default function EvProductCard({ product }: Props) {
  const s = product.latest_snapshot ?? null;
  return (
    <Link
      href={`/ev/product/${product.slug}`}
      className="block p-4 rounded-xl transition-all duration-200 hover:-translate-y-0.5"
      style={{
        background: "var(--surface-gradient)",
        backdropFilter: "var(--surface-blur)",
        border: "1px solid rgba(255, 255, 255, 0.10)",
        boxShadow: "var(--surface-shadow)",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      {product.image_uri && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={product.image_uri}
          alt={product.name}
          className="w-full mb-3"
          style={{ height: "120px", objectFit: "contain" }}
        />
      )}
      <div
        className="text-sm font-semibold truncate mb-1"
        style={{ color: "var(--text-primary)" }}
      >
        {product.name}
      </div>
      <div
        className="text-xs mb-3"
        style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
      >
        {TYPE_LABEL[product.product_type]} &middot; {product.release_year}
      </div>
      <div className="text-[13px] grid gap-0.5" style={{ color: "var(--text-primary)" }}>
        <div>
          Cards: <strong>{fmt(s?.ev_net_cards_only)}</strong>
        </div>
        {s?.ev_net_sealed != null && (
          <div>
            + sealed: <strong>{fmt(s.ev_net_sealed)}</strong>
          </div>
        )}
        {s?.ev_net_opened != null && (
          <div>
            + opened: <strong>{fmt(s.ev_net_opened)}</strong>
          </div>
        )}
      </div>
    </Link>
  );
}
