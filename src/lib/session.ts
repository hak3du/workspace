import { db } from "@/lib/db";

// Demo session user — in this build there is no full auth flow; every visitor
// is attributed to the seeded "@nova" account. Auth and wallet remain separate.
export async function getSessionUser() {
  let user = await db.user.findUnique({ where: { handle: "@nova" } });
  if (!user) {
    user = await db.user.create({
      data: {
        handle: "@nova",
        displayName: "Nova Reyes",
        avatarEmoji: "🛸",
        avatarColor: "#8b5cf6",
        bio: "Explorer of the Quantum universe. Building at the edge of media and crypto.",
        role: "CREATOR",
        verified: true,
      },
    });
  }
  return user;
}

export async function ensureUserByHandle(handle: string, defaults: Partial<{ displayName: string; avatarEmoji: string; avatarColor: string }> = {}) {
  let user = await db.user.findUnique({ where: { handle } });
  if (!user) {
    user = await db.user.create({
      data: {
        handle,
        displayName: defaults.displayName ?? handle.replace("@", ""),
        avatarEmoji: defaults.avatarEmoji ?? "👾",
        avatarColor: defaults.avatarColor ?? "#22d3ee",
      },
    });
  }
  return user;
}
