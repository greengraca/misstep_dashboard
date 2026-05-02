"use client";

import { useState, useEffect, useMemo, useRef, useTransition } from "react";
import Select from "@/components/dashboard/select";
import Modal from "@/components/dashboard/modal";
import { FoilStar, LanguageFlag } from "@/components/dashboard/cm-sprite";
import { SetSymbol } from "@/components/dashboard/set-symbol";
import { cleanCardmarketUrl, isCardmarketProductUrl } from "@/lib/appraiser/scryfall-resolve";
import type { AppraiserCard, AppraiserCollection } from "@/lib/appraiser/types";
import { sectionHeader, btnSecondaryClass, btnSecondary, btnPrimaryClass, btnPrimary, inputClass, inputStyle } from "./ui";

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

interface OverrideListEntry {
  set: string;
  collectorNumber: string;
  cardmarket_id: number;
  updatedAt: string;
  sampleName: string | null;
  sampleSetName: string | null;
  sampleImageUrl: string | null;
  sampleFoil: boolean | null;
  usageCount: number;
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
  const [idOverrideTarget, setIdOverrideTarget] = useState<AppraiserCard | null>(null);
  const [idOverrideInput, setIdOverrideInput] = useState("");
  const [idOverrideError, setIdOverrideError] = useState("");
  const [idOverrideSubmitting, setIdOverrideSubmitting] = useState(false);
  const [overrideManagerOpen, setOverrideManagerOpen] = useState(false);
  const [overrideManagerList, setOverrideManagerList] = useState<OverrideListEntry[] | null>(null);
  const [overrideManagerLoading, setOverrideManagerLoading] = useState(false);
  const [deletingOverrideKey, setDeletingOverrideKey] = useState<string | null>(null);
  // Edit-IDs mode is opt-in: cards with a working cardmarket_id only expose
  // the "edit ID" button when the user explicitly enables this. Per-session
  // (no persistence) — it's a transient repair tool, not a default-on view.
  const [editIdsEnabled, setEditIdsEnabled] = useState<boolean>(false);
  // useTransition lets React schedule the table re-render as a non-urgent
  // update — the chevron flips instantly, the (expensive) per-row reconciliation
  // happens during idle frames instead of blocking the click. Without this,
  // a large collection makes the toggle freeze the UI for seconds.
  const [, startVelocityTransition] = useTransition();

