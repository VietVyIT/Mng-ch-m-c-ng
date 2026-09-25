# ATTENDLY – Hệ Thống Quản Lý Chấm Công

Hệ thống tra cứu & quản lý ngày công sinh viên với nhận diện khuôn mặt.

## Công nghệ

- **Frontend:** React 19 · Vite · Chart.js · Face-API · Framer Motion
- **Backend:** Node.js 18+ · Express · JWT · bcrypt · mysql2
- **Database:** MySQL 8.0
- **Triển khai:** Docker · Vercel · Railway

## Yêu cầu

- Node.js 18+ và npm 9+
- MySQL 8.0+
- Docker (nếu dùng Docker)

## Cài đặt local

```bash
# 1. Clone và cài dependencies
git clone https://github.com/VietVyIT/Mng-ch-m-c-ng.git
cd Mng-ch-m-c-ng
npm install

# 2. Tạo database
mysql -u root -p < database/schema.sql
# Hoặc mở database/schema.sql trong MySQL Workbench → Execute

# 3. Cấu hình môi trường
cp server/.env.example server/.env
# Mở server/.env → điền DB_PASSWORD và JWT_SECRET

# 4. Chạy
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:5000/api
- Health check: http://localhost:5000/api/health

## Triển khai Docker

```bash
cp .env.example .env    # Sửa JWT_SECRET trước khi chạy
docker compose up -d --build
```

Truy cập http://localhost:5000 — MySQL tự khởi tạo schema lần đầu.

```bash
docker compose logs -f          # Xem logs
docker compose down             # Dừng
docker compose down -v          # Dừng + xoá database
docker compose up -d --build    # Rebuild
```

## Deploy Vercel + Railway

> Chỉ deploy frontend lên Vercel là chưa đủ. Cần backend Railway + MySQL.

**Railway MySQL** — tạo service MySQL, chạy SQL theo thứ tự:

```
database/schema.sql
database/migrations/003_workflows_shifts.sql
database/migrations/004_punctuality_status.sql
database/migrations/005_attendance_deletion_logs.sql
database/migrations/006_notifications.sql
database/migrations/007_user_profiles.sql
database/migrations/008_imported_attendance.sql
```

**Railway Backend** — Root: `server`, Build: `npm install`, Start: `npm start`

```env
NODE_ENV=production
PORT=5000
CLIENT_URL=https://<frontend-domain>
DB_HOST=<railway-mysql-host>
DB_PORT=3306
DB_NAME=attendance_system
DB_USER=<railway-mysql-user>
DB_PASSWORD=<railway-mysql-password>
JWT_SECRET=<chuỗi-ngẫu-nhiên-tối-thiểu-32-ký-tự>
FACE_MATCH_THRESHOLD=0.6
```

Tạo JWT secret: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

**Vercel Frontend** — Root: `client`, Build: `npm run build`, Output: `dist`

```env
VITE_API_URL=https://<backend-domain>/api
```

Đổi `VITE_API_URL` phải Redeploy vì biến `VITE_*` được nhúng lúc build.

## Tài khoản thử nghiệm

| Vai trò | Username | Password | Ghi chú |
|---------|----------|----------|---------|
| Admin | `admin` | `admin123` | Dashboard, duyệt/xoá công, cấu hình ca |
| User 1 | `user1` | `user123` | Đã có 5 ngày công được duyệt |
| User 2 | `user2` | `user123` | Tài khoản trống, thử check-in đầu tiên |

**Test nhanh:** Đăng nhập `user2` → check-in → đăng nhập `admin` → duyệt → đăng nhập lại `user2` xem kết quả.

> Tài khoản mẫu chỉ dùng cho development, không dùng production.

## Khung giờ ca làm

| Ca | Thời gian | Ghi chú |
|----|-----------|---------|
| Sáng | 07:30 – 12:00 | Mặc định bật |
| Chiều | 13:30 – 17:30 | Mặc định bật |
| Tối | 17:30 – 20:00 | Admin bật/tắt theo ngày |

## Import Excel

Admin → Dashboard → **Nhập dữ liệu Excel** → tải file `.xlsx` / `.xls`.

Yêu cầu file: dòng ngày `D/M` hoặc `D/M/YYYY`, dòng dưới ghi ca (`Sáng`, `Chiều`, `Tối`), cột `Họ & Tên` + `MSSV` + `Total`, ô `x`/`X` = đã đi làm.

Thành viên chưa có tài khoản sẽ được tạo tự động (mật khẩu tạm `user123@`, bắt đổi lần đầu).

## Nạp danh sách thành viên

```bash
npm run seed:members --workspace server
```

File `server/seed/members.json` nằm local, đã thêm `.gitignore`. Mật khẩu lưu bcrypt hash, đánh dấu đổi mật khẩu lần đầu.

## Bảo mật

- Mật khẩu: bcrypt hash (cost 12)
- Xác thực: JWT qua header `Authorization: Bearer <token>`
- HTTP headers: Helmet.js, tắt `x-powered-by`
- Rate limit: 10 lần đăng nhập sai / 5 phút / IP
- SQL: parameter binding (prepared statements)
- Body: JSON giới hạn 10MB
- Không commit `.env`, `members.json` lên git

## Cấu trúc thư mục

```
├── Dockerfile                 # Multi-stage Docker build
├── docker-compose.yml         # MySQL + App
├── .env.example               # Biến môi trường Docker
├── package.json               # Root workspace
├── client/                    # React + Vite
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── styles.css
│   ├── vite.config.js
│   └── vercel.json
├── server/                    # Express API
│   ├── src/
│   │   ├── server.js
│   │   ├── app.js
│   │   ├── config/
│   │   ├── routes/
│   │   ├── middlewares/
│   │   └── utils/
│   └── seed/
└── database/
    ├── schema.sql
    └── migrations/
```
