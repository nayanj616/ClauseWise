import type { NextConfig } from "next";

function getServerActionAllowedOrigins(): string[] {
  const origins = new Set<string>(["localhost:3000"]);

  for (const rawUrl of [
    process.env.NEXTAUTH_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ]) {
    if (rawUrl) {
      try {
        origins.add(new URL(rawUrl).host);
      } catch {
        // Ignore malformed URLs
      }
    }
  }

  if (process.env.VERCEL_URL) {
    origins.add(process.env.VERCEL_URL);
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    origins.add(process.env.VERCEL_PROJECT_PRODUCTION_URL);
  }

  return Array.from(origins);
}

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
      allowedOrigins: getServerActionAllowedOrigins(),
    },
  },
};

export default nextConfig;

