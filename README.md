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

### Khung giờ ca làm việc

- Ca sáng: 07:30–12:00
- Ca chiều: 13:30–17:30
- Ca tối: 17:30–20:00 (có thể bật/tắt theo ngày bởi Admin)

> Tài khoản và dữ liệu mẫu chỉ dành cho môi trường phát triển local, không dùng trong production.

### Nạp danh sách thành viên an toàn

Danh sách thành viên thực tế nằm trong `server/seed/members.json` ở máy local và đã được thêm vào `.gitignore`, không được commit lên GitHub. Chạy lệnh sau để tạo/cập nhật tài khoản:

```powershell
npm run seed:members --workspace server
```

Script chỉ lưu mật khẩu dưới dạng bcrypt hash (`cost 12`), đặt `must_change_password = TRUE`, và không lưu mã CCCD dạng plaintext trong database. Sau lần đăng nhập đầu tiên, thành viên được đưa tới trang Hồ sơ để đổi mật khẩu.

Backend đã bật Helmet, tắt `x-powered-by`, giới hạn body JSON, giới hạn đăng nhập sai tối đa 10 lần trong 5 phút theo IP, truy vấn SQL có parameter binding, xác thực JWT và kiểm tra dữ liệu đầu vào cơ bản. Không đưa `server/.env` hoặc `server/seed/members.json` lên repository.

### Import bảng chấm công Excel

Admin mở Dashboard, chọn **Nhập dữ liệu Excel**, rồi tải file `.xlsx` hoặc `.xls`. File cần có:

- Một dòng ngày tháng dạng `D/M` hoặc `D/M/YYYY`.
- Dòng ngay bên dưới ghi ca `Sáng`, `Chiều`, `Tối`.
- Các cột `Họ & Tên`, `MSSV` và `Total` ở bên trái/bên phải bảng.
- Ô có `x` hoặc `X` được tính là đã đi làm.

Hệ thống hiển thị bản xem trước trước khi lưu. Thành viên được ghép theo MSSV trước, sau đó theo họ tên không phân biệt hoa thường. Các ca Excel được lưu ở bảng `imported_attendance_records` để không làm mất trường hợp một người có nhiều ca trong cùng ngày. Chạy migration [database/migrations/008_imported_attendance.sql](database/migrations/008_imported_attendance.sql) trước khi sử dụng.

Nếu thành viên chưa tồn tại, hệ thống sẽ tự tạo tài khoản USER với username là họ tên trong Excel và mật khẩu tạm thời `user123@`; tài khoản được đánh dấu đổi mật khẩu ở lần đăng nhập đầu tiên. Cột `Total` luôn được lưu nguyên giá trị làm tổng ngày công, không thay thế bằng số lượng dấu `x`.

## Deploy production trên Vercel/Netlify

### Quy trình đầy đủ với Vercel + Railway

Production cần hai dịch vụ độc lập:

- **Vercel/Netlify:** frontend trong thư mục `client`.
- **Railway:** Express API trong thư mục `server` và MySQL.

Chỉ deploy frontend lên Vercel là chưa đủ để đăng nhập. Frontend phải có
`VITE_API_URL` trỏ tới backend Railway đang chạy.

#### Railway MySQL

Tạo service MySQL và chạy SQL theo thứ tự:

```text
database/schema.sql
database/migrations/003_workflows_shifts.sql
database/migrations/004_punctuality_status.sql
database/migrations/005_attendance_deletion_logs.sql
database/migrations/006_notifications.sql
database/migrations/007_user_profiles.sql
database/migrations/008_imported_attendance.sql
```

Không bỏ qua migration `008_imported_attendance.sql`, vì file này tạo bảng
import Excel và lịch sử nhiều ca trong cùng ngày.

#### Railway backend

Tạo service từ GitHub repository và đặt:

```text
Root directory: server
Build command: npm install
Start command: npm start
```

Trong Railway **Variables**, thêm:

```text
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

`CLIENT_URL` là biến bắt buộc và phải là URL frontend thật, ví dụ
`https://mng-ch-m-c-ng-client.vercel.app`, không có dấu `/` cuối. Nếu thiếu,
backend dừng với lỗi `Thiếu biến môi trường bắt buộc: CLIENT_URL`.

Tạo JWT secret an toàn:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Sau khi backend chạy, vào **Settings > Networking > Generate Domain** và kiểm tra:

```text
https://<backend-domain>/api/health
https://<backend-domain>/api/health/database
```

#### Vercel frontend

```text
Root directory: client
Build command: npm run build
Output directory: dist
```

Thêm biến:

```text
VITE_API_URL=https://<backend-domain>/api
```

Sau khi đổi `VITE_API_URL`, phải **Redeploy** vì biến `VITE_*` được nhúng lúc
build. [client/vercel.json](client/vercel.json) đã cấu hình SPA rewrite. Với
Netlify, dùng Base directory `client`, Publish directory `dist`; file
[client/public/_redirects](client/public/_redirects) đã có fallback route.

#### Cập nhật production

```powershell
npm run build
git add .
git commit -m "Describe the change"
git push origin main
```

Vercel và Railway sẽ tự deploy commit mới nếu đã bật GitHub integration. Trước
khi chạy migration mới, hãy backup database và tạo migration mới thay vì sửa
migration cũ. Không commit `server/.env`, `client/.env` hoặc
`server/seed/members.json`.

Các mục Chấm công, Lịch sử và Hồ sơ yêu cầu đăng nhập. JWT được gửi qua header
`Authorization: Bearer <token>` và backend kiểm tra role trước khi cho phép truy cập.
