# Quy tắc bảo trì mtunz (theo yêu cầu chủ dự án)

Áp dụng cho mọi đợt sửa giao diện, tối ưu và bổ sung tính năng sau này.

1. **Bảo toàn chức năng hiện có.** Chỉ sửa lỗi, mở rộng hoặc nâng cấp khi vẫn giữ luồng đăng nhập, đăng ký, tài khoản, PIN, quyền Admin, WebSocket, tin nhắn riêng/nhóm/Chat thế giới, tệp đính kèm, thông báo, kiểm duyệt, kháng nghị và xóa tài khoản.
2. **Không xóa hoặc đặt lại dữ liệu thật.** Tuyệt đối không chạy thao tác xóa người dùng, nhật ký, tin nhắn hoặc cơ sở dữ liệu trong quá trình chỉnh UI/test. Chỉ sử dụng dữ liệu tạm và database test riêng biệt.
3. **Giữ API và bảo mật phía máy chủ.** Không bỏ middleware, giới hạn gửi tin, quyền truy cập, kiểm tra PIN, quy tắc báo cáo hoặc cơ chế chống spam để làm giao diện nhanh/đẹp hơn.
4. **Sửa độc lập, có thể hoàn tác.** Tạo nhánh/PR, ưu tiên CSS/JS bổ sung có phạm vi hẹp; không đụng phần không liên quan. Không merge/deploy trước khi kiểm thử.
5. **Kiểm thử hồi quy bắt buộc.** Chạy bài Python/JS sẵn có, kiểm thử PostgreSQL và smoke UI trên màn hình 320px, 390px, 768px, 1440px. Rà soát chế độ phòng đóng, bị phạt, mạng chậm, giảm chuyển động và keyboard mobile.
6. **Không cam kết 'không lỗi' khi chưa kiểm chứng.** Chỉ đánh dấu hoàn thiện sau khi CI và kiểm tra thủ công đã đạt; nếu còn giới hạn môi trường phải ghi rõ.

## V9 World Chat + Mobile Profile

- Nút Profile trên mobile phải hiển thị trong thanh điều hướng dưới; nút Profile desktop giữ nguyên.
- Chat thế giới nâng cấp phần trình bày, đồng thời giữ nguyên luồng dữ liệu và xử lý của các module World cũ.
- Không thêm giả lập người dùng online hoặc số liệu không có trên backend.