  // Hydrate Velocity-column collapsed state from localStorage on mount.
  // Default is collapsed because the column is opt-in detail, not core data.
  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("appraiser_velocityCollapsed") : null;
    if (stored != null) setVelocityCollapsed(stored !== "0");
  }, []);
  const toggleVelocityCollapsed = () => {
    const next = !velocityCollapsed;
    if (typeof window !== "undefined") {
      localStorage.setItem("appraiser_velocityCollapsed", next ? "1" : "0");
    }
    startVelocityTransition(() => setVelocityCollapsed(next));
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

  // Manual Cardmarket-ID override flow. Used for printings where Scryfall
  // didn't know the right idProduct (PLST cards, niche promos, etc.) — the
  // user pastes a CM URL or product number and we propagate it to every
  // appraiser card with the same `{set, collectorNumber}` across all
  // collections, plus persist for future imports of the same printing.
  const openIdOverride = (c: AppraiserCard) => {
    setIdOverrideTarget(c);
    setIdOverrideInput("");
    setIdOverrideError("");
  };
  const closeIdOverride = () => {
    setIdOverrideTarget(null);
    setIdOverrideInput("");
    setIdOverrideError("");
  };
  const openOverrideManager = async () => {
    setOverrideManagerOpen(true);
    setOverrideManagerLoading(true);
    try {
      const res = await fetch("/api/appraiser/cm-overrides");
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setOverrideManagerList(Array.isArray(data?.overrides) ? data.overrides : []);
    } catch {
      setOverrideManagerList([]);
    } finally {
      setOverrideManagerLoading(false);
    }
  };
  const closeOverrideManager = () => {
    setOverrideManagerOpen(false);
    setOverrideManagerList(null);
  };
  const deleteOverride = async (set: string, collectorNumber: string) => {
    const key = `${set}:${collectorNumber}`;
    if (deletingOverrideKey) return;
    if (!confirm(`Remove the manual Cardmarket-ID override for ${set.toUpperCase()} #${collectorNumber}?\n\nThis clears the ID from every card with this set + collector number, so the "set ID" button reappears and you can re-add the override.`)) return;
    setDeletingOverrideKey(key);
    try {
      const res = await fetch("/api/appraiser/cm-overrides", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ set, collectorNumber }),
      });
      if (res.ok) {
        setOverrideManagerList((prev) => prev?.filter((o) => `${o.set}:${o.collectorNumber}` !== key) ?? null);
      }
    } finally {
      setDeletingOverrideKey(null);
    }
  };

  const submitIdOverride = async () => {
    if (!idOverrideTarget || idOverrideSubmitting) return;
    setIdOverrideSubmitting(true);
    setIdOverrideError("");
    try {
      const res = await fetch("/api/appraiser/cm-overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          set: idOverrideTarget.set,
          collectorNumber: idOverrideTarget.collectorNumber,
          cardmarketIdInput: idOverrideInput,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setIdOverrideError(data.error ?? "Failed to set override");
        return;
      }
      closeIdOverride();
      onCardChanged();
      // If the manager modal happens to be open, refresh it so the new
      // override appears at the top.
      if (overrideManagerOpen) await openOverrideManager();
    } catch (err) {
      setIdOverrideError(err instanceof Error ? err.message : "Network error");
    } finally {
      setIdOverrideSubmitting(false);
    }
  };

  // Wipes the cardmarket_id from this {set, cn} pair across all collections.
  // Covers both "remove an override I don't want" and "recover from a stuck
  // ID left behind by an earlier delete". The DELETE endpoint is idempotent:
  // it removes the override doc if present and ALWAYS clears cardmarket_id
  // on every matching appraiser + ev_cards row.
  const clearIdOverride = async () => {
    if (!idOverrideTarget || idOverrideSubmitting) return;
    setIdOverrideSubmitting(true);
    setIdOverrideError("");
    try {
      const res = await fetch("/api/appraiser/cm-overrides", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          set: idOverrideTarget.set,
          collectorNumber: idOverrideTarget.collectorNumber,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setIdOverrideError(data.error ?? "Failed to clear override");
        return;
      }
      closeIdOverride();
      onCardChanged();
      if (overrideManagerOpen) await openOverrideManager();
    } catch (err) {
      setIdOverrideError(err instanceof Error ? err.message : "Network error");
    } finally {
      setIdOverrideSubmitting(false);
    }
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
          <label
            style={{ display: "flex", alignItems: "center", gap: 4, opacity: bulkExclude ? 1 : 0.5 }}
            title="Cards with Cardmarket Trend price below this threshold are treated as bulk: they're priced at the 'Bulk @' rate instead of contributing their Trend value to the offer total."
          >
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
          <label
            style={{ display: "flex", alignItems: "center", gap: 4, opacity: bulkExclude ? 1 : 0.5 }}
            title="Price you'll pay for bulk"
          >
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
            title={`Subtracts this % from each card's Trend price before computing the offer. Use when you want to price below market for fast turnover. Currently ${undercutEnabled ? `−${undercutPercent}% applied` : "off"}.`}
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
          <label
            style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none" }}
            title="Show an inline edit button on cards that already have a Cardmarket ID. Off by default so the table stays clean."
          >
            <input
              type="checkbox"
              checked={editIdsEnabled}
              onChange={(e) => setEditIdsEnabled(e.target.checked)}
              style={{ accentColor: "var(--accent)" }}
            />
            Edit IDs
          </label>
          <button
            onClick={openOverrideManager}
            className={btnSecondaryClass}
            style={btnSecondary}
            title="Browse and remove manual Cardmarket-ID overrides"
          >
            Manage IDs
          </button>
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
                title={
                  (velocityCollapsed
                    ? "Expand Velocity — sales-cadence column"
                    : "Collapse Velocity column") +
                  "\n\nN/30 = days with ≥1 CM sale in the last 30 days." +
                  "\nFast (green): ≥20 active days AND last sale ≤2d" +
                  "\nSlow (red): <5 active days OR last sale ≥8d" +
                  "\nMedium (yellow): in between" +
                  "\nUnknown (grey): no chart data"
                }
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
                        // cardDocToPayload rebuilds the URL via buildCardmarketUrl,
                        // which already appends `?isFoil=Y` for foil rows on
                        // product / slug URLs. Don't double up here — wrapping
                        // would produce `?isFoil=Y&isFoil=Y` which CM redirects
                        // to "invalid expansion".
                        href={cleanCardmarketUrl(c.cardmarketUrl)}
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
                    {(c.cardmarket_id == null || editIdsEnabled) && (
                      <button
                        onClick={() => openIdOverride(c)}
                        title={c.cardmarket_id == null
                          ? "Cardmarket couldn't find this printing — click to paste the right idProduct manually. Applies to every collection with the same set + collector number."
                          : `Currently bound to idProduct=${c.cardmarket_id}. Click to change or clear.`}
                        className="hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors"
                        style={{
                          background: "transparent",
                          border: c.cardmarket_id == null ? "1px dashed var(--border)" : "1px solid transparent",
                          color: "var(--text-muted)",
                          cursor: "pointer",
                          fontSize: 9,
                          padding: "1px 5px",
                          borderRadius: 3,
                          fontFamily: "var(--font-mono)",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          lineHeight: 1.3,
                          opacity: c.cardmarket_id == null ? 1 : 0.5,
                        }}
                      >
                        {c.cardmarket_id == null ? "set ID" : "edit ID"}
                      </button>
                    )}
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
                        // The stored URL is already foil-aware (cardDocToPayload
                        // rebuilds via buildCardmarketUrl with the row's foil flag).
                        // Don't re-append isFoil here — would produce ?isFoil=Y twice.
                        const href = cleanCardmarketUrl(c.cardmarketUrl);
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

      <Modal
        open={!!idOverrideTarget}
        onClose={closeIdOverride}
        title="Set Cardmarket ID"
        maxWidth="max-w-md"
      >
        {idOverrideTarget && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 13, color: "var(--text-secondary)" }}>
            <p style={{ margin: 0 }}>
              <strong style={{ color: "var(--text-primary)" }}>{idOverrideTarget.name}</strong>
              {" "}
              <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 11 }}>
                {idOverrideTarget.set.toUpperCase()} #{idOverrideTarget.collectorNumber}
              </span>
            </p>
            {idOverrideTarget.cardmarket_id != null && (
              <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                Currently bound to{" "}
                <a
                  href={`https://www.cardmarket.com/en/Magic/Products?idProduct=${idOverrideTarget.cardmarket_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--accent)", textDecoration: "none" }}
                  className="hover:underline"
                >
                  idProduct={idOverrideTarget.cardmarket_id} ↗
                </a>
              </div>
            )}
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 6, padding: "10px 12px", fontSize: 12, color: "var(--text-secondary)" }}>
              <div style={{ color: "var(--text-primary)", fontWeight: 600, marginBottom: 6 }}>How to find the idProduct</div>
              <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
                <li>Open this card&apos;s product page on Cardmarket (use the search if needed).</li>
                <li>
                  Press <kbd style={{ fontFamily: "var(--font-mono)", padding: "1px 5px", border: "1px solid var(--border)", borderRadius: 3, fontSize: 11, background: "var(--bg-hover)" }}>Ctrl+U</kbd>
                  {" "}(or{" "}
                  <kbd style={{ fontFamily: "var(--font-mono)", padding: "1px 5px", border: "1px solid var(--border)", borderRadius: 3, fontSize: 11, background: "var(--bg-hover)" }}>Cmd+Option+U</kbd>
                  {" "}on macOS) to view page source.
                </li>
                <li>
                  <kbd style={{ fontFamily: "var(--font-mono)", padding: "1px 5px", border: "1px solid var(--border)", borderRadius: 3, fontSize: 11, background: "var(--bg-hover)" }}>Ctrl+F</kbd>
                  {" "}for <code style={{ fontFamily: "var(--font-mono)", color: "var(--accent)" }}>idAddProduct</code> — you&apos;ll land on a hidden input.
                </li>
                <li>
                  Paste that whole line below (or just the number from <code style={{ fontFamily: "var(--font-mono)" }}>value=&quot;…&quot;</code>).
                </li>
              </ol>
              <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-muted)" }}>
                Applies to every collection with the same <span style={{ fontFamily: "var(--font-mono)" }}>{idOverrideTarget.set.toUpperCase()} #{idOverrideTarget.collectorNumber}</span> and to future imports.
              </div>
            </div>
            <input
              autoFocus
              className={inputClass}
              style={{ ...inputStyle, fontFamily: "var(--font-mono)", fontSize: 12 }}
              placeholder='441234   or   <input name="idAddProduct" value="441234">   or   ?idProduct=441234'
              value={idOverrideInput}
              onChange={(e) => setIdOverrideInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitIdOverride();
                if (e.key === "Escape") closeIdOverride();
              }}
            />
            {idOverrideError && (
              <div style={{ color: "var(--error)", fontSize: 12 }}>{idOverrideError}</div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" }}>
              {idOverrideTarget.cardmarket_id != null && (
                <button
                  onClick={clearIdOverride}
                  className={btnSecondaryClass}
                  style={{ ...btnSecondary, marginRight: "auto", color: "var(--error)", borderColor: "var(--error-border)" }}
                  disabled={idOverrideSubmitting}
                  title={`Clear cardmarket_id ${idOverrideTarget.cardmarket_id} from every card with this set + CN`}
                >
                  Clear ID
                </button>
              )}
              <button
                onClick={closeIdOverride}
                className={btnSecondaryClass}
                style={btnSecondary}
                disabled={idOverrideSubmitting}
              >
                Cancel
              </button>
              <button
                onClick={submitIdOverride}
                className={btnPrimaryClass}
                style={btnPrimary}
                disabled={idOverrideSubmitting || !idOverrideInput.trim()}
              >
                {idOverrideSubmitting ? "Saving…" : "Save override"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={overrideManagerOpen}
        onClose={closeOverrideManager}
        title="Cardmarket-ID overrides"
        maxWidth="max-w-2xl"
      >
        {overrideManagerLoading ? (
          <div style={{ padding: 16, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
            Loading…
          </div>
        ) : !overrideManagerList || overrideManagerList.length === 0 ? (
          <div style={{ padding: 16, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
            No overrides yet. Click <strong>set ID</strong> on any card whose Cardmarket link is broken to add one.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>
              Each override is keyed by <code style={{ fontFamily: "var(--font-mono)" }}>set:collectorNumber</code> and applies across every collection. Removing one clears the ID from every card with that set + CN — the &quot;set ID&quot; button reappears so you can re-add a different ID.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: "55vh", overflowY: "auto" }}>
              {overrideManagerList.map((o) => {
                const key = `${o.set}:${o.collectorNumber}`;
                const cmHref = `https://www.cardmarket.com/en/Magic/Products?idProduct=${o.cardmarket_id}`;
                const isDeleting = deletingOverrideKey === key;
                return (
                  <div
                    key={key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 10px",
                      borderRadius: 6,
                      border: "1px solid var(--border)",
                      background: "var(--bg-card)",
                      fontSize: 12,
                      opacity: isDeleting ? 0.5 : 1,
                    }}
                  >
                    {o.sampleImageUrl ? (
                      <img src={o.sampleImageUrl} alt="" style={{ width: 22, height: 30, objectFit: "cover", borderRadius: 3, flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 22, height: 30, borderRadius: 3, background: "var(--bg-hover)", flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <strong style={{ color: "var(--text-primary)" }}>
                          {o.sampleName ?? <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>(no card uses this override)</span>}
                        </strong>
                        {o.sampleFoil && <FoilStar />}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 10, marginTop: 2 }}>
                        <span>{o.set.toUpperCase()} #{o.collectorNumber}</span>
                        <span>·</span>
                        <a
                          href={cmHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "var(--accent)", textDecoration: "none" }}
                          className="hover:underline"
                          title="Open this Cardmarket product in a new tab"
                        >
                          idProduct={o.cardmarket_id} ↗
                        </a>
                        <span>·</span>
                        <span>{o.usageCount} card{o.usageCount === 1 ? "" : "s"}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => deleteOverride(o.set, o.collectorNumber)}
                      disabled={isDeleting}
                      title="Remove this override"
                      className="hover:text-[var(--error)] transition-colors"
                      style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "4px 6px", flexShrink: 0 }}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
}
