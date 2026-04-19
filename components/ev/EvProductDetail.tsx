"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { fetcher } from "@/lib/fetcher";
import type { EvProduct, EvProductResult } from "@/lib/types";

function BasicLandToggle({ product, onChanged }: { product: EvProduct; onChanged: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const countOn = product.count_basic_lands === true;

  async function toggle() {
    setSaving(true);
    setError(null);
    try {
      const { _id, seeded_at, ...rest } = product;
      void _id;
      void seeded_at;
      const payload = { ...rest, count_basic_lands: !countOn, overwrite: true };
      const res = await fetch("/api/ev/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      // Regenerate the latest snapshot so the Products tab grid reflects the change.
      await fetch(`/api/ev/products/${product.slug}/snapshot`, { method: "POST" });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-3 flex items-center gap-2 text-sm">
      <label className="inline-flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={countOn}
          onChange={toggle}
          disabled={saving}
          className="accent-[var(--accent)]"
        />
        <span style={{ color: "var(--text-muted)" }}>
          Count basic lands {countOn ? "(on)" : "(off — default)"}
        </span>
      </label>
      {saving && <span style={{ color: "var(--text-muted)" }}>saving…</span>}
      {error && <span style={{ color: "var(--error)" }}>{error}</span>}
    </div>
  );
}

interface Props {
  slug: string;
}

const TYPE_LABEL: Record<EvProduct["product_type"], string> = {
  planeswalker_deck: "Planeswalker Deck",
  commander: "Commander",
  starter: "Starter",
  welcome: "Welcome",
  duel: "Duel",
  challenger: "Challenger",
  other: "Other",
};

function fmt(eur: number | null | undefined): string {
  if (eur == null) return "—";
  return `€${eur.toFixed(2)}`;
}

// Cardmarket slugifies set and card names by collapsing runs of non-alphanumeric
// chars to a single dash. Same pattern as components/stock/StockTable.tsx.
function cardmarketSlug(input: string): string {
  return input.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function cardmarketUrl(setName: string | undefined, cardName: string, isFoil: boolean): string | null {
  if (!setName) return null;
  const base = `https://www.cardmarket.com/en/Magic/Products/Singles/${cardmarketSlug(setName)}/${cardmarketSlug(cardName)}`;
  return isFoil ? `${base}?isFoil=Y` : base;
}

export default function EvProductDetail({ slug }: Props) {
  const { data, isLoading, error } = useSWR<{
    data: { product: EvProduct; ev: EvProductResult; set_names?: Record<string, string> };
  }>(`/api/ev/products/${slug}`, fetcher);

  if (isLoading) {
    return <div className="skeleton" style={{ height: "400px" }} />;
  }

  if (error || !data?.data) {
    return (
      <div className="flex flex-col gap-3">
        <Link
          href="/ev?view=products"
          className="inline-flex items-center gap-1.5 text-sm w-fit"
          style={{ color: "var(--accent)" }}
        >
          <ArrowLeft size={14} /> Products
        </Link>
        <div
          className="p-3 rounded-lg text-sm"
          style={{
            border: "1px solid var(--error-border)",
            background: "var(--error-light)",
            color: "var(--error)",
          }}
        >
          Product not found or failed to load.
        </div>
      </div>
    );
  }

  const { product, ev } = data.data;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <Link
          href="/ev?view=products"
          className="inline-flex items-center gap-1.5 text-sm mb-2"
          style={{ color: "var(--accent)" }}
        >
          <ArrowLeft size={14} /> Products
        </Link>
        <div className="flex items-start gap-4 flex-wrap">
          {product.image_uri && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.image_uri}
              alt={product.name}
              style={{ height: "96px", width: "auto", objectFit: "contain" }}
            />
          )}
          <div className="min-w-0">
            <h1
              className="text-2xl font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              {product.name}
            </h1>
            <div
              className="text-[13px] mt-1"
              style={{ color: "var(--text-muted)" }}
            >
              {TYPE_LABEL[product.product_type]} &middot; {product.release_year}
              {product.parent_set_code && (
                <>
                  {" "}&middot;{" "}
                  <Link
                    href={`/ev?view=sets&set=${product.parent_set_code}`}
                    style={{ color: "var(--accent)" }}
                  >
                    parent set: {product.parent_set_code.toUpperCase()}
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Totals summary */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "12px",
        }}
      >
        <TotalCard
          label="Cards only (net)"
          value={ev.totals.cards_only.net}
          gross={ev.totals.cards_only.gross}
        />
        {ev.totals.sealed && (
          <TotalCard
            label="+ Sealed boosters (net)"
            value={ev.totals.sealed.net}
            gross={ev.totals.sealed.gross}
          />
        )}
        {ev.totals.opened && (
          <TotalCard
            label="+ Opened boosters (net)"
            value={ev.totals.opened.net}
            gross={ev.totals.opened.gross}
          />
        )}
      </div>

      {/* Missing cards warning */}
      {ev.missing_scryfall_ids.length > 0 && (
        <div
          className="p-3 rounded-lg text-[13px]"
          style={{
            border: "1px solid var(--error-border)",
            background: "var(--error-light)",
            color: "var(--error)",
          }}
        >
          <strong>{ev.missing_scryfall_ids.length}</strong> card(s) not found in
          the ev_cards cache — parent set may not be synced. IDs:{" "}
          {ev.missing_scryfall_ids.slice(0, 5).join(", ")}
          {ev.missing_scryfall_ids.length > 5 && "…"}
        </div>
      )}

      {/* Decklist */}
      <section
        className="p-4 rounded-xl"
        style={{
          background: "var(--surface-gradient)",
          backdropFilter: "var(--surface-blur)",
          border: "1px solid rgba(255, 255, 255, 0.10)",
          boxShadow: "var(--surface-shadow)",
        }}
      >
        <h2
          className="text-base font-semibold mb-3"
          style={{ color: "var(--text-primary)" }}
        >
          Decklist{" "}
          <span
            className="text-sm font-normal"
            style={{ color: "var(--text-muted)" }}
          >
            ({ev.card_count_total} cards)
          </span>
        </h2>
        <BasicLandToggle product={product} onChanged={() => mutate(`/api/ev/products/${slug}`)} />
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "13px",
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: "1px solid var(--border)",
                  textAlign: "left",
                  color: "var(--text-muted)",
                }}
              >
                <th style={{ padding: "8px", fontWeight: 500 }}>#</th>
                <th style={{ padding: "8px", fontWeight: 500 }}>Name</th>
                <th style={{ padding: "8px", fontWeight: 500 }}>Set</th>
                <th style={{ padding: "8px", fontWeight: 500 }}>Finish</th>
                <th style={{ padding: "8px", fontWeight: 500 }}>Unit</th>
                <th
                  style={{
                    padding: "8px",
                    textAlign: "right",
                    fontWeight: 500,
                  }}
                >
                  Line total
                </th>
              </tr>
            </thead>
            <tbody>
              {ev.card_breakdown.map((c) => {
                const cmUrl = cardmarketUrl(
                  data.data.set_names?.[c.set_code],
                  c.name,
                  c.is_foil
                );
                return (
                <tr
                  key={c.scryfall_id + (c.is_foil ? "-f" : "")}
                  style={{ borderBottom: "1px solid var(--border-subtle)" }}
                >
                  <td
                    style={{
                      padding: "8px",
                      color: "var(--text-muted)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {c.count}
                  </td>
                  <td
                    style={{ padding: "8px", color: "var(--text-primary)" }}
                  >
                    {cmUrl ? (
                      <a
                        href={cmUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="transition-colors no-underline hover:underline hover:text-[var(--accent)]"
                        style={{ color: "var(--text-primary)" }}
                        title="Open on Cardmarket"
                      >
                        {c.name}
                      </a>
                    ) : (
                      c.name
                    )}
                    {c.role && (
                      <span
                        className="ml-1.5 text-[11px]"
                        style={{ color: "var(--accent)" }}
                      >
                        ({c.role.replace(/_/g, " ")})
                      </span>
                    )}
                  </td>
                  <td
                    style={{
                      padding: "8px",
                      color: "var(--text-muted)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {c.set_code.toUpperCase()}
                  </td>
                  <td
                    style={{
                      padding: "8px",
                      color: c.is_foil
                        ? "var(--accent)"
                        : "var(--text-muted)",
                    }}
                  >
                    {c.is_foil ? "foil" : "non-foil"}
                  </td>
                  <td
                    style={{
                      padding: "8px",
                      color: "var(--text-primary)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {fmt(c.unit_price)}
                  </td>
                  <td
                    style={{
                      padding: "8px",
                      textAlign: "right",
                      color: "var(--text-primary)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {fmt(c.line_total)}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Included boosters */}
      {ev.booster_breakdown.length > 0 && (
        <section
          className="p-4 rounded-xl"
          style={{
            background: "var(--surface-gradient)",
            backdropFilter: "var(--surface-blur)",
            border: "1px solid rgba(255, 255, 255, 0.10)",
            boxShadow: "var(--surface-shadow)",
          }}
        >
          <h2
            className="text-base font-semibold mb-3"
            style={{ color: "var(--text-primary)" }}
          >
            Included boosters
          </h2>
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "13px",
              }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid var(--border)",
                    textAlign: "left",
                    color: "var(--text-muted)",
                  }}
                >
                  <th style={{ padding: "8px", fontWeight: 500 }}>Set</th>
                  <th style={{ padding: "8px", fontWeight: 500 }}>Count</th>
                  <th style={{ padding: "8px", fontWeight: 500 }}>
                    Sealed (each)
                  </th>
                  <th style={{ padding: "8px", fontWeight: 500 }}>
                    Opened EV (each)
                  </th>
                </tr>
              </thead>
              <tbody>
                {ev.booster_breakdown.map((b, i) => (
                  <tr
                    key={b.set_code + i}
                    style={{ borderBottom: "1px solid var(--border-subtle)" }}
                  >
                    <td style={{ padding: "8px" }}>
                      <Link
                        href={`/ev?view=sets&set=${b.set_code}`}
                        style={{
                          color: "var(--accent)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {b.set_code.toUpperCase()}
                      </Link>
                    </td>
                    <td
                      style={{
                        padding: "8px",
                        color: "var(--text-primary)",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {b.count}
                    </td>
                    <td
                      style={{
                        padding: "8px",
                        color: "var(--text-primary)",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {fmt(b.sealed_price_eur)}
                    </td>
                    <td
                      style={{
                        padding: "8px",
                        color: "var(--text-primary)",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {fmt(b.opened_unit_ev)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function TotalCard({
  label,
  value,
  gross,
}: {
  label: string;
  value: number;
  gross: number;
}) {
  return (
    <div
      className="p-4 rounded-xl"
      style={{
        background: "var(--surface-gradient)",
        backdropFilter: "var(--surface-blur)",
        border: "1px solid rgba(255, 255, 255, 0.10)",
        boxShadow: "var(--surface-shadow)",
      }}
    >
      <div
        className="text-[11px] uppercase"
        style={{
          color: "var(--text-muted)",
          letterSpacing: "0.5px",
          fontFamily: "var(--font-mono)",
        }}
      >
        {label}
      </div>
      <div
        className="text-xl font-semibold mt-1"
        style={{ color: "var(--text-primary)" }}
      >
        {fmt(value)}
      </div>
      <div
        className="text-[11px] mt-0.5"
        style={{ color: "var(--text-muted)" }}
      >
        gross {fmt(gross)}
      </div>
    </div>
  );
}
