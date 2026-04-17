"use client";

import { useState, useEffect } from "react";
import type { EvSet } from "@/lib/types";
import EvSetCard from "./EvSetCard";
import { RefreshCw, Search, LayoutGrid, List, Settings } from "lucide-react";

const LS_VIEW_KEY = "ev-set-view";
const LS_CONFIGURED_KEY = "ev-configured-only";

interface EvSetListProps {
  sets: EvSet[];
  onSelectSet: (code: string) => void;
  onRefresh: () => void;
}

export default function EvSetList({ sets, onSelectSet, onRefresh }: EvSetListProps) {
  const [search, setSearch] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [view, setView] = useState<"cards" | "list">("cards");
  const [configuredOnly, setConfiguredOnly] = useState(false);

  // Load preferences from localStorage
  useEffect(() => {
    const savedView = localStorage.getItem(LS_VIEW_KEY);
    if (savedView === "list" || savedView === "cards") setView(savedView);
    const savedConfigured = localStorage.getItem(LS_CONFIGURED_KEY);
    if (savedConfigured === "true") setConfiguredOnly(true);
  }, []);

  function toggleView() {
    const next = view === "cards" ? "list" : "cards";
    setView(next);
    localStorage.setItem(LS_VIEW_KEY, next);
  }

  function toggleConfigured() {
    const next = !configuredOnly;
    setConfiguredOnly(next);
    localStorage.setItem(LS_CONFIGURED_KEY, String(next));
  }

  async function handleRefresh() {
    setSyncing(true);
    try {
      await onRefresh();
    } finally {
      setSyncing(false);
    }
  }

  const filtered = sets.filter((s) => {
    if (configuredOnly && !s.config_exists) return false;
    const q = search.toLowerCase();
    return s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q);
  });

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div
          className="flex items-center gap-2 flex-1 min-w-[200px] rounded-lg px-3 py-2"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
          }}
        >
          <Search size={16} style={{ color: "var(--text-muted)" }} />
          <input
            type="text"
            placeholder="Search sets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent outline-none text-sm flex-1"
            style={{ color: "var(--text-primary)" }}
          />
        </div>

        {/* Configured only toggle */}
        <button
          onClick={toggleConfigured}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors"
          style={{
            background: configuredOnly ? "var(--accent-light)" : "rgba(255,255,255,0.05)",
            color: configuredOnly ? "var(--accent)" : "var(--text-muted)",
          }}
        >
          <Settings size={14} />
          Configured
        </button>

        {/* View toggle */}
        <button
          onClick={toggleView}
          className="p-2 rounded-lg transition-colors"
          style={{
            background: "rgba(255,255,255,0.05)",
            color: "var(--text-muted)",
          }}
          title={view === "cards" ? "Switch to list view" : "Switch to card view"}
        >
          {view === "cards" ? <List size={16} /> : <LayoutGrid size={16} />}
        </button>

        <button
          onClick={handleRefresh}
          disabled={syncing}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{
            background: "var(--accent-light)",
            color: "var(--accent)",
            opacity: syncing ? 0.6 : 1,
          }}
        >
          <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
          Sync Sets
        </button>
      </div>

      {/* Card view */}
      {view === "cards" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: "16px",
          }}
        >
          {filtered.map((set) => (
            <EvSetCard
              key={set.code}
              set={set}
              onClick={() => onSelectSet(set.code)}
            />
          ))}
        </div>
      )}

      {/* List view */}
      {view === "list" && (
        <div className="flex flex-col gap-1">
          {filtered.map((set) => (
            <div
              key={set.code}
              onClick={() => onSelectSet(set.code)}
              className="flex items-center gap-2 sm:gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-[var(--bg-hover)] transition-colors"
              style={{ borderBottom: "1px solid var(--border-subtle)" }}
            >
              {set.icon_svg_uri && (
                <img
                  src={set.icon_svg_uri}
                  alt={set.name}
                  className="w-5 h-5 shrink-0"
                  style={{ filter: "invert(0.9)" }}
                />
              )}
              <span
                className="text-sm font-medium flex-1 min-w-0 truncate"
                style={{ color: "var(--text-primary)" }}
              >
                {set.name}
              </span>
              <span
                className="text-xs w-10 text-center shrink-0"
                style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
              >
                {set.code.toUpperCase()}
              </span>
              <span
                className="hidden md:inline text-xs w-20 text-right shrink-0"
                style={{ color: "var(--text-muted)" }}
              >
                {new Date(set.released_at + "T00:00:00").toLocaleDateString("pt-PT")}
              </span>
              <span
                className="hidden sm:inline text-xs w-16 text-right shrink-0"
                style={{ color: "var(--text-muted)" }}
              >
                {set.card_count} cards
              </span>
              <div className="w-auto sm:w-32 flex justify-end gap-1 shrink-0">
                {set.config_exists ? (
                  <>
                    {set.play_ev_net != null && (
                      <span
                        className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                        style={{
                          background: "rgba(99, 102, 241, 0.15)",
                          color: "var(--accent)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        &euro;{set.play_ev_net.toFixed(0)}
                      </span>
                    )}
                    {set.collector_ev_net != null && (
                      <span
                        className="hidden sm:inline text-xs px-1.5 py-0.5 rounded-full font-medium"
                        style={{
                          background: "rgba(168, 85, 247, 0.15)",
                          color: "#a855f7",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        &euro;{set.collector_ev_net.toFixed(0)}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>—</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {filtered.length === 0 && (
        <div
          className="text-center py-12 text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          {sets.length === 0
            ? 'No sets loaded. Click "Sync Sets" to fetch from Scryfall.'
            : configuredOnly
              ? "No configured sets. Configure a set first or disable the filter."
              : "No sets match your search."}
        </div>
      )}
    </div>
  );
}
