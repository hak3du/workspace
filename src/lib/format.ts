// Formatting helpers shared across the app.

export const SOL_USD = 182.42;

export function usd(n: number, opts?: { compact?: boolean }): string {
  if (opts?.compact) return "$" + compact(n);
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

export function compact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return (n / 1_000_000_000).toFixed(abs >= 10_000_000_000 ? 0 : 1) + "B";
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1) + "M";
  if (abs >= 1_000) return (n / 1_000).toFixed(abs >= 10_000 ? 0 : 1) + "K";
  if (abs >= 100) return n.toFixed(0);
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function sol(n: number, digits = 3): string {
  return n.toFixed(digits) + " SOL";
}

export function priceLabel(priceSol: number): string {
  if (priceSol === 0) return "0";
  if (priceSol < 0.000001) return priceSol.toExponential(2);
  if (priceSol < 0.001) return priceSol.toFixed(8);
  return priceSol.toFixed(6);
}

export function timeAgo(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m === 1) return "1 min ago";
  if (m < 60) return `${m} mins ago`;
  const h = Math.floor(m / 60);
  if (h === 1) return "1 hr ago";
  if (h < 24) return `${h} hrs ago`;
  const days = Math.floor(h / 24);
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function shortAddr(addr: string): string {
  if (!addr) return "";
  return addr.slice(0, 4) + "…" + addr.slice(-4);
}

export function pct(n: number): string {
  return (n * 100).toFixed(1) + "%";
}
