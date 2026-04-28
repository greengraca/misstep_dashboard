"use client";

import { useState } from "react";

/**
 * Some Scryfall sets share an icon basename rather than having their own
 * SVG file at `<setcode>.svg`. When Scryfall serves the symbol from a
 * different basename, mirror the redirect here so we don't 404 and fall
 * back to text.
 *
 * The authoritative source is `dashboard_ev_sets.icon_svg_uri` (synced
 * from Scryfall) — when a new set falls through to the text fallback,
 * read that field for the actual basename and add an entry here.
 */
const SCRYFALL_ICON_REMAP: Record<string, string> = {
  plst: "planeswalker", // The List shares the planeswalker symbol
};

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
  const iconBasename = SCRYFALL_ICON_REMAP[trimmed] ?? trimmed;
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
