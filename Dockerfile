# syntax=docker/dockerfile:1

# ==============================================================================
# Stage 1: Install dependencies
# ==============================================================================
FROM node:22-bookworm-slim AS deps
WORKDIR /app

COPY package.json package-lock.json .npmrc* ./
RUN npm ci --no-audit --no-fund

# ==============================================================================
# Stage 2: Build the Next.js production bundle (NO server secrets in image)
# ==============================================================================
FROM node:22-bookworm-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Public client-safe build arguments only.
# Server secrets (DATABASE_URL, NEXTAUTH_SECRET, SUPABASE_SERVICE_ROLE_KEY,
# SUPABASE_URL, OPENAI_API_KEY) MUST NOT be passed at build time; they are
# injected strictly at container runtime via docker-compose.yml.
ARG NEXT_PUBLIC_SUPABASE_URL=""
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=""
ARG NEXT_PUBLIC_APP_URL="http://localhost:3000"
ARG NEXTAUTH_URL="http://localhost:3000"

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV NEXTAUTH_URL=${NEXTAUTH_URL}

RUN npm run build && npm prune --omit=dev

# ==============================================================================
# Stage 3: Minimal non-root production runtime
# ==============================================================================
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Ensure all runtime files are owned by the non-root 'node' user (UID 1000)
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/next.config.ts ./next.config.ts
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/node_modules ./node_modules

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/auth/session').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npx", "next", "start", "-p", "3000"]
