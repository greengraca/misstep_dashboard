import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { timingSafeEqual } from "crypto";

const pinProvider = Credentials({
  id: "pin",
  name: "PIN",
  credentials: {
    pin: { label: "PIN", type: "password" },
  },
  async authorize(credentials) {
    const correctPin = process.env.APP_PIN;
    if (!correctPin || !credentials?.pin) return null;
    const pinBuf = Buffer.from(credentials.pin as string);
    const correctBuf = Buffer.from(correctPin);
    if (pinBuf.length !== correctBuf.length || !timingSafeEqual(pinBuf, correctBuf)) return null;
    return { id: "pin-user", name: "Team Member" };
  },
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [pinProvider],
  pages: {
    signIn: "/login",
  },
  // Trust the request's host header. Without this, NextAuth uses AUTH_URL
  // for redirects/callbacks, which is pinned to the production hostname —
  // so a successful login on a Vercel preview deployment bounces the user
  // back to production instead of the preview URL they came from.
  trustHost: true,
  callbacks: {
    authorized({ auth: session, request: { nextUrl } }) {
      const isLoggedIn = !!session?.user;
      const isOnLogin = nextUrl.pathname.startsWith("/login");
      if (isOnLogin) return isLoggedIn ? Response.redirect(new URL("/", nextUrl)) : true;
      return isLoggedIn;
    },
    async session({ session, token }) {
      if (token?.sub && session.user) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
});

export async function getUserName(): Promise<string> {
  const session = await auth();
  return session?.user?.name || session?.user?.email || "Unknown";
}