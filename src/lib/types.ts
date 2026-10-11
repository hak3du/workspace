// Shared DTO types for Quantum Launchpad V2.5

export interface SessionUser {
  id: string;
  handle: string;
  displayName: string;
  avatarEmoji: string;
  avatarColor: string;
  role: string;
  verified: boolean;
  followers: number;
}

export type ViewName =
  | "discover"
  | "spaces"
  | "space"
  | "studio"
  | "launch"
  | "token"
  | "labs"
  | "portfolio";

export interface View {
  name: ViewName;
  id?: string;
}

export interface UserDTO {
  id: string;
  handle: string;
  displayName: string;
  avatarEmoji: string;
  avatarColor: string;
  verified: boolean;
  followers: number;
}

export interface PostDTO {
  id: string;
  type: "VIDEO" | "IMAGE" | "ARTICLE" | "AUDIO" | "UPDATE" | "CODE";
  title: string;
  body: string;
  mediaUrl?: string | null;
  thumbUrl?: string | null;
  durationLabel?: string | null;
  tags: string[];
  viewCount: number;
  likeCount: number;
  commentCount: number;
  saveCount: number;
  isLive: boolean;
  createdAt: string;
  author: UserDTO;
  space?: { id: string; name: string; slug: string } | null;
  liked?: boolean;
  saved?: boolean;
}

export interface CommentDTO {
  id: string;
  body: string;
  createdAt: string;
  author: UserDTO;
}

export interface SpaceDTO {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  category: string;
  iconEmoji: string;
  gradient: string;
  visibility: string;
  memberCount: number;
  onlineCount: number;
  createdAt: string;
  owner: UserDTO;
  joined?: boolean;
  postCount?: number;
}

export interface SpaceEventDTO {
  id: string;
  title: string;
  kind: string;
  startsAt: string;
}

export interface SpaceMessageDTO {
  id: string;
  body: string;
  createdAt: string;
  author: UserDTO;
}

export interface TokenDTO {
  id: string;
  name: string;
  symbol: string;
  description: string;
  imageUrl?: string | null;
  mint: string;
  status: "BONDING" | "MIGRATED";
  priceSol: number;
  marketCapUsd: number;
  progress: number; // 0..100 bonding curve progress
  creator: UserDTO;
  tradeCount: number;
  virtualSol: number;
  virtualToken: number;
  createdAt: string;
  lastTradeAt: string;
  holders?: number;
  replyCount?: number;
}

export interface TradeDTO {
  id: string;
  side: "BUY" | "SELL";
  solAmount: number;
  tokenAmount: number;
  priceAfter: number;
  traderLabel: string;
  isBot: boolean;
  txSig: string;
  createdAt: string;
}

export interface ActivityDTO {
  id: string;
  kind: string;
  title: string;
  meta: Record<string, unknown>;
  tokenId?: string | null;
  createdAt: string;
}

export interface NotificationDTO {
  id: string;
  kind: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export interface VerificationCheckDTO {
  id: string;
  name: string;
  status: "PASS" | "WARN" | "FAIL" | "UNAVAILABLE";
  detail: string;
  source: string;
  checkedAt: string;
}

export interface ApiKeyDTO {
  id: string;
  label: string;
  prefix: string;
  environment: "SANDBOX" | "PRODUCTION";
  plan: string;
  quota: number;
  used: number;
  revoked: boolean;
  lastUsedAt?: string | null;
  createdAt: string;
}

export interface HoldingDTO {
  id: string;
  token: TokenDTO;
  amount: number;
  avgPrice: number;
  valueSol: number;
  pnlUsd: number;
}

export interface PortfolioDTO {
  address: string | null;
  provider: string | null;
  solBalance: number;
  solUsd: number;
  holdings: HoldingDTO[];
  recentTrades: (TradeDTO & { tokenName: string; tokenSymbol: string; tokenImage?: string | null })[];
  totalValueUsd: number;
  totalPnlUsd: number;
  cashbackRate: number;
  securityAlerts: number;
  launchFeesPaid: number;
}

export interface BootstrapDTO {
  user: SessionUser;
  featured: PostDTO | null;
  trending: PostDTO[];
  live: PostDTO[];
  topTokens: TokenDTO[];
  topSpaces: SpaceDTO[];
  ticker: ActivityDTO[];
  stats: {
    creators: number;
    media: number;
    spaces: number;
    launches: number;
    volumeUsd: number;
  };
}

export interface AheEnvelope {
  v: string;
  alg: string;
  kdf: string;
  kid: string;
  iv: string;
  ct: string;
  tag: string;
}

export interface SearchResultGroup {
  kind: string;
  label: string;
  items: { id: string; title: string; subtitle: string; image?: string | null; target: { name: ViewName; id?: string } }[];
}
