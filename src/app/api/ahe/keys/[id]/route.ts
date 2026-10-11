// Quantum Labs — soft-revoke an AHE API key (owner only).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getSessionUser();

    const key = await db.apiKey.findUnique({ where: { id } });
    if (!key || key.userId !== user.id) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    // Soft revoke — usage events and envelope history stay intact.
    await db.apiKey.update({ where: { id }, data: { revoked: true } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("ahe/keys/[id] DELETE error", err);
    return NextResponse.json({ error: "Failed to revoke key" }, { status: 500 });
  }
}
