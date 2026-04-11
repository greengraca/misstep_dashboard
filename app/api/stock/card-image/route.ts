import { NextResponse } from "next/server";
import { withAuthRead } from "@/lib/api-helpers";
import { getCardImage } from "@/lib/card-images";

export const GET = withAuthRead(async (req) => {
  const name = req.nextUrl.searchParams.get("name") || "";
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  return await getCardImage(name);
}, "stock-card-image");
