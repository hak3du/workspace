/**
 * Quantum Launchpad V2.5 — seed script (run: bun prisma/seed.ts)
 * Creates demo users, spaces, media posts, launch tokens with bonding-curve
 * history, activity ticker, notifications, fee records, verification checks
 * and AHE API keys. Idempotent: wipes and rebuilds.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const VIRTUAL_SOL_INIT = 30;
const VIRTUAL_TOKEN_INIT = 1_000_000_000;
const K = VIRTUAL_SOL_INIT * VIRTUAL_TOKEN_INIT;
const MIGRATION_SOL = 85;
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const rnd = (n: number) => Math.floor(Math.random() * n);
const pick = <T>(a: T[]): T => a[rnd(a.length)];
const b58 = (len: number) => Array.from({ length: len }, () => B58[rnd(B58.length)]).join("");
const daysAgo = (d: number) => new Date(Date.now() - d * 86400000 - rnd(3600) * 1000);
const minsAgo = (m: number) => new Date(Date.now() - m * 60000);

async function main() {
  console.log("Seeding Quantum Launchpad V2.5 …");

  // Wipe (FK-safe order)
  await db.apiUsageEvent.deleteMany();
  await db.apiKey.deleteMany();
  await db.verificationCheck.deleteMany();
  await db.feeRecord.deleteMany();
  await db.trade.deleteMany();
  await db.holding.deleteMany();
  await db.activityEvent.deleteMany();
  await db.notification.deleteMany();
  await db.reaction.deleteMany();
  await db.comment.deleteMany();
  await db.post.deleteMany();
  await db.spaceMessage.deleteMany();
  await db.spaceEvent.deleteMany();
  await db.spaceMembership.deleteMany();
  await db.space.deleteMany();
  await db.token.deleteMany();
  await db.wallet.deleteMany();
  await db.config.deleteMany();
  await db.user.deleteMany();

  // ---------- Users ----------
  const nova = await db.user.create({
    data: {
      handle: "@nova", displayName: "Nova Reyes", avatarEmoji: "🛸", avatarColor: "#8b5cf6",
      bio: "Explorer of the Quantum universe. Building where media meets crypto.", role: "CREATOR", verified: true, followers: 1284,
    },
  });
  const dylan = await db.user.create({
    data: { handle: "@dylanhodges", displayName: "Dylan Hodges", avatarEmoji: "🥷", avatarColor: "#22d3ee", bio: "Cinematic worlds & live sessions.", role: "CREATOR", verified: true, followers: 536000 },
  });
  const cat = await db.user.create({
    data: { handle: "@DonaldCat", displayName: "DonaldCat", avatarEmoji: "🐱", avatarColor: "#f59e0b", bio: "This cat is always right and everyone else is wrong.", role: "CREATOR", followers: 98211 },
  });
  const mira = await db.user.create({
    data: { handle: "@miraquant", displayName: "Mira Quant", avatarEmoji: "🧪", avatarColor: "#34d399", bio: "Post-quantum researcher. AHE contributor.", role: "DEVELOPER", verified: true, followers: 20417 },
  });
  const vince = await db.user.create({
    data: { handle: "@vincentparks", displayName: "Vincent Parks", avatarEmoji: "🎧", avatarColor: "#f472b6", bio: "Dropping beats into the void.", role: "CREATOR", followers: 88120 },
  });
  const lillie = await db.user.create({
    data: { handle: "@lillienash", displayName: "Lillie Nash", avatarEmoji: "🎨", avatarColor: "#a78bfa", bio: "Digital art & design systems.", role: "CREATOR", followers: 41233 },
  });
  const bot = await db.user.create({
    data: { handle: "@marketmaker", displayName: "Market Maker", avatarEmoji: "🤖", avatarColor: "#64748b", bio: "Liquidity daemon.", role: "EXPLORER", followers: 3 },
  });

  // ---------- Spaces ----------
  const mkSpace = (s: { slug: string; name: string; tagline: string; category: string; iconEmoji: string; gradient: string; owner: string; memberCount: number; onlineCount: number; visibility?: string }) =>
    db.space.create({
      data: {
        slug: s.slug, name: s.name, tagline: s.tagline, category: s.category, iconEmoji: s.iconEmoji,
        gradient: s.gradient, visibility: s.visibility ?? "PUBLIC", ownerId: s.owner, memberCount: s.memberCount, onlineCount: s.onlineCount,
      },
    });

  const spArena = await mkSpace({ slug: "quantum-arena", name: "Quantum Arena", tagline: "Gaming & esports — tournaments every Friday", category: "GAMING", iconEmoji: "🎮", gradient: "from-violet-600 to-fuchsia-500", owner: dylan.id, memberCount: 24819, onlineCount: 1204 });
  const spCyber = await mkSpace({ slug: "ahe-labs", name: "AHE Labs", tagline: "Post-quantum cryptography research & AHE SDK", category: "CYBERSEC", iconEmoji: "🔐", gradient: "from-cyan-500 to-blue-500", owner: mira.id, memberCount: 9320, onlineCount: 311 });
  const spMusic = await mkSpace({ slug: "sonic-void", name: "Sonic Void", tagline: "Music, podcasts & live listening rooms", category: "MUSIC", iconEmoji: "🎧", gradient: "from-pink-500 to-violet-500", owner: vince.id, memberCount: 15602, onlineCount: 742 });
  const spArt = await mkSpace({ slug: "prism-works", name: "Prism Works", tagline: "Digital art, galleries & design critiques", category: "ART", iconEmoji: "🎨", gradient: "from-amber-500 to-rose-500", owner: lillie.id, memberCount: 7418, onlineCount: 208 });
  const spLaunch = await mkSpace({ slug: "launch-pad", name: "Launch Pad", tagline: "Everything about Launch Arena — launches, fees, trading", category: "STARTUP", iconEmoji: "🚀", gradient: "from-violet-600 to-cyan-500", owner: nova.id, memberCount: 31204, onlineCount: 2870 });
  const spPrivate = await mkSpace({ slug: "builders-deny", name: "Builders' Deny", tagline: "Private builder room — invite only", category: "AI", iconEmoji: "🛠️", gradient: "from-emerald-500 to-cyan-500", owner: mira.id, memberCount: 212, onlineCount: 36, visibility: "PRIVATE" });

  for (const [space, uid] of [[spArena, nova.id], [spCyber, nova.id], [spLaunch, nova.id], [spMusic, nova.id]] as const) {
    await db.spaceMembership.create({ data: { spaceId: space.id, userId: uid, role: "MEMBER" } });
  }

  await db.spaceEvent.create({ data: { spaceId: spArena.id, title: "Friday Night Arena — Quantum Clash Finals", kind: "LIVE", startsAt: new Date(Date.now() + 3600000) } });
  await db.spaceEvent.create({ data: { spaceId: spMusic.id, title: "Sonic Void Listening Room #42", kind: "STREAM", startsAt: new Date(Date.now() + 2 * 3600000) } });
  await db.spaceEvent.create({ data: { spaceId: spCyber.id, title: "AHE v1.2 protocol review", kind: "MILESTONE", startsAt: new Date(Date.now() + 86400000) } });

  await db.spaceMessage.createMany({
    data: [
      { spaceId: spLaunch.id, userId: cat.id, body: "Wen migration? The curve is looking juicy 📈", createdAt: minsAgo(14) },
      { spaceId: spLaunch.id, userId: mira.id, body: "Reminder: bonding curve math is public in /lib/bonding.ts — verify before you ape.", createdAt: minsAgo(41) },
      { spaceId: spLaunch.id, userId: dylan.id, body: "New launch just graduated 🎓 QCAT to the pools!", createdAt: minsAgo(120) },
      { spaceId: spArena.id, userId: dylan.id, body: "Finals bracket is live. Pick your winners!", createdAt: minsAgo(30) },
      { spaceId: spCyber.id, userId: mira.id, body: "Self-test suite green: roundtrip, tamper, wrong-key, version guard ✅", createdAt: minsAgo(95) },
      { spaceId: spMusic.id, userId: vince.id, body: "Listening room starts in 2 hours — bring your weirdest tracks.", createdAt: minsAgo(58) },
    ],
  });

  // ---------- Media posts ----------
  const mkPost = (p: { authorId: string; spaceId?: string; type: string; title: string; body?: string; mediaUrl?: string; durationLabel?: string; tags?: string[]; likeCount?: number; viewCount?: number; isLive?: boolean; days?: number }) =>
    db.post.create({
      data: {
        authorId: p.authorId, spaceId: p.spaceId, type: p.type, title: p.title, body: p.body ?? "",
        mediaUrl: p.mediaUrl, durationLabel: p.durationLabel, tags: JSON.stringify(p.tags ?? []),
        likeCount: p.likeCount ?? rnd(4000), viewCount: p.viewCount ?? rnd(90000), isLive: p.isLive ?? false,
        commentCount: rnd(300), saveCount: rnd(900), createdAt: daysAgo(p.days ?? rnd(10)),
      },
    });

  const featured = await mkPost({
    authorId: dylan.id, type: "VIDEO", title: "Inside the Quantum Universe — Season 2 Trailer",
    body: "A cinematic tour through the media-first digital universe: discover, create, connect, launch, build.",
    mediaUrl: "/media/hero-universe.jpg", durationLabel: "2:41", tags: ["featured", "cinematic", "universe"], likeCount: 18400, viewCount: 923000, days: 1,
  });
  await mkPost({ authorId: dylan.id, type: "VIDEO", title: "Building worlds in the Arena — dev diary #7", mediaUrl: "/media/metaverse.jpg", durationLabel: "12:08", tags: ["devlog", "worlds"], likeCount: 8422, days: 2 });
  await mkPost({ authorId: vince.id, type: "AUDIO", title: "Sonic Void — Neon Frequencies vol.12", mediaUrl: "/media/space-music.jpg", durationLabel: "58:12", tags: ["music", "synthwave"], likeCount: 3901, days: 3 });
  await mkPost({ authorId: lillie.id, type: "IMAGE", title: "Prism studies — light, glass and gradient", mediaUrl: "/media/metaverse.jpg", tags: ["art", "design"], likeCount: 5610, days: 4 });
  await mkPost({ authorId: mira.id, type: "ARTICLE", title: "HKDF + AES-GCM: designing AHE v1 content keys", body: "A walk through derivation, nonces and tamper detection — and why versioned envelopes matter for the post-quantum roadmap.", tags: ["cryptography", "ahe"], likeCount: 2208, days: 2 });
  await mkPost({ authorId: mira.id, type: "CODE", title: "AHE SDK quickstart — encrypt in 6 lines", body: "import { aheEncrypt } from '@ahe/sdk' … Full example in the Quantum Labs console.", tags: ["sdk", "dev"], likeCount: 1502, days: 1 });
  const live1 = await mkPost({ authorId: dylan.id, type: "VIDEO", title: "LIVE: Quantum Clash Finals — watch party", mediaUrl: "/media/live-stage.jpg", isLive: true, tags: ["live", "esports"], likeCount: 9911, viewCount: 128000, days: 0 });
  const live2 = await mkPost({ authorId: vince.id, type: "AUDIO", title: "LIVE: Late night listening room", mediaUrl: "/media/space-music.jpg", isLive: true, tags: ["live", "music"], likeCount: 3312, viewCount: 22100, days: 0 });
  await mkPost({ authorId: cat.id, type: "UPDATE", title: "DonaldCat Coin is now the most honest coin. All other coins are wrong.", tags: ["meme"], likeCount: 7104, days: 1 });
  await mkPost({ authorId: nova.id, type: "UPDATE", title: "Welcome to Quantum Launchpad V2.5", body: "Discover media, join Spaces, launch tokens on the Arena, and explore Quantum Labs. Start without a wallet — connect only when you need one.", tags: ["welcome"], likeCount: 640, days: 0 });
  await mkPost({ authorId: dylan.id, type: "VIDEO", title: "Creator Studio walkthrough — publishing, analytics, monetization", mediaUrl: "/media/hero-universe.jpg", durationLabel: "8:32", tags: ["studio"], likeCount: 4188, days: 5 });
  await mkPost({ authorId: lillie.id, type: "IMAGE", title: "Arena keyart — season two", mediaUrl: "/media/live-stage.jpg", tags: ["art", "gaming"], likeCount: 2980, days: 6 });

  await db.comment.createMany({
    data: [
      { postId: featured.id, authorId: cat.id, body: "The transition at 1:12 is unreal 🔥", createdAt: minsAgo(55) },
      { postId: featured.id, authorId: vince.id, body: "Sound design carried this whole thing.", createdAt: minsAgo(120) },
      { postId: featured.id, authorId: lillie.id, body: "That gradient palette though.", createdAt: minsAgo(300) },
    ],
  });
  await db.reaction.createMany({
    data: [
      { postId: featured.id, userId: nova.id, kind: "LIKE" },
      { postId: featured.id, userId: nova.id, kind: "SAVE" },
    ],
  });

  // ---------- Tokens ----------
  interface TokenSpec {
    name: string; symbol: string; description: string; imageUrl?: string; creator: string; targetProgress: number; days: number; migrated?: boolean;
  }
  const specs: TokenSpec[] = [
    { name: "Quantum Cat", symbol: "QCAT", description: "The cat that observed the curve and collapsed it in your favor. Meow beyond classical limits.", imageUrl: "/media/token-quantum-cat.jpg", creator: cat.id, targetProgress: 100, days: 12, migrated: true },
    { name: "SpaceDoge", symbol: "SDOGE", description: "Much orbit. Very curve. Such Solana.", imageUrl: "/media/token-space-doge.jpg", creator: dylan.id, targetProgress: 68, days: 8 },
    { name: "Neon Ape", symbol: "NAPE", description: "Apes together strong. Apes together on-chain.", imageUrl: "/media/token-neon-ape.jpg", creator: lillie.id, targetProgress: 41, days: 5 },
    { name: "Wizard Hat", symbol: "WIZ", description: "Casting spells on the bonding curve since block zero.", imageUrl: "/media/token-wizard.jpg", creator: vince.id, targetProgress: 24, days: 3 },
    { name: "Cyber Frog", symbol: "CFROG", description: "It's not a phase, it's a protocol.", imageUrl: "/media/space-cyber.jpg", creator: mira.id, targetProgress: 9, days: 1 },
    { name: "Foo", symbol: "FOO", description: "Foo. That's it. That's the pitch.", creator: nova.id, targetProgress: 4, days: 0 },
  ];

  const SOL_NOW = 182.42;

  for (const spec of specs) {
    const targetSol = VIRTUAL_SOL_INIT + (spec.targetProgress / 100) * (MIGRATION_SOL - VIRTUAL_SOL_INIT);
    const token = await db.token.create({
      data: {
        name: spec.name, symbol: spec.symbol, description: spec.description, imageUrl: spec.imageUrl,
        mint: b58(44), creatorId: spec.creator, virtualSol: VIRTUAL_SOL_INIT, virtualToken: VIRTUAL_TOKEN_INIT,
        createdAt: daysAgo(spec.days), lastTradeAt: minsAgo(rnd(30)),
      },
    });

    // Simulate a believable buy history reaching the target reserve exactly.
    let virtualSol = VIRTUAL_SOL_INIT;
    let virtualToken = VIRTUAL_TOKEN_INIT;
    const slices = Math.max(6, Math.round(spec.targetProgress / 2) + rnd(6));
    const totalIn = targetSol - VIRTUAL_SOL_INIT;
    const weights = Array.from({ length: slices }, () => 0.4 + Math.random());
    const wSum = weights.reduce((a, b) => a + b, 0);

    for (let i = 0; i < slices; i++) {
      const solIn = (totalIn * weights[i]) / wSum;
      const newSol = virtualSol + solIn;
      const newToken = K / newSol;
      const tokenOut = virtualToken - newToken;
      virtualSol = newSol;
      virtualToken = newToken;
      const price = virtualSol / virtualToken;
      const at = daysAgo(spec.days * (1 - i / slices));
      const label = i % 3 === 0 ? "you" : pick(["0xGhost", "sniperbot7", "degen.eth", "moonrider", "quantumquant", "ape_vault", "solfrog"]);
      await db.trade.create({
        data: {
          tokenId: token.id, userId: label === "you" ? nova.id : null, side: "BUY",
          solAmount: solIn, tokenAmount: tokenOut, priceAfter: price, traderLabel: label,
          isBot: label !== "you", txSig: b58(64), createdAt: at,
        },
      });
    }

    const price = virtualSol / virtualToken;
    const mcap = price * 1_000_000_000 * SOL_NOW;
    await db.token.update({
      where: { id: token.id },
      data: {
        virtualSol, virtualToken, tradeCount: slices,
        status: spec.migrated && spec.targetProgress >= 100 ? "MIGRATED" : "BONDING",
        lastTradeAt: minsAgo(rnd(20)),
      },
    });
    await db.feeRecord.create({
      data: { ref: `launch:${token.id}`, tokenId: token.id, kind: "LAUNCH_FEE", quotedSol: 0.02, settledSol: 0.02, status: "CONFIRMED", txSig: b58(64), createdAt: daysAgo(spec.days), settledAt: daysAgo(spec.days) },
    });
    await db.activityEvent.create({
      data: { kind: "LAUNCH", title: `${spec.symbol} launched on the Arena`, meta: JSON.stringify({ symbol: spec.symbol, mcap }), tokenId: token.id, createdAt: daysAgo(spec.days) },
    });

    // Verification checks
    const graduated = spec.targetProgress >= 100;
    await db.verificationCheck.createMany({
      data: [
        { projectId: token.id, name: "Wallet & address consistency", status: "PASS", detail: "Creator address resolved and consistent across launch records.", checkedAt: daysAgo(spec.days) },
        { projectId: token.id, name: "Launch transaction confirmation", status: "PASS", detail: "Simulated devnet launch transaction confirmed (devnet).", checkedAt: daysAgo(spec.days) },
        { projectId: token.id, name: "Metadata integrity", status: spec.imageUrl ? "PASS" : "WARN", detail: spec.imageUrl ? "On-chain metadata hash matches uploaded media." : "No media uploaded — metadata incomplete." },
        { projectId: token.id, name: "Attestation (PQC adapter)", status: graduated ? "PASS" : "UNAVAILABLE", detail: graduated ? "Launch metadata signed under AHE attestation v1 (dev adapter)." : "No attestation requested for this launch." },
        { projectId: token.id, name: "Repository & release links", status: graduated || spec.symbol === "SDOGE" ? "PASS" : "WARN", detail: graduated || spec.symbol === "SDOGE" ? "Linked repository verified via public API." : "Repository not linked by creator." },
        { projectId: token.id, name: "Program checks", status: "UNAVAILABLE", detail: "On-chain program security scan not available in this environment." },
      ],
    });

    // Ticker trades
    const recent = await db.trade.findMany({ where: { tokenId: token.id }, orderBy: { createdAt: "desc" }, take: 3 });
    for (const t of recent) {
      await db.activityEvent.create({
        data: { kind: "TRADE", title: `${t.traderLabel} ${t.side === "BUY" ? "bought" : "sold"} ${t.solAmount.toFixed(2)} SOL of ${spec.symbol}`, meta: JSON.stringify({ symbol: spec.symbol, side: t.side }), tokenId: token.id, createdAt: t.createdAt },
      });
    }
    void mcap;
  }

  // Holdings for @nova
  const qcat = await db.token.findFirstOrThrow({ where: { symbol: "QCAT" } });
  const sdoge = await db.token.findFirstOrThrow({ where: { symbol: "SDOGE" } });
  const nape = await db.token.findFirstOrThrow({ where: { symbol: "NAPE" } });
  await db.holding.create({ data: { tokenId: qcat.id, userId: nova.id, amount: 42_500_000, avgPrice: 0.00000004 } });
  await db.holding.create({ data: { tokenId: sdoge.id, userId: nova.id, amount: 18_200_000, avgPrice: 0.00000005 } });
  await db.holding.create({ data: { tokenId: nape.id, userId: nova.id, amount: 5_000_000, avgPrice: 0.00000006 } });

  // Follows (as activity)
  await db.activityEvent.createMany({
    data: [
      { kind: "FOLLOW", title: "Lillie Nash followed Nova Reyes", meta: JSON.stringify({}), createdAt: minsAgo(9) },
      { kind: "JOIN", title: "1,204 creators joined Quantum Arena this week", meta: JSON.stringify({}), createdAt: minsAgo(22) },
      { kind: "MILESTONE", title: "AHE SDK crossed 10K sandbox calls", meta: JSON.stringify({}), createdAt: minsAgo(38) },
      { kind: "GRADUATE", title: "QCAT graduated to the liquidity pool 🎓", meta: JSON.stringify({ symbol: "QCAT" }), createdAt: minsAgo(65) },
    ],
  });

  // Notifications
  await db.notification.createMany({
    data: [
      { userId: nova.id, kind: "SYSTEM", title: "Welcome to Quantum Launchpad V2.5", body: "Discover, create, connect, launch and build — all in one universe.", createdAt: minsAgo(2) },
      { userId: nova.id, kind: "LAUNCH", title: "QCAT graduated", body: "Quantum Cat completed its bonding curve and migrated liquidity.", createdAt: minsAgo(65) },
      { userId: nova.id, kind: "SOCIAL", title: "Lillie Nash started following you", body: "Check out her latest gallery in Prism Works.", createdAt: minsAgo(9) },
      { userId: nova.id, kind: "SECURITY", title: "AHE sandbox key active", body: "Your sandbox API key was provisioned. Test encrypt/decrypt in Quantum Labs.", createdAt: minsAgo(180) },
    ],
  });

  // AHE API key for @nova
  const crypto = await import("crypto");
  const raw = crypto.randomBytes(24).toString("base64url");
  const prefix = `ahe_sandbox_${raw.slice(0, 4)}`;
  const fullKey = `${prefix}.${raw}`;
  const key = await db.apiKey.create({
    data: {
      userId: nova.id, label: "Sandbox playground", prefix, keyHash: crypto.createHash("sha256").update(fullKey).digest("hex"),
      environment: "SANDBOX", plan: "FREE", quota: 1000, used: 137,
    },
  });
  await db.apiUsageEvent.createMany({
    data: Array.from({ length: 12 }, (_, i) => ({
      keyId: key.id, endpoint: pick(["/v1/encrypt", "/v1/decrypt"]),
      status: i === 3 ? "ERROR" : "OK", latencyMs: 2 + rnd(18), createdAt: minsAgo(i * 7 + 2),
    })),
  });

  console.log("Seed complete ✅");
  console.log(`  users: 7, spaces: 6, posts: 12, tokens: ${specs.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
