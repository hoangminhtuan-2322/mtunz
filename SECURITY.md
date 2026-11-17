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
