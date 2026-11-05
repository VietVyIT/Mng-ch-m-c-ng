# ATTENDLY

ATTENDLY là ứng dụng web quản lý chấm công sinh viên. Sinh viên có thể ghi nhận giờ vào/ra bằng camera và nhận diện khuôn mặt, theo dõi lịch sử làm việc và cập nhật hồ sơ. Quản trị viên quản lý tài khoản, ca làm, yêu cầu chấm công, dữ liệu import và thông tin ngân hàng nhận lương.

Tài liệu này hướng dẫn cài đặt từ mã nguồn, chạy ở môi trường phát triển và thử ứng dụng bằng Docker. Các lệnh được chạy từ thư mục gốc của repository.

## Mục lục

- [Tính năng](#tính-năng)
- [Công nghệ](#công-nghệ)
- [Yêu cầu](#yêu-cầu)
- [Chạy local](#chạy-local)
- [Chạy bằng Docker](#chạy-bằng-docker)
- [Cấu trúc dự án](#cấu-trúc-dự-án)
- [Cơ sở dữ liệu và migrations](#cơ-sở-dữ-liệu-và-migrations)
- [Build và kiểm tra](#build-và-kiểm-tra)
- [Bảo mật và vận hành](#bảo-mật-và-vận-hành)
- [Xử lý sự cố](#xử-lý-sự-cố)

## Tính năng

### Sinh viên

- Đăng nhập, đăng ký và khôi phục mật khẩu; các luồng xác thực qua email cần cấu hình SMTP.
- Đăng ký khuôn mặt, gửi yêu cầu đăng ký lại và xem trạng thái yêu cầu.
- Chấm công vào/ra bằng camera, xem trạng thái duyệt và lịch sử chấm công cá nhân.
- Theo dõi tổng quan ngày công, ca làm và thông báo.
- Cập nhật hồ sơ, đổi tên đăng nhập và mật khẩu.
- Khai báo thông tin ngân hàng nhận lương.

### Quản trị viên

- Xem dashboard, quản lý tài khoản sinh viên và xử lý yêu cầu liên quan đến khuôn mặt.
- Duyệt hoặc từ chối yêu cầu chấm công; quản lý lịch sử và dữ liệu chấm công.
- Cấu hình ca làm và ngày/ca được mở.
- Import danh sách sinh viên và dữ liệu chấm công từ Excel. Dữ liệu chấm công import dùng khóa người dùng, ngày và ca để cập nhật bản ghi khi import lại thay vì tạo thêm bản ghi trùng.
- Xem thông tin ngân hàng nhận lương và lịch sử thay đổi.
- Gửi thông báo và quản lý hồ sơ cá nhân.

## Công nghệ

- **Frontend:** React 19, Vite, face-api.js, Chart.js.
- **Backend:** Node.js 20+, Express 4, JWT, bcrypt, ExcelJS, Nodemailer.
- **Cơ sở dữ liệu:** MySQL 8, InnoDB, `mysql2`.
- **Triển khai:** Docker Compose, Nginx.

## Yêu cầu

Để chạy local không dùng Docker:

- Node.js 20 trở lên và npm.
- MySQL 8 đang chạy, có quyền tạo database.
- Trình duyệt hiện đại có quyền truy cập camera. Camera yêu cầu secure context: dùng `localhost` khi phát triển local; khi truy cập từ máy khác cần HTTPS.

Để chạy bằng Docker, cần Docker Engine hoặc Docker Desktop cùng Docker Compose. Nếu gọi Docker Compose trực tiếp thì không cần cài Node.js/MySQL trên máy host; lệnh tắt `npm run docker:up` cần Node.js/npm.

## Chạy local

### 1. Lấy mã nguồn và cài dependencies

```bash
git clone <URL-repository>
cd <thu-muc-repository>
npm ci
```

### 2. Tạo database mới

Tạo schema ban đầu và dữ liệu mẫu bằng `database/schema.sql`. Cách dùng MySQL Workbench:

1. Mở `database/schema.sql`.
2. Kết nối MySQL local và thực thi toàn bộ script.

Trên Windows, có thể chạy từ PowerShell tại thư mục dự án:

```powershell
cmd.exe /c "mysql -u root -p < database\schema.sql"
```

Trên macOS/Linux:

```bash
mysql -u root -p < database/schema.sql
```

Script tạo database `attendance_system`, các bảng cần thiết, các ca mặc định và tài khoản quản trị mẫu. Với database mới được tạo riêng bằng script này, thông tin đăng nhập mẫu là `admin` / `admin123`. Hãy đổi mật khẩu ngay sau lần đăng nhập đầu tiên. Không chạy file schema này thay cho migrations trên database production hoặc database đã có dữ liệu.

### 3. Cấu hình backend

Tạo file môi trường local:

```powershell
Copy-Item server\.env.example server\.env
```

macOS/Linux:

```bash
cp server/.env.example server/.env
```

Mở `server/.env`, đặt thông tin MySQL thực tế và thay các giá trị secret mẫu:

```env
NODE_ENV=development
PORT=5000
CLIENT_URL=http://localhost:5173

DB_HOST=localhost
DB_PORT=3306
DB_NAME=attendance_system
DB_USER=root
DB_PASSWORD=<mat-khau-MySQL-local>

JWT_SECRET=<chuoi-ngau-nhien-it-nhat-32-ky-tu>
FACE_MATCH_DISTANCE_THRESHOLD=0.6
BANK_ACCOUNT_ENCRYPTION_KEY=<64-ky-tu-hex>
```

Tạo secret ngẫu nhiên bằng Node.js:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Để tạo khóa mã hóa ngân hàng riêng (32 byte, biểu diễn bằng 64 ký tự hex):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`BANK_ACCOUNT_ENCRYPTION_KEY` cần có khi sử dụng tính năng ngân hàng nhận lương. Hãy lưu khóa an toàn và giữ nguyên khóa trong suốt vòng đời dữ liệu đã mã hóa; mất hoặc thay khóa sẽ khiến dữ liệu cũ không thể giải mã.

Trong trang **Thông báo** riêng của Admin, quản trị viên có thể soạn tiêu đề, nội dung, nhãn nút và bật/tắt popup nhắc User cập nhật ngân hàng. Cấu hình được lưu bền vững trong bảng `bank_update_notification_settings` (migration `013_bank_update_notification_settings.sql` và `014_editable_bank_update_notification.sql`; ứng dụng cũng tự khởi tạo/cập nhật bảng khi khởi động). Nút popup luôn mở trang ngân hàng nhận lương. Số điện thoại ngân hàng được lưu riêng trong `user_salary_bank_accounts.phone`, không bị thay đổi khi import danh sách hoặc công chấm công; migration `015_salary_bank_phone.sql` chuyển số hiện có sang cột riêng. Đóng popup chỉ ẩn đến khi tải lại trang hoặc đăng nhập lại; tắt thông báo sẽ ẩn popup cho toàn bộ User.

SMTP trong `server/.env.example` là tùy chọn đối với việc khởi chạy ứng dụng, nhưng cần thiết cho các luồng gửi OTP email như đăng ký và khôi phục mật khẩu. Không đưa thông tin SMTP hoặc bất kỳ secret thật nào vào Git.

### 4. Khởi chạy ứng dụng

```bash
npm run dev
```

Các địa chỉ mặc định:

- Frontend: <http://localhost:5173>
- Backend: <http://localhost:5000>
- API health: <http://localhost:5000/api/health>
- Kiểm tra kết nối database: <http://localhost:5000/api/health/database>

Frontend ở chế độ phát triển tự gọi API tại cổng `5000` trên cùng hostname. Nếu đổi cổng hoặc tách frontend/backend, cấu hình `VITE_API_URL` cho frontend thành URL API đầy đủ, ví dụ `http://localhost:5000/api`.

### Chạy production build trên một máy

Sau khi đã cấu hình `server/.env` và database:

```bash
npm run build
```

Đặt `NODE_ENV=production` trong `server/.env`, sau đó chạy:

```bash
npm start
```

Express phục vụ frontend đã build và API tại cổng được đặt bởi `PORT` (mặc định `5000`). Khi chạy ngoài môi trường local, cần đặt HTTPS ở reverse proxy và cấu hình `CLIENT_URL` theo origin của frontend.

## Chạy bằng Docker

Docker Compose khởi chạy MySQL, backend phục vụ frontend đã build, và Nginx. Trước khi chạy:

1. Tạo file cấu hình từ template.
2. Thay password database, JWT secret và khóa mã hóa bằng giá trị mạnh, riêng cho môi trường này.
3. Nginx hiện cấu hình TLS với hai file `nginx/ssl/self-signed.crt` và `nginx/ssl/self-signed.key`. Cần cung cấp các file đó để Nginx khởi động; với môi trường public, dùng chứng chỉ hợp lệ thay vì chứng chỉ self-signed. Có thể tạo chứng chỉ thử nghiệm nếu máy đã cài OpenSSL:

   ```powershell
   New-Item -ItemType Directory -Force nginx\ssl
   openssl req -x509 -nodes -days 365 -newkey rsa:2048 `
     -keyout nginx/ssl/self-signed.key `
     -out nginx/ssl/self-signed.crt `
     -subj "/CN=localhost"
   ```

   Lệnh tạo chứng chỉ này chỉ phục vụ local/test, không dùng cho website public.
4. Kiểm tra `database/seed.sql` trước khi tạo volume database mới. Compose gắn file dump này vào thư mục khởi tạo của MySQL, và MySQL chỉ chạy các script khởi tạo khi volume còn trống. Đây là dump dữ liệu, không phải chỉ schema sạch; chỉ dùng dữ liệu development đã được duyệt và tuyệt đối không dùng dump chứa dữ liệu cá nhân hoặc production để chia sẻ/triển khai.

Tạo file `.env.docker`:

```powershell
Copy-Item .env.docker.example .env.docker
```

macOS/Linux:

```bash
cp .env.docker.example .env.docker
```

Sau khi chỉnh `.env.docker` và chuẩn bị chứng chỉ Nginx, chạy:

```bash
npm run docker:up
```

Hoặc dùng Docker Compose trực tiếp:

```bash
docker compose --env-file .env.docker up -d --build
```

Truy cập <http://localhost:3000>. HTTPS được publish ở cổng `443`; trình duyệt sẽ cảnh báo nếu dùng chứng chỉ self-signed.

Các cổng host trong `docker-compose.yml`:

| Dịch vụ | Cổng host | Ghi chú |
|---|---:|---|
| Web qua Nginx | `3000` | HTTP |
| Nginx TLS | `443` | Cần chứng chỉ trong `nginx/ssl` |
| MySQL | `3307` | Chuyển tiếp tới cổng `3306` trong container |

Dừng các container nhưng giữ nguyên dữ liệu:

```bash
npm run docker:down
```

hoặc:

```bash
docker compose --env-file .env.docker down
```

Database được lưu trong named volume `mysql_data`. Không thêm `-v` vào lệnh `docker compose down` nếu muốn giữ dữ liệu. Xóa volume sẽ xóa database local không thể khôi phục nếu chưa có backup. Thay đổi `database/seed.sql` cũng không tự nạp lại vào volume đã được khởi tạo.

## Cấu trúc dự án

```text
.
├── client/                 # Ứng dụng React/Vite
│   ├── src/                # Giao diện và luồng nghiệp vụ
│   └── public/             # Tài nguyên frontend
├── server/
│   ├── src/
│   │   ├── config/         # Cấu hình môi trường và MySQL
│   │   ├── middlewares/    # Xác thực và xử lý lỗi
│   │   ├── routes/         # API auth, attendance, admin, ...
│   │   └── utils/          # Hàm dùng chung
│   └── public/models/      # Model nhận diện khuôn mặt
├── database/
│   ├── schema.sql          # Schema đầy đủ cho database mới
│   ├── migrations/         # Thay đổi schema theo phiên bản
│   └── seed.sql            # Dump được Docker Compose dùng khi tạo volume mới
├── nginx/
│   ├── nginx.conf
│   └── ssl/                # Chứng chỉ TLS cần được cung cấp riêng
├── Dockerfile
├── docker-compose.yml
└── package.json            # npm workspaces và lệnh dùng chung
```

## Cơ sở dữ liệu và migrations

- `database/schema.sql` là điểm khởi đầu cho **database local mới**, bao gồm các bảng chính và dữ liệu mẫu.
- `database/migrations/` chứa các thay đổi theo phiên bản cho database đã tồn tại. Xem nội dung từng migration và kiểm tra trạng thái schema trước khi áp dụng; không chạy lại một migration đã áp dụng.
- Server có một số bước tạo/bảo trì bảng khi khởi động, nhưng đây không thay thế quy trình backup và migrations có kiểm soát cho môi trường hiện hữu.
- `database/seed.sql` là dump được Docker Compose nạp khi MySQL khởi tạo volume trống. Không dùng file dump này để cập nhật database hiện hữu.
- Sao lưu database trước khi thay đổi schema. Với tính năng ngân hàng, sao lưu an toàn cả database lẫn khóa `BANK_ACCOUNT_ENCRYPTION_KEY`.

## Build và kiểm tra

Build frontend:

```bash
npm run build
```

Khởi động backend:

```bash
npm start
```

Hiện tại workspace có script build cho frontend nhưng chưa khai báo script `test` ở thư mục gốc, `client` hoặc `server`.

## Bảo mật và vận hành

- Không commit `server/.env`, `.env.docker`, thông tin đăng nhập, khóa mã hóa, chứng chỉ riêng hoặc dữ liệu backup.
- Không sử dụng giá trị mẫu trong file môi trường hay cấu hình Docker ở môi trường public. Tự đặt `DB_PASSWORD`, `JWT_SECRET` ngẫu nhiên đủ mạnh và `BANK_ACCOUNT_ENCRYPTION_KEY` riêng cho từng môi trường.
- Không đưa `database/seed.sql` lên môi trường production. Kiểm tra nội dung dump trước khi chia sẻ repository hoặc chạy Compose lần đầu.
- Giữ database sau mạng riêng; không mở MySQL trực tiếp ra Internet.
- Dùng HTTPS cho ứng dụng public. API cần kết nối camera, vì vậy trình duyệt phải ở secure context.
- Lập lịch backup và kiểm thử khôi phục. Giữ khóa mã hóa ngân hàng tách biệt, có kiểm soát truy cập, cùng với quy trình khôi phục database.

## Xử lý sự cố

### Backend báo không kết nối được MySQL

- Kiểm tra MySQL đang chạy và truy cập được tại `DB_HOST:DB_PORT`.
- Đảm bảo database `attendance_system` đã được tạo, thông tin user/password trong `server/.env` đúng và `database/schema.sql` đã chạy trên database local mới.
- Kiểm tra `/api/health/database` để xác nhận kết nối.

### Không đăng nhập hoặc không nhận được OTP

- Tài khoản `admin` / `admin123` chỉ được tạo bởi `database/schema.sql` khi khởi tạo database mới; đổi mật khẩu sau khi đăng nhập.
- Các luồng cần OTP email yêu cầu cấu hình đúng SMTP trong `server/.env`; kiểm tra log backend và cấu hình SMTP của nhà cung cấp.
- Tài khoản/dữ liệu trong database Docker phụ thuộc vào dump được nạp khi volume được tạo, không nhất thiết giống dữ liệu từ `schema.sql`.

### Camera không mở hoặc nhận diện không hoạt động

- Cấp quyền camera cho trang web và dùng `localhost` hoặc HTTPS.
- Kiểm tra backend phục vụ được thư mục `/models` và trình duyệt tải được các model trong `server/public/models/`.

### Docker web không truy cập được

- Xem trạng thái và log bằng `docker compose --env-file .env.docker ps` và `docker compose --env-file .env.docker logs`.
- Kiểm tra cổng `3000`, `443`, `3307` không bị ứng dụng khác chiếm dụng.
- Kiểm tra hai file chứng chỉ Nginx tồn tại đúng đường dẫn trước khi khởi động Compose.
- Nếu volume MySQL đã được tạo trước đó, các script trong `/docker-entrypoint-initdb.d` sẽ không chạy lại.

---

ATTENDLY được tổ chức theo npm workspaces; cài dependencies một lần tại thư mục gốc để làm việc với cả frontend và backend.
