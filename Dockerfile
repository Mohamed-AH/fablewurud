# Dockerfile for Duroos Platform (OCI compute)
#
# Build:    docker build -t duroos .
# Run:      docker run -p 3000:3000 --env-file .env duroos
# Compose:  docker-compose up -d
#
# Multistage: build deps stay in the builder; the runtime image ships only
# node_modules + app and runs as a non-root user.

# ---- Builder: install production deps (with native toolchain) ----
FROM node:20-alpine AS builder
WORKDIR /app

# Toolchain for native modules (@sentry/profiling-node, music-metadata)
RUN apk add --no-cache python3 make g++

# Install from the lockfile for reproducible builds (fails if package-lock drifts)
COPY package*.json ./
RUN npm ci --omit=dev

# ---- Runtime: minimal, non-root ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Bring in prebuilt production dependencies
COPY --chown=node:node --from=builder /app/node_modules ./node_modules

# Copy application source (node_modules excluded via .dockerignore)
COPY --chown=node:node . .

# Writable runtime dirs owned by the non-root user
RUN mkdir -p uploads logs && chown -R node:node uploads logs

# Drop root
USER node

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })"

CMD ["node", "server.js"]
