# mtunz — Render Free + Neon PostgreSQL

Bản này dành riêng cho **Render (Web Service Free)** với cơ sở dữ liệu **Neon PostgreSQL Free**. Giao diện mtunz, nhắn tin realtime, quản trị, duyệt tài khoản, PIN, nhóm, sửa/thu hồi, biểu cảm, ảnh/tệp nhỏ được giữ từ bản Python.

**Đọc `HUONG_DAN_RENDER.md` trước khi triển khai.**

## Cấu trúc

- `app.py`: FastAPI, tài khoản, PIN, quản trị, nhắn tin 1–1, thông báo, WebSocket.
- `features.py`: nhóm, hồ sơ, tệp đính kèm, tin nhắn nâng cao.
- `pg_storage.py`: hỗ trợ PostgreSQL trong Render; SQLite vẫn dùng để phát triển trên máy.
- `render.yaml`: cấu hình Render Free (Singapore, 1 worker, HTTPS do Render cấp).
- `static/`: giao diện mtunz.
- `tests/`: kiểm thử chức năng và kiểm tra cấu hình.

## Chạy ở máy tính (không public)

```sh
pip install -r requirements.txt -r requirements-dev.txt
python -m uvicorn app:app --reload
```

Mở `http://127.0.0.1:8000`. Tài khoản quản trị demo `admin` / `mtunz7` **chỉ dùng khi chạy local**.

## Cấu hình public

| Biến | Bắt buộc | Ghi chú |
|---|---|---|
| `PUBLIC_MODE=1` | Có | Bật bảo vệ phiên/CORS phù hợp HTTPS |
| `COOKIE_SECURE=1` | Có | Cookie `Secure` |
| `REQUIRE_POSTGRES=1` | Có | Không cho Render vô tình dùng SQLite tạm |
| `DATABASE_URL` | Có | Connection string Neon Postgres (pooled, SSL) |
| `ADMIN_PASSWORD` | Có | Mật khẩu mới tối thiểu 12 ký tự (không dùng mtunz7) |
| `PUBLIC_ORIGIN` | Không | Để trống nếu chỉ dùng `*.onrender.com`; cần khai báo theo domain đặc biệt nếu dùng proxy ngoài |

Trên Render: **tuyệt đối không đưa `.env` hoặc `DATABASE_URL` lên GitHub**. Blueprint sẽ hỏi hai secret qua giao diện.

## Hạn chế của gói Free

- Render tự ngủ sau 15 phút không có lưu lượng HTTP/WebSocket. Lần mở lại cần thời gian khởi động; socket đang kết nối có thể bị ngắt, giao diện cần kết nối lại.
- Database Neon sống độc lập trên Render; **không mất tài khoản/tin nhắn khi Render ngủ**. Tệp đính kèm tối đa **2 MB/tệp**, giới hạn **25 MB/người dùng**, lưu thành bytea trên Neon.
- Neon Free có hạn mức lưu trữ, compute và có thể thay đổi điều khoản. Chỉ phù hợp thử nghiệm, chưa được kiểm toán bảo mật độc lập.
- Gọi thoại/video dùng WebRTC cơ bản; mạng phức tạp có thể cần TURN riêng (thường phát sinh chi phí).
- Không hỗ trợ mã hóa đầu-cuối (E2EE). Admin có khả năng kiểm duyệt nội dung và người dùng cần được thông báo về điều này.
- Dữ liệu trong SQLite trên máy cũ **không tự chuyển** sang Neon; file ZIP này tạo dữ liệu mới khi deploy.

## Kiểm thử

```sh
python -m pytest -q
```

**11/11 bài kiểm thử đạt** gồm 8 bài chức năng SQLite và 3 bài cấu hình/giả lập adapter PostgreSQL. Kiểm tra với PostgreSQL/Render thật cần tài khoản Neon và Render; chưa triển khai thay người dùng.

## Quản lý phiên & thiết bị

Trong **Cài đặt → Phiên đăng nhập**, người dùng có thể xem loại thiết bị, hệ điều hành,
trình duyệt, thời điểm đăng nhập/ghi nhớ, thời điểm hoạt động cuối, thời hạn, mạng IP đã
rút gọn và vị trí gần đúng (nếu có). Có thể đổi tên và thu hồi **từng** phiên/thiết bị;
không thể xóa nhầm phiên đang dùng (hãy bấm Đăng xuất). Thu hồi quyền ghi nhớ chỉ gỡ
mở khóa nhanh bằng PIN, không tự đăng xuất một phiên đang hoạt động.

Tên loại thiết bị được suy ra từ User-Agent (không phải tên máy chính xác). **Không có
theo dõi GPS hay gọi API geolocation bên thứ ba.** Vị trí được tra cứu cục bộ, chỉ khi
triển khai đã chuẩn bị tệp GeoLite2-City `.mmdb` hợp lệ và khai báo
`GEOIP_DB_PATH=/đường/dẫn/GeoLite2-City.mmdb`. Không có cơ sở dữ liệu này,
mtunz hiển thị **Không xác định** và vẫn có thể xem IP đã che bớt. Vị trí IP
có thể sai do VPN, mạng di động và proxy. Đối với thiết bị đăng nhập trước bản
cập nhật, các trường nhận diện được hiển thị **Chưa có dữ liệu** thay vì suy đoán.
