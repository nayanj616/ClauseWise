import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Security headers applied to all routes
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          // CSP: tightened further in Phase 10
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // Next.js requires 'unsafe-inline' for styles and 'unsafe-eval' in dev
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' blob: data:",
              "font-src 'self'",
              "connect-src 'self'",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
  // Never expose server-only env vars with NEXT_PUBLIC_ prefix unless intentional
  // Explicitly allowlist what can be in the client bundle
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000"],
    },
  },
};

export default nextConfig;

