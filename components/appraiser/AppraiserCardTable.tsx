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

// Relative time string for tooltip provenance ("scraped 2h ago", "scraped 3d ago").
function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "";
  if (ms < 60 * 60 * 1000) {
    const mins = Math.max(1, Math.round(ms / 60000));
    return `${mins}m ago`;
  }
  if (ms < 24 * 60 * 60 * 1000) {
    return `${Math.round(ms / 3600000)}h ago`;
  }
  return `${Math.round(ms / 86400000)}d ago`;
}

const VELOCITY_TIER_COLOR: Record<"fast" | "medium" | "slow" | "unknown", string> = {
  fast: "var(--success)",
  medium: "var(--warning)",
  slow: "var(--error)",
  unknown: "var(--text-muted)",
};

// Single source of truth for the Velocity tooltip — used by both the cell
// content (when expanded) and the bare cell (when collapsed). `mode` only
// affects wording on the stale variant ("click to refresh" vs "expand
// column to refresh").
function buildVelocityTooltip(c: AppraiserCard, mode: "expanded" | "collapsed"): string {
  const v = c.velocity;
  const STALE_MS = 3 * 24 * 60 * 60 * 1000;
  const scrapedAtMs = v?.chartScrapedAt ? new Date(v.chartScrapedAt).getTime() : null;
  const isStale = scrapedAtMs != null && Date.now() - scrapedAtMs >= STALE_MS;
  if (!v) return "No sales data — click the card name to scrape its Cardmarket page";
  if (isStale) {
    const action = mode === "collapsed" ? "expand column to refresh" : "click to refresh";
    return `Chart scraped ${timeAgo(v.chartScrapedAt) || "?"} · ${v.variant}\nToo stale to trust velocity — ${action}`;
  }
  if (v.tier === "unknown") return "No sales data — visit the Cardmarket page to populate";
  const lastSaleStr = v.daysSinceLastSale == null
    ? "no sales in window"
    : v.daysSinceLastSale === 0
      ? "last sale today"
      : `last sale ${v.daysSinceLastSale}d ago`;
  const interp = v.tier === "slow"
    ? "Slow mover — capital lock-up risk"
    : "(1+ sale per active day, volume not tracked)";
  return `Active ${v.activeDays} of last ${v.windowDays} days · ${lastSaleStr}\n${interp}\nChart scraped ${timeAgo(v.chartScrapedAt) || "?"} · ${v.variant}`;
}

