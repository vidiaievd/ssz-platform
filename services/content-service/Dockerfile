# Build context: repo root (ssz-platform/)
# Required because @ssz/messaging (and its dep @ssz/contracts) are local file: dependencies.

# ── Stage 1: build contracts ───────────────────────────────────────────────────
FROM node:22-bookworm-slim AS contracts-builder

WORKDIR /workspace/packages/contracts

COPY packages/contracts/package*.json ./
RUN npm ci
COPY packages/contracts/src ./src
COPY packages/contracts/tsconfig.json ./
RUN npm run build

# ── Stage 2: build messaging ───────────────────────────────────────────────────
FROM node:22-bookworm-slim AS messaging-builder

COPY --from=contracts-builder /workspace/packages/contracts/package.json /workspace/packages/contracts/package.json
COPY --from=contracts-builder /workspace/packages/contracts/dist         /workspace/packages/contracts/dist

WORKDIR /workspace/packages/messaging

COPY packages/messaging/package*.json ./
RUN npm install --install-links
COPY packages/messaging/src ./src
COPY packages/messaging/tsconfig.json ./
RUN npm run build

# ── Stage 3: build service ────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder
ARG NODE_ENV=development

# Mirror monorepo layout so file: deps resolve within /workspace
COPY --from=contracts-builder /workspace/packages/contracts/package.json /workspace/packages/contracts/package.json
COPY --from=contracts-builder /workspace/packages/contracts/dist         /workspace/packages/contracts/dist
COPY --from=messaging-builder /workspace/packages/messaging/package.json /workspace/packages/messaging/package.json
COPY --from=messaging-builder /workspace/packages/messaging/dist         /workspace/packages/messaging/dist

WORKDIR /workspace/services/content-service

COPY services/content-service/package*.json ./

# --install-links: install file: deps as regular copies, not symlinks
RUN npm install --install-links

COPY services/content-service/tsconfig*.json services/content-service/nest-cli.json ./
COPY services/content-service/prisma/ ./prisma/
COPY services/content-service/src/ ./src/

RUN npx prisma generate
RUN npm run build
RUN if [ "$NODE_ENV" = "production" ]; then npm prune --production; fi

# ── Stage 4: runtime ──────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runner

WORKDIR /app

ARG NODE_ENV=development
ENV NODE_ENV=$NODE_ENV

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY --from=builder /workspace/services/content-service/node_modules ./node_modules
COPY --from=builder /workspace/services/content-service/dist         ./dist
COPY --from=builder /workspace/services/content-service/generated    ./generated
COPY --from=builder /workspace/services/content-service/prisma       ./prisma
COPY services/content-service/prisma.config.ts ./
COPY services/content-service/package.json services/content-service/tsconfig.json ./

EXPOSE 3003

CMD ["sh", "-c", "npx prisma migrate deploy --schema prisma/schema.prisma && node dist/src/main.js"]
