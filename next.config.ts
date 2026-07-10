import type { NextConfig } from "next";

/** Public Cloudflare Tunnel hostname — never a LAN IP. */
const DEFAULT_BACKEND_ORIGIN = "https://api-staging-eth-l2.magro.dev";

const nextConfig: NextConfig = {
  // Serverful Next on Vercel so we can same-origin-proxy REST to the MBP tunnel.
  // (Static export cannot use rewrites / route handlers.)
  devIndicators: false,

  async rewrites() {
    // Local `pnpm dev` / `make frontend`: browser talks to Go on 127.0.0.1:8080.
    // Vercel (or ETH_L2_ENABLE_API_PROXY=1): proxy REST to the public tunnel origin.
    const enableProxy =
      process.env.VERCEL === "1" || process.env.ETH_L2_ENABLE_API_PROXY === "1";
    if (!enableProxy) return [];

    const origin = (
      process.env.ETH_L2_BACKEND_ORIGIN ?? DEFAULT_BACKEND_ORIGIN
    ).replace(/\/$/, "");

    return [
      { source: "/api/:path*", destination: `${origin}/api/:path*` },
      { source: "/health", destination: `${origin}/health` },
      { source: "/health/live", destination: `${origin}/health/live` },
      { source: "/health/ready", destination: `${origin}/health/ready` },
      { source: "/healthz", destination: `${origin}/healthz` },
    ];
  },

  // Allow magro.dev portfolio iframes (matches eth-tx-lifecycle CSP).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'self' https://magro.dev https://www.magro.dev",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
