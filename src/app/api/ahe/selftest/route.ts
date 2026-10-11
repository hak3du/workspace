// Quantum Labs — AHE v1 self-test suite.
// Runs the full roundtrip/tamper/version-guard suite against a scratch kid
// (never a real API key). POST exists for symmetry; no metering is attached.
import { NextResponse } from "next/server";
import { aheSelfTest, AHE_VERSION, AHE_ALG, AHE_KDF } from "@/lib/ahe";

export const dynamic = "force-dynamic";

async function handle() {
  try {
    const results = await aheSelfTest();
    const allPassed = results.every((r) => r.status === "PASS");
    return NextResponse.json({
      results,
      allPassed,
      version: AHE_VERSION,
      alg: AHE_ALG,
      kdf: AHE_KDF,
    });
  } catch (err) {
    console.error("ahe/selftest error", err);
    return NextResponse.json({ error: "Self-test run failed" }, { status: 500 });
  }
}

export async function GET() {
  return handle();
}

export async function POST() {
  return handle();
}
