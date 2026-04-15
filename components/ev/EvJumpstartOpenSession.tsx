"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, Search, Plus, Minus, Save, RotateCcw, Check, AlertTriangle } from "lucide-react";
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

const COLORS = ["white", "blue", "black", "red", "green", "multi"] as const;
const TIERS = ["common", "rare", "mythic"] as const;

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
  const [colorFilter, setColorFilter] = useState<Set<string>>(new Set());
  const [tierFilter, setTierFilter] = useState<Set<string>>(new Set());
  const [tally, setTally] = useState<Record<string, number>>({});
  const [history, setHistory] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
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

  // Search/filter logic
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return themes.filter((t) => {
      if (colorFilter.size && !colorFilter.has(t.color)) return false;
      if (tierFilter.size && !tierFilter.has(t.tier)) return false;
      if (!q) return true;
      if (t.name.toLowerCase().includes(q)) return true;
      for (const c of t.cards) if (c.name.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [themes, search, colorFilter, tierFilter]);

  // When no search, show themes already tallied first so you can undo quickly.
  const displayed = useMemo(() => {
    if (search.trim() || colorFilter.size || tierFilter.size) return filtered;
    const tallied = filtered.filter((t) => (tally[themeKey(t)] ?? 0) > 0);
    const rest = filtered.filter((t) => (tally[themeKey(t)] ?? 0) === 0);
    return [...tallied, ...rest];
  }, [filtered, tally, search, colorFilter, tierFilter]);

  function toggleSet(s: Set<string>, v: string): Set<string> {
    const n = new Set(s);
    if (n.has(v)) n.delete(v); else n.add(v);
    return n;
  }

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
    if (!confirm("Clear all tallies in this session?")) return;
    setTally({});
    setHistory([]);
    setSaved(false);
    setSaveError(null);
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") setSearch("");
    if (e.key === "Enter" && displayed.length > 0) {
      e.preventDefault();
      const top = displayed[0];
      if (e.shiftKey) dec(themeKey(top));
      else inc(themeKey(top));
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
  const totalByTier = { common: 80, rare: 30, mythic: 11 };  // not used directly but handy if future

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: "rgba(5, 8, 12, 0.92)", backdropFilter: "blur(6px)" }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-5 py-3"
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
        <div className="ml-auto flex items-center gap-2">
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
              background: "rgba(255,255,255,0.04)",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
              opacity: totalPacks === 0 ? 0.4 : 1,
            }}
          >
            Reset
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

      {/* Search + filters */}
      <div className="px-5 py-3 flex flex-col gap-2" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2">
          <div
            className="flex items-center gap-2 flex-1 px-3 py-2 rounded-lg"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)" }}
          >
            <Search size={14} style={{ color: "var(--text-muted)" }} />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={onKey}
              placeholder="Search card or theme name…  (Enter = +top · Shift+Enter = −top · Esc = clear)"
              className="flex-1 bg-transparent outline-none text-sm"
              style={{ color: "var(--text-primary)" }}
            />
            {search && (
              <button onClick={() => setSearch("")} style={{ color: "var(--text-muted)" }}>
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs mr-1" style={{ color: "var(--text-muted)" }}>Color:</span>
          {COLORS.map((c) => {
            const s = COLOR_STYLES[c];
            const on = colorFilter.has(c);
            return (
              <button
                key={c}
                onClick={() => setColorFilter((x) => toggleSet(x, c))}
                className="text-xs px-2 py-0.5 rounded-full capitalize"
                style={{
                  background: on ? s.color : s.bg,
                  color: on ? "#000" : s.color,
                  border: `1px solid ${on ? s.color : "transparent"}`,
                }}
              >
                {c}
              </button>
            );
          })}
          <span className="text-xs ml-3 mr-1" style={{ color: "var(--text-muted)" }}>Tier:</span>
          {TIERS.map((t) => {
            const on = tierFilter.has(t);
            const col = TIER_COLOR[t];
            return (
              <button
                key={t}
                onClick={() => setTierFilter((x) => toggleSet(x, t))}
                className="text-xs px-2 py-0.5 rounded-full capitalize"
                style={{
                  background: on ? col : "rgba(255,255,255,0.03)",
                  color: on ? "#000" : col,
                  border: `1px solid ${on ? col : "var(--border)"}`,
                }}
              >
                {t}
              </button>
            );
          })}
          <span className="ml-auto text-xs" style={{ color: "var(--text-muted)" }}>
            {displayed.length} / {themes.length} themes
          </span>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-auto px-5 py-3">
        {displayed.length === 0 ? (
          <div className="text-center py-12 text-sm" style={{ color: "var(--text-muted)" }}>
            No themes match your search.
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {displayed.map((t, idx) => {
              const key = themeKey(t);
              const count = tally[key] ?? 0;
              const cs = COLOR_STYLES[t.color] ?? COLOR_STYLES.multi;
              const matches = q
                ? t.cards.filter((c) => c.name.toLowerCase().includes(q.toLowerCase())).slice(0, 3)
                : [];
              const diff = variantDiff[key] ?? [];
              const isTop = idx === 0 && q !== "";

              return (
                <div
                  key={key}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg"
                  style={{
                    background: count > 0 ? "rgba(34,197,94,0.06)" : "rgba(255,255,255,0.015)",
                    border: `1px solid ${isTop ? "rgba(234,179,8,0.35)" : count > 0 ? "rgba(34,197,94,0.2)" : "var(--border-subtle)"}`,
                  }}
                >
                  <span className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: cs.color }} />
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded capitalize w-14 text-center flex-shrink-0"
                    style={{
                      background: `${TIER_COLOR[t.tier]}22`,
                      color: TIER_COLOR[t.tier],
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {t.tier}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                        {highlight(t.name, q)}
                      </span>
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>v{t.variant}</span>
                      <span className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                        €{t.ev_net.toFixed(2)}
                      </span>
                    </div>
                    {(matches.length > 0 || diff.length > 0) && (
                      <div className="text-[11px] mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5" style={{ color: "var(--text-muted)" }}>
                        {matches.length > 0 && (
                          <span>
                            matches: {matches.map((c, i) => (
                              <span key={i}>
                                {i > 0 && ", "}
                                <span style={{ color: "var(--text-secondary)" }}>{highlight(c.name, q)}</span>
                              </span>
                            ))}
                          </span>
                        )}
                        {diff.length > 0 && (
                          <span>
                            unique: <span style={{ color: "#60a5fa" }}>{diff.join(" · ")}</span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
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
