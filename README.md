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


## Giữ phiên và màn hình hiện tại khi tải lại tab (11/2026)

- API `GET /api/auth/remembered/status` chỉ kiểm tra thiết bị đã ghi nhớ mà **không thu hồi phiên đăng nhập**. API khóa phiên cũ chỉ được gọi trong luồng truy cập tab mới, không gọi khi F5.
- Sau khi đăng nhập, mtunz đánh dấu phiên hoạt động trong **sessionStorage**
  của tab (chỉ ID tài khoản và trang đang xem, không lưu mật khẩu/PIN).
  Tải lại bằng **F5 / Ctrl+R** sẽ gọi `GET /api/me` để dùng tiếp phiên
  cookie HttpOnly đã xác thực, **không gọi lại quy trình khóa phiên/PIN**.
- Khi tải lại, ứng dụng khôi phục khu vực đang mở: trang Cài đặt, nhóm chat,
  cuộc trò chuyện (nếu vẫn còn quyền truy cập) hoặc trang quản trị. Nội dung
  tin nhắn được tải mới từ server; không lưu tin nhắn/PIN/mật khẩu vào
  sessionStorage.
- Khi mất kết nối tạm thời, màn hình cho phép **Thử kết nối lại** thay vì
  mặc định xóa thông tin phiên hoặc chuyển về đăng nhập.
- Một tab mới thông thường không có dấu phiên trong sessionStorage nên
  không tự động mở tin nhắn. Tab mới kiểm tra sự tồn tại của tab khác qua
  `BroadcastChannel` để tránh thu hồi phiên của tab đang hoạt động.
  Nếu không có tab nào đang hoạt động, phiên cookie cũ được khóa và
  người dùng phải đăng nhập lại hoặc xác minh PIN thiết bị đã ghi nhớ.
- **Giới hạn của trình duyệt:** Không có sự kiện đáng tin cậy phân biệt
  đóng tab với tải lại trong mọi trình duyệt. Tab bị đóng thông thường
  xóa sessionStorage, nhưng việc khôi phục tab gần đây, nhân bản tab hoặc
  crash recovery có thể phục hồi sessionStorage; server không bảo đảm
  thu hồi phiên ngay chính xác vào thời điểm đóng tab. Phiên vẫn được
  thu hồi khi người dùng bấm Đăng xuất, khi mở lại theo luồng tab mới,
  hoặc khi hết hạn (Admin tối đa 2 giờ, thành viên tối đa 7 ngày).
  Không nên dùng dấu sessionStorage làm yếu tố xác thực thay cho cookie,
  PIN hoặc kiểm soát phiên phía máy chủ.

Bài test: `node tests/tab_session_lifecycle.cjs`. Các kiểm tra gồm nạp lại
không mất phiên, khôi phục cuộc trò chuyện và mục Admin, giữ tab khác không
bị đá ra khi mở thêm tab, tab mới yêu cầu xác thực và lỗi mạng không thành
đăng xuất.

## Chống spam vào hộp thư hỗ trợ Admin

- Giới hạn ở **máy chủ**, không tin vào đồng hồ hay nút gửi ở trình duyệt.
- Mỗi phiếu hỗ trợ: cách nhau ít nhất 4 giây, tối đa 6 tin/phút; từ chối nội dung lặp trong 60 giây.
- Theo trình duyệt/khách: tối đa 25 tin/10 phút và 100 tin/ngày; theo IP kết nối: 90 tin/10 phút, 300 tin/ngày. IP được băm bằng HMAC với khóa ngẫu nhiên lưu trong cấu hình DB, không lưu IP thô vào bảng giới hạn.
- Tạo phiếu: tối đa 1 phiếu/phút, 3 phiếu/giờ và 2 phiếu đang mở mỗi khách; tối đa 24 phiếu/giờ từ một IP. Giới hạn bộ nhớ sẵn có vẫn là một lớp bổ sung.
- Bộ đếm lưu trong SQLite (local) hoặc Neon PostgreSQL (Render), dùng UPSERT nguyên tử và không mất khi worker khởi động lại. Khi vượt ngưỡng, máy chủ trả HTTP 429 kèm Retry-After.
- Admin có thể **Đánh dấu spam** một phiếu, đóng quyền gửi tiếp, ẩn phiếu khỏi danh sách mặc định và xem lại/mở lại bằng **Xem phiếu spam**. Hành động được ghi vào audit. Tin nhắn Admin gửi không chịu giới hạn spam của khách.
- Giới hạn theo IP có thể ảnh hưởng đến nhiều người dùng cùng mạng (ví dụ Wi-Fi trường học), nên đặt hạn mức IP rộng hơn giới hạn cookie; có thể điều chỉnh các ngưỡng theo lưu lượng thực tế.
