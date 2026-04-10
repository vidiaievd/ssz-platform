# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm ci

# Copy source and config
COPY tsconfig*.json nest-cli.json ./
COPY prisma/ ./prisma/
COPY src/ ./src/

# Generate Prisma client, then compile TypeScript
RUN npx prisma generate
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# ── Stage 2: runtime ───────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

# curl is used by the docker-compose healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Only copy what the running service needs
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/generated ./generated
COPY --from=builder /app/prisma ./prisma
COPY prisma.config.ts ./
COPY package.json tsconfig.json ./

EXPOSE 3001

# Run migrations then start the service.
# prisma.config.ts is a TS file — ts-node is available via devDeps kept in node_modules after builder prune.
# We use --schema flag to point directly at the schema file, avoiding the TS config.
CMD ["sh", "-c", "npx prisma migrate deploy --schema prisma/schema.prisma && node dist/main"]
