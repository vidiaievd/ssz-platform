# E2E build — context must be the repo root.

# ── Stage 1: build contracts ───────────────────────────────────────────────────
FROM node:22-bookworm-slim AS contracts-builder

WORKDIR /app/packages/contracts
COPY packages/contracts/package*.json ./
RUN npm ci
COPY packages/contracts/ ./
RUN npm run build

# ── Stage 2: build service ─────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS service-builder

WORKDIR /app/services/exercise-engine-service

COPY services/exercise-engine-service/package*.json ./
COPY --from=contracts-builder /app/packages/contracts /app/packages/contracts
RUN npm ci

COPY services/exercise-engine-service/tsconfig*.json ./
COPY services/exercise-engine-service/prisma/ ./prisma/
COPY services/exercise-engine-service/src/ ./src/

RUN npx prisma generate
RUN npm run build
RUN npm prune --production

# ── Stage 3: runtime ───────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runner

WORKDIR /app

ARG NODE_ENV=development
ENV NODE_ENV=$NODE_ENV

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY --from=service-builder /app/services/exercise-engine-service/node_modules ./node_modules
COPY --from=service-builder /app/services/exercise-engine-service/dist ./dist
COPY --from=service-builder /app/services/exercise-engine-service/prisma ./prisma
COPY --from=service-builder /app/services/exercise-engine-service/package.json ./

EXPOSE 3006

CMD ["sh", "-c", "npx prisma migrate deploy --schema prisma/schema.prisma && node dist/main.js"]
