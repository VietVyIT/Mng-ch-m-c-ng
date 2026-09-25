#!/bin/bash

# Kiểm tra xem có file .env.docker chưa
if [ ! -f .env.docker ]; then
  echo "⚠️ Chưa tìm thấy file .env.docker. Đang tạo từ .env.docker.example..."
  cp .env.docker.example .env.docker
  echo "Vui lòng mở file .env.docker để sửa các cấu hình (Password, Domain...) sau đó chạy lại lệnh này!"
  exit 1
fi

echo "🚀 Bắt đầu khởi chạy hệ thống ATTENDLY với Docker..."

# Pull code mới nhất (nếu chạy trên VPS)
# git pull origin main

# Build và khởi chạy các container ở chế độ nền (daemon)
docker compose --env-file .env.docker up -d --build

echo "✅ Đã khởi chạy xong! Kiểm tra trạng thái bằng lệnh: docker compose ps"
