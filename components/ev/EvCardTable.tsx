"use client";

import { useState } from "react";
import DataTable, { type Column } from "@/components/dashboard/data-table";
import type { EvTopCard } from "@/lib/types";
import { ChevronDown, ChevronRight } from "lucide-react";

// Cardmarket slug pattern matches StockTable.tsx — collapse non-alphanumerics.
function cardmarketSlug(input: string): string {
  return input.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function cardmarketUrl(setName: string | undefined, cardName: string, isFoil: boolean): string | null {
  if (!setName) return null;
  const base = `https://www.cardmarket.com/en/Magic/Products/Singles/${cardmarketSlug(setName)}/${cardmarketSlug(cardName)}`;
  return isFoil ? `${base}?isFoil=Y` : base;
}

interface EvCardTableProps {
  cards: EvTopCard[];
  isLoading: boolean;
  title?: string;
  defaultSortKey?: string;
  defaultExpanded?: boolean;
  /** Map of set_code → set name, used to build per-card Cardmarket links. */
  setNames?: Record<string, string>;
}

export default function EvCardTable({ cards, isLoading, title = "Top EV Cards", defaultSortKey = "ev_contribution", defaultExpanded = false, setNames }: EvCardTableProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  if (isLoading) {
    return <div className="skeleton" style={{ height: "300px" }} />;
  }

  const columns: Column<EvTopCard & Record<string, unknown>>[] = [
    {
      key: "name",
      label: "Card",
      sortable: true,
      render: (row) => {
        const cmUrl = cardmarketUrl(setNames?.[row.set], row.name, row.is_foil);
        return (
        <div className="flex items-center gap-2">
          {row.image_uri && (
            <img
              src={row.image_uri}
              alt={row.name}
              className="w-8 h-11 rounded-sm object-cover"
              loading="lazy"
            />
          )}
          <div>
            {cmUrl ? (
              <a
                href={cmUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium no-underline hover:underline transition-colors"
                style={{ color: "var(--text-primary)" }}
                title="Open on Cardmarket"
                onClick={(e) => e.stopPropagation()}
              >
                {row.name}
              </a>
            ) : (
              <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                {row.name}
              </p>
            )}
            <a
              href={`https://scryfall.com/card/${row.set === "mb2-list" ? "plst" : row.set}/${row.collector_number}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs hover:underline"
              style={{ color: "var(--text-muted)" }}
              onClick={(e) => e.stopPropagation()}
            >
              #{row.collector_number}
              {row.is_foil && (
                <span className="ml-1.5" style={{ color: "var(--accent)" }}>foil</span>
              )}
            </a>
          </div>
        </div>
        );
      },
    },
    {
      key: "rarity",
      label: "Rarity",
      sortable: true,
      render: (row) => (
        <span
          className="text-xs px-2 py-0.5 rounded-full capitalize"
          style={{
            background:
              row.rarity === "mythic"
                ? "rgba(239, 68, 68, 0.15)"
                : row.rarity === "rare"
                  ? "rgba(234, 179, 8, 0.15)"
                  : "rgba(255, 255, 255, 0.05)",
            color:
              row.rarity === "mythic"
                ? "#ef4444"
                : row.rarity === "rare"
                  ? "#eab308"
                  : "var(--text-muted)",
          }}
        >
          {row.rarity}
        </span>
      ),
    },
    {
      key: "treatment",
      label: "Treatment",
      sortable: true,
      render: (row) => (
        <span className="text-xs capitalize" style={{ color: "var(--text-secondary)" }}>
          {row.treatment.replace(/_/g, " ")}
        </span>
      ),
    },
    {
      key: "price",
      label: "Price",
      sortable: true,
      sortValue: (row) => row.price,
      className: "text-right",
      render: (row) => (
        <span style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
          &euro;{row.price.toFixed(2)}
        </span>
      ),
    },
    {
      key: "pull_rate_per_box",
      label: "Pulls/Box",
      sortable: true,
      sortValue: (row) => row.pull_rate_per_box,
      className: "text-right",
      render: (row) => (
        <span
          style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}
          title={row.pull_rate_per_box.toFixed(4)}
        >
          {row.pull_rate_per_box.toFixed(2)}
        </span>
      ),
    },
    {
      key: "ev_contribution",
      label: "EV",
      sortable: true,
      sortValue: (row) => row.ev_contribution,
      className: "text-right",
      render: (row) => (
        <span
          style={{
            color: "var(--accent)",
            fontFamily: "var(--font-mono)",
            fontWeight: 600,
          }}
        >
          &euro;{row.ev_contribution.toFixed(2)}
        </span>
      ),
    },
  ];

  const data = cards.map((c) => ({ ...c } as EvTopCard & Record<string, unknown>));

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left mb-3"
        style={{ color: "var(--text-primary)" }}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {cards.length} cards
        </span>
      </button>
      {!expanded ? null : <DataTable
        columns={columns}
        data={data}
        keyField="uid"
        emptyMessage="No cards with EV above sift floor"
        defaultSortKey={defaultSortKey}
        defaultSortDir="desc"
        rowHover
        renderMobileCard={(row) => (
          <div className="flex items-center justify-between gap-2 py-2 px-1">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {row.image_uri && (
                <img
                  src={row.image_uri}
                  alt={row.name}
                  className="w-6 h-8 rounded-sm shrink-0"
                />
              )}
              <div className="min-w-0">
                <p
                  className="text-sm truncate"
                  style={{ color: "var(--text-primary)" }}
                >
                  {row.name}
                </p>
                <p
                  className="text-xs truncate"
                  style={{ color: "var(--text-muted)" }}
                >
                  {row.rarity} &middot; {row.treatment.replace(/_/g, " ")}
                </p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p style={{ color: "var(--accent)", fontFamily: "var(--font-mono)", fontSize: "13px" }}>
                &euro;{row.ev_contribution.toFixed(2)}
              </p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                &euro;{row.price.toFixed(2)} &times; {row.pull_rate_per_box.toFixed(2)}
              </p>
            </div>
          </div>
        )}
      />}
    </div>
  );
}
