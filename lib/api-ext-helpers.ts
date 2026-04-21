import { NextRequest, NextResponse } from "next/server";
import { requireExtAuth } from "./ext-auth";
import { requireAuth } from "./api-auth";
import { logApiError } from "./error-log";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HandlerReturn = Response | Record<string, any>;

/**
 * Identity passed to dual-auth read handlers. Exactly one of
 * `memberName` (extension path) or `sessionUser` (dashboard path) is set —
 * both `undefined` means the request wasn't identified. Use this instead
 * of reading `x-member-name` from the request in the handler: that header
 * is trivially spoofable by a dashboard-authed caller.
 */
export interface ExtReadIdentity {
  memberName?: string;
  sessionUser?: string;
}

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
 * Ext-only (Bearer-token-required) mutation wrapper for dynamic routes.
 * Mirrors `withExtAuth` but awaits and forwards `ctx.params` to the handler.
 */
export function withExtAuthParams<P>(
  handler: (
    req: NextRequest,
    memberName: string,
    params: P
  ) => Promise<HandlerReturn>,
  routeName: string
) {
  return async (request: NextRequest, ctx: { params: Promise<P> }) => {
    try {
      const { memberName, error } = await requireExtAuth(request);
      if (error) return error;
      const params = await ctx.params;
      return toResponse(await handler(request, memberName, params));
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
 *
 * The handler receives an `ExtReadIdentity` object telling it which path
 * authorized the call. Handlers that don't need identity can just ignore
 * the second argument.
 */
export function withExtAuthRead(
  handler: (req: NextRequest, identity: ExtReadIdentity) => Promise<HandlerReturn>,
  routeName: string
) {
  return async (request: NextRequest) => {
    try {
      // Try NextAuth session first (dashboard)
      const sessionResult = await requireAuth(request);
      if (!sessionResult.error) {
        const sessionUser = sessionResult.session?.user?.name || undefined;
        return toResponse(await handler(request, { sessionUser }));
      }

      // Fall back to Bearer token (extension)
      const extResult = await requireExtAuth(request);
      if (extResult.error) return extResult.error;

      return toResponse(
        await handler(request, { memberName: extResult.memberName })
      );
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
 * Dual-auth read wrapper for routes with dynamic params (e.g. /api/foo/[id]).
 * Mirrors `withExtAuthRead` but awaits and forwards `ctx.params` to the handler.
 */
export function withExtAuthReadParams<P>(
  handler: (
    req: NextRequest,
    identity: ExtReadIdentity,
    params: P
  ) => Promise<HandlerReturn>,
  routeName: string
) {
  return async (request: NextRequest, ctx: { params: Promise<P> }) => {
    try {
      // Try NextAuth session first (dashboard)
      const sessionResult = await requireAuth(request);
      if (!sessionResult.error) {
        const sessionUser = sessionResult.session?.user?.name || undefined;
        const params = await ctx.params;
        return toResponse(await handler(request, { sessionUser }, params));
      }

      // Fall back to Bearer token (extension)
      const extResult = await requireExtAuth(request);
      if (extResult.error) return extResult.error;

      const params = await ctx.params;
      return toResponse(
        await handler(request, { memberName: extResult.memberName }, params)
      );
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
