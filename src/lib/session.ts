import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { db } from "@/lib/db";

export class AuthenticationRequiredError extends Error {
  readonly statusCode = 401;
  constructor() {
    super("Authentication required. Sign in before performing this action.");
    this.name = "AuthenticationRequiredError";
  }
}

/**
 * Resolves the user from a verified NextAuth session. Never creates or falls
 * back to a shared demo user. API routes must map AuthenticationRequiredError
 * to HTTP 401 instead of treating an anonymous visitor as @nova.
 */
export async function getSessionUser() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) throw new AuthenticationRequiredError();

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new AuthenticationRequiredError();
  return user;
}

/**
 * Explicitly named helper for importing/creating non-authenticated display
 * records only. Never use this helper to authorize a request or infer identity.
 */
export async function ensureUserByHandle(
  handle: string,
  defaults: Partial<{
    displayName: string;
    avatarEmoji: string;
    avatarColor: string;
  }> = {},
) {
  return db.user.upsert({
    where: { handle },
    update: {},
    create: {
      handle,
      displayName: defaults.displayName ?? handle.replace("@", ""),
      avatarEmoji: defaults.avatarEmoji ?? "👾",
      avatarColor: defaults.avatarColor ?? "#22d3ee",
    },
  });
}
