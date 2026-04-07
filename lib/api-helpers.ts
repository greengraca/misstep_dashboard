import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "./api-auth";
import { logApiError } from "./error-log";
import type { Session } from "next-auth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HandlerReturn = Response | Record<string, any>;

/** If the handler returned a plain object, wrap it in NextResponse.json(). */
function toResponse(result: HandlerReturn): Response {
  if (result instanceof Response) return result;
  return NextResponse.json(result);
}

/**
 * Wraps an API route handler with auth, rate limiting, and error handling.
 * Use for routes that need the session (mutations, activity logging).
 * The handler can return a Response or a plain object (auto-wrapped in NextResponse.json).
 */
export function withAuth(
  handler: (req: NextRequest, session: Session) => Promise<HandlerReturn>,
  routeName: string
) {
  return async (request: NextRequest) => {
    try {
      const { session, error } = await requireAuth(request);
      if (error) return error;
      return toResponse(await handler(request, session));
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
 * Wraps an API route handler with auth and error handling.
 * Use for read-only routes that don't need the session object.
 * The handler can return a Response or a plain object (auto-wrapped in NextResponse.json).
 */
export function withAuthRead(
  handler: (req: NextRequest) => Promise<HandlerReturn>,
  routeName: string
) {
  return async (request: NextRequest) => {
    try {
      const { error } = await requireAuth(request);
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

/**
 * Wraps a dynamic API route handler with auth and error handling.
 * Use for routes with params that need the session (mutations).
 * The handler can return a Response or a plain object (auto-wrapped in NextResponse.json).
 */
export function withAuthParams<P>(
  handler: (req: NextRequest, session: Session, params: P) => Promise<HandlerReturn>,
  routeName: string
) {
  return async (request: NextRequest, ctx: { params: Promise<P> }) => {
    try {
      const { session, error } = await requireAuth(request);
      if (error) return error;
      const params = await ctx.params;
      return toResponse(await handler(request, session, params));
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
 * Wraps a dynamic API route handler with auth and error handling.
 * Use for read-only routes with params that don't need the session.
 * The handler can return a Response or a plain object (auto-wrapped in NextResponse.json).
 */
export function withAuthReadParams<P>(
  handler: (req: NextRequest, params: P) => Promise<HandlerReturn>,
  routeName: string
) {
  return async (request: NextRequest, ctx: { params: Promise<P> }) => {
    try {
      const { error } = await requireAuth(request);
      if (error) return error;
      const params = await ctx.params;
      return toResponse(await handler(request, params));
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
