import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { spotPrice, curveProgress, TOTAL_SUPPLY } from "@/lib/bonding";
import { SOL_USD } from "@/lib/format";
import type { SearchResultGroup, ViewName } from "@/lib/types";

export const dynamic = "force-dynamic";

// Global unified search across tokens, posts, spaces, creators, docs.
export async function GET(req: NextRequest) {
  try {
    const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
    if (q.length < 2) return NextResponse.json({ groups: [] as SearchResultGroup[] });

    const like = { contains: q };
    const [tokens, posts, spaces, users] = await Promise.all([
      db.token.findMany({
        where: { OR: [{ name: like }, { symbol: like }, { mint: like }] },
        take: 5, include: { creator: true },
      }),
      db.post.findMany({ where: { OR: [{ title: like }, { body: like }] }, take: 5, include: { author: true } }),
      db.space.findMany({ where: { OR: [{ name: like }, { tagline: like }] }, take: 5, include: { owner: true } }),
      db.user.findMany({ where: { OR: [{ handle: like }, { displayName: like }] }, take: 5 }),
    ]);

    const groups: SearchResultGroup[] = [];

    if (tokens.length) {
      groups.push({
        kind: "token",
        label: "Launches & tokens",
        items: tokens.map((t) => ({
          id: t.id,
          title: `${t.name} (${t.symbol})`,
          subtitle: `Market cap ${Math.round(spotPrice(t) * TOTAL_SUPPLY * SOL_USD).toLocaleString()} USD · ${Math.round(curveProgress(t))}% of curve`,
          image: t.imageUrl,
          target: { name: "token" as ViewName, id: t.id },
        })),
      });
    }
    if (posts.length) {
      groups.push({
        kind: "post",
        label: "Media & posts",
        items: posts.map((p) => ({
          id: p.id,
          title: p.title,
          subtitle: `${p.author.displayName} · ${p.type.toLowerCase()}`,
          image: p.mediaUrl,
          target: { name: "discover" as ViewName },
        })),
      });
    }
    if (spaces.length) {
      groups.push({
        kind: "space",
        label: "Spaces & Arenas",
        items: spaces.map((s) => ({
          id: s.id,
          title: `${s.iconEmoji} ${s.name}`,
          subtitle: `${s.memberCount.toLocaleString()} members · ${s.category.toLowerCase()}`,
          image: null,
          target: { name: "space" as ViewName, id: s.id },
        })),
      });
    }
    if (users.length) {
      groups.push({
        kind: "creator",
        label: "People & creators",
        items: users.map((u) => ({
          id: u.id,
          title: `${u.displayName} ${u.handle}`,
          subtitle: `${u.followers.toLocaleString()} followers`,
          image: null,
          target: { name: "spaces" as ViewName },
        })),
      });
    }

    // Static docs results
    const docs: Record<string, { title: string; subtitle: string; view: ViewName }> = {
      ahe: { title: "AHE — Adaptive Hashing Encryption", subtitle: "Quantum Labs · crypto service console", view: "labs" },
      quantum: { title: "Quantum Labs developer platform", subtitle: "API keys, quotas, SDK, verification", view: "labs" },
      launch: { title: "Launch Arena", subtitle: "Create, trade and follow token launches", view: "launch" },
      portfolio: { title: "Portfolio & card", subtitle: "Holdings, activity, cashback", view: "portfolio" },
      studio: { title: "Creator Studio", subtitle: "Publishing, analytics, monetization", view: "studio" },
      space: { title: "Spaces & Arenas", subtitle: "Customizable digital worlds", view: "spaces" },
    };
    const docKey = Object.keys(docs).find((k) => q.toLowerCase().includes(k));
    if (docKey) {
      const d = docs[docKey];
      groups.push({
        kind: "docs",
        label: "Documentation & platform",
        items: [{ id: docKey, title: d.title, subtitle: d.subtitle, image: null, target: { name: d.view } }],
      });
    }

    return NextResponse.json({ groups });
  } catch (err) {
    console.error("search error", err);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
