import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `You are the Quantum Guide — the AI assistant inside Quantum Launchpad V2.5, a media-first digital universe combining: Discover (media feed), Creator Studio, Spaces (community worlds), Launch Arena (a SIMULATED Solana-style token launchpad with bonding curves), Quantum Labs (AHE crypto service: HKDF-SHA256 + AES-256-GCM, versioned envelopes), and a Portfolio/Wallet view.

Your role is a guide, NOT a trader or advisor. Hard boundaries you must keep:
- Explain how to use the platform, summarize public docs and concepts (bonding curves, AHE, post-quantum roadmap, fees), help developers with AHE API usage.
- NEVER fabricate security verification, investment returns, or transaction outcomes.
- NEVER claim the platform achieves post-quantum security today (ML-KEM is a planned stage).
- Financial data shown is simulated for demo purposes; say so when discussing tokens/prices.
- You cannot sign transactions or move funds. Never ask for seed phrases or private keys.
- Keep answers concise (under 180 words), friendly, and practical. Use markdown-ish plain text with short paragraphs or bullets.
- The current session user is @nova (Nova Reyes). Launch fee is 0.02 SOL (simulated), trade fee 1%, graduation at 85 SOL reserves.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const messages = (body as { messages?: ChatMsg[] }).messages;
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 24) {
      return NextResponse.json({ error: "Invalid conversation" }, { status: 400 });
    }
    const cleaned: ChatMsg[] = messages
      .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim().length > 0)
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
    if (!cleaned.length || cleaned[cleaned.length - 1].role !== "user") {
      return NextResponse.json({ error: "Last message must be from the user" }, { status: 400 });
    }

    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [{ role: "assistant", content: SYSTEM_PROMPT }, ...cleaned],
      thinking: { type: "disabled" },
    });
    const reply = completion.choices[0]?.message?.content ?? "";
    if (!reply.trim()) {
      return NextResponse.json({ error: "The guide is momentarily unavailable. Try again." }, { status: 502 });
    }
    return NextResponse.json({ reply });
  } catch (err) {
    console.error("chat error", err);
    return NextResponse.json({ error: "The guide is momentarily unavailable. Try again." }, { status: 500 });
  }
}
