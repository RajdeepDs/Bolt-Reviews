# Match package.json engines (Node >=20.19)
FROM node:20-alpine
RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production

# Install dependencies (production only)
# Supports both npm (package-lock.json) and bun (bun.lock)
COPY package.json package-lock.json* bun.lock* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev --legacy-peer-deps; else npm install --omit=dev --legacy-peer-deps; fi && npm cache clean --force
# Remove CLI packages since we don't need them in production
RUN npm remove @shopify/cli 2>/dev/null || true

COPY . .

# Build and run migrations then start (DATABASE_URL must be set at runtime)
RUN npm run build

CMD ["npm", "run", "docker-start"]
