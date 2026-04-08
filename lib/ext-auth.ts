import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";

const EXT_TOKEN_SALT = "misstep-ext-v1";

/** Compute the expected token from the app PIN. */
export function computeExtToken(pin: string): string {
  return createHash("sha256").update(pin + EXT_TOKEN_SALT).digest("hex");
}

type ExtAuthResult =
  | { memberName: string; error?: never }
  | { memberName?: never; error: NextResponse };

/**
 * Validate a Bearer token from the extension.
 * Returns the member name stored alongside the token, or a 401 response.
 */
export async function requireExtAuth(
  request: NextRequest
): Promise<ExtAuthResult> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return {
      error: NextResponse.json({ error: "Missing authorization" }, { status: 401 }),
    };
  }

  const token = authHeader.slice(7);
  const pin = process.env.APP_PIN;
  if (!pin) {
    return {
      error: NextResponse.json({ error: "Server misconfigured" }, { status: 500 }),
    };
  }

  const expected = computeExtToken(pin);
  if (token !== expected) {
    return {
      error: NextResponse.json({ error: "Invalid token" }, { status: 401 }),
    };
  }

  // Member name comes from x-member-name header (set by extension on every request)
  const memberName = request.headers.get("x-member-name") || "unknown";

  return { memberName };
}
