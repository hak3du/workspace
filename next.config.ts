import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Production builds must fail on TypeScript errors rather than silently
  // shipping an artifact whose type safety has not been established.
  reactStrictMode: false,
};

export default nextConfig;
