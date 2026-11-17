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
