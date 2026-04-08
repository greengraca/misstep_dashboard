import { NextRequest, NextResponse } from "next/server";
import { requireExtAuth } from "./ext-auth";
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
 * Wraps an API route handler with extension Bearer-token auth and error handling.
 * Use for read-only routes that don't need the member name.
 */
export function withExtAuthRead(
  handler: (req: NextRequest) => Promise<HandlerReturn>,
  routeName: string
) {
  return async (request: NextRequest) => {
    try {
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
