import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

const pinProvider = Credentials({
  id: "pin",
  name: "PIN",
  credentials: {
    pin: { label: "PIN", type: "password" },
  },
  async authorize(credentials) {
    const correctPin = process.env.APP_PIN;
    if (!correctPin || !credentials?.pin) return null;
    if ((credentials.pin as string) !== correctPin) return null;
    return { id: "pin-user", name: "Team Member" };
  },
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [pinProvider],
  pages: {
    signIn: "/login",
  },
  callbacks: {
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