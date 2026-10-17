// Quantum Labs — AHE API keys: list + create.
// keyHash and fullKeyOnce are NEVER returned in lists; the full secret is
// returned exactly once at creation time (see POST).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { generateApiKey } from "@/lib/ahe";
import type { ApiKeyDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

const ENVIRONMENTS = ["SANDBOX", "PRODUCTION"] as const;
const PLANS = ["FREE", "PRO", "ENTERPRISE"] as const;
const QUOTA_BY_PLAN: Record<(typeof PLANS)[number], number> = {
  FREE: 1000,
  PRO: 50000,
  ENTERPRISE: 1000000,
};

type KeyRow = {
  id: string;
  label: string;
  prefix: string;
  environment: string;
  plan: string;
  quota: number;
  used: number;
  revoked: boolean;
  lastUsedAt: Date | null;
  createdAt: Date;
};

function toKeyDTO(k: KeyRow): ApiKeyDTO {
  return {
    id: k.id,
    label: k.label,
    prefix: k.prefix,
    environment: k.environment as ApiKeyDTO["environment"],
    plan: k.plan,
    quota: k.quota,
    used: k.used,
    revoked: k.revoked,
    lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
    createdAt: k.createdAt.toISOString(),
  };
}

export async function GET() {
  try {
    const user = await getSessionUser();
    const keys = await db.apiKey.findMany({
      where: { userId: user.id },
      orderBy: [{ revoked: "asc" }, { createdAt: "desc" }],
    });
    return NextResponse.json({ keys: keys.map(toKeyDTO) });
  } catch (err) {
    console.error("ahe/keys GET error", err);
    return NextResponse.json({ error: "Failed to load API keys" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    const body = (await req.json().catch(() => ({}))) as {
      label?: unknown;
      environment?: unknown;
      plan?: unknown;
    };

    const label = typeof body.label === "string" ? body.label.trim() : "";
    if (label.length < 2 || label.length > 40) {
      return NextResponse.json({ error: "Label must be 2–40 characters" }, { status: 400 });
    }

    const environment =
      typeof body.environment === "string" && (ENVIRONMENTS as readonly string[]).includes(body.environment)
        ? (body.environment as (typeof ENVIRONMENTS)[number])
        : "SANDBOX";
    const plan =
      typeof body.plan === "string" && (PLANS as readonly string[]).includes(body.plan)
        ? (body.plan as (typeof PLANS)[number])
        : "FREE";

    const { fullKey, prefix, hash } = await generateApiKey(environment);
    const key = await db.apiKey.create({
      data: {
        userId: user.id,
        label,
        prefix,
        keyHash: hash,
        fullKeyOnce: null,
        environment,
        plan,
        quota: QUOTA_BY_PLAN[plan],
      },
    });

    // fullKey is shown exactly once by the UI ("You won't see this again").
    return NextResponse.json({ key: toKeyDTO(key), fullKey }, { status: 201 });
  } catch (err) {
    console.error("ahe/keys POST error", err);
    return NextResponse.json({ error: "Failed to create API key" }, { status: 500 });
  }
}
