# mtunz / Render Free: bảo mật và giới hạn

Đây là bản tự triển khai cho nhóm thử nghiệm nhỏ, **chưa được kiểm toán bảo mật độc lập**. Admin có thể kiểm duyệt nội dung tin nhắn; ứng dụng **không mã hóa đầu-cuối (E2EE)**. Hãy thông báo điều này cho người sử dụng.

1. **Không dùng mật khẩu admin demo `mtunz7` trên Internet.** Đặt `ADMIN_PASSWORD` ngẫu nhiên, riêng biệt, tối thiểu 12 ký tự **trước lần khởi tạo database Neon đầu tiên**. Sau lần đầu, biến môi trường không tự ghi đè mật khẩu đã băm trong cơ sở dữ liệu.
2. Bật `PUBLIC_MODE=1`, `COOKIE_SECURE=1`, `REQUIRE_POSTGRES=1`, cung cấp secret `DATABASE_URL` trong Render Environment. Không đưa secrets vào GitHub/ảnh chụp màn hình. Hệ thống không khởi chạy trên Render khi thiếu PostgreSQL.
3. Web dùng cookie HttpOnly, SameSite=Lax và kiểm tra Origin khi ghi dữ liệu/WebSocket. Mật khẩu và mã PIN lưu bằng Argon2 hash; admin không đọc được giá trị gốc.
4. Trên Render Free, dữ liệu người dùng phải lưu ở **Neon PostgreSQL**. Local SQLite trên Render không bền vững và sẽ mất khi service ngủ/deploy lại. Các tệp nhỏ trên Render được lưu dạng PostgreSQL BYTEA tối đa 2 MB/tệp và 25 MB/người, theo hạn mức Neon. Không có hệ thống quét virus toàn diện.
5. **Sao lưu Neon bằng công cụ xuất/backup PostgreSQL**, hoặc theo tính năng lịch sử/restore mà gói Neon đang hỗ trợ. `backup.py` trong repo chỉ sao lưu SQLite khi chạy local; không thể dùng nó để sao lưu Neon.
6. Ứng dụng chỉ chạy **1 worker**; trạng thái online và WebSocket in-memory, không hỗ trợ nhiều worker hoặc nhiều instance. Render Free có thể tự ngủ, ngắt kết nối và khởi động lại; tốc độ mở lần đầu có thể chậm.
7. Rate limiting hiện chủ yếu theo tiến trình, thích hợp demo nhóm nhỏ, chưa thay thế rate limiting tập trung và chống bot khi phục vụ rộng rãi.
8. Gọi thoại/video 1–1 bằng WebRTC là bản cơ bản, không có máy chủ TURN đi kèm. Cần dịch vụ TURN cho một số mạng khó và có thể có chi phí riêng.
9. Khôi phục tài khoản do admin duyệt thủ công; cần xác minh chủ sở hữu ngoài kênh chat, không cấp lại thông tin chỉ dựa trên lời tự khai của người yêu cầu.
10. Không đưa website vào sản xuất quy mô lớn nếu chưa kiểm tra quyền truy cập, thử nghiệm PostgreSQL thực tế, chống lạm dụng, chính sách quyền riêng tư, xóa dữ liệu và phương án khôi phục sau sự cố.

## Gia cố giao diện và bảo mật tháng 11/2026

