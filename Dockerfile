# ==========================================
# STAGE 1: Build Frontend (React + Vite)
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Cài đặt toàn bộ dependencies (Sử dụng package.json của gốc, client, server)
COPY package*.json ./
COPY client/package*.json client/
COPY server/package*.json server/
RUN npm ci

# Copy source code client và build
COPY client/ client/
WORKDIR /app/client
RUN npm run build

# ==========================================
# STAGE 2: Setup Express Backend & Serve Static
# ==========================================
FROM node:20-alpine

WORKDIR /app

# Chỉ cài đặt production dependencies cho server
COPY package*.json ./
COPY server/package*.json server/
RUN npm ci --omit=dev

# Copy source code của server
COPY server/ server/

# Copy thư mục build của client từ Stage 1 sang đúng vị trí mà Express mong đợi
COPY --from=builder /app/client/dist /app/client/dist

WORKDIR /app/server
EXPOSE 5000

# Khởi chạy Backend
CMD ["node", "src/server.js"]
