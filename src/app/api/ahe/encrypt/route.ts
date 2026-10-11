// Quantum Labs — AHE v1 encrypt endpoint.
// Resolve key by keyId (session user's own, non-revoked) or by fullKey
// (sha256 lookup — lets the docs curl example work without exposing the hash).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { aheEncrypt, hashKey } from "@/lib/ahe";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    const body = (await req.json().catch(() => ({}))) as {
      keyId?: unknown;
      fullKey?: unknown;
      plaintext?: unknown;
    };

    const plaintext = typeof body.plaintext === "string" ? body.plaintext : "";
    if (plaintext.length < 1 || plaintext.length > 8000) {
      return NextResponse.json({ error: "plaintext must be 1–8000 characters" }, { status: 400 });
    }

    // Resolve key: explicit keyId → explicit fullKey → first active key (docs quickstart).
    let key: Awaited<ReturnType<typeof db.apiKey.findFirst>> = null;
    if (typeof body.keyId === "string" && body.keyId) {
      key = await db.apiKey.findFirst({ where: { id: body.keyId, userId: user.id, revoked: false } });
      if (!key) return NextResponse.json({ error: "Key not found or not yours" }, { status: 403 });
    } else if (typeof body.fullKey === "string" && body.fullKey) {
      key = await db.apiKey.findFirst({ where: { keyHash: hashKey(body.fullKey), userId: user.id, revoked: false } });
      if (!key) return NextResponse.json({ error: "Key not found or not yours" }, { status: 403 });
    } else {
      key = await db.apiKey.findFirst({ where: { userId: user.id, revoked: false }, orderBy: { createdAt: "asc" } });
      if (!key) return NextResponse.json({ error: "No active API key — create one in Quantum Labs first" }, { status: 400 });
    }

    if (key.used >= key.quota) {
      return NextResponse.json({ error: "Quota exceeded for this key" }, { status: 429 });
    }

    const result = await aheEncrypt(key.id, plaintext);

    await db.apiUsageEvent.create({
      data: { keyId: key.id, endpoint: "/v1/encrypt", status: "OK", latencyMs: result.latencyMs },
    });
    await db.apiKey.update({
      where: { id: key.id },
      data: { used: { increment: 1 }, lastUsedAt: new Date() },
    });

    return NextResponse.json({
      envelope: result.envelope,
      ciphertextBytes: result.ciphertextBytes,
      latencyMs: result.latencyMs,
    });
  } catch (err) {
    console.error("ahe/encrypt error", err);
    return NextResponse.json({ error: "Encryption failed" }, { status: 500 });
  }
}
