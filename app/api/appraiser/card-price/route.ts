import { NextRequest, NextResponse } from "next/server";
import { withAuthRead } from "@/lib/api-helpers";
import { resolveScryfall } from "@/lib/appraiser/scryfall-resolve";

export const GET = withAuthRead(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get("name")?.trim() ?? "";
  if (!name) {
    return NextResponse.json({ error: "Card name is required" }, { status: 400 });
  }

  const set = searchParams.get("set") ?? undefined;
  const collectorNumber = searchParams.get("collector_number") ?? undefined;
  const foil = searchParams.get("foil") === "true";

  try {
    const result = await resolveScryfall({ name, set, collectorNumber, foil });
    return { ...result };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scryfall error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}, "appraiser-card-price");
