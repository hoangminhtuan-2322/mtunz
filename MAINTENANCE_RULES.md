# Quy tắc bảo trì mtunz (theo yêu cầu chủ dự án)

Áp dụng cho mọi đợt sửa giao diện, tối ưu và bổ sung tính năng sau này.

1. **Bảo toàn chức năng hiện có.** Chỉ sửa lỗi, mở rộng hoặc nâng cấp khi vẫn giữ luồng đăng nhập, đăng ký, tài khoản, PIN, quyền Admin, WebSocket, tin nhắn riêng/nhóm/Chat thế giới, tệp đính kèm, thông báo, kiểm duyệt, kháng nghị và xóa tài khoản.
2. **Không xóa hoặc đặt lại dữ liệu thật.** Tuyệt đối không chạy thao tác xóa người dùng, nhật ký, tin nhắn hoặc cơ sở dữ liệu trong quá trình chỉnh UI/test. Chỉ sử dụng dữ liệu tạm và database test riêng biệt.
3. **Giữ API và bảo mật phía máy chủ.** Không bỏ middleware, giới hạn gửi tin, quyền truy cập, kiểm tra PIN, quy tắc báo cáo hoặc cơ chế chống spam để làm giao diện nhanh/đẹp hơn.
4. **Sửa độc lập, có thể hoàn tác.** Tạo nhánh/PR, ưu tiên CSS/JS bổ sung có phạm vi hẹp; không đụng phần không liên quan. Không merge/deploy trước khi kiểm thử.
5. **Kiểm thử hồi quy bắt buộc.** Chạy bài Python/JS sẵn có, kiểm thử PostgreSQL và smoke UI trên màn hình 320px, 390px, 768px, 1440px. Rà soát chế độ phòng đóng, bị phạt, mạng chậm, giảm chuyển động và keyboard mobile.
6. **Không cam kết 'không lỗi' khi chưa kiểm chứng.** Chỉ đánh dấu hoàn thiện sau khi CI và kiểm tra thủ công đã đạt; nếu còn giới hạn môi trường phải ghi rõ.

## V9 World Chat + Mobile Profile

- Profile trên mobile phải hiển thị thành **thẻ tài khoản (avatar, tên, @username) ở đầu danh sách Tin nhắn, phía trên tiêu đề Tin nhắn**, không nằm trong thanh điều hướng dưới. Thanh dưới luôn giữ đúng 5 mục cũ; nút Profile desktop ở cuối menu trái giữ nguyên.
- Chat thế giới nâng cấp phần trình bày, đồng thời giữ nguyên luồng dữ liệu và xử lý của các module World cũ.
- Không thêm giả lập người dùng online hoặc số liệu không có trên backend.

## Quy ước Chat thế giới trên desktop (V9.1)

- Khi chọn **Chat thế giới** ở viewport từ **801px** trở lên, bố cục sử dụng toàn bộ vùng sau thanh điều hướng chính. Thanh danh sách hộp thư thường được ẩn **chỉ trong tab Chat thế giới**; khi trở về Tin nhắn/Nhóm, thanh này phải xuất hiện lại.
- **Enter** gửi tin (không tạo dòng trống), **Shift+Enter** xuống dòng. Trong lúc bộ gõ IME đang ghép chữ, giữ phím lặp, tải tệp hoặc nút Gửi bị vô hiệu hóa, không kích hoạt gửi bất thường.
- Ở viewport tối đa **800px** và thiết bị cảm ứng không có con trỏ chính xác, **không thay đổi** bố cục hiện hữu hay hành vi Enter trên bàn phím mobile.
- Kiểm thử hồi quy cả trạng thái mở/đóng phòng, lớp quyền, thao tác gửi bằng chuột, danh sách phòng, bình chọn và báo cáo. Không cần thay đổi backend để sửa hai hành vi giao diện này.

## Quy ước xác minh PIN Admin

- Khi Admin đã thiết lập PIN, **các thao tác quản trị thường xuyên** (cấu hình Chat thế giới, xử lý báo cáo, giới hạn tài khoản, điều chỉnh thông tin người dùng, gửi thông báo, thu hồi phiên) chỉ hiện một ô PIN; máy chủ bắt buộc xác minh PIN mới chấp nhận thay đổi.
- Không giảm bảo mật vì thay UI: dùng bộ xác thực PIN phía máy chủ, giới hạn lần nhập sai, khóa tạm và ghi nhật ký; không lưu PIN trên browser.
- Các hoạt động nhạy cảm như cấp mã đặt lại mật khẩu/PIN cho người khác hoặc xóa tài khoản/dữ liệu không thể hoàn tác giữ xác minh mạnh hơn (mật khẩu và PIN hoặc quy trình xác nhận đặc biệt).
- Trong trường hợp tài khoản Admin cũ chưa thiết lập PIN, luồng mật khẩu trước đây vẫn hoạt động để tránh làm gián đoạn tính năng; nên thiết lập PIN để sử dụng giao diện mới.

## Quy ước URL sạch

- Nếu người dùng truy cập kèm `utm_source=chatgpt.com`, loại bỏ **duy nhất** tham số này bằng History API và không reload, không đổi đường dẫn, không xóa query khác hoặc hash fragment.
- Không thay đổi hệ thống đăng nhập, session cookie, bộ định tuyến hay API khi làm sạch URL.

## Xóa tin nhắn riêng và nhóm (V11)

- Mỗi tin nhắn trong chat cá nhân/nhóm (kể cả tin đã thu hồi) phải có lối tắt **Xóa** dễ nhìn, dùng được trên desktop lẫn mobile. Không giấu hoàn toàn phía sau hover.
- Phân biệt rõ: **Xóa ở phía tôi** chỉ ẩn ở tài khoản đang sử dụng (sender hoặc recipient/member có quyền), không xóa tin cho người khác; **Thu hồi với mọi người** chỉ người gửi được làm, theo API DELETE cũ.
- Quyền ẩn/thu hồi phải được máy chủ kiểm tra; chỉ xóa riêng không sửa nội dung gốc, ID tin nhắn, người gửi hay quyền quản trị. Cấm ẩn tin của người lạ hoặc nhóm không còn là thành viên.
- Tin bị ẩn không được lộ lại qua lịch sử, xem trước hội thoại, bộ đếm chưa đọc, tìm kiếm, bookmark hoặc đường dẫn tải đính kèm của người đã ẩn. Tự đồng bộ giữa các phiên của cùng tài khoản; không thông báo việc ẩn riêng cho người khác.
- Migrations chỉ **bổ sung** bảng `message_hidden`; không xóa dữ liệu trước đây, không đổi schema hai bảng tin nhắn cũ. Xóa người dùng/nhóm rỗng phải dọn các bản ghi ẩn mồ côi.
- Kiểm thử API/migration trên SQLite và Neon PostgreSQL CI; kiểm thử xác nhận xóa trên 320/390/768/1440px; không tự merge hoặc thử xóa dữ liệu thật trên Render.
