# ATTENDLY – Hệ Thống Quản Lý Chấm Công

Hệ thống tra cứu & quản lý ngày công sinh viên với nhận diện khuôn mặt.

**Công nghệ:** React 19 · Vite · Express · MySQL 8.0 · JWT · Face-API

---

## Cài đặt

### Bước 1: Cài đặt dependencies

```bash
npm install
```

### Bước 2: Tạo database

Mở **MySQL Workbench**, mở file `database/schema.sql` rồi bấm **Execute**.

Hoặc chạy bằng terminal:

```powershell
# Thêm MySQL vào PATH (chỉ cần lần đầu trong phiên terminal)
$env:PATH += ";C:\Program Files\MySQL\MySQL Server 8.0\bin"

# Chạy schema
Get-Content database\schema.sql | mysql -u root -p
```

File này tạo database `attendance_system`, tất cả bảng cần thiết và tài khoản admin mẫu.

### Bước 3: Cấu hình môi trường

```powershell
Copy-Item server\.env.example server\.env
```

Mở file `server/.env` và sửa lại thông tin MySQL:

```env
NODE_ENV=development
PORT=5000
CLIENT_URL=http://localhost:5173

DB_HOST=localhost
DB_PORT=3306
DB_NAME=attendance_system
DB_USER=root
DB_PASSWORD=mật_khẩu_mysql_của_bạn

JWT_SECRET=replace-with-a-random-secret-at-least-32-characters
FACE_MATCH_THRESHOLD=0.6
```

> Chỉ cần sửa `DB_PASSWORD` là chạy được. Các giá trị khác giữ mặc định.

### Bước 4: Chạy

```bash
npm run dev
```

Mở trình duyệt:

- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:5000/api
- **Health check:** http://localhost:5000/api/health/database — trả `success: true` là OK

---

## Tài khoản thử nghiệm

| Vai trò | Username | Password | Ghi chú |
|---------|----------|----------|---------|
| Admin | `admin` | `admin123` | Dashboard, duyệt/xoá công, cấu hình ca |
| User 1 | `user1` | `user123` | Đã có 5 ngày công được duyệt |
| User 2 | `user2` | `user123` | Tài khoản trống, thử check-in đầu tiên |

**Test nhanh:**

1. Đăng nhập `user2` / `user123` → check-in bằng khuôn mặt
2. Đăng nhập `admin` / `admin123` → duyệt yêu cầu
3. Đăng nhập lại `user2` → xem kết quả

> Tài khoản mẫu chỉ dùng cho development.

---

## Ca làm việc

| Ca | Thời gian | Ghi chú |
|----|-----------|---------|
| Sáng | 07:30 – 12:00 | Mặc định bật |
| Chiều | 13:30 – 17:30 | Mặc định bật |
| Tối | 17:30 – 20:00 | Admin bật/tắt theo ngày |

---

## Import Excel

Admin → Dashboard → **Nhập dữ liệu Excel** → tải file `.xlsx` / `.xls`.

File cần có: dòng ngày `D/M` hoặc `D/M/YYYY`, dòng dưới ghi ca (`Sáng`, `Chiều`, `Tối`), cột `Họ & Tên` + `MSSV` + `Total`, ô `x`/`X` = đã đi làm.

Thành viên chưa có tài khoản sẽ được tạo tự động (mật khẩu tạm `user123@`, bắt đổi lần đầu).

---

## Nạp danh sách thành viên

File `server/seed/members.json` nằm local (đã gitignore):

```bash
npm run seed:members --workspace server
```

---

## Cấu trúc thư mục

```
├── Dockerfile
├── docker-compose.yml
├── package.json               # Root workspace
├── client/                    # React + Vite
│   └── src/
│       ├── App.jsx
│       ├── main.jsx
│       └── styles.css
├── server/                    # Express API
│   └── src/
│       ├── server.js          # Entry point
│       ├── app.js             # Express config
│       ├── config/            # env.js, database.js
│       ├── routes/            # API routes
│       ├── middlewares/
│       └── utils/
└── database/
    ├── schema.sql
    └── migrations/
```

---

## Lưu ý bảo mật

- Không commit `server/.env` hoặc `server/seed/members.json`
- Mật khẩu lưu bcrypt hash, không plaintext
- JWT qua header `Authorization: Bearer <token>`
- Rate limit: 10 lần đăng nhập sai / 5 phút / IP
