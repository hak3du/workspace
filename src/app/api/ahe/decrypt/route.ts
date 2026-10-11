// Quantum Labs — AHE v1 decrypt endpoint.
// The envelope.kid must resolve to a key owned by the session user (not
// revoked). AheError outcomes are logged as ERROR usage events and surfaced
// with their stable error codes (AHE_AUTH_FAILED, AHE_MALFORMED_ENVELOPE, …).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { aheDecrypt, AheError } from "@/lib/ahe";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    const body = (await req.json().catch(() => ({}))) as { envelope?: unknown };

    const env = body.envelope as Record<string, unknown> | undefined;
    if (!env || typeof env !== "object" || Array.isArray(env)) {
      return NextResponse.json(
        { error: "Envelope is missing required fields", code: "AHE_MALFORMED_ENVELOPE" },
        { status: 422 }
      );
    }

    const kid = env.kid;
    if (typeof kid !== "string" || !kid) {
      return NextResponse.json(
        { error: "Envelope is missing required fields", code: "AHE_MALFORMED_ENVELOPE" },
        { status: 422 }
      );
    }

    // Ownership guard before any crypto runs.
    const key = await db.apiKey.findFirst({ where: { id: kid, userId: user.id, revoked: false } });
    if (!key) {
      return NextResponse.json({ error: "Key not found or not yours" }, { status: 403 });
    }

    try {
      const result = await aheDecrypt(env as Record<string, string>);
      await db.apiUsageEvent.create({
        data: { keyId: key.id, endpoint: "/v1/decrypt", status: "OK", latencyMs: result.latencyMs },
      });
      await db.apiKey.update({
        where: { id: key.id },
        data: { used: { increment: 1 }, lastUsedAt: new Date() },
      });
      return NextResponse.json({ plaintext: result.plaintext, latencyMs: result.latencyMs });
    } catch (err) {
      if (err instanceof AheError) {
        await db.apiUsageEvent.create({
          data: { keyId: key.id, endpoint: "/v1/decrypt", status: "ERROR", latencyMs: 0 },
        });
        return NextResponse.json({ error: err.message, code: err.code }, { status: 422 });
      }
      throw err;
    }
  } catch (err) {
    console.error("ahe/decrypt error", err);
    return NextResponse.json({ error: "Decryption failed" }, { status: 500 });
  }
}
