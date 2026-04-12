import { NextResponse } from "next/server";
import { LATEST_EXT_VERSION, EXT_DOWNLOAD_URL } from "@/lib/constants";

export async function GET() {
  return NextResponse.json(
    { data: { version: LATEST_EXT_VERSION, downloadUrl: EXT_DOWNLOAD_URL } },
    { headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" } }
  );
}
