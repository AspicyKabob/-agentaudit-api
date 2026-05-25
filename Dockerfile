# AgentAudit API Dockerfile — multi-stage build
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build

# ─── Production stage ────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Install production deps only
COPY package*.json ./
RUN npm ci --only=production

# Copy built artifacts + generated Prisma client
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/prisma ./prisma

# Add curl for healthcheck
RUN apk add --no-cache curl

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

CMD ["node", "dist/server.js"]
