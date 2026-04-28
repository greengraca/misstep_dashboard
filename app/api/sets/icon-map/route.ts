// Returns a map of `setCode → Scryfall icon basename` for every set in
// `dashboard_ev_sets` whose icon basename differs from its code. Consumed
// by `components/dashboard/set-symbol.tsx` so that promo sets sharing
// their parent's icon (or a generic icon like "star" / "planeswalker")
// render correctly without per-set hardcoded remaps in the component.
//
// Only deviations are emitted (basename !== code) — the SetSymbol
// component defaults to `${code}.svg` and only needs the map for sets
// where Scryfall serves the icon at a different basename.
//
// Cached aggressively (1h s-maxage, stale-while-revalidate) — set icons
// rarely change, and a stale render is a cosmetic miss that the next
// fetch corrects.

import { NextResponse } from "next/server";
import { withAuthRead } from "@/lib/api-helpers";
import { getDb } from "@/lib/mongodb";

function basenameFromIconUrl(uri: string | undefined | null): string | null {
  if (!uri) return null;
  try {
    const u = new URL(uri);
    const m = u.pathname.match(/\/sets\/([^/]+)\.svg$/);
    return m ? m[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

export const GET = withAuthRead(async () => {
  const db = await getDb();
  const sets = await db
    .collection("dashboard_ev_sets")
    .find({}, { projection: { _id: 0, code: 1, icon_svg_uri: 1 } })
    .toArray();

  const basenames: Record<string, string> = {};
  for (const s of sets as Array<{ code?: string; icon_svg_uri?: string }>) {
    if (!s.code) continue;
    const code = s.code.toLowerCase();
    const basename = basenameFromIconUrl(s.icon_svg_uri);
    if (basename && basename !== code) basenames[code] = basename;
  }

  return NextResponse.json(
    { basenames },
    {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}, "sets-icon-map");
