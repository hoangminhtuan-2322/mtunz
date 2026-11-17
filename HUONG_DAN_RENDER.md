# CÁCH ĐƯA MTUNZ LÊN RENDER FREE (KHÔNG CẦN CMD)

Bạn cần **3 website miễn phí**: GitHub (giữ source), Neon (lưu dữ liệu), Render (chạy web). Không cần cài Python hoặc Node.js vào máy chỉ để deploy.

## 1. Tạo cơ sở dữ liệu ở Neon

1. Vào https://console.neon.tech/ → Sign up / Log in.
2. Chọn **New Project**, đặt tên `mtunz`, chọn gói **Free**. Có thể chọn region Singapore nếu được hỗ trợ.
3. Mở **Connect / Connection Details**, chọn connection string **Pooled** nếu có.
4. Sao chép chuỗi bắt đầu `postgresql://...`, thường có `sslmode=require`. **Giữ bí mật**. Không gửi chuỗi này qua ảnh chụp/chat và không upload lên GitHub.

## 2. Tải mã nguồn lên GitHub

1. Vào https://github.com/new, đăng nhập GitHub.
2. Tạo repo **Private** tên `mtunz`, bấm **Create repository**.
3. Ấn **Add file → Upload files**; kéo/thả **toàn bộ tệp và thư mục BÊN TRONG** `mtunz_render_free_public`, để `render.yaml`, `app.py`, `requirements.txt`, `static/` ở thư mục gốc repo. **Không upload nguyên file ZIP**.
4. Bấm **Commit changes**. Không upload `.env`, SQLite database, tệp sao lưu hoặc private key.

## 3. Tạo web trên Render

1. Vào https://dashboard.render.com/ → Sign up / Log in.
2. Chọn **New → Blueprint** (nếu có) → kết nối GitHub và repo `mtunz`.
3. Render đọc `render.yaml`, tạo Web Service tên `mtunz` trên **plan Free**. Kiểm tra đúng `Free` trước khi bấm triển khai.
4. Khi Render hỏi hai biến bí mật, nhập:
   - `DATABASE_URL`: chuỗi PostgreSQL lấy ở bước 1.
   - `ADMIN_PASSWORD`: mật khẩu ngẫu nhiên **tối thiểu 12 ký tự**, KHÁC `mtunz7`.
   Nếu giao diện không hỏi, vào dịch vụ mtunz → **Environment → Add Environment Variable** nhập hai biến này trước khi chạy.
5. Xem **Logs**. Nếu báo lỗi thiếu `DATABASE_URL`, nhập biến trên rồi **Manual Deploy / Deploy latest commit**.
6. Khi trạng thái **Live**, mở URL được Render cấp, ví dụ `https://mtunz.onrender.com` nếu tên còn trống.

**Không chọn Render Postgres Free** cho dữ liệu quan trọng: cơ sở dữ liệu đó hết hạn sau 30 ngày. Dự án đã cấu hình dùng Neon ngoài Render để giữ dữ liệu lâu dài trong hạn mức Free.

## 4. Kiểm tra website hoạt động

1. Dùng URL mà Render cấp, vào `.../health` và xác nhận có `"ok": true`.
2. Vào trang mtunz, đăng nhập `admin` với **mật khẩu bạn vừa đặt**, không yêu cầu PIN.
3. Mở cửa sổ ẩn danh → người dùng yêu cầu tạo tên tài khoản.
4. Admin duyệt trong bảng quản trị, người dùng tạo mật khẩu/PIN và đăng nhập.
5. Tạo thêm tài khoản thứ hai để kiểm tra kết bạn và gửi tin nhắn realtime.
6. Từ Dashboard, chọn **Manual Deploy → Deploy latest commit**, hoặc đợi Free ngủ rồi truy cập lại; kiểm tra tài khoản/tin nhắn vẫn tồn tại trong Neon.

## Khi gặp lỗi

| Hiện tượng | Kiểm tra |
|---|---|
| `Missing DATABASE_URL` | Environment có biến `DATABASE_URL` và `REQUIRE_POSTGRES=1` |
| Admin không vào được | `ADMIN_PASSWORD` ít nhất 12 ký tự, đã thiết lập TRƯỚC lần chạy đầu; đổi env sau khi tạo admin không đổi mật khẩu của admin đã lưu |
| `password authentication failed` | Sao chép đúng PostgreSQL connection string Neon, không có khoảng trắng/dấu nháy |
| Lần mở đầu chậm | Render Free ngủ sau 15 phút; lần truy cập mới cần thời gian khởi động |
| Không gửi được tệp lớn | Tệp tối đa 2 MB trên Render Free; tối đa 25 MB/người dùng |
| Dùng `render.yaml` nhưng không hỏi secret | Vào Environment và thêm `DATABASE_URL`, `ADMIN_PASSWORD` thủ công |
| Tin nhắn mất sau khởi động | Kiểm tra app đang dùng DATABASE_URL thực; không được để `REQUIRE_POSTGRES=0` trên Render |
| URL không phải `mtunz.onrender.com` | Tên mtunz đã được dùng; Render tự cấp URL khác, dùng đúng URL trong dashboard |

## An toàn / giới hạn quan trọng

- **Không gửi** cho ai: mật khẩu admin, connection string Neon, SSH key hoặc token API.
- Free không cam kết không giới hạn phí/mức dùng; giữ phương thức thanh toán ở chế độ không tính phí hoặc thiết lập giới hạn theo giao diện từng nhà cung cấp.
- Bản này chưa kiểm thử trực tiếp trên tài khoản Neon/Render và **không thể bảo đảm chạy 24/7** vì Render Free ngủ khi không có hoạt động.
- Nếu bạn đã dùng mtunz trên SQLite trước đây, dữ liệu chưa được di chuyển sang PostgreSQL tự động.
- Website có tính năng admin kiểm duyệt tin nhắn, cần thông báo chính sách riêng tư cho người tham gia. Mật khẩu/PIN được băm, admin không đọc được mật khẩu/PIN gốc.
