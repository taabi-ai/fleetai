# syntax=docker/dockerfile:1.7
# FleetAI Dash — production image (multi-stage, standalone output)
# Build:  docker build -t fleetai-dash:latest -f nextjs_space/Dockerfile nextjs_space
# Run:    docker run -p 3000:3000 --env-file .env fleetai-dash:latest

FROM node:22-bookworm-slim AS base
ENV YARN_ENABLE_GLOBAL_CACHE=false \
    NEXT_TELEMETRY_DISABLED=1
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

# ---------- dependencies ----------
FROM base AS deps
COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn install --immutable || yarn install

# ---------- build ----------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Prisma client output is relative to the schema when built outside the hosted platform.
RUN sed -i -E 's#^(\s*output\s*=\s*").*#\1../node_modules/.prisma/client"#' prisma/schema.prisma \
 && yarn prisma generate
# DATABASE_URL is not needed at build time (all routes are dynamic) but Prisma validates the URL shape.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    NEXTAUTH_SECRET="build-time-placeholder" \
    NEXT_OUTPUT_MODE=standalone
RUN yarn build

# ---------- runtime ----------
FROM node:22-bookworm-slim AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates curl && rm -rf /var/lib/apt/lists/* \
 && groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs -m nextjs
WORKDIR /app
# outputFileTracingRoot is the parent of the app dir, so standalone output is nested under app/
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone/app ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# Prisma CLI + schema for running migrations from the same image (docker compose / k8s job)
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD curl -fsS http://localhost:3000/api/health || exit 1
CMD ["node", "server.js"]
