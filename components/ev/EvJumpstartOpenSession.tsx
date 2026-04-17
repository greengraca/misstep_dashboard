"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, Search, Plus, Minus, Save, RotateCcw, Check, AlertTriangle, List, Layers, Copy, HelpCircle, ChevronDown, ChevronUp, ArrowUpDown } from "lucide-react";
import type { EvJumpstartThemeResult } from "@/lib/types";

const COLOR_STYLES: Record<string, { bg: string; color: string }> = {
  white: { bg: "rgba(255, 255, 224, 0.10)", color: "#fde68a" },
  blue: { bg: "rgba(96, 165, 250, 0.10)", color: "#60a5fa" },
  black: { bg: "rgba(168, 162, 158, 0.10)", color: "#a8a29e" },
  red: { bg: "rgba(248, 113, 113, 0.10)", color: "#f87171" },
  green: { bg: "rgba(74, 222, 128, 0.10)", color: "#4ade80" },
  multi: { bg: "rgba(234, 179, 8, 0.10)", color: "#eab308" },
};

const TIER_COLOR: Record<string, string> = {
  common: "var(--text-muted)",
  rare: "#eab308",
  mythic: "#ef4444",
};

const TIER_LETTER: Record<string, string> = {
  common: "C",
  rare: "R",
  mythic: "M",
};

interface Props {
  setCode: string;
  themes: EvJumpstartThemeResult[];           // full theme list from calc result (includes card names)
  onClose: () => void;
  onSaved: () => void;                        // called after successful save to trigger SWR revalidation
}

function themeKey(t: { name: string; variant: number }) {
  return `${t.name}|${t.variant}`;
}

// Cards that are unique to each variant within a same-name theme family.
// Used to help disambiguate variants at a glance.
function diffCardsByVariant(themes: EvJumpstartThemeResult[]) {
  const byName: Record<string, EvJumpstartThemeResult[]> = {};
  for (const t of themes) (byName[t.name] ||= []).push(t);
  const out: Record<string, string[]> = {};
  for (const group of Object.values(byName)) {
    if (group.length < 2) continue;
    for (const t of group) {
      const others = group.filter((x) => x.variant !== t.variant);
      const otherCards = new Set<string>();
      for (const o of others) for (const c of o.cards) otherCards.add(c.name);
      const unique = t.cards.map((c) => c.name).filter((n) => !otherCards.has(n));
      out[themeKey(t)] = unique.slice(0, 3);
    }
  }
  return out;
}

