import { NextRequest, NextResponse } from "next/server";
import { requireExtAuth } from "./ext-auth";
import { requireAuth } from "./api-auth";
import { logApiError } from "./error-log";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HandlerReturn = Response | Record<string, any>;

function toResponse(result: HandlerReturn): Response {
  if (result instanceof Response) return result;
  return NextResponse.json(result);
}

/**
 * Wraps an API route handler with extension Bearer-token auth and error handling.
 * Use for mutation routes (POST/PATCH/DELETE) that need the member name.
 */
export function withExtAuth(
  handler: (req: NextRequest, memberName: string) => Promise<HandlerReturn>,
  routeName: string
) {
  return async (request: NextRequest) => {
    try {
      const { memberName, error } = await requireExtAuth(request);
      if (error) return error;
      return toResponse(await handler(request, memberName));
    } catch (err) {
      console.error(`${routeName} error:`, err);
      logApiError(routeName, err);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  };
}

/**
 * Wraps an API route handler that accepts EITHER NextAuth session (dashboard)
 * OR extension Bearer token. Use for read-only ext routes that the frontend also calls.
 */
export function withExtAuthRead(
  handler: (req: NextRequest) => Promise<HandlerReturn>,
  routeName: string
) {
  return async (request: NextRequest) => {
    try {
      // Try NextAuth session first (dashboard)
      const sessionResult = await requireAuth(request);
      if (!sessionResult.error) {
        return toResponse(await handler(request));
      }

      // Fall back to Bearer token (extension)
      const { error } = await requireExtAuth(request);
      if (error) return error;

      return toResponse(await handler(request));
    } catch (err) {
      console.error(`${routeName} error:`, err);
      logApiError(routeName, err);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  };
}
