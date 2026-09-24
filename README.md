# 🚀 ATTENDLY - HỆ THỐNG QUẢN LÝ CHẤM CÔNG

PHASE 1 thiết lập React + Express + MySQL.

## Yêu cầu

- Node.js 20+
- MySQL 8+

## Cài đặt

```powershell
npm install
Copy-Item server\.env.example server\.env
```

Tạo database và các bảng trong MySQL bằng file SQL có sẵn:

```powershell
Get-Content database\schema.sql | mysql -u root -p
```

Hoặc mở file [database/schema.sql](database/schema.sql) trong MySQL Workbench và bấm **Execute**.

File này tạo database `attendance_system`, bảng `users`, bảng `attendance`, ràng buộc một user chỉ có một bản ghi mỗi ngày và tài khoản admin mẫu cho PHASE 2.

Mở `server/.env` và điền thông tin MySQL. Sau đó chạy:

```powershell
npm run dev
```

- Frontend: http://localhost:5173
- Backend health check: http://localhost:5000/api/health
- Database check: http://localhost:5000/api/health/database

Endpoint database trả về `success: true` chỉ khi Express kết nối và thực thi được câu `SELECT 1`.

## Đăng nhập PHASE 2

Tài khoản admin mẫu sau khi chạy `database/schema.sql`:

- Username: `admin`
- Password: `admin123`

## Tài khoản thử nghiệm

| Vai trò | Username | Password | Quyền hạn |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin` | `admin123` | Admin Dashboard, duyệt/xóa công, cấu hình ca, xem dữ liệu và ảnh mọi người |
| **User 1** | `user1` | `user123` | User Portal, đã có sẵn 5 ngày công được duyệt |
| **User 2** | `user2` | `user123` | User Portal mới, trạng thái và lịch sử trống để thử check-in đầu tiên |

### Kịch bản test nhanh

1. Đăng nhập `user2` / `user123`: chỉ thấy User Portal, KPI và lịch sử cá nhân đang trống.
2. Bấm quét khuôn mặt để check-in: bản ghi chuyển sang `PENDING` và chờ Admin duyệt.
3. Đăng xuất, đăng nhập `admin` / `admin123`: mở Dashboard và phê duyệt yêu cầu của `user2`.
4. Đăng nhập lại `user2`: trạng thái chuyển sang đã duyệt và ngày công được tính.
5. Đăng nhập `user1` / `user123`: kiểm tra bảng lịch sử cá nhân với 5 ngày đã duyệt.

### Hồ sơ cá nhân

Trong mục **Hồ sơ**, người dùng có thể cập nhật họ tên, số điện thoại, địa chỉ hiện tại và quê quán. Danh sách tỉnh/thành được tải từ API `provinces.open-api.vn/api/v2/p/`, là danh sách đơn vị hành chính sau sáp nhập. Người dùng cũng có thể đổi mật khẩu bằng mật khẩu hiện tại; mật khẩu mới phải có ít nhất 6 ký tự.

Sau khi cập nhật cấu trúc database, chạy migration:

```powershell
# database/migrations/007_user_profiles.sql
```

> Tài khoản và dữ liệu mẫu chỉ dành cho môi trường phát triển local, không dùng trong production.

Các mục Chấm công, Lịch sử và Hồ sơ yêu cầu đăng nhập. JWT được gửi qua header
`Authorization: Bearer <token>` và backend kiểm tra role trước khi cho phép truy cập.
