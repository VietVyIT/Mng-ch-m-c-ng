# STAGE 1: Client Builder
FROM node:18-alpine AS client-builder

WORKDIR /app/client

# Copy cấu hình client và cài đặt dependencies
COPY client/package*.json ./
RUN npm install

# Copy toàn bộ mã nguồn client và build ra thư mục tĩnh (dist)
COPY client/ ./
RUN npm run build

# STAGE 2: Production Server
FROM node:18-alpine AS production-server

WORKDIR /app/server

# Copy cấu hình server và cài đặt dependencies (chỉ production)
COPY server/package*.json ./
RUN npm install --omit=dev

# Copy toàn bộ mã nguồn server
COPY server/ ./

# Copy thư mục tĩnh đã build từ Stage 1 sang cấu trúc mong đợi của app.js
COPY --from=client-builder /app/client/dist /app/client/dist

# Expose port (Nginx sẽ proxy vào port này)
EXPOSE 3000

# Khởi chạy server
CMD ["node", "src/server.js"]
