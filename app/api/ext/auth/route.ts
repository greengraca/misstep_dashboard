import { NextRequest, NextResponse } from "next/server";
import { computeExtToken } from "@/lib/ext-auth";
import { logApiError } from "@/lib/error-log";

export async function POST(request: NextRequest) {
  try {
    const { pin, memberName } = await request.json();

    if (!pin || !memberName) {
      return NextResponse.json(
        { error: "pin and memberName are required" },
        { status: 400 }
      );
    }

    const correctPin = process.env.APP_PIN;
    if (!correctPin || pin !== correctPin) {
      return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
    }

    const token = computeExtToken(pin);
    return NextResponse.json({ data: { token, memberName } });
  } catch (err) {
    console.error("ext-auth error:", err);
    logApiError("ext-auth", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
