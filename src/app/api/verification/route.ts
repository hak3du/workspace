// Quantum project verification checks — latest check per name for a project.
// Honesty rule surfaced in the UI: an UNAVAILABLE check is not a PASS, and
// attestations verify metadata signing, not project honesty or contract safety.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { VerificationCheckDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const projectId = new URL(req.url).searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    const rows = await db.verificationCheck.findMany({
      where: { projectId },
      orderBy: { checkedAt: "desc" },
    });

    // Latest per name (rows are newest-first).
    const seen = new Set<string>();
    const checks: VerificationCheckDTO[] = [];
    for (const c of rows) {
      if (seen.has(c.name)) continue;
      seen.add(c.name);
      checks.push({
        id: c.id,
        name: c.name,
        status: c.status as VerificationCheckDTO["status"],
        detail: c.detail,
        source: c.source,
        checkedAt: c.checkedAt.toISOString(),
      });
    }

    return NextResponse.json({ checks });
  } catch (err) {
    console.error("verification GET error", err);
    return NextResponse.json({ error: "Failed to load verification checks" }, { status: 500 });
  }
}
