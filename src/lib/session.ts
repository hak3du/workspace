import { db } from "@/lib/db";

// Demo session user — this build still has no full authentication flow; every
// visitor is attributed to the seeded "@nova" account. Auth and wallet remain
// separate. Upsert avoids duplicate-create races on concurrent first requests.
export async function getSessionUser() {
  return db.user.upsert({
    where: { handle: "@nova" },
    update: {},
    create: {
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
