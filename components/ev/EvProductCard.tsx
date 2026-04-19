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
    parent_set_icon?: string | null;
    parent_set_name?: string | null;
  };
}

const TYPE_LABEL: Record<EvProduct["product_type"], string> = {
  planeswalker_deck: "PW Deck",
  commander: "Commander",
  starter: "Starter",
  welcome: "Welcome",
  duel: "Duel",
  challenger: "Challenger",
  other: "Product",
};

function fmt(eur: number | null | undefined): string {
  if (eur == null) return "—";
  return `€${eur.toFixed(2)}`;
}

/**
 * Shortens a product name for the grid card. Replaces the parent set name
 * with the uppercase code and "Planeswalker" with "PW" so the title fits on
 * one line at the small font size.
 */
function shortenProductName(name: string, parentSetName: string | null | undefined, parentSetCode: string | null | undefined): string {
  let out = name;
  if (parentSetName && parentSetCode) {
    out = out.replace(parentSetName, parentSetCode.toUpperCase());
  }
  out = out.replace(/Planeswalker/g, "PW");
  return out;
}

export default function EvProductCard({ product }: Props) {
  const s = product.latest_snapshot ?? null;
  const hasEv = s?.ev_net_cards_only != null || s?.ev_net_sealed != null || s?.ev_net_opened != null;
  const totalCards = product.cards.reduce((acc, c) => acc + c.count, 0);
  const totalBoosters = (product.included_boosters ?? []).reduce((acc, b) => acc + b.count, 0);

  return (
    <Link
      href={`/ev/product/${product.slug}`}
      className="p-4 rounded-xl transition-all duration-200 hover:-translate-y-0.5 flex flex-col no-underline"
      style={{
        background: "var(--surface-gradient)",
        backdropFilter: "var(--surface-blur)",
        border: "1px solid rgba(255, 255, 255, 0.10)",
        boxShadow: "var(--surface-shadow)",
        color: "inherit",
      }}
    >
      {/* Header: parent-set icon + name + type/year */}
      <div className="flex items-start gap-3 mb-3">
        {product.parent_set_icon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.parent_set_icon}
            alt={product.parent_set_code ?? ""}
            className="w-8 h-8"
            style={{ filter: "invert(0.9)" }}
          />
        ) : (
          <div className="w-8 h-8" />
        )}
        <div className="min-w-0 flex-1">
          <p
            className="text-[13px] font-semibold leading-tight truncate"
            style={{ color: "var(--text-primary)" }}
            title={product.name}
          >
            {shortenProductName(product.name, product.parent_set_name, product.parent_set_code)}
          </p>
          <p
            className="text-xs mt-0.5"
            style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
          >
            {TYPE_LABEL[product.product_type]} &middot; {product.release_year}
          </p>
        </div>
      </div>

      {/* Middle: EV badges (cards only / + sealed / + opened) */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        {hasEv ? (
          <>
            {s?.ev_net_cards_only != null && (
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{
                  background: "rgba(99, 102, 241, 0.15)",
                  color: "var(--accent)",
                  fontFamily: "var(--font-mono)",
                }}
                title="Cards only (net)"
              >
                Cards: {fmt(s.ev_net_cards_only)}
              </span>
            )}
            {s?.ev_net_sealed != null && (
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{
                  background: "rgba(34, 197, 94, 0.15)",
                  color: "var(--success)",
                  fontFamily: "var(--font-mono)",
                }}
                title="Cards + sealed boosters (net)"
              >
                + sealed: {fmt(s.ev_net_sealed)}
              </span>
            )}
            {s?.ev_net_opened != null && (
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{
                  background: "rgba(168, 85, 247, 0.15)",
                  color: "#a855f7",
                  fontFamily: "var(--font-mono)",
                }}
                title="Cards + opened boosters (net)"
              >
                + opened: {fmt(s.ev_net_opened)}
              </span>
            )}
          </>
        ) : (
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{
              background: "rgba(255, 255, 255, 0.05)",
              color: "var(--text-muted)",
            }}
          >
            No snapshot
          </span>
        )}
      </div>

      {/* Footer: card count + booster count — always at bottom */}
      <div className="flex items-center justify-between mt-auto">
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {totalCards} cards
          {totalBoosters > 0 && ` + ${totalBoosters} booster${totalBoosters === 1 ? "" : "s"}`}
        </span>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {product.cards.length} unique
        </span>
      </div>
    </Link>
  );
}
