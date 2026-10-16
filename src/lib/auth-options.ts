import type { NextAuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import { db } from "@/lib/db";

/**
 * OAuth-only authentication. No password or wallet secret is ever collected.
 * Configure GitHub OAuth credentials and NEXTAUTH_SECRET before enabling sign-in.
 */
export const authOptions: NextAuthOptions = {
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_ID || "",
      clientSecret: process.env.GITHUB_SECRET || "",
      allowDangerousEmailAccountLinking: false,
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  pages: { signIn: "/auth/signin", error: "/auth/signin" },
  callbacks: {
    async signIn({ profile }) {
      // Never create a local identity from a client-supplied handle.
      const providerId = profile && "id" in profile ? String(profile.id) : "";
      return /^[0-9]{1,20}$/.test(providerId);
    },
    async jwt({ token, profile }) {
      if (profile && "id" in profile) {
        const providerId = String(profile.id);
        if (!/^[0-9]{1,20}$/.test(providerId)) return token;
        const handle = "@github_" + providerId;
        const login = typeof profile.login === "string" ? profile.login : handle.slice(1);
        const displayName = typeof profile.name === "string" && profile.name.trim()
          ? profile.name.trim().slice(0, 80)
          : login.slice(0, 80);
        const user = await db.user.upsert({
          where: { handle },
          update: { displayName },
          create: {
            handle,
            displayName,
            avatarEmoji: "👾",
            avatarColor: "#22d3ee",
            bio: "",
            role: "EXPLORER",
            verified: false,
          },
          select: { id: true },
        });
        token.sub = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        (session.user as typeof session.user & { id: string }).id = token.sub;
      }
      return session;
    },
  },
};
