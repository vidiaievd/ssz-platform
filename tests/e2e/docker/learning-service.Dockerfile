# E2E build — context must be the repo root.
# Includes packages/contracts so the file: dep resolves correctly.

# ── Stage 1: build contracts ───────────────────────────────────────────────────
FROM node:22-bookworm-slim AS contracts-builder

WORKDIR /app/packages/contracts
COPY packages/contracts/package*.json ./
RUN npm ci
COPY packages/contracts/ ./
RUN npm run build

# ── Stage 2: build service ─────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS service-builder

WORKDIR /app/services/learning-service

COPY services/learning-service/package*.json ./
# Provide the contracts dist so npm ci can resolve the file: dep
COPY --from=contracts-builder /app/packages/contracts /app/packages/contracts
RUN npm ci

COPY services/learning-service/tsconfig*.json ./
COPY services/learning-service/prisma/ ./prisma/
COPY services/learning-service/src/ ./src/
COPY services/learning-service/prisma.config.ts* ./

RUN npx prisma generate
RUN npm run build
RUN npm prune --production

# ── Stage 3: runtime ───────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runner

WORKDIR /app

ARG NODE_ENV=development
ENV NODE_ENV=$NODE_ENV

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY --from=service-builder /app/services/learning-service/node_modules ./node_modules
COPY --from=service-builder /app/services/learning-service/dist ./dist
COPY --from=service-builder /app/services/learning-service/prisma ./prisma
COPY --from=service-builder /app/services/learning-service/package.json ./
COPY --from=service-builder /app/services/learning-service/tsconfig.json ./

EXPOSE 3007

CMD ["sh", "-c", "npx prisma migrate deploy --schema prisma/schema.prisma && node dist/main.js"]