export default function AppraiserCardTable({ collectionId, collection, cards, onCardChanged }: Props) {
  const [offerPct, setOfferPct] = useState<number>(5);
  const [editingQty, setEditingQty] = useState<string | null>(null);
  const [qtyValue, setQtyValue] = useState("");
  const [bulkExclude, setBulkExclude] = useState<boolean>(true);
  const [bulkThreshold, setBulkThreshold] = useState<number>(1);
  const [bulkRate, setBulkRate] = useState<number>(0);
  const [undercutEnabled, setUndercutEnabled] = useState<boolean>(false);
  const [undercutPercent, setUndercutPercent] = useState<number>(20);
  const [velocityCollapsed, setVelocityCollapsed] = useState<boolean>(true);

  // Hydrate Velocity-column collapsed state from localStorage on mount.
  // Default is collapsed because the column is opt-in detail, not core data.
  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("appraiser_velocityCollapsed") : null;
    if (stored != null) setVelocityCollapsed(stored !== "0");
  }, []);
  const toggleVelocityCollapsed = () => {
    const next = !velocityCollapsed;
    setVelocityCollapsed(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("appraiser_velocityCollapsed", next ? "1" : "0");
    }
  };

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
    setUndercutEnabled(collection.undercutEnabled);
    setUndercutPercent(collection.undercutPercent);
    lastHydratedId.current = collection._id;
  }, [collection]);

  // Debounced persistence — fires 300ms after the last change to any of the
  // three bulk fields. Skip until hydration has happened (avoids saving the
  // initial useState defaults over the persisted values on mount).
  useEffect(() => {
    if (!collection || lastHydratedId.current !== collection._id) return;
    // Skip if local state still matches the hydrated values — nothing to save.
    if (
      bulkExclude       === collection.bulkExcludeEnabled &&
      bulkThreshold     === collection.bulkThreshold &&
      bulkRate          === collection.bulkRate &&
      undercutEnabled   === collection.undercutEnabled &&
      undercutPercent   === collection.undercutPercent
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
            undercutEnabled,
            undercutPercent,
          }),
        });
      } catch (err) {
        // Silent failure — user can keep editing; next debounced save will retry.
        console.warn("[appraiser] bulk-settings save failed", err);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [collectionId, collection, bulkExclude, bulkThreshold, bulkRate, undercutEnabled, undercutPercent]);

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

  // Undercut models the resale haircut on TREND only — buyers undercut my
  // listings, so what I'd actually realize is N% below trend. From price
  // is what I'm offering / paying so it stays raw; the offer math uses raw
  // From too.
  // Floor: when undercut is on, the discounted trend can't drop below `from`
  // (the lowest current ask) — a real seller would just match `from`, so
  // that's the actual realizable price.
  const undercutFactor = undercutEnabled ? 1 - undercutPercent / 100 : 1;
  const displayTrend = (c: AppraiserCard): number | null => {
    if (c.trendPrice == null) return null;
    const scaled = c.trendPrice * undercutFactor;
    if (undercutEnabled && c.fromPrice != null && scaled < c.fromPrice) {
      return c.fromPrice;
    }
    return scaled;
  };
  const isFlooredByFrom = (c: AppraiserCard): boolean =>
    undercutEnabled &&
    c.trendPrice != null &&
    c.fromPrice != null &&
    c.trendPrice * undercutFactor < c.fromPrice;

  const { mainCards, bulkCards, excludedCards, displayCards, totalCards, totalFrom, totalTrend, bulkCount, bulkAddOn, excludedCount, offerTotal } = useMemo(() => {
    const isBulk = (c: AppraiserCard) =>
      bulkExclude && (c.trendPrice == null || c.trendPrice < bulkThreshold);
    const byTrendDesc = (a: AppraiserCard, b: AppraiserCard) =>
      (b.trendPrice ?? 0) - (a.trendPrice ?? 0);
    // Excluded cards are split off FIRST — they don't enter bulk classification
    // or any totals/offer math. Kept visible at the very bottom for reversal.
    const excludedCards = cards.filter((c) => c.excluded).sort(byTrendDesc);
    const inPlayCards = cards.filter((c) => !c.excluded);
    const mainCards = inPlayCards.filter((c) => !isBulk(c)).sort(byTrendDesc);
    const bulkCards = inPlayCards.filter((c) =>  isBulk(c)).sort(byTrendDesc);
    const displayCards = [...mainCards, ...bulkCards, ...excludedCards];
    const totalCards = cards.reduce((s, c) => s + c.qty, 0);
    const totalFrom  = mainCards.reduce((s, c) => s + (c.fromPrice  ?? 0) * c.qty, 0);
    const totalTrend = mainCards.reduce((s, c) => s + (displayTrend(c) ?? 0) * c.qty, 0);
    const bulkCount  = bulkCards.reduce((s, c) => s + c.qty, 0);
    const bulkAddOn  = bulkCount * bulkRate;
    const excludedCount = excludedCards.reduce((s, c) => s + c.qty, 0);
    const offerTotal = totalFrom * (1 - offerPct / 100) + bulkAddOn;
    return { mainCards, bulkCards, excludedCards, displayCards, totalCards, totalFrom, totalTrend, bulkCount, bulkAddOn, excludedCount, offerTotal };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- displayTrend's inputs (undercutEnabled, undercutPercent) are already in deps
  }, [cards, bulkExclude, bulkThreshold, bulkRate, offerPct, undercutEnabled, undercutPercent]);

  const bulkIds = useMemo(() => new Set(bulkCards.map((c) => c._id)), [bulkCards]);
  const excludedIds = useMemo(() => new Set(excludedCards.map((c) => c._id)), [excludedCards]);

  const copyAll = async () => {
    const header = `Name\tSet\tCN\tLang\tFoil\tQty\tFrom\tTrend\tOffer -${offerPct}%`;
    const formatRow = (c: AppraiserCard) => [
      c.name, c.set.toUpperCase(), c.collectorNumber, c.language,
      c.foil ? "foil" : "", c.qty,
      eur(c.fromPrice),
      eur(displayTrend(c)),
      eur(c.fromPrice !== null ? c.fromPrice * (1 - offerPct / 100) : null),
    ].join("\t");
    const mainLines = mainCards.map(formatRow);
    const bulkBlock =
      bulkExclude && bulkCards.length > 0
        ? [
            "",
            `# Bulk (Trend < €${bulkThreshold.toFixed(2).replace(".", ",")}) — excluded from offer math`,
            ...bulkCards.map(formatRow),
          ]
        : [];
    const skippedBlock =
      excludedCards.length > 0
        ? [
            "",
            `# Skipped — not in offer math`,
            ...excludedCards.map(formatRow),
          ]
        : [];
    const splitBits = [
      bulkExclude && bulkCards.length > 0 ? `${totalCards - bulkCount - excludedCount} main` : null,
      bulkExclude && bulkCards.length > 0 ? `${bulkCount} bulk` : null,
      excludedCount > 0 ? `${excludedCount} skipped` : null,
    ].filter(Boolean);
    const totalSuffix = splitBits.length > 0 ? ` (${splitBits.join(" + ")})` : "";
    const summary = [
      "",
      `Total cards: ${totalCards}${totalSuffix}`,
      `Total From${bulkExclude && bulkCards.length > 0 ? " (main)" : ""}: ${eur(totalFrom)}`,
      `Total Trend${bulkExclude && bulkCards.length > 0 ? " (main)" : ""}${undercutEnabled ? ` (-${undercutPercent}%)` : ""}: ${eur(totalTrend)}`,
      ...(bulkExclude && bulkRate > 0 && bulkCount > 0
        ? [`Bulk add-on: ${bulkCount} × ${eur(bulkRate)} = ${eur(bulkAddOn)}`]
        : []),
      `Offer -${offerPct}%: ${eur(offerTotal)}`,
    ];
    await navigator.clipboard.writeText([header, ...mainLines, ...bulkBlock, ...skippedBlock, ...summary].join("\n"));
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
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              cursor: "pointer",
              userSelect: "none",
              color: undercutEnabled ? "var(--error)" : undefined,
            }}
            title={undercutEnabled ? `Undercut -${undercutPercent}% applied to Trend values` : undefined}
          >
            <input
              type="checkbox"
              checked={undercutEnabled}
              onChange={(e) => setUndercutEnabled(e.target.checked)}
              style={{ accentColor: undercutEnabled ? "var(--error)" : "var(--accent)" }}
            />
            Undercut
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={undercutPercent}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (Number.isFinite(v) && v >= 0 && v <= 100) setUndercutPercent(v);
              }}
              disabled={!undercutEnabled}
              className="appraiser-field"
              style={{
                width: 44,
                padding: "2px 6px",
                background: undercutEnabled ? "var(--error-light)" : "var(--bg-card)",
                border: `1px solid ${undercutEnabled ? "var(--error-border)" : "var(--border)"}`,
                borderRadius: 6,
                color: undercutEnabled ? "var(--error)" : "var(--text-primary)",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                opacity: undercutEnabled ? 1 : 0.5,
              }}
            />
            %
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
          <button
            onClick={copyAll}
            className={btnSecondaryClass}
            style={btnSecondary}
          >
            Copy
          </button>
        </div>
      </div>

      {/* Summary bar (moved to top: totals + offer tiers always visible) */}
      <div style={{ display: "flex", gap: 14, padding: "10px 14px", borderBottom: "1px solid var(--border)", flexWrap: "wrap", alignItems: "center", fontSize: 12, background: "var(--bg-card)" }}>
        <span style={{ color: "var(--text-muted)" }}>
          {totalCards} card{totalCards !== 1 ? "s" : ""}
          {excludedCount > 0 && ` (${excludedCount} skipped)`}
        </span>
        <span>From: <strong style={{ fontFamily: "var(--font-mono)" }}>{eur(totalFrom)}</strong></span>
        <span
          style={{ color: undercutEnabled ? "var(--error)" : "var(--text-secondary)" }}
          title={undercutEnabled ? `Undercut -${undercutPercent}% applied to Trend` : undefined}
        >
          Trend{undercutEnabled ? ` -${undercutPercent}%` : ""}: <strong style={{ fontFamily: "var(--font-mono)" }}>{eur(totalTrend)}</strong>
        </span>
        {OFFER_OPTIONS.map((p) => (
          <span key={p} style={{ color: p === offerPct ? "var(--accent)" : "var(--text-muted)" }}>
            -{p}%: <strong style={{ fontFamily: "var(--font-mono)" }}>{eur(totalFrom * (1 - p / 100))}</strong>
          </span>
        ))}
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

      {excludedCards.length > 0 && (
        <div style={{ display: "flex", gap: 14, padding: "8px 14px 10px 14px", borderBottom: "1px solid var(--border)", flexWrap: "wrap", alignItems: "center", fontSize: 11, color: "var(--text-muted)", background: "var(--bg-card)" }}>
          <span>↳ {excludedCount} skipped card{excludedCount !== 1 ? "s" : ""} — not in totals or offer math</span>
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
              <th
                style={{
                  ...th,
                  textAlign: "center",
                  cursor: "pointer",
                  padding: velocityCollapsed ? "8px 4px" : "8px 12px",
                  width: velocityCollapsed ? 16 : undefined,
                  userSelect: "none",
                }}
                onClick={toggleVelocityCollapsed}
                className="hover:bg-[var(--bg-card-hover)] transition-colors"
                title={velocityCollapsed ? "Expand Velocity — sales-cadence column" : "Collapse Velocity column"}
              >
                {velocityCollapsed ? (
                  <span style={{ color: "var(--text-muted)" }}>&lt;</span>
                ) : (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    Velocity
                    <span style={{ color: "var(--text-muted)", opacity: 0.7 }}>&gt;</span>
                  </span>
                )}
              </th>
              <th style={{ ...th, textAlign: "right" }}>From</th>
              <th style={{ ...th, textAlign: "right" }}>Trend</th>
              <th style={{ ...th, textAlign: "right" }}>Offer -{offerPct}%</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {displayCards.map((c) => (
              <tr
                key={c._id}
                className="hover:bg-[var(--bg-card-hover)] transition-colors"
                style={
                  excludedIds.has(c._id)
                    ? { opacity: 0.25 }
                    : bulkIds.has(c._id)
                      ? { opacity: 0.4 }
                      : undefined
                }
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
                      {excludedIds.has(c._id) && (
                        <span
                          title="Skipped — not in totals or offer math. Click ↑ to restore."
                          style={{
                            fontSize: 9,
                            padding: "1px 5px",
                            borderRadius: 3,
                            background: "rgba(252, 165, 165, 0.10)",
                            color: "var(--error)",
                            fontFamily: "var(--font-mono)",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                          }}
                        >
                          skipped
                        </span>
                      )}
                    </span>
                  )}
                </td>
                <td
                  style={{
                    ...td,
                    textAlign: "center",
                    padding: velocityCollapsed ? "8px 4px" : td.padding,
                    width: velocityCollapsed ? 16 : undefined,
                    cursor: velocityCollapsed ? "pointer" : undefined,
                  }}
                  onClick={velocityCollapsed ? toggleVelocityCollapsed : undefined}
                  className={velocityCollapsed ? "hover:bg-[var(--bg-card-hover)] transition-colors" : undefined}
                  title={velocityCollapsed ? buildVelocityTooltip(c, "collapsed") : undefined}
                >
                  {velocityCollapsed ? null : (() => {
                    const v = c.velocity;
                    const STALE_MS = 3 * 24 * 60 * 60 * 1000;
                    const scrapedAtMs = v?.chartScrapedAt ? new Date(v.chartScrapedAt).getTime() : null;
                    const isStale = scrapedAtMs != null && Date.now() - scrapedAtMs >= STALE_MS;
                    const tooltip = buildVelocityTooltip(c, "expanded");
                    const dotColor = !v || isStale ? "var(--text-muted)" : VELOCITY_TIER_COLOR[v.tier];

                    const dot = (
                      <span style={{
                        display: "inline-block",
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: dotColor,
                      }} />
                    );

                    // Expanded: never-scraped (quiet dot, no number).
                    if (!v) {
                      return (
                        <span
                          title={tooltip}
                          style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--text-muted)", opacity: 0.6 }}
                        >
                          {dot}
                        </span>
                      );
                    }

                    // Expanded: stale → Rescrape link.
                    if (isStale) {
                      const inner = (
                        <>
                          {dot}
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>Rescrape</span>
                        </>
                      );
                      if (c.cardmarketUrl) {
                        const clean = cleanCardmarketUrl(c.cardmarketUrl);
                        const href = c.foil && isCardmarketProductUrl(clean)
                          ? `${clean}${clean.includes("?") ? "&" : "?"}isFoil=Y`
                          : clean;
                        return (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={tooltip}
                            className="hover:text-[var(--accent)] transition-colors"
                            style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--text-muted)", textDecoration: "none" }}
                          >
                            {inner}
                          </a>
                        );
                      }
                      return (
                        <span
                          title={tooltip}
                          style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--text-muted)" }}
                        >
                          {inner}
                        </span>
                      );
                    }

                    // Expanded: fresh tier dot + N/M.
                    return (
                      <span
                        title={tooltip}
                        style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                      >
                        {dot}
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
                          {v.tier === "unknown" ? "?" : `${v.activeDays}/${v.windowDays}`}
                        </span>
                      </span>
                    );
                  })()}
                </td>
                <td
                  style={{ ...td, textAlign: "right", fontFamily: "var(--font-mono)" }}
                  title={c.fromPrice != null && c.from_source === "cm_ext"
                    ? `ext · ${c.from_updated_at ? new Date(c.from_updated_at).toLocaleDateString() : "?"}`
                    : undefined}
                >
                  {eur(c.fromPrice)}
                </td>
                <td
                  style={{
                    ...td,
                    textAlign: "right",
                    fontFamily: "var(--font-mono)",
                    color: undercutEnabled ? "var(--error)" : "var(--text-secondary)",
                  }}
                  title={c.trendPrice != null && c.trend_source
                    ? `${c.trend_source === "cm_ext" ? "ext" : "scryfall"} · ${c.trend_updated_at ? new Date(c.trend_updated_at).toLocaleDateString() : "?"}${c.trend_ascending ? " · from > trend (rising / thin supply)" : ""}${undercutEnabled ? ` · undercut -${undercutPercent}%` : ""}${isFlooredByFrom(c) ? " · floored by from" : ""}`
                    : undefined}
                >
                  {eur(displayTrend(c))}
                  {c.trend_source === "cm_ext" && (
                    <span style={{ marginLeft: 4, fontSize: c.trend_ascending ? 10 : 9, color: "var(--accent)", verticalAlign: "top" }}>
                      {c.trend_ascending ? "↑" : "•"}
                    </span>
                  )}
                </td>
                <td style={{ ...td, textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--accent)", fontWeight: 600 }}>
                  {eur(c.fromPrice !== null ? c.fromPrice * (1 - offerPct / 100) : null)}
                </td>
                <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                  <button
                    onClick={() => putCard(c._id, { excluded: !c.excluded })}
                    title={c.excluded ? "Restore to main list" : "Skip — push to bottom, drop from totals & offer"}
                    className="hover:text-[var(--accent)] transition-colors"
                    style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "2px 4px", marginRight: 2 }}
                  >
                    {c.excluded ? "↑" : "↓"}
                  </button>
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
