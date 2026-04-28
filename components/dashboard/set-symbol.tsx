"use client";

import { useEffect, useState } from "react";

/**
 * Hardcoded fallback for sets whose Scryfall icon lives at a basename
 * different from the set code (e.g. The List → planeswalker.svg, promo
 * sets that share their parent's icon, etc.). Used when the dynamic map
 * (fetched from /api/sets/icon-map) hasn't loaded yet, or when the API
 * is unreachable.
 *
 * Most entries here are also discoverable from `dashboard_ev_sets`
 * — they're duplicated as a synchronous fast-path so the very first
 * render after a cold load doesn't flicker between text and icon.
 */
const SCRYFALL_ICON_REMAP: Record<string, string> = {
  plst: "planeswalker",
  p30a: "star",
  pemn: "emn",
  paer: "aer",
  plg21: "star",
};

// Module-level dynamic map populated from /api/sets/icon-map. One fetch
// per page session, deduped across every SetSymbol instance.
let dynamicIconMap: Record<string, string> = {};
let dynamicIconPromise: Promise<Record<string, string>> | null = null;
const subscribers = new Set<() => void>();

function ensureDynamicIconMap(): Promise<Record<string, string>> {
  if (!dynamicIconPromise) {
    dynamicIconPromise = fetch("/api/sets/icon-map")
      .then((r) => (r.ok ? r.json() : { basenames: {} }))
      .then((d: { basenames?: Record<string, string> }) => {
        dynamicIconMap = d.basenames ?? {};
        for (const cb of subscribers) cb();
        return dynamicIconMap;
      })
      .catch(() => {
        // Allow retry on next mount (network blip / dev-only fetch errors).
        dynamicIconPromise = null;
        return {};
      });
  }
  return dynamicIconPromise;
}

/**
 * Renders a Scryfall set symbol (SVG from svgs.scryfall.io) with the same
 * invert-for-dark-mode treatment used in EvSetList / EvSetDetail. Falls back
 * to the uppercase set code as plain text when the SVG fails to load (rare
 * set codes Scryfall doesn't host, or when offline).
 */
export function SetSymbol({
  code,
  size = 16,
  className,
}: {
  code: string;
  size?: number;
  className?: string;
}) {
  const [errored, setErrored] = useState(false);
  const trimmed = (code || "").trim().toLowerCase();

  // Subscribe to the module-level dynamic map. Re-renders this instance
  // when the fetch completes so the icon switches from the hardcoded
  // fallback (or the default `${code}.svg`) to the DB-resolved basename.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!trimmed) return;
    const cb = () => setTick((n) => n + 1);
    subscribers.add(cb);
    if (Object.keys(dynamicIconMap).length === 0) ensureDynamicIconMap();
    return () => {
      subscribers.delete(cb);
    };
  }, [trimmed]);

  // Resolution priority: dynamic DB map → hardcoded fallback → set code itself.
  const iconBasename =
    dynamicIconMap[trimmed] ?? SCRYFALL_ICON_REMAP[trimmed] ?? trimmed;

  // Reset the `errored` flag whenever the resolved basename changes. The
  // initial render uses `${code}.svg` which often 404s (e.g. pf19.svg), then
  // the dynamic map arrives and resolves to a working basename (pf19 → star).
  // Without this reset the img stays in error state and the text fallback
  // sticks even after the working URL is available.
  useEffect(() => {
    setErrored(false);
  }, [iconBasename]);

  if (!trimmed || errored) {
    return (
      <span
        className={className}
        style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 12 }}
      >
        {trimmed.toUpperCase() || "?"}
      </span>
    );
  }
  return (
    <img
      src={`https://svgs.scryfall.io/sets/${iconBasename}.svg`}
      alt={trimmed.toUpperCase()}
      title={trimmed.toUpperCase()}
      onError={() => setErrored(true)}
      className={className}
      style={{
        width: size,
        height: size,
        verticalAlign: "middle",
        filter: "invert(0.9)",
        objectFit: "contain",
        flexShrink: 0,
      }}
    />
  );
}
