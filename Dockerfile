# syntax=docker/dockerfile:1
# Multi-stage production image for the PaperDeck Next.js app.
# Build:  docker build --build-arg NEXT_PUBLIC_SUPABASE_URL=... --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=... -t paper-deck .
# Run:    docker run --env-file .env.local -p 3001:3001 paper-deck
# Secrets (SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET, ...) are passed at RUNTIME via --env-file,
# never baked into the image. Only the public NEXT_PUBLIC_* values are build args (they are
# inlined into the client bundle at `next build` and are not secret).

# ---- 1. Dependencies ---------------------------------------------------------
FROM node:22-alpine AS deps
# libc6-compat: some Node native addons expect glibc symbols on musl/alpine.
RUN apk add --no-cache libc6-compat
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ---- 2. Builder --------------------------------------------------------------
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Public Supabase config — inlined into the client bundle during `next build`.
# These are NOT secret (the anon key is meant to ship to browsers).
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_TELEMETRY_DISABLED=1

# Builds to .next/standalone (server.js + minimal node_modules). next/font/google
# fetches the Geist fonts here, so the build needs network access.
RUN pnpm build

# ---- 3. Runner ---------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Run as an unprivileged user.
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Standalone output does NOT include public/ or .next/static — copy them explicitly.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3001
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

# server.js is emitted by Next's standalone output.
CMD ["node", "server.js"]
