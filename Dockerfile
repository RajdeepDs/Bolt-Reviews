# Multi-stage build for optimized production image
FROM node:20-alpine AS base

# Install necessary system dependencies
RUN apk add --no-cache \
  openssl \
  libc6-compat

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# ============================================
# Dependencies stage - better layer caching
# ============================================
FROM base AS deps

# Copy package files
COPY package.json bun.lock* package-lock.json* ./

# Install ALL dependencies (including dev) for build stage
# Handle both npm and bun lockfiles
RUN if [ -f bun.lock ]; then \
  npm install --legacy-peer-deps --ignore-scripts; \
  elif [ -f package-lock.json ]; then \
  npm ci --ignore-scripts; \
  else \
  npm install --legacy-peer-deps --ignore-scripts; \
  fi

# ============================================
# Build stage
# ============================================
FROM base AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application code
COPY . .

# Generate Prisma Client (required before build)
RUN npx prisma generate

# Build the application
RUN npm run build

# ============================================
# Production dependencies
# ============================================
FROM base AS prod-deps

WORKDIR /app

# Copy package files
COPY package.json bun.lock* package-lock.json* ./

# Install only production dependencies + prisma CLI (needed for migrations)
RUN if [ -f bun.lock ]; then \
  npm install --legacy-peer-deps --omit=dev --ignore-scripts; \
  elif [ -f package-lock.json ]; then \
  npm ci --omit=dev --ignore-scripts; \
  else \
  npm install --legacy-peer-deps --omit=dev --ignore-scripts; \
  fi && \
  npm install --legacy-peer-deps --no-save prisma

# ============================================
# Production stage
# ============================================
FROM base AS runner

WORKDIR /app

# Don't run production as root
RUN addgroup --system --gid 1001 nodejs && \
  adduser --system --uid 1001 appuser

# Copy production dependencies
COPY --from=prod-deps --chown=appuser:nodejs /app/node_modules ./node_modules

# Copy necessary files from builder
COPY --from=builder --chown=appuser:nodejs /app/package.json ./
COPY --from=builder --chown=appuser:nodejs /app/build ./build
COPY --from=builder --chown=appuser:nodejs /app/prisma ./prisma
COPY --from=builder --chown=appuser:nodejs /app/public ./public

# Switch to non-root user
USER appuser

# Expose the port the app runs on
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); });"

# Start the application
# Run migrations and then start the server
CMD ["npm", "run", "docker-start"]
