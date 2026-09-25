#!/bin/bash

# Kiểm tra xem có file .env chưa
if [ ! -f .env ]; then
  echo "⚠️ Chưa tìm thấy file .env. Đang tạo từ .env.example..."
  cp .env.example .env
  echo "Vui lòng mở file .env để sửa các cấu hình (Password, Domain...) sau đó chạy lại lệnh này!"
  exit 1
fi

echo "🚀 Bắt đầu khởi chạy hệ thống ATTENDLY với Docker..."

# Pull code mới nhất (nếu chạy trên VPS)
# git pull origin main

# Build và khởi chạy các container ở chế độ nền (daemon)
docker compose up -d --build

echo "✅ Đã khởi chạy xong! Kiểm tra trạng thái bằng lệnh: docker compose ps"
