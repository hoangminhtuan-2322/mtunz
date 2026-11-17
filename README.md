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

CI chạy kiểm thử Python, cấu hình PostgreSQL và các bài kiểm tra giao diện JavaScript. Các bài kiểm thử xóa tài khoản còn kiểm tra khoảng chờ 30 ngày, hủy yêu cầu, quá hạn, xóa vĩnh viễn bởi admin và bảo vệ tài khoản admin.

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


## Tài khoản chờ xóa 30 ngày

Trong **Cài đặt → Xóa tài khoản và dữ liệu**, người dùng nhập lại tên tài khoản,
mật khẩu, PIN và cụm `XOA SAU 30 NGAY` để tạo yêu cầu xóa. Dữ liệu **không bị xóa
ngay**: thời điểm `purge_at = requested_at + 30 × 24 giờ` được lưu bền vững
trong bảng `account_deletion_requests` (Neon ở môi trường public). Người dùng
có thể hủy trước hạn bằng mật khẩu và PIN hiện tại. Yêu cầu trùng không gia hạn
ngầm mốc xóa. Sau hạn, hủy không còn hiệu lực.

Hệ thống tự xử lý tài khoản đến hạn khi ứng dụng khởi động và mỗi 60 phút trong
thời gian chạy. Workflow `.github/workflows/deletion-retention.yml` gọi
`/health` mỗi 6 giờ để đánh thức ứng dụng Render Free ngay cả khi ngủ.
Đặt GitHub Actions variable `MTUNZ_HEALTH_URL` nếu địa chỉ triển khai không
phải `https://mtunz.onrender.com/health`. GitHub Actions hoặc Render bị
gián đoạn có thể khiến xóa thực tế diễn ra **muộn hơn 30 ngày**, không bao giờ
được xóa trước thời điểm đã đặt. Đây là lịch xử lý best-effort, không phải cam
kết chạy chính xác đến từng phút. Cần theo dõi các workflow thất bại để đảm
bảo xóa đúng hạn.

Admin thấy yêu cầu và hạn xử lý tại **Chờ xóa 30 ngày**, và vẫn có thể
**xóa vĩnh viễn ngay** từ danh sách này hoặc quản lý người dùng. Xóa ngay
yêu cầu admin đã kích hoạt PIN và xác minh lại bằng mật khẩu, PIN, tên tài khoản
đích và `XOA VINH VIEN`. Thao tác được ghi nhật ký; không có khôi phục dữ liệu
sau khi hệ thống đã xóa tài khoản.

## Bảo mật phiên quản trị

- Phiên Admin tối đa 2 giờ, thay vì 7 ngày của thành viên thông thường.
- Admin không thể dùng cookie ghi nhớ thiết bị trong 30 ngày để bỏ qua bước
  mật khẩu; đăng nhập trên thiết bị mới yêu cầu mật khẩu và PIN sau khi kích hoạt PIN.
- Xóa vĩnh viễn ngay bị khóa cho đến khi Admin thiết lập PIN.
- Trang **Bảo mật Admin** cho phép xem phiên đăng nhập và thu hồi các phiên khác;
  nhật ký thao tác xuất hiện tại trang tổng quan. Middleware chặn yêu cầu cross-site,
  kiểm tra Origin/Referer và sử dụng HTTPS/Secure cookies trên môi trường public.

**Khuyến nghị:** Đổi mật khẩu Admin mạnh, riêng biệt sau khi cập nhật. PIN là
một bước xác minh bổ sung, không thay thế MFA độc lập như passkey hoặc TOTP;
đối với hệ thống production có dữ liệu nhạy cảm, cần triển khai MFA mạnh và
đánh giá bảo mật độc lập.


## Quản lý thông tin liên hệ và hồ sơ người dùng

- Đăng ký mtunz mới **bắt buộc** nhập số điện thoại ngay khi gửi yêu cầu
  phê duyệt; email/Gmail là tùy chọn. Số Việt Nam dạng `09xxxxxxxx` được
  chuẩn hóa về `+84...`; số quốc tế nhận định dạng bắt đầu bằng dấu `+`.
- Số điện thoại và email chỉ xuất hiện với **chủ tài khoản** tại
  **Cài đặt → Thông tin liên hệ riêng tư** và với **Admin** tại
  **Phê duyệt đăng ký / Người dùng → Chi tiết**. API hồ sơ công khai không
  trả về hai trường này.
- Admin được xem các trường hồ sơ có trong hệ thống: tên đăng nhập/hiển thị,
  điện thoại, email, giới thiệu, mốc thời gian, trạng thái, quyền riêng tư,
  hoạt động tài khoản và số lượng tài nguyên. API này chỉ trả về những trường
  được chọn rõ ràng; không tiết lộ mật khẩu, mã băm, PIN, token hoặc mã khôi phục.
  Mỗi lần Admin mở chi tiết được ghi vào nhật ký `admin_view_user_details`.
- Với tài khoản tạo trước phiên bản này, điện thoại/email có thể trống cho
  đến khi chủ tài khoản tự bổ sung. Các tài khoản cũ không bị khóa chỉ vì
  chưa có số điện thoại. Trường hợp phê duyệt đăng ký từ phiên bản cũ
  cũng có thể bổ sung số điện thoại trước khi tạo tài khoản.
- **Chưa tích hợp xác thực sở hữu điện thoại qua SMS hoặc email**: dữ liệu
  là thông tin người dùng khai báo, không đủ làm bằng chứng xác minh danh tính
  hoặc phương thức khôi phục tài khoản an toàn.

## Xác nhận đăng xuất và hiệu ứng hiệu năng cao

Nút **Đăng xuất** trong menu, Cài đặt và Admin mở hộp thoại
**Hủy / Đăng xuất**; không thu hồi phiên nếu người dùng chọn Hủy.
Các màn hình xác minh, bảng quản trị và hộp thoại có hiệu ứng vào ngắn;
nút chạy tác vụ có spinner được dọn sau cả thành công/lỗi; hồ sơ chi tiết
Admin có skeleton khi chờ phản hồi. File `static/ui-interactions.css`
chỉ sử dụng các biến đổi nhỏ `opacity`/`transform`, tránh blur nặng,
và tôn trọng `prefers-reduced-motion` để tránh quá tải thiết bị yếu.

Chạy `node tests/contact_and_motion_ui.cjs` và `python -m pytest -q`
để kiểm tra thêm luồng mới. Khi triển khai thật cần kiểm tra Neon schema
migration và quy trình gửi SMS/email riêng trước khi xem số liên hệ như
dữ liệu đã được xác thực.
