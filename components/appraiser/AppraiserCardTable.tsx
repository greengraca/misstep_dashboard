"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Select from "@/components/dashboard/select";
import { FoilStar, LanguageFlag } from "@/components/dashboard/cm-sprite";
import { SetSymbol } from "@/components/dashboard/set-symbol";
import { cleanCardmarketUrl, isCardmarketProductUrl } from "@/lib/appraiser/scryfall-resolve";
import type { AppraiserCard, AppraiserCollection } from "@/lib/appraiser/types";
import { sectionHeader, btnSecondaryClass, btnSecondary } from "./ui";

interface Props {
  collectionId: string;
  collection: AppraiserCollection | undefined;
  cards: AppraiserCard[];
  onCardChanged: () => void;
}

const OFFER_OPTIONS = [5, 10, 15, 20] as const;
const OFFER_SELECT_OPTIONS = OFFER_OPTIONS.map((p) => ({ value: String(p), label: `-${p}%` }));

function eur(n: number | null): string {
  if (n === null || n === undefined) return "--";
  return n.toFixed(2).replace(".", ",") + " €";
}

export default function AppraiserCardTable({ collectionId, collection, cards, onCardChanged }: Props) {
  const [offerPct, setOfferPct] = useState<number>(5);
  const [editingQty, setEditingQty] = useState<string | null>(null);
  const [qtyValue, setQtyValue] = useState("");
  const [bulkExclude, setBulkExclude] = useState<boolean>(false);
  const [bulkThreshold, setBulkThreshold] = useState<number>(1);
  const [bulkRate, setBulkRate] = useState<number>(0);

  // Hydrate bulk settings on collection ID change ONLY — not on every collection
  // update. Otherwise SWR polling would overwrite mid-typing edits in the
  // threshold/rate fields. The debounced PUT (Task 6) is the source of truth
  // from the moment the user starts editing.
  const lastHydratedId = useRef<string | null>(null);
  useEffect(() => {
    if (!collection) return;
    if (lastHydratedId.current === collection._id) return;
    setBulkExclude(collection.bulkExcludeEnabled);
    setBulkThreshold(collection.bulkThreshold);
    setBulkRate(collection.bulkRate);
    lastHydratedId.current = collection._id;
  }, [collection]);

  // Debounced persistence — fires 300ms after the last change to any of the
  // three bulk fields. Skip until hydration has happened (avoids saving the
  // initial useState defaults over the persisted values on mount).
  useEffect(() => {
    if (!collection || lastHydratedId.current !== collection._id) return;
    // Skip if local state still matches the hydrated values — nothing to save.
    if (
      bulkExclude   === collection.bulkExcludeEnabled &&
      bulkThreshold === collection.bulkThreshold &&
      bulkRate      === collection.bulkRate
    ) return;
    const handle = setTimeout(async () => {
      try {
        await fetch(`/api/appraiser/collections/${collectionId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bulkExcludeEnabled: bulkExclude,
            bulkThreshold,
            bulkRate,
          }),
        });
      } catch (err) {
        // Silent failure — user can keep editing; next debounced save will retry.
        console.warn("[appraiser] bulk-settings save failed", err);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [collectionId, collection, bulkExclude, bulkThreshold, bulkRate]);

  const putCard = async (cardId: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/appraiser/collections/${collectionId}/cards/${cardId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (res.ok) onCardChanged();
  };

  const deleteCard = async (cardId: string, name: string) => {
    if (!confirm(`Remove "${name}" from this collection?`)) return;
    await fetch(`/api/appraiser/collections/${collectionId}/cards/${cardId}`, { method: "DELETE" });
    onCardChanged();
  };

  const { mainCards, bulkCards, totalCards, totalFrom, totalTrend, bulkCount, bulkAddOn, offerTotal } = useMemo(() => {
    const isBulk = (c: AppraiserCard) =>
      bulkExclude && (c.trendPrice == null || c.trendPrice < bulkThreshold);
    const mainCards = cards.filter((c) => !isBulk(c));
    const bulkCards = cards.filter((c) =>  isBulk(c));
    const totalCards = cards.reduce((s, c) => s + c.qty, 0);
    const totalFrom  = mainCards.reduce((s, c) => s + (c.fromPrice  ?? 0) * c.qty, 0);
    const totalTrend = mainCards.reduce((s, c) => s + (c.trendPrice ?? 0) * c.qty, 0);
    const bulkCount  = bulkCards.reduce((s, c) => s + c.qty, 0);
    const bulkAddOn  = bulkCount * bulkRate;
    const offerTotal = totalFrom * (1 - offerPct / 100) + bulkAddOn;
    return { mainCards, bulkCards, totalCards, totalFrom, totalTrend, bulkCount, bulkAddOn, offerTotal };
  }, [cards, bulkExclude, bulkThreshold, bulkRate, offerPct]);

  const bulkIds = useMemo(() => new Set(bulkCards.map((c) => c._id)), [bulkCards]);

  const copyAll = async () => {
    const header = `Name\tSet\tCN\tLang\tFoil\tQty\tFrom\tTrend\tOffer -${offerPct}%`;
    const lines = cards.map((c) => [
      c.name, c.set.toUpperCase(), c.collectorNumber, c.language,
      c.foil ? "foil" : "", c.qty,
      eur(c.fromPrice), eur(c.trendPrice),
      eur(c.fromPrice !== null ? c.fromPrice * (1 - offerPct / 100) : null),
    ].join("\t"));
    const summary = [
      "",
      `Total cards: ${totalCards}`,
      `Total From: ${eur(totalFrom)}`,
      `Total Trend: ${eur(totalTrend)}`,
      `Offer -${offerPct}%: ${eur(totalFrom * (1 - offerPct / 100))}`,
    ];
    await navigator.clipboard.writeText([header, ...lines, ...summary].join("\n"));
  };

  if (cards.length === 0) return null;

  const th: React.CSSProperties = {
    textAlign: "left",
    padding: "8px 12px",
    fontSize: 11,
    color: "var(--text-muted)",
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    fontFamily: "var(--font-mono)",
    fontWeight: 600,
    background: "var(--bg-card)",
    borderBottom: "1px solid var(--border)",
  };
  const td: React.CSSProperties = {
    padding: "8px 12px",
    borderTop: "1px solid var(--border)",
    fontSize: 12,
    color: "var(--text-primary)",
    verticalAlign: "middle",
  };

  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid var(--border)", flexWrap: "wrap", gap: 12 }}>
        <h3 style={sectionHeader}>Cards</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 11, color: "var(--text-muted)", flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none" }}>
            <input
              type="checkbox"
              checked={bulkExclude}
              onChange={(e) => setBulkExclude(e.target.checked)}
              style={{ accentColor: "var(--accent)" }}
            />
            Exclude bulk
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 4, opacity: bulkExclude ? 1 : 0.5 }}>
            Trend &lt;
            <input
              type="number"
              min={0}
              max={1000}
              step={0.1}
              value={bulkThreshold}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (Number.isFinite(v) && v >= 0) setBulkThreshold(v);
              }}
              disabled={!bulkExclude}
              className="appraiser-field"
              style={{
                width: 60,
                padding: "2px 6px",
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                color: "var(--text-primary)",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
              }}
            />
            €
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 4, opacity: bulkExclude ? 1 : 0.5 }}>
            Bulk @
            <input
              type="number"
              min={0}
              max={bulkThreshold}
              step={0.01}
              value={bulkRate}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (Number.isFinite(v) && v >= 0 && v <= bulkThreshold) setBulkRate(v);
              }}
              disabled={!bulkExclude}
              className="appraiser-field"
              style={{
                width: 60,
                padding: "2px 6px",
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                color: "var(--text-primary)",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
              }}
            />
            €/ea
          </label>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            Offer
            <Select
              value={String(offerPct)}
              onChange={(v) => setOfferPct(Number(v))}
              options={OFFER_SELECT_OPTIONS}
              size="sm"
            />
          </span>
        </div>
      </div>

      {/* Summary bar (moved to top: totals + offer tiers always visible) */}
      <div style={{ display: "flex", gap: 14, padding: "10px 14px", borderBottom: "1px solid var(--border)", flexWrap: "wrap", alignItems: "center", fontSize: 12, background: "var(--bg-card)" }}>
        <span style={{ color: "var(--text-muted)" }}>{totalCards} card{totalCards !== 1 ? "s" : ""}</span>
        <span>From: <strong style={{ fontFamily: "var(--font-mono)" }}>{eur(totalFrom)}</strong></span>
        <span style={{ color: "var(--text-secondary)" }}>Trend: <strong style={{ fontFamily: "var(--font-mono)" }}>{eur(totalTrend)}</strong></span>
        {OFFER_OPTIONS.map((p) => (
          <span key={p} style={{ color: p === offerPct ? "var(--accent)" : "var(--text-muted)" }}>
            -{p}%: <strong style={{ fontFamily: "var(--font-mono)" }}>{eur(totalFrom * (1 - p / 100))}</strong>
          </span>
        ))}
        <button
          onClick={copyAll}
          className={btnSecondaryClass}
          style={{ ...btnSecondary, marginLeft: "auto" }}
        >
          Copy
        </button>
      </div>

      {bulkExclude && bulkCards.length > 0 && (
        <div style={{ display: "flex", gap: 14, padding: "8px 14px 10px 14px", borderBottom: "1px solid var(--border)", flexWrap: "wrap", alignItems: "center", fontSize: 11, color: "var(--text-muted)", background: "var(--bg-card)" }}>
          <span>↳ excludes {bulkCount} bulk card{bulkCount !== 1 ? "s" : ""} (Trend &lt; €{bulkThreshold.toFixed(2).replace(".", ",")})</span>
          {bulkRate > 0 && (
            <span>
              Bulk add-on: {bulkCount} × €{bulkRate.toFixed(2).replace(".", ",")} ={" "}
              <strong style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{eur(bulkAddOn)}</strong>
            </span>
          )}
          <span style={{ marginLeft: "auto", color: "var(--accent)" }}>
            Offer total: <strong style={{ fontFamily: "var(--font-mono)" }}>{eur(offerTotal)}</strong>
          </span>
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Name</th>
              <th style={th}>Set / CN</th>
              <th style={th}>Lang</th>
              <th style={th}>Foil</th>
              <th style={th}>Qty</th>
              <th style={{ ...th, textAlign: "right" }}>From</th>
              <th style={{ ...th, textAlign: "right" }}>Trend</th>
              <th style={{ ...th, textAlign: "right" }}>Offer -{offerPct}%</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {cards.map((c) => (
              <tr
                key={c._id}
                className="hover:bg-[var(--bg-card-hover)] transition-colors"
                style={bulkIds.has(c._id) ? { opacity: 0.4 } : undefined}
              >
                <td style={td}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {c.imageUrl && <img src={c.imageUrl} alt="" style={{ width: 22, height: 30, objectFit: "cover", borderRadius: 3 }} />}
                    {c.cardmarketUrl ? (
                      <a
                        href={(() => {
                          const clean = cleanCardmarketUrl(c.cardmarketUrl);
                          // Only product URLs have a foil mode to toggle. Appending
                          // ?isFoil=Y to a search URL breaks it (the search page ignores it).
                          if (c.foil && isCardmarketProductUrl(clean)) {
                            return `${clean}${clean.includes("?") ? "&" : "?"}isFoil=Y`;
                          }
                          return clean;
                        })()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                        style={{ color: "var(--accent)", textDecoration: "none" }}
                        title={isCardmarketProductUrl(c.cardmarketUrl)
                          ? "Open on Cardmarket — your extension will scrape prices"
                          : "Scryfall didn't have a direct Cardmarket product link — opens a CM search instead"}
                      >
                        {c.name} ↗
                      </a>
                    ) : c.name}
                  </div>
                </td>
                <td style={td}>
                  {c.set ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <SetSymbol code={c.set} size={16} />
                      {c.collectorNumber && (
                        <span style={{ color: "var(--text-muted)" }}>#{c.collectorNumber}</span>
                      )}
                    </span>
                  ) : "?"}
                </td>
                <td style={td}>
                  <LanguageFlag language={c.language} />
                </td>
                <td style={td}>
                  <button
                    onClick={() => putCard(c._id, { foil: !c.foil })}
                    title={c.foil ? "Click to un-foil" : "Click to mark foil"}
                    style={{
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                      lineHeight: 0,
                      verticalAlign: "middle",
                    }}
                  >
                    {c.foil ? <FoilStar /> : <span style={{ color: "var(--text-muted)", lineHeight: 1, fontSize: 12 }}>—</span>}
                  </button>
                </td>
                <td style={td}>
                  {editingQty === c._id ? (
                    <input
                      className="appraiser-field"
                      type="number"
                      min={1}
                      value={qtyValue}
                      onChange={(e) => setQtyValue(e.target.value)}
                      onBlur={async () => {
                        const q = parseInt(qtyValue, 10);
                        if (q > 0) await putCard(c._id, { qty: q });
                        setEditingQty(null);
                      }}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      autoFocus
                      style={{
                        width: 48,
                        padding: "2px 6px",
                        background: "var(--bg-card)",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        color: "var(--text-primary)",
                        fontSize: 12,
                      }}
                    />
                  ) : (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span
                        onClick={() => { setEditingQty(c._id); setQtyValue(String(c.qty)); }}
                        title="Click to edit quantity"
                        className="hover:bg-[var(--bg-hover)] transition-colors"
                        style={{
                          cursor: "pointer",
                          padding: "2px 6px",
                          borderRadius: 4,
                          borderBottom: "1px dashed var(--text-muted)",
                        }}
                      >
                        {c.qty}
                      </span>
                      {bulkIds.has(c._id) && (
                        <span
                          title={`Trend < €${bulkThreshold.toFixed(2).replace(".", ",")} — excluded from main totals`}
                          style={{
                            fontSize: 9,
                            padding: "1px 5px",
                            borderRadius: 3,
                            background: "rgba(255,255,255,0.06)",
                            color: "var(--text-muted)",
                            fontFamily: "var(--font-mono)",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                          }}
                        >
                          bulk
                        </span>
                      )}
                    </span>
                  )}
                </td>
                <td style={{ ...td, textAlign: "right", fontFamily: "var(--font-mono)" }}>{eur(c.fromPrice)}</td>
                <td
                  style={{ ...td, textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}
                  title={c.trendPrice != null && c.trend_source
                    ? `${c.trend_source === "cm_ext" ? "ext" : "scryfall"} · ${c.trend_updated_at ? new Date(c.trend_updated_at).toLocaleDateString() : "?"}${c.trend_ascending ? " · from > trend (rising / thin supply)" : ""}`
                    : undefined}
                >
                  {eur(c.trendPrice)}
                  {c.trend_source === "cm_ext" && (
                    <span style={{ marginLeft: 4, fontSize: c.trend_ascending ? 10 : 9, color: "var(--accent)", verticalAlign: "top" }}>
                      {c.trend_ascending ? "↑" : "•"}
                    </span>
                  )}
                </td>
                <td style={{ ...td, textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--accent)", fontWeight: 600 }}>
                  {eur(c.fromPrice !== null ? c.fromPrice * (1 - offerPct / 100) : null)}
                </td>
                <td style={{ ...td, textAlign: "right" }}>
                  <button
                    onClick={() => deleteCard(c._id, c.name)}
                    title="Remove card"
                    className="hover:text-[var(--error)] transition-colors"
                    style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "2px 4px" }}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}
