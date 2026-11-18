> **TÀI LIỆU TRƯỚC ĐÂY:** Bản rà soát này đã được thay thế bằng [PREPUBLIC_FINAL_AUDIT_2026-11-18.md](PREPUBLIC_FINAL_AUDIT_2026-11-18.md). Hãy sử dụng báo cáo mới nhất để kiểm tra trước public.

# MTUNZ — Đánh giá mức sẵn sàng trước public
**Ngày rà soát:** 18/11/2026  
**Phạm vi:** GitHub `main`, các workflow CI, mã FastAPI/PostgreSQL, giao diện Admin/người dùng, kiểm tra metadata Neon.  
**Không phải:** chứng nhận pentest độc lập, kiểm thử tải thật hay xác nhận triển khai Render đã live.

## 1. Chức năng đã xác minh bằng mã và kiểm thử
- Thu hồi tin nhắn ở DM/nhóm: chỉ chủ tin thu hồi, server đánh dấu `deleted_at` và phát sự kiện thay đổi.
- Chỉnh sửa: chủ tin, chưa thu hồi, `now()-created_at <= 900 giây` ở máy chủ.
- Ghim riêng cho từng tài khoản/cuộc trò chuyện: tối đa 5 tin, kiểm tra tình bạn hoặc tư cách thành viên nhóm ở API `/api/chat/pins`.
- Chuyển tiếp DM/nhóm: API `/api/chat/forward` xác minh tin nguồn và quyền gửi ở đích; đính kèm vẫn được bảo vệ qua quyền truy cập.
- Popup lời mời kết bạn: xem hồ sơ, chấp nhận, từ chối, để sau; giữ luồng hủy lời mời đã gửi.
- Cài đặt: bố cục tổng quan, lối tắt, trạng thái riêng tư; không thay thế API đổi mật khẩu/PIN.
- Chat thế giới: trang `Coming soon` và lối vào, không có API gửi tin công khai.
- Quyền định vị: đã sửa `Permissions-Policy` từ cấm toàn bộ sang `geolocation=(self)`, trình duyệt vẫn phải xin người dùng chấp thuận.
- CI gồm kiểm tra cú pháp JS, hồi quy giao diện, pytest API và smoke PostgreSQL (không có xác minh thao tác trực tiếp qua trình duyệt thật).

## 2. Rủi ro phải xử lý trước public (P0)
**P0-1 — Production chưa xác nhận cập nhật:** Khi đối chiếu Neon `mtunz-db` nhánh `main`, chưa thấy bảng `message_pins` hoặc cột `forwarded`. Đây là schema mới tự migrate lúc khởi động phiên bản mới; phải xác nhận deploy thực sự đã live rồi kiểm tra schema/endpoint. Không chạy migration thủ công trên production khi chưa chuẩn bị phục hồi.

**P0-2 — Chưa xác minh Render:** Kết nối Render có workspace tên `mtunz` nhưng chưa có workspace được xác nhận/chọn trong phiên. Chưa kiểm tra build/deploy, log lỗi, health endpoint và commit hiện chạy. Việc GitHub Actions xanh không đồng nghĩa Render đã live.

**P0-3 — Backup và phục hồi:** Neon default branch `main` đang báo `protected=false`. Cần cấu hình quyền truy cập, bảo vệ nhánh, điểm khôi phục/snapshot và thử phục hồi trên nhánh thử nghiệm trước khi lưu dữ liệu người dùng thật.

**P0-4 — Kiểm thử hai người dùng thực:** Cần xác minh bằng 2–3 tài khoản thử trên phiên bản đã triển khai: đăng nhập, gửi ảnh + giới hạn, emoji, vị trí với cấp quyền/từ chối, kết bạn và từ chối, DM/nhóm, sửa tại mốc 15 phút, thu hồi, ghim, chuyển tiếp ảnh/tin, chặn, đăng xuất và đăng nhập lại. Kiểm tra điện thoại Android/iPhone và máy tính trước mở rộng.

## 3. Rủi ro quan trọng cần cân nhắc (P1)
- **Đặc tính Free:** Một worker WebSocket, hạn chế tài nguyên, cold start; giới hạn lưu tệp 2 MB trên chế độ hosted và tổng 25 MB tài khoản trong mã. Cần thử tải đồng thời và có phương án tăng cấu hình khi có người dùng thực.
- **Chưa có mã hóa đầu-cuối:** Máy chủ xử lý nội dung và Admin có khả năng kiểm duyệt/truy cập theo quyền. Cần công khai rõ trong chính sách quyền riêng tư, tránh hứa hẹn “bí mật như E2EE”.
- **Xác minh liên hệ:** SMS/email chưa xác thực quyền sở hữu. Không dùng thông tin do người dùng tự khai làm bằng chứng khôi phục tài khoản duy nhất.
- **Cuộc gọi:** WebRTC chưa được chứng minh hoạt động ổn định trên mọi NAT/mạng di động, có thể cần TURN được vận hành chính thức.
- **Chống spam:** Rate limit chính của API dùng bộ nhớ tiến trình, bị reset khi restart; có thêm một số giới hạn hỗ trợ trong DB. Khi mở rộng nhiều worker, cần backend rate limit dùng chung.
- **Kiểm thử bảo mật:** Chưa có pentest, rà soát thư viện phụ thuộc, thử XSS/các case upload khó, bài thử tải và giám sát cảnh báo lỗi chạy thật.
- **Retention:** Cron gọi `/health` mỗi 6 giờ để kích hoạt xử lý xóa 30 ngày (best-effort), không đảm bảo xử lý đúng từng phút.

## 4. Cải tiến không chặn bản beta nhỏ (P2)
- Rà soát UI trực quan trên điện thoại nhỏ, hỗ trợ bàn phím/đọc màn hình và thông báo lỗi.
- Xem lại ảnh PNG bị chuyển JPEG nền trắng khi tối ưu, GIF lớn hơn 2 MB, quota lưu trữ và xử lý tệp nguồn bị xóa sau khi chuyển tiếp.
- Cập nhật trạng thái ghim khi tin nhắn cũ không nằm trong 70 tin mới nhất.
- Hoàn thiện điều khoản sử dụng/chính sách riêng tư, quy trình báo cáo nội dung và thông báo bảo trì.
- Cân nhắc `X-Robots-Tag: noindex, nofollow` khi muốn được các công cụ tìm kiếm lập chỉ mục; hiện tại chặn index.
- Thêm cảnh báo giám sát lỗi và quy trình backup có kiểm tra phục hồi.

## 5. Quy trình go/no-go đề xuất
1. Xác nhận workspace Render `mtunz` và phiên bản triển khai, không tự chọn một workspace chưa được xác nhận.
2. Xác nhận commit production, `PUBLIC_MODE=1`, `REQUIRE_POSTGRES=1`, cookie Secure và migration đầy đủ.
3. Bảo vệ và sao lưu Neon; thử khôi phục trên môi trường tách biệt.
4. Chạy smoke thật bằng nhiều tài khoản, nhiều thiết bị và kiểm thử áp lực mức dự kiến.
5. Hoàn thiện thông báo riêng tư, kênh hỗ trợ, kiểm duyệt, quy trình xử lý sự cố và lịch giám sát.
6. Chỉ sau các bước trên mới chốt **GO PUBLIC**. Chưa đạt các bước thì giữ **NO-GO**.

**Hiện trạng đánh giá:** *NO-GO cho phát hành chính thức rộng rãi* (có thể tiếp tục kiểm thử nội bộ). Không có thao tác xóa/sửa dữ liệu người dùng thật nào được thực hiện trong cuộc rà soát này.
