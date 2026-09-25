# ============================================================
# ATTENDLY – Hệ Thống Quản Lý Chấm Công
# Multi-stage Dockerfile (node:18-alpine)
# ============================================================

# ── Stage 1: Build React/Vite client ────────────────────────
FROM node:18-alpine AS client-builder

WORKDIR /build

# Copy workspace root + client package manifests
COPY package.json package-lock.json ./
COPY client/package.json client/

# Install ALL deps (including devDependencies for vite build)
RUN npm ci --workspace client

# Copy client source & build
COPY client/ client/
RUN npm run build --workspace client


# ── Stage 2: Production server ──────────────────────────────
FROM node:18-alpine AS production

LABEL maintainer="ATTENDLY Team"
LABEL description="Hệ Thống Tra Cứu & Quản Lý Ngày Công Sinh Viên"

# Tini for proper PID 1 signal handling
RUN apk add --no-cache tini

WORKDIR /app

# Copy workspace root + server package manifests
COPY package.json package-lock.json ./
COPY server/package.json server/

# Install production-only dependencies
RUN npm ci --omit=dev --workspace server && npm cache clean --force

# Copy server source
COPY server/ server/

# Copy database schemas & migrations (for reference / init scripts)
COPY database/ database/

# Copy built client from stage 1
COPY --from=client-builder /build/client/dist client/dist

# App listens on port 5000
EXPOSE 5000

# Use tini as entrypoint for signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Start the Express server in production mode
ENV NODE_ENV=production
CMD ["node", "server/src/server.js"]
