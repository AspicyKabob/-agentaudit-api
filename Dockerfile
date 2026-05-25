# AgentAudit API Dockerfile — multi-stage build
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

# Install OpenSSL so Prisma generates engine matching production stage
RUN apk add --no-cache openssl

COPY . .
RUN npx prisma generate
RUN npm run build

# ─── Production stage ────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Install production deps only
COPY package*.json ./
RUN npm ci --only=production

# Install OpenSSL + curl for Prisma engine and healthcheck
RUN apk add --no-cache openssl curl

# Copy built artifacts + generated Prisma client + engine binaries + CLI
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/.bin ./node_modules/.bin

# Copy prisma files from build context (not cached builder) to ensure migrations exist
COPY prisma ./prisma

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

CMD node_modules/.bin/prisma migrate deploy && node dist/server.js