export default function EvJumpstartOpenSession({ setCode, themes, onClose, onSaved }: Props) {
  const [search, setSearch] = useState("");
  const [tally, setTally] = useState<Record<string, number>>({});
  const [history, setHistory] = useState<string[]>([]);
  const [view, setView] = useState<"themes" | "cards">("themes");
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [cardSort, setCardSort] = useState<"name" | "total-desc" | "total-asc">("name");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { searchRef.current?.focus(); }, []);

  const totalPacks = Object.values(tally).reduce((s, v) => s + v, 0);
  const tierCounts = useMemo(() => {
    const out = { common: 0, rare: 0, mythic: 0 } as Record<string, number>;
    for (const t of themes) {
      const n = tally[themeKey(t)] ?? 0;
      if (n > 0) out[t.tier] = (out[t.tier] ?? 0) + n;
    }
    return out;
  }, [tally, themes]);

  const variantDiff = useMemo(() => diffCardsByVariant(themes), [themes]);

  // Aggregate all cards pulled from tallied themes
  const pulledCards = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; price: number; rarity: string }>();
    for (const t of themes) {
      const count = tally[themeKey(t)] ?? 0;
      if (count === 0) continue;
      for (const c of t.cards) {
        const existing = map.get(c.name);
        if (existing) {
          existing.qty += count;
        } else {
          map.set(c.name, { name: c.name, qty: count, price: c.price, rarity: c.rarity });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [themes, tally]);

  // Search logic — sorted alphabetically by theme name, then by variant
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return themes
      .filter((t) => !q || t.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const byName = a.name.localeCompare(b.name);
        if (byName !== 0) return byName;
        return a.variant - b.variant;
      });
  }, [themes, search]);

  const displayed = filtered;

  function inc(key: string) {
    setTally((t) => ({ ...t, [key]: (t[key] ?? 0) + 1 }));
    setHistory((h) => [...h, key]);
    setSaved(false);
  }
  function dec(key: string) {
    setTally((t) => {
      const current = t[key] ?? 0;
      if (current <= 0) return t;
      const next = { ...t, [key]: current - 1 };
      if (next[key] === 0) delete next[key];
      return next;
    });
    setSaved(false);
  }
  function undo() {
    setHistory((h) => {
      if (!h.length) return h;
      const last = h[h.length - 1];
      dec(last);
      return h.slice(0, -1);
    });
  }
  function reset() {
    if (confirmingReset) {
      setTally({});
      setHistory([]);
      setSaved(false);
      setSaveError(null);
      setConfirmingReset(false);
    } else {
      setConfirmingReset(true);
      setTimeout(() => setConfirmingReset(false), 3000);
    }
  }

  function switchView(next: "themes" | "cards") {
    setView(next);
    setSearch("");
    searchRef.current?.focus();
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") setSearch("");
    if (e.key === "Enter" && displayed.length > 0 && view === "themes") {
      e.preventDefault();
      const top = displayed[0];
      if (e.shiftKey) dec(themeKey(top));
      else inc(themeKey(top));
      setSearch("");
    }
  }

  function highlight(text: string, q: string) {
    if (!q) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0) return text;
    return (
      <>
        {text.slice(0, idx)}
        <span style={{ background: "rgba(234,179,8,0.25)", color: "#fde68a" }}>{text.slice(idx, idx + q.length)}</span>
        {text.slice(idx + q.length)}
      </>
    );
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/ev/jumpstart/${setCode}/weights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packs: totalPacks,
          tier_counts: { common: tierCounts.common, rare: tierCounts.rare, mythic: tierCounts.mythic },
          theme_counts: tally,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setSaved(true);
      onSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const q = search.trim();

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: "rgba(5, 8, 12, 0.92)", backdropFilter: "blur(6px)" }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-5 py-3 flex-wrap"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
          Open Session · <span style={{ color: "var(--accent)" }}>{setCode.toUpperCase()}</span>
        </h2>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          Packs: <span style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>{totalPacks}</span>
          {" · "}C <span style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>{tierCounts.common}</span>
          {" · "}R <span style={{ color: "#eab308", fontFamily: "var(--font-mono)" }}>{tierCounts.rare}</span>
          {" · "}M <span style={{ color: "#ef4444", fontFamily: "var(--font-mono)" }}>{tierCounts.mythic}</span>
        </span>
        {totalPacks > 0 && (
          <div
            className="flex rounded-lg overflow-hidden"
            style={{ border: "1px solid var(--border)" }}
          >
            <button
              onClick={() => switchView("themes")}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs"
              style={{
                background: view === "themes" ? "rgba(255,255,255,0.08)" : "transparent",
                color: view === "themes" ? "var(--text-primary)" : "var(--text-muted)",
              }}
            >
              <Layers size={12} /> Themes
            </button>
            <button
              onClick={() => switchView("cards")}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs"
              style={{
                background: view === "cards" ? "rgba(255,255,255,0.08)" : "transparent",
                color: view === "cards" ? "var(--text-primary)" : "var(--text-muted)",
                borderLeft: "1px solid var(--border)",
              }}
            >
              <List size={12} /> Cards
              <span style={{ fontFamily: "var(--font-mono)", color: "var(--accent)" }}>{pulledCards.length}</span>
            </button>
          </div>
        )}
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <div className="relative">
            <button
              onClick={() => setShowShortcuts((s) => !s)}
              className="p-1.5 rounded-lg"
              style={{
                background: showShortcuts ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
                color: "var(--text-muted)",
              }}
              aria-label="Keyboard shortcuts"
            >
              <HelpCircle size={14} />
            </button>
            {showShortcuts && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowShortcuts(false)}
                />
                <div
                  className="absolute right-0 top-full mt-1 z-50 rounded-lg p-3 text-xs flex flex-col gap-1.5"
                  style={{
                    background: "rgba(15, 18, 22, 0.98)",
                    border: "1px solid var(--border)",
                    minWidth: "240px",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                  }}
                >
                  <div className="font-semibold mb-1" style={{ color: "var(--text-primary)" }}>Keyboard shortcuts</div>
                  {[
                    ["Enter", "+1 to top match"],
                    ["Shift + Enter", "−1 from top match"],
                    ["Esc", "Clear search"],
                  ].map(([key, desc]) => (
                    <div key={key} className="flex items-center justify-between gap-3">
                      <kbd
                        className="px-1.5 py-0.5 rounded text-[10px]"
                        style={{
                          background: "rgba(255,255,255,0.06)",
                          border: "1px solid var(--border)",
                          color: "var(--text-secondary)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {key}
                      </kbd>
                      <span style={{ color: "var(--text-muted)" }}>{desc}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          <button
            onClick={undo}
            disabled={history.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
              opacity: history.length === 0 ? 0.4 : 1,
            }}
          >
            <RotateCcw size={12} /> Undo
          </button>
          <button
            onClick={reset}
            disabled={totalPacks === 0}
            className="px-3 py-1.5 rounded-lg text-xs"
            style={{
              background: confirmingReset ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${confirmingReset ? "rgba(239,68,68,0.4)" : "var(--border)"}`,
              color: confirmingReset ? "#ef4444" : "var(--text-secondary)",
              opacity: totalPacks === 0 ? 0.4 : 1,
            }}
          >
            {confirmingReset ? "Confirm reset?" : "Reset"}
          </button>
          <button
            onClick={save}
            disabled={saving || totalPacks === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{
              background: saved ? "rgba(34,197,94,0.15)" : "var(--accent)",
              color: saved ? "#22c55e" : "#fff",
              border: saved ? "1px solid rgba(34,197,94,0.35)" : "1px solid transparent",
              opacity: saving || totalPacks === 0 ? 0.5 : 1,
            }}
          >
            {saved ? <Check size={13} /> : <Save size={13} />}
            {saving ? "Saving..." : saved ? "Saved" : "Save & Apply"}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg"
            style={{ background: "rgba(255,255,255,0.04)", color: "var(--text-muted)" }}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {saveError && (
        <div
          className="flex items-center gap-2 px-5 py-2 text-xs"
          style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", borderBottom: "1px solid rgba(239,68,68,0.2)" }}
        >
          <AlertTriangle size={12} /> {saveError}
        </div>
      )}

      {/* Search */}
      <div className="px-5 py-3 flex items-center gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div
          className="flex items-center gap-2 flex-1 px-3 py-2 rounded-lg"
          style={{
            background: view === "cards" ? "rgba(96,165,250,0.04)" : "rgba(255,255,255,0.03)",
            border: `1px solid ${view === "cards" ? "rgba(96,165,250,0.25)" : "var(--border)"}`,
          }}
        >
          <Search size={14} style={{ color: view === "cards" ? "#60a5fa" : "var(--text-muted)" }} />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={onKey}
            placeholder={
              view === "themes"
                ? "Search theme name…  (Enter = +top · Shift+Enter = −top)"
                : "Search card name…"
            }
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: "var(--text-primary)" }}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{ color: "var(--text-muted)" }}>
              <X size={14} />
            </button>
          )}
        </div>
        {view === "themes" && (
          <span className="text-xs whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
            {displayed.length} / {themes.length} themes
          </span>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-auto px-5 py-3">
        {view === "themes" ? (
          displayed.length === 0 ? (
            <div className="text-center py-12 text-sm" style={{ color: "var(--text-muted)" }}>
              No themes match your search.
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {displayed.map((t, idx) => {
                const key = themeKey(t);
                const count = tally[key] ?? 0;
                const cs = COLOR_STYLES[t.color] ?? COLOR_STYLES.multi;
                const diff = (variantDiff[key] ?? []).filter((n) => n !== t.lead_card);
                const isTop = idx === 0 && q !== "";
                const isHighEv = t.ev_net >= 1;

                return (
                  <div
                    key={key}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg flex-wrap md:flex-nowrap"
                    style={{
                      background: count > 0 ? "rgba(34,197,94,0.06)" : "rgba(255,255,255,0.015)",
                      border: `1px solid ${isTop ? "rgba(234,179,8,0.35)" : count > 0 ? "rgba(34,197,94,0.2)" : "var(--border-subtle)"}`,
                    }}
                  >
                    <span className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: cs.color }} />
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
                      style={{
                        background: `${TIER_COLOR[t.tier]}22`,
                        color: TIER_COLOR[t.tier],
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {TIER_LETTER[t.tier] ?? t.tier.charAt(0).toUpperCase()}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                          {highlight(t.name, q)}
                        </span>
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>v{t.variant}</span>
                        <span
                          className="text-xs"
                          style={{
                            color: isHighEv ? "var(--accent)" : "var(--text-muted)",
                            fontFamily: "var(--font-mono)",
                            fontWeight: isHighEv ? 600 : 400,
                          }}
                        >
                          €{t.ev_net.toFixed(2)}
                        </span>
                      </div>
                      {(t.lead_card || diff.length > 0) && (
                        <div className="text-[11px] mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5" style={{ color: "var(--text-muted)" }}>
                          <span>
                            {t.lead_card && (
                              <span style={{ color: t.tier === "mythic" ? "#ef4444" : "#eab308", fontWeight: 600 }}>{t.lead_card}</span>
                            )}
                            {t.lead_card && diff.length > 0 && (
                              <span style={{ color: "var(--text-muted)" }}> · </span>
                            )}
                            {diff.length > 0 && (
                              <span style={{ color: "#60a5fa" }}>{diff.join(" · ")}</span>
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
                      <button
                        onClick={() => dec(key)}
                        disabled={count === 0}
                        className="w-7 h-7 rounded flex items-center justify-center"
                        style={{
                          background: "rgba(255,255,255,0.04)",
                          color: "var(--text-muted)",
                          opacity: count === 0 ? 0.3 : 1,
                        }}
                      >
                        <Minus size={12} />
                      </button>
                      <span
                        className="w-8 text-center text-sm font-bold"
                        style={{
                          color: count > 0 ? "var(--text-primary)" : "var(--text-muted)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {count}
                      </span>
                      <button
                        onClick={() => inc(key)}
                        className="w-7 h-7 rounded flex items-center justify-center"
                        style={{
                          background: "var(--accent)",
                          color: "#fff",
                        }}
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          /* Cards Pulled view */
          (() => {
            const cardQ = search.trim().toLowerCase();
            const baseCards = cardQ
              ? pulledCards.filter((c) => c.name.toLowerCase().includes(cardQ))
              : pulledCards;
            const filteredCards = cardSort === "name"
              ? baseCards
              : [...baseCards].sort((a, b) => {
                  const ta = a.qty * a.price;
                  const tb = b.qty * b.price;
                  return cardSort === "total-desc" ? tb - ta : ta - tb;
                });
            const totalCards = filteredCards.reduce((s, c) => s + c.qty, 0);
            const totalValue = filteredCards.reduce((s, c) => s + c.qty * c.price, 0);

            return filteredCards.length === 0 ? (
              <div className="text-center py-12 text-sm" style={{ color: "var(--text-muted)" }}>
                {pulledCards.length === 0 ? "No packs tallied yet." : "No cards match your search."}
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {/* Summary bar */}
                <div
                  className="flex items-center gap-4 px-3 py-2 rounded-lg text-xs mb-1 flex-wrap"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)" }}
                >
                  <span style={{ color: "var(--text-muted)" }}>
                    Unique cards: <span style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>{filteredCards.length}</span>
                  </span>
                  <span style={{ color: "var(--text-muted)" }}>
                    Total cards: <span style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>{totalCards}</span>
                  </span>
                  <span style={{ color: "var(--text-muted)" }}>
                    Total value: <span style={{ color: "var(--accent)", fontFamily: "var(--font-mono)" }}>€{totalValue.toFixed(2)}</span>
                  </span>
                  <button
                    onClick={() => {
                      const text = filteredCards.map((c) => `${c.qty} ${c.name}`).join("\n");
                      navigator.clipboard.writeText(text);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs"
                    style={{
                      background: copied ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${copied ? "rgba(34,197,94,0.35)" : "var(--border)"}`,
                      color: copied ? "#22c55e" : "var(--text-secondary)",
                    }}
                  >
                    {copied ? <Check size={11} /> : <Copy size={11} />}
                    {copied ? "Copied" : "Copy list"}
                  </button>
                </div>

                {/* Column headers */}
                <div
                  className="flex items-center gap-3 px-3 py-1 text-[10px] uppercase tracking-wider"
                  style={{ color: "var(--text-muted)" }}
                >
                  <span className="flex-1">Card Name</span>
                  <span className="w-12 text-center">Qty</span>
                  <span className="w-16 text-right">Price</span>
                  <button
                    onClick={() => {
                      setCardSort((s) =>
                        s === "name" ? "total-desc"
                          : s === "total-desc" ? "total-asc"
                          : "name"
                      );
                    }}
                    className="w-16 text-right uppercase tracking-wider flex items-center justify-end gap-1 hover:opacity-100"
                    style={{
                      color: cardSort === "name" ? "var(--text-muted)" : "var(--accent)",
                      fontSize: "inherit",
                    }}
                    title="Click to sort by total value"
                  >
                    Total
                    {cardSort === "total-desc" ? (
                      <ChevronDown size={10} />
                    ) : cardSort === "total-asc" ? (
                      <ChevronUp size={10} />
                    ) : (
                      <ArrowUpDown size={10} style={{ opacity: 0.5 }} />
                    )}
                  </button>
                </div>

                {filteredCards.map((c) => {
                  const RARITY_COLOR: Record<string, string> = {
                    common: "var(--text-muted)",
                    uncommon: "#a3a3a3",
                    rare: "#eab308",
                    mythic: "#ef4444",
                  };
                  const rCol = RARITY_COLOR[c.rarity] ?? "var(--text-muted)";

                  return (
                    <div
                      key={c.name}
                      className="flex items-center gap-3 px-3 py-1.5 rounded-lg"
                      style={{
                        background: c.price > 0 ? "rgba(255,255,255,0.015)" : "transparent",
                        border: `1px solid ${c.price >= 1 ? "rgba(234,179,8,0.15)" : "var(--border-subtle)"}`,
                      }}
                    >
                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        <span
                          className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ background: rCol }}
                        />
                        <span className="text-sm truncate" style={{ color: "var(--text-primary)" }}>
                          {highlight(c.name, cardQ)}
                        </span>
                      </div>
                      <span
                        className="w-12 text-center text-sm font-bold"
                        style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}
                      >
                        {c.qty}
                      </span>
                      <span
                        className="w-16 text-right text-xs"
                        style={{
                          color: c.price > 0 ? "var(--text-secondary)" : "var(--text-muted)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        €{c.price.toFixed(2)}
                      </span>
                      <span
                        className="w-16 text-right text-xs font-medium"
                        style={{
                          color: c.price > 0 ? "var(--accent)" : "var(--text-muted)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        €{(c.qty * c.price).toFixed(2)}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })()
        )}
      </div>

      {/* Footer hint */}
      <div
        className="px-5 py-2 text-[10px]"
        style={{ borderTop: "1px solid var(--border)", color: "var(--text-muted)" }}
      >
        Save &amp; Apply merges this session into the cumulative sample and updates tier + theme weights used by EV &amp; Monte Carlo.
      </div>
    </div>
  );
}