- Giao diện có toast riêng theo loại thông báo, thanh thời gian tự đóng, đóng thủ công, popup thao tác nguy hiểm và hỗ trợ bàn phím/focus.
- Middleware từ chối nguồn ghi dữ liệu sai Origin/Referer và trình duyệt gửi `Sec-Fetch-Site: cross-site`. Yêu cầu API thông thường giới hạn nội dung JSON ở 64 KiB; upload có giới hạn yêu cầu 3 MiB và giới hạn tệp thực ở 2 MiB trên Render Free.
- WebSocket từ chối thông điệp JSON không hợp lệ, thông điệp lớn hơn 16 KiB và tần suất sự kiện bất thường. Các giới hạn này vẫn là bảo vệ cấp ứng dụng, không thay thế WAF hay rate limiter tập trung.
- Đã bổ sung COOP/CORP, `X-Content-Type-Options`, `X-Frame-Options`, CSP và giới hạn kiểm tra tài khoản/đổi mật khẩu/PIN. Khi chạy `PUBLIC_MODE=1`, **mật khẩu mới** phải từ 10 đến 128 ký tự và không dùng các mật khẩu phổ biến đã liệt kê; tài khoản cũ không tự đổi mật khẩu.
- Trên máy chủ production, cookie đăng nhập dùng `HttpOnly`, `Secure`, `SameSite=Lax`. PIN là lớp xác minh bổ sung kiểu *knowledge factor*, không phải xác thực đa yếu tố bằng thiết bị độc lập. Admin vẫn được xét duyệt thủ công theo thiết kế hiện tại.
- **Chưa có E2EE, quét virus đầy đủ, bảo vệ chống tấn công phân tán, xác thực TOTP/hardware key hay kiểm thử thâm nhập độc lập**. Không khẳng định hệ thống đạt chuẩn bảo mật doanh nghiệp.
- Mật khẩu admin được thiết lập trước đây có thể đã xuất hiện trong cuộc hội thoại. Nên đổi mật khẩu admin **trong ứng dụng** qua mục bảo mật, vì sửa riêng biến `ADMIN_PASSWORD` trên Render sẽ không đổi hash đã lưu trong Neon. Không chia sẻ mật khẩu, API key, cookie hoặc chuỗi kết nối database.

## Lưu thiết bị, mở khóa bằng PIN (tháng 11/2026)

- Người dùng chọn **Ghi nhớ thiết bị này trong 30 ngày** khi đăng nhập thành công bằng mật khẩu và PIN. Thiết bị được lưu bằng token 256-bit ngẫu nhiên trong cookie `HttpOnly`, `SameSite=Strict`, `Secure` trên Render HTTPS; phía Neon chỉ lưu SHA-256 của token, không lưu mật khẩu hoặc PIN trên trình duyệt.
- Khi tải lại / mở trang mtunz, client gửi yêu cầu khóa phiên truy cập cũ trước khi hiển thị tin nhắn. Nếu thiết bị còn hợp lệ, nó hiện màn hình yêu cầu PIN, không tự mở tin nhắn. Thiết bị hết hạn, bị thu hồi hoặc tài khoản bị khóa phải xác minh lại theo quy trình đăng nhập.
- PIN sai 5 lần sẽ tạm khóa thiết bị ghi nhớ **15 phút**; số lần thử được lưu trong PostgreSQL để giới hạn không tự reset khi Render khởi động lại.
- Đổi mật khẩu, đổi PIN, khôi phục tài khoản hoặc quản trị viên khóa tài khoản sẽ thu hồi các token ghi nhớ của tài khoản đó. **Đăng xuất** cũng thu hồi token ghi nhớ của thiết bị hiện tại.
- Trong mục **Phiên đăng nhập**, người dùng xem số phiên hoạt động và thiết bị ghi nhớ; chọn **Đăng xuất thiết bị khác** để thu hồi cả hai. Với thiết bị đã được ghi nhớ, nút **Khóa bằng PIN** đóng quyền truy cập hiện tại nhưng không xóa thiết bị.
- Tài khoản admin trước đây không có PIN. Muốn ghi nhớ thiết bị, admin phải vào **Bảo mật → Kích hoạt PIN cho admin** bằng mật khẩu admin hiện tại; từ đó đăng nhập trên thiết bị mới bằng mật khẩu + PIN.
- **Giới hạn:** Chế độ bảo vệ PIN khi mở lại website được áp dụng bằng API khóa phiên lúc ứng dụng khởi tạo. Không nên xem đây là xác thực đa yếu tố chống thiết bị bị chiếm quyền điều khiển: kẻ có quyền thực thi JavaScript trong tab đã mở khóa có thể sử dụng phiên đang hoạt động. Việc mở lại mtunz trong tab khác có thể làm phiên ở tab trước cần xác minh lại. Thời hạn cookie và trạng thái phiên còn phụ thuộc chính sách trình duyệt.
