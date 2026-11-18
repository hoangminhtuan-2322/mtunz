# mtunz — Quy tắc Chat thế giới và kiểm duyệt
Ngày cập nhật: 18/11/2026.

## 1. Chat thế giới chỉ mở khi admin bật
Mặc định phòng Chat thế giới đang đóng (Coming soon). Admin bật/tắt trên trang quản trị. Có thể lên lịch mở/đóng hằng ngày theo Asia/Ho_Chi_Minh, kể cả khoảng giờ qua nửa đêm. Server kiểm tra lịch trực tiếp mỗi khi có yêu cầu; không phụ thuộc cron.

## 2. Chống spam bằng cơ sở dữ liệu
Quy tắc chỉ áp dụng với Chat thế giới, không ảnh hưởng chat riêng/nhóm.
- 5 lần thử gửi trong 3 giây = 1 cảnh cáo; tin thứ 5 không được gửi.
- 3 cảnh cáo trong mỗi cấp = 1 án phạt.
- Cấp 1 khóa gửi Chat thế giới 12 giờ.
- Cấp 2 khóa gửi Chat thế giới 1 ngày.
- Cấp 3 khóa gửi Chat thế giới 3 ngày.
- Cấp 4 khóa gửi Chat thế giới 7 ngày.
- Cấp 5 khóa TOÀN TÀI KHOẢN 15 ngày.
- Nếu không phát sinh vi phạm nào trong 30 ngày kể từ cảnh cáo/vi phạm gần nhất, hệ thống đặt lại số cảnh cáo và cấp phạt tự động về 0. Quyết định khóa riêng do admin không bị xóa.
- Trừ khi đã bị khóa toàn tài khoản ở cấp cuối, người đang bị phạt vẫn đọc được tin công cộng. Thanh gửi bị chặn với bộ đếm ngày:giờ:phút:giây và popup cảnh báo.
- Trạng thái spam lưu trên PostgreSQL, không xóa khi F5, đăng nhập lại hoặc đổi thiết bị.

## 3. Quyền admin
Admin có thể bật/tắt phòng, thiết lập giờ mở/đóng tự động, xem người vi phạm, khóa gửi thủ công theo thời hạn, bỏ khóa thủ công, đặt lại cảnh cáo tự động, gỡ tin công cộng và xử lý báo cáo. Thao tác thay đổi yêu cầu xác minh lại mật khẩu và PIN admin nếu được bật, đồng thời ghi nhật ký quản trị.

## 4. Báo cáo
Người dùng có thể báo cáo từ hồ sơ, danh sách bạn bè và tin Chat thế giới; cần lý do và mô tả tối thiểu 10 ký tự. Bằng chứng từ tin nhắn chỉ gửi được khi người báo cáo có quyền xem. Admin xem hàng chờ và quyết định đã xem xét hoặc bác bỏ, kèm ghi chú. Báo cáo không tự động kết tội. Một tài khoản có tối đa 6 báo cáo/giờ và không thể báo cáo trùng cùng mục tiêu trong khi báo cáo vẫn chờ trong vòng 1 giờ.

## 5. Database và phát hành
Bốn bảng mới: world_settings, world_messages, world_penalties, user_reports. Mặc định world_settings.enabled = 0. Dữ liệu người dùng dùng khóa ngoại xóa dây chuyền. Tin công cộng chỉ thể hiện tên hiển thị và ID, không công khai tên đăng nhập, số điện thoại, IP hoặc mật khẩu.

Kiểm thử tự động:
- tests/test_world_moderation.py: quy tắc spam, phân cấp, reset, lịch và quyền, báo cáo, không khóa DM/nhóm.
- tests/world_moderation_ui.cjs: popup, bộ đếm, điều hướng và công cụ admin.
- tests/smoke_postgres.py: chạy PostgreSQL thử nghiệm riêng, xác minh tạo tin công cộng, báo cáo và quyết định admin.

Chỉ đánh dấu tính năng đang chạy production khi đã xác nhận commit Render ở trạng thái live, Neon có đủ schema và thử nghiệm thực tế. Chưa dùng PostgreSQL production làm môi trường kiểm thử phá hủy dữ liệu.
