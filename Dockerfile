# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Install build tools required for isolated-vm native compilation via node-gyp
RUN apk add --no-cache python3 make g++ linux-headers

# Copy dependency manifests
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies (isolated-vm compiles here)
RUN npm ci

# Copy source code
COPY . .

# Generate Prisma client and build
RUN npx prisma generate
RUN npm run build

# Production stage
FROM node:22-alpine AS production

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Copy all dependencies (including compiled native modules like isolated-vm)
COPY --from=builder /app/node_modules ./node_modules

# Copy built artifacts and Prisma files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Copy entrypoint script
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

EXPOSE 8080

ENTRYPOINT ["dumb-init", "--"]
CMD ["./entrypoint.sh"]
