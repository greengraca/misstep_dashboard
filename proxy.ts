export { auth as proxy } from "@/lib/auth";

export const config = {
  matcher: [
    /*
     * Protect everything except:
     * - /login (auth page)
     * - /api/auth (NextAuth endpoints)
     * - /_next (static assets)
     * - /favicon.ico, /icon.*, /apple-icon.* (icons)
     */
    "/((?!login|api/auth|api/ext|_next|favicon\\.ico|icon|apple-icon).*)",
  ],
};
