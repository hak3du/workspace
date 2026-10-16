type Bucket = { start: number; count: number };

const buckets = new Map<string, Bucket>();

/**
 * Best-effort per-instance throttle for public market proxy endpoints.
 * Vercel instances do not share memory; configure provider-side quotas for a hard limit.
 */
export function marketProxyRateLimit(request: Request, scope: string, limit: number, windowMs = 60_000) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip") || "unknown";
  const key = scope + ":" + ip;
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now - bucket.start >= windowMs) {
    bucket = { start: now, count: 0 };
    buckets.set(key, bucket);
  }
  bucket.count += 1;

  if (buckets.size > 5_000) {
    for (const [candidate, value] of buckets) {
      if (now - value.start >= windowMs) buckets.delete(candidate);
    }
  }

  const allowed = bucket.count <= limit;
  return {
    allowed,
    retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - bucket.start)) / 1000)),
  };
}
