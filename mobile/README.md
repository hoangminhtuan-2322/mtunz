# mtunz Mobile — Android/iOS native, đồng bộ với web

Ứng dụng **React Native + Expo SDK 58**, dùng **cùng FastAPI, PostgreSQL/SQLite, tài khoản và lịch sử chat** với website. Không dùng WebView hoặc database chat riêng. Thay đổi trên PR thử nghiệm, chưa tự triển khai production.

## Đã tích hợp trong mã nguồn

- Đăng ký tài khoản trên app, có số điện thoại, email tùy chọn, bước duyệt Admin trên web, tạo mật khẩu/PIN và chấp nhận Điều khoản/Quyền riêng tư; đăng nhập tên/số điện thoại + mật khẩu + PIN.
- Session native có thể thu hồi (Expo SecureStore, opaque bearer token), quản lý phiên và đăng xuất các thiết bị khác, không bỏ qua bảo vệ Admin.
- Danh sách hội thoại, bạn bè, kết bạn, lời mời, tin nhắn chờ, tìm người dùng, chat riêng và nhóm; tạo và quản lý nhóm.
- REST + WebSocket cho tin nhắn, reaction, sửa/thu hồi, đã nhận/đã xem, tin nhắn đang gõ, biệt danh, trạng thái, cập nhật hồ sơ. Làm mới dữ liệu khi vào foreground hoặc kết nối lại.
- Gửi ảnh, video, file nhỏ, ghi âm thoại M4A bằng micro, xem ảnh trong app, lưu/chia sẻ file; trả lời, ghim, chuyển tiếp và tìm kiếm; thư viện nội dung đã gửi.
- Đổi tên có mật khẩu và PIN, tùy chọn hồ sơ riêng tư, quản lý thông báo/hội thoại, chặn và báo cáo vi phạm.
- Chat thế giới theo chính sách của backend hiện tại.
- Có API đăng ký Expo Push Token gắn với session; thông báo mặc định không chứa nội dung nhạy cảm và tôn trọng cài đặt mute/quyền riêng tư.

## Cách chạy thử

Cài Node.js >=22.13, clone repo, vào thư mục mobile. Sao chép .env.example thành .env (Windows dùng lệnh copy), rồi điền EXPO_PUBLIC_API_URL bằng URL **HTTPS** của backend mtunz đã triển khai nhánh này; tuyệt đối không điền DATABASE_URL hoặc secret.

    cd mobile
    npm install
    npx expo-doctor
    npx expo start

Chạy kiểm thử trên DB local/thử nghiệm, không dùng production:

    python -m pytest -q tests/test_native_mobile.py
    python -m pytest -q

CI hiện kiểm tra tương thích Expo, export bundle Android/iOS, kiểm thử Python và PostgreSQL thử nghiệm. Export JavaScript bundle **không tạo APK hoặc IPA**.

## Chuẩn bị cài APK/iOS

Cần tài khoản Expo EAS, cấu hình projectId và khóa ký, tài khoản phân phối (nếu phát hành App Store/Play Store). Bật FCM cho Android và APNs cho iOS nếu muốn nhận push khi app đã đóng.

    cd mobile
    npx eas-cli login
    npx eas-cli init
    npx eas-cli build --platform android --profile preview
    npx eas-cli build --platform ios --profile preview

Profile preview xuất Android APK để thử nội bộ sau khi có signing; production dùng gói phù hợp nhà phát hành. Thư mục hiện **chưa chứa APK/IPA đã ký**. Trên Android SDK53+, Expo Go không hỗ trợ remote push; hãy dùng development build hoặc app đã ký để test.

## Giới hạn và an toàn trước khi phát hành

- WebSocket chỉ hoạt động khi OS cho phép chạy; khi đóng app cần push. Thông báo đẩy không đảm bảo giao đúng tuyệt đối mọi lúc.
- Render Free có thể tự ngủ, gây mất realtime hoặc chậm tin. Với mục tiêu đồng bộ liên tục, cần backend always-on và giám sát hạ tầng, xử lý reconnect, delivery/retry, kiến trúc pub/sub khi chạy nhiều worker.
- Backend hiện có giới hạn tệp 2 MB trên Render Free và khoảng 25 MB mỗi người dùng; app tuân theo. Chưa hỗ trợ mã hóa đầu cuối E2EE.
- Chưa thể khẳng định ngang bằng 100% với web: gọi thoại/video WebRTC native, toàn bộ Admin, một số nâng cấp cộng đồng/thế giới, test tự động E2E trên máy thật, build và ký ứng dụng chưa hoàn tất.
- **Bắt buộc kiểm thử Android/iOS thật**: HTTPS, native WebSocket bearer, PIN, bật/tắt push, chế độ nền, quyền micro, upload/preview/download, phân trang, cuộn tin và session revoke. Không coi CI bundle xanh là xác nhận mọi tính năng đã chạy tốt trên điện thoại.
- Không lưu mật khẩu/PIN/token ở log, không bỏ qua TLS hoặc để lộ khóa DB trong mã app.
