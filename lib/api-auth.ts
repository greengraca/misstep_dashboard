import { NextRequest, NextResponse } from "next/server";
import { auth } from "./auth";
import { logAuthFailure } from "./error-log";
import type { Session } from "next-auth";

type AuthResult =
  | { session: Session; error?: never }
  | { session?: never; error: NextResponse };

/**
 * Require authentication for an API route.
 * Logs auth failures with IP and pathname for monitoring.
 */
export async function requireAuth(
  request: NextRequest
): Promise<AuthResult> {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const pathname = new URL(request.url).pathname;

  const session = await auth();
  if (!session?.user?.id) {
    logAuthFailure(pathname, { ip });
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { session };
}
