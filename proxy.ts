export { auth as proxy } from "@/lib/auth";

export const config = {
  matcher: [
    /*
     * Protect everything except:
     * - /login (auth page)
     * - /api/auth (NextAuth endpoints)
     * - /api/ext (extension sync, has its own bearer-token auth)
     * - /_next (Next.js internals)
     * - /favicon.ico, /icon.*, /apple-icon.* (Next file-based icons)
     * - any path with a file extension (static assets in public/: .svg, .png, .ico, .css, etc.)
     */
    "/((?!login|api/auth|api/ext|_next|favicon\\.ico|icon|apple-icon|.*\\..*).*)",
  ],
};
