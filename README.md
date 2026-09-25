<![CDATA[<div align="center">

# 🚀 ATTENDLY

### Hệ Thống Tra Cứu & Quản Lý Ngày Công Sinh Viên

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![MySQL](https://img.shields.io/badge/MySQL-8.0-4479A1?logo=mysql&logoColor=white)](https://www.mysql.com/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-Private-red)](#)

</div>

---

## 📋 Mục Lục

- [Tổng Quan](#-tổng-quan)
- [Kiến Trúc Hệ Thống](#-kiến-trúc-hệ-thống)
- [Tính Năng Chính](#-tính-năng-chính)
- [Yêu Cầu Hệ Thống](#-yêu-cầu-hệ-thống)
- [Cài Đặt & Chạy Local](#-cài-đặt--chạy-local)
- [Triển Khai Docker](#-triển-khai-docker)
- [Deploy Production (Vercel + Railway)](#-deploy-production-vercel--railway)
- [Cấu Trúc Thư Mục](#-cấu-trúc-thư-mục)
- [API Endpoints](#-api-endpoints)
- [Tài Khoản Thử Nghiệm](#-tài-khoản-thử-nghiệm)
- [Import Bảng Chấm Công Excel](#-import-bảng-chấm-công-excel)
- [Bảo Mật](#-bảo-mật)
- [FAQ & Troubleshooting](#-faq--troubleshooting)

---

## 🌟 Tổng Quan

**ATTENDLY** là hệ thống quản lý chấm công toàn diện dành cho tổ chức sinh viên, hỗ trợ:

- Chấm công bằng **nhận diện khuôn mặt** (Face API)
- Quản lý **phê duyệt** theo quy trình Admin
- **Import** bảng chấm công từ file Excel
- Tra cứu **ngày công cá nhân** theo thời gian thực
- **Dashboard** thống kê & biểu đồ cho Admin

---

## 🏗 Kiến Trúc Hệ Thống

```
┌──────────────────────────────────────────────────────────┐
│                     ATTENDLY System                      │
├──────────────┬───────────────────────┬───────────────────┤
│   Frontend   │      Backend API      │     Database      │
│  React 19    │   Express.js (v4)     │   MySQL 8.0       │
│  Vite 6      │   Node.js 18+        │   utf8mb4         │
│  Chart.js    │   JWT Auth           │   InnoDB          │
│  Face-API    │   Helmet + CORS      │   Connection Pool │
│  Framer      │   Rate Limiting      │   SSL (prod)      │
│  Motion      │   bcrypt             │                   │
├──────────────┴───────────────────────┴───────────────────┤
│              Monorepo (npm workspaces)                   │
│         client/ (Vite SPA)  ←→  server/ (API)           │
└──────────────────────────────────────────────────────────┘
```

| Layer | Công nghệ | Ghi chú |
|:------|:-----------|:--------|
| **Frontend** | React 19, Vite 6, Chart.js, Framer Motion, Lucide Icons | SPA với CSS Glassmorphism |
| **Backend** | Node.js 18+, Express 4, JWT, bcrypt, mysql2/promise | ESM modules, Helmet bảo mật |
| **Database** | MySQL 8.0, utf8mb4_unicode_ci | Schema + 7 migration files |
| **Face Recognition** | @vladmandic/face-api | Client-side, threshold cấu hình |
| **File Import** | xlsx (SheetJS) | Parse Excel trên client |

---

## ✨ Tính Năng Chính

### 👤 Dành cho User
- ✅ Đăng nhập / Đổi mật khẩu bắt buộc lần đầu
- ✅ Check-in / Check-out bằng nhận diện khuôn mặt
- ✅ Xem lịch sử chấm công cá nhân
- ✅ Xem KPI & thống kê ngày công
- ✅ Cập nhật hồ sơ cá nhân (họ tên, SĐT, địa chỉ, quê quán)
- ✅ Nhận thông báo khi công được duyệt/từ chối

### 🛡 Dành cho Admin
- ✅ Dashboard tổng quan với biểu đồ thống kê
- ✅ Phê duyệt / Từ chối yêu cầu chấm công
- ✅ Xem ảnh check-in/check-out của tất cả thành viên
- ✅ Import bảng chấm công từ Excel (.xlsx / .xls)
- ✅ Cấu hình bật/tắt ca tối theo ngày
- ✅ Xoá bản ghi chấm công (có ghi log lý do)
- ✅ Quản lý danh sách thành viên

### ⏰ Khung Giờ Ca Làm Việc

| Ca | Thời gian | Ghi chú |
|:---|:----------|:--------|
| 🌅 Ca sáng | 07:30 – 12:00 | Mặc định bật |
| 🌤 Ca chiều | 13:30 – 17:30 | Mặc định bật |
| 🌙 Ca tối | 17:30 – 20:00 | Admin bật/tắt theo ngày |

---

## 💻 Yêu Cầu Hệ Thống

### Chạy Local (Development)

| Phần mềm | Phiên bản tối thiểu |
|:----------|:--------------------|
| Node.js | 18.x trở lên (khuyến nghị 20.x) |
| npm | 9.x trở lên |
| MySQL | 8.0 trở lên |

### Triển Khai Docker

| Phần mềm | Phiên bản tối thiểu |
|:----------|:--------------------|
| Docker Engine | 24.x trở lên |
| Docker Compose | v2.x trở lên |

---

## 🚀 Cài Đặt & Chạy Local

### 1. Clone repository

```bash
git clone https://github.com/VietVyIT/Mng-ch-m-c-ng.git
cd Mng-ch-m-c-ng
```

### 2. Cài đặt dependencies

```bash
npm install
```

> Lệnh này cài đặt đồng thời dependencies cho cả `client/` và `server/` nhờ npm workspaces.

### 3. Tạo database

Chạy file schema trong MySQL:

```powershell
# PowerShell
Get-Content database\schema.sql | mysql -u root -p
```

```bash
# Linux / macOS
mysql -u root -p < database/schema.sql
```

Hoặc mở file `database/schema.sql` trong **MySQL Workbench** và bấm **Execute**.

File này tạo database `attendance_system`, tất cả bảng cần thiết (`users`, `attendance`, `attendance_events`, `shift_day_settings`, `attendance_deletion_logs`, `imported_attendance_records`, `notifications`), và tài khoản admin mẫu.

### 4. Cấu hình biến môi trường

```powershell
# PowerShell
Copy-Item server\.env.example server\.env
```

```bash
# Linux / macOS
cp server/.env.example server/.env
```

Mở `server/.env` và điền thông tin MySQL:

```env
DB_HOST=localhost
DB_PORT=3306
DB_NAME=attendance_system
DB_USER=root
DB_PASSWORD=your_mysql_password
JWT_SECRET=replace-with-a-random-secret-at-least-32-characters
```

### 5. Khởi chạy

```bash
npm run dev
```

| Service | URL |
|:--------|:----|
| 🌐 Frontend | http://localhost:5173 |
| ⚡ Backend API | http://localhost:5000/api |
| 💚 Health check | http://localhost:5000/api/health |
| 🗄 Database check | http://localhost:5000/api/health/database |

> Endpoint `/api/health/database` trả về `success: true` chỉ khi Express kết nối và thực thi được câu `SELECT 1`.

---

## 🐳 Triển Khai Docker

### Khởi chạy nhanh (1 lệnh)

```bash
# 1. Copy file cấu hình
cp .env.example .env          # Linux/Mac
# Copy-Item .env.example .env # PowerShell

# 2. (Tuỳ chọn) Sửa .env theo nhu cầu

# 3. Build và chạy
docker compose up -d --build
```

Hệ thống sẽ:
1. ✅ Khởi tạo MySQL 8.0 với schema tự động
2. ✅ Chờ MySQL healthy (healthcheck)
3. ✅ Build React client → tĩnh hóa
4. ✅ Chạy Express server (production mode)
5. ✅ Truy cập tại **http://localhost:5000**

### Các lệnh Docker thường dùng

```bash
# Xem logs realtime
docker compose logs -f

# Xem logs từng service
docker compose logs -f app
docker compose logs -f db

# Dừng tất cả
docker compose down

# Dừng và xoá data (⚠️ mất toàn bộ database)
docker compose down -v

# Rebuild khi thay đổi code
docker compose up -d --build

# Truy cập MySQL CLI trong container
docker exec -it attendly-mysql mysql -u root -p
```

### Cấu hình Docker

#### `Dockerfile` – Multi-stage build

```
Stage 1 (client-builder)  →  Build React/Vite thành static files
Stage 2 (production)      →  Copy static + server code, chạy Express
```

| Đặc điểm | Giá trị |
|:----------|:--------|
| Base image | `node:18-alpine` (nhẹ ~120MB) |
| Process manager | `tini` (PID 1 signal handling) |
| Production deps | `npm ci --omit=dev` |
| Port | `5000` |

#### `docker-compose.yml` – 2 Services

```yaml
services:
  db:    # MySQL 8.0 với healthcheck & persistent volume
  app:   # Node.js app, chờ DB healthy trước khi start
```

#### `.env.example` – Biến môi trường

| Biến | Mặc định | Mô tả |
|:-----|:---------|:------|
| `MYSQL_ROOT_PASSWORD` | `rootpassword` | Mật khẩu root MySQL |
| `MYSQL_DATABASE` | `attendance_system` | Tên database |
| `DB_EXTERNAL_PORT` | `3306` | Cổng MySQL map ra host |
| `PORT` | `5000` | Cổng app map ra host |
| `CLIENT_URL` | _(trống)_ | URL frontend cho CORS |
| `JWT_SECRET` | _(placeholder)_ | **BẮT BUỘC đổi** trong production |
| `FACE_MATCH_THRESHOLD` | `0.6` | Ngưỡng nhận diện khuôn mặt |

> ⚠️ **Quan trọng:** Luôn đổi `JWT_SECRET` và `MYSQL_ROOT_PASSWORD` trước khi deploy production!

---

## ☁️ Deploy Production (Vercel + Railway)

Production cần hai dịch vụ độc lập:

- **Vercel/Netlify:** Frontend trong thư mục `client`
- **Railway:** Express API trong thư mục `server` và MySQL

> ⚠️ Chỉ deploy frontend lên Vercel là **chưa đủ** để đăng nhập. Frontend phải có `VITE_API_URL` trỏ tới backend Railway.

### Railway MySQL

Tạo service MySQL và chạy SQL theo thứ tự:

```
database/schema.sql
database/migrations/003_workflows_shifts.sql
database/migrations/004_punctuality_status.sql
database/migrations/005_attendance_deletion_logs.sql
database/migrations/006_notifications.sql
database/migrations/007_user_profiles.sql
database/migrations/008_imported_attendance.sql
```

> Không bỏ qua `008_imported_attendance.sql` – file này tạo bảng import Excel và lịch sử nhiều ca cùng ngày.

### Railway Backend

Tạo service từ GitHub repository:

| Cấu hình | Giá trị |
|:----------|:--------|
| Root directory | `server` |
| Build command | `npm install` |
| Start command | `npm start` |

**Variables cần thiết:**

```env
NODE_ENV=production
PORT=5000
CLIENT_URL=https://<frontend-domain>
DB_HOST=<railway-mysql-host>
DB_PORT=3306
DB_NAME=attendance_system
DB_USER=<railway-mysql-user>
DB_PASSWORD=<railway-mysql-password>
JWT_SECRET=<random-secret-at-least-32-characters>
FACE_MATCH_THRESHOLD=0.6
```

> `JWT_SECRET` là **bắt buộc**. Thiếu sẽ crash với lỗi: `Thiếu biến môi trường bắt buộc: JWT_SECRET`.
>
> `CLIENT_URL` phải đúng domain Vercel, **không có** dấu `/` cuối.

**Tạo JWT secret an toàn:**

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Sau khi backend chạy, vào **Settings → Networking → Generate Domain** và kiểm tra:

```
https://<backend-domain>/api/health
https://<backend-domain>/api/health/database
```

### Vercel Frontend

| Cấu hình | Giá trị |
|:----------|:--------|
| Root directory | `client` |
| Build command | `npm run build` |
| Output directory | `dist` |

**Biến môi trường:**

```env
VITE_API_URL=https://<backend-domain>/api
```

> Sau khi đổi `VITE_API_URL`, phải **Redeploy** vì biến `VITE_*` được nhúng lúc build.

`client/vercel.json` đã cấu hình SPA rewrite. Với Netlify, dùng Base directory `client`, Publish directory `dist`; file `client/public/_redirects` đã có fallback route.

### Cập nhật Production

```bash
npm run build
git add .
git commit -m "Describe the change"
git push origin main
```

Vercel và Railway sẽ tự deploy commit mới nếu đã bật GitHub integration.

---

## 📁 Cấu Trúc Thư Mục

```
attendly/
├── 📄 Dockerfile              # Multi-stage Docker build
├── 📄 docker-compose.yml      # Orchestration (MySQL + App)
├── 📄 .env.example            # Template biến môi trường (Docker)
├── 📄 .dockerignore           # Exclude files from Docker context
├── 📄 .gitignore
├── 📄 package.json            # Root workspace manifest
│
├── 📂 client/                 # Frontend (React + Vite)
│   ├── 📄 package.json
│   ├── 📄 vite.config.js
│   ├── 📄 vercel.json         # SPA rewrite cho Vercel
│   ├── 📄 index.html
│   ├── 📂 public/             # Static assets, face-api models
│   └── 📂 src/
│       ├── 📄 main.jsx        # Entry point
│       ├── 📄 App.jsx         # Main application component
│       └── 📄 styles.css      # Glassmorphism CSS
│
├── 📂 server/                 # Backend (Express.js)
│   ├── 📄 package.json
│   ├── 📄 .env.example        # Template biến môi trường (local)
│   ├── 📂 src/
│   │   ├── 📄 server.js       # Entry point (listen)
│   │   ├── 📄 app.js          # Express app setup
│   │   ├── 📂 config/
│   │   │   ├── 📄 env.js      # Environment validation
│   │   │   └── 📄 database.js # MySQL connection pool
│   │   ├── 📂 routes/
│   │   │   ├── 📄 health.routes.js
│   │   │   ├── 📄 auth.routes.js
│   │   │   ├── 📄 face.routes.js
│   │   │   ├── 📄 attendance.routes.js
│   │   │   ├── 📄 admin.routes.js
│   │   │   └── 📄 notification.routes.js
│   │   ├── 📂 middlewares/
│   │   └── 📂 utils/
│   └── 📂 seed/               # Member import scripts
│
└── 📂 database/               # SQL schemas & migrations
    ├── 📄 schema.sql           # Main schema (tables + admin)
    └── 📂 migrations/
        ├── 📄 002_attendance_images.sql
        ├── 📄 003_workflows_shifts.sql
        ├── 📄 004_punctuality_status.sql
        ├── 📄 005_attendance_deletion_logs.sql
        ├── 📄 006_notifications.sql
        ├── 📄 007_user_profiles.sql
        └── 📄 008_imported_attendance.sql
```

---

## 🔌 API Endpoints

| Method | Endpoint | Mô tả | Auth |
|:-------|:---------|:-------|:-----|
| `GET` | `/api/health` | Server health check | ❌ |
| `GET` | `/api/health/database` | Database connectivity check | ❌ |
| `POST` | `/api/auth/login` | Đăng nhập (rate limited) | ❌ |
| `POST` | `/api/auth/register` | Đăng ký tài khoản | ❌ |
| `PUT` | `/api/auth/profile` | Cập nhật hồ sơ cá nhân | 🔐 User |
| `PUT` | `/api/auth/change-password` | Đổi mật khẩu | 🔐 User |
| `POST` | `/api/face/register` | Đăng ký khuôn mặt | 🔐 User |
| `POST` | `/api/face/verify` | Xác thực khuôn mặt | 🔐 User |
| `GET` | `/api/attendance` | Lịch sử chấm công cá nhân | 🔐 User |
| `POST` | `/api/attendance/check-in` | Check-in | 🔐 User |
| `POST` | `/api/attendance/check-out` | Check-out | 🔐 User |
| `GET` | `/api/admin/attendance` | Tất cả bản ghi (Admin) | 🔐 Admin |
| `PUT` | `/api/admin/attendance/:id` | Duyệt/Từ chối công | 🔐 Admin |
| `DELETE` | `/api/admin/attendance/:id` | Xoá bản ghi (có log) | 🔐 Admin |
| `POST` | `/api/admin/import-excel` | Import Excel | 🔐 Admin |
| `GET` | `/api/notifications` | Danh sách thông báo | 🔐 User |

> JWT được gửi qua header `Authorization: Bearer <token>`. Backend kiểm tra role trước khi cho phép truy cập.

---

## 🧪 Tài Khoản Thử Nghiệm

| Vai trò | Username | Password | Quyền hạn |
|:--------|:---------|:---------|:-----------|
| **Admin** | `admin` | `admin123` | Dashboard, duyệt/xoá công, cấu hình ca, xem dữ liệu & ảnh mọi người |
| **User 1** | `user1` | `user123` | User Portal, đã có sẵn 5 ngày công được duyệt |
| **User 2** | `user2` | `user123` | User Portal mới, trạng thái & lịch sử trống để thử check-in |

### Kịch Bản Test Nhanh

1. Đăng nhập `user2` / `user123`: chỉ thấy User Portal, KPI và lịch sử cá nhân đang trống.
2. Bấm quét khuôn mặt để check-in: bản ghi chuyển sang `PENDING` và chờ Admin duyệt.
3. Đăng xuất → đăng nhập `admin` / `admin123`: mở Dashboard và phê duyệt yêu cầu của `user2`.
4. Đăng nhập lại `user2`: trạng thái chuyển sang đã duyệt và ngày công được tính.
5. Đăng nhập `user1` / `user123`: kiểm tra bảng lịch sử cá nhân với 5 ngày đã duyệt.

### Hồ Sơ Cá Nhân

Trong mục **Hồ sơ**, người dùng có thể cập nhật họ tên, số điện thoại, địa chỉ hiện tại và quê quán. Danh sách tỉnh/thành được tải từ API `provinces.open-api.vn/api/v2/p/`, là danh sách đơn vị hành chính sau sáp nhập. Mật khẩu mới phải có ít nhất 6 ký tự.

> ⚠️ Tài khoản và dữ liệu mẫu chỉ dành cho môi trường phát triển local, **không dùng trong production**.

---

## 📊 Import Bảng Chấm Công Excel

Admin mở Dashboard → chọn **Nhập dữ liệu Excel** → tải file `.xlsx` hoặc `.xls`.

### Yêu cầu định dạng file

- Một dòng ngày tháng dạng `D/M` hoặc `D/M/YYYY`
- Dòng ngay bên dưới ghi ca: `Sáng`, `Chiều`, `Tối`
- Các cột `Họ & Tên`, `MSSV` và `Total` ở bên trái/phải bảng
- Ô có `x` hoặc `X` được tính là đã đi làm

### Quy trình

1. Hệ thống hiển thị **bản xem trước** trước khi lưu
2. Thành viên được ghép theo **MSSV** trước, sau đó theo **họ tên** (không phân biệt hoa thường)
3. Các ca Excel được lưu ở bảng `imported_attendance_records` (hỗ trợ nhiều ca/ngày)
4. Nếu thành viên chưa tồn tại → tự tạo tài khoản USER với username là họ tên, mật khẩu tạm `user123@`, đánh dấu đổi mật khẩu lần đầu
5. Cột `Total` luôn lưu nguyên giá trị, không thay bằng số lượng dấu `x`

> Chạy migration `database/migrations/008_imported_attendance.sql` trước khi sử dụng.

---

## 🔒 Bảo Mật

| Tính năng | Chi tiết |
|:----------|:---------|
| **Mật khẩu** | Bcrypt hash (cost 12), không lưu plaintext |
| **Xác thực** | JWT qua header `Authorization: Bearer` |
| **HTTP Headers** | Helmet.js (CSP, HSTS, X-Frame-Options, ...) |
| **Rate Limiting** | Tối đa 10 lần đăng nhập sai / 5 phút / IP |
| **CORS** | Chỉ cho phép origin từ `CLIENT_URL` |
| **SQL Injection** | Parameter binding (prepared statements) |
| **x-powered-by** | Đã tắt |
| **Body Size** | JSON giới hạn 10MB |
| **Sensitive Data** | `.env`, `members.json` không commit lên git |

### Nạp Danh Sách Thành Viên An Toàn

File `server/seed/members.json` nằm ở máy local và đã được thêm vào `.gitignore`:

```bash
npm run seed:members --workspace server
```

Script lưu mật khẩu dưới dạng bcrypt hash (cost 12), đặt `must_change_password = TRUE`, và không lưu mã CCCD dạng plaintext.

---

## ❓ FAQ & Troubleshooting

### Docker

<details>
<summary><b>Lỗi "port is already allocated"</b></summary>

Cổng 3306 hoặc 5000 đang bị chiếm. Đổi trong `.env`:

```env
DB_EXTERNAL_PORT=3307
PORT=5001
```

</details>

<details>
<summary><b>App không kết nối được MySQL</b></summary>

Kiểm tra MySQL đã healthy chưa:

```bash
docker compose ps
docker compose logs db
```

MySQL cần 15-30 giây để khởi tạo lần đầu. Docker Compose đã cấu hình `depends_on: condition: service_healthy` nên app sẽ tự chờ.

</details>

<details>
<summary><b>Muốn reset database hoàn toàn</b></summary>

```bash
docker compose down -v    # Xoá volume
docker compose up -d --build
```

</details>

<details>
<summary><b>Container bị restart liên tục</b></summary>

Kiểm tra logs:

```bash
docker compose logs -f app
```

Thường do thiếu `JWT_SECRET` hoặc sai thông tin database.

</details>

### Local Development

<details>
<summary><b>Lỗi "Thiếu biến môi trường bắt buộc"</b></summary>

Đảm bảo đã copy `.env.example` → `.env` và điền đầy đủ:

```bash
cp server/.env.example server/.env
```

Các biến bắt buộc: `DB_HOST`, `DB_NAME`, `DB_USER`, `JWT_SECRET`.

</details>

<details>
<summary><b>Lỗi "ER_ACCESS_DENIED_ERROR"</b></summary>

Sai username/password MySQL. Kiểm tra `DB_USER` và `DB_PASSWORD` trong `server/.env`.

</details>

<details>
<summary><b>Frontend trắng, API lỗi CORS</b></summary>

Kiểm tra `CLIENT_URL` trong `server/.env` trùng với URL frontend:

```env
CLIENT_URL=http://localhost:5173
```

</details>

---

## 📄 License

Private – Internal use only.

---

<div align="center">

**Made with ❤️ by ATTENDLY Team**

</div>
]]>
