# ============================================
# Base image
# ============================================
FROM node:20-alpine AS base

RUN apk add --no-cache \
  openssl \
  libc6-compat

WORKDIR /app
ENV NODE_ENV=production

# ============================================
# Dependencies stage
# ============================================
FROM base AS deps

COPY package.json bun.lock* package-lock.json* ./

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

# 👇 IMPORTANT: Make DATABASE_URL available at build time
ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build app
RUN npm run build

# ============================================
# Production dependencies stage
# ============================================
FROM base AS prod-deps

WORKDIR /app

COPY package.json bun.lock* package-lock.json* ./

RUN if [ -f bun.lock ]; then \
  npm install --legacy-peer-deps --omit=dev --ignore-scripts; \
  elif [ -f package-lock.json ]; then \
  npm ci --omit=dev --ignore-scripts; \
  else \
  npm install --legacy-peer-deps --omit=dev --ignore-scripts; \
  fi && \
  npm install --legacy-peer-deps --no-save prisma

# ============================================
# Production runner
# ============================================
FROM base AS runner

WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
  adduser --system --uid 1001 appuser

COPY --from=prod-deps --chown=appuser:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:nodejs /app/package.json ./
COPY --from=builder --chown=appuser:nodejs /app/build ./build
COPY --from=builder --chown=appuser:nodejs /app/prisma ./prisma
COPY --from=builder --chown=appuser:nodejs /app/public ./public

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); });"

CMD ["npm", "run", "docker-start"]
