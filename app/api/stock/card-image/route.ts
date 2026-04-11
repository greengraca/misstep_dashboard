import { NextResponse } from "next/server";
import { withAuthRead } from "@/lib/api-helpers";
import { getCardImage } from "@/lib/card-images";

export const GET = withAuthRead(async (req) => {
  const sp = req.nextUrl.searchParams;
  const name = sp.get("name") || "";
  const set = sp.get("set") || undefined;
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  return await getCardImage(name, set);
}, "stock-card-image");
