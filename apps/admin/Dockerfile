# ─── Stage 1: Install dependencies ───
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# Copy workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY turbo.json ./

# Copy package.json files for all workspace packages
COPY apps/admin/package.json apps/admin/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/

# Install all dependencies
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# ─── Stage 2: Build ───
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# Copy deps
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/admin/node_modules ./apps/admin/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules

# Copy source
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY packages/shared/ packages/shared/
COPY packages/db/ packages/db/
COPY apps/admin/ apps/admin/

# Build shared packages first
WORKDIR /app/packages/shared
RUN npx tsc --outDir dist || true

WORKDIR /app/packages/db
RUN npx tsc --outDir dist || true

# Build the admin app
WORKDIR /app/apps/admin
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN npx next build

# ─── Stage 3: Production runner ───
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone build output
COPY --from=builder /app/apps/admin/.next/standalone ./
COPY --from=builder /app/apps/admin/.next/static ./apps/admin/.next/static
COPY --from=builder /app/apps/admin/public ./apps/admin/public 2>/dev/null || true

USER nextjs
EXPOSE 3000

# The standalone server is at apps/admin/server.js in monorepo mode
CMD ["node", "apps/admin/server.js"]
