# mtunz Mobile — ứng dụng nhắn tin native (bản thử nghiệm)

Dự án Expo / React Native dùng **chính FastAPI + PostgreSQL hiện tại**. Không nhân bản dữ liệu, không dùng WebView. Đây là bản đầu cho Android và iOS.

## Chạy

Máy phát triển cần Node.js >= 22.13. Từ thư mục gốc của repo:

    cd mobile
    cp .env.example .env
    npm install
    npx expo install --fix
    npx expo start

Trên Windows, sao chép .env.example thành .env thủ công. Đặt EXPO_PUBLIC_API_URL thành URL HTTPS thật của backend mtunz mà bạn đang dùng, **không kèm dấu /**. Expo Go có thể dùng cho thử nghiệm; cần kiểm tra WebSocket header Authorization trên thiết bị thật. Trước khi build APK/AAB hay iOS, chạy:

    npx expo-doctor
    npx eas-cli build --platform android --profile preview

Thiết lập hồ sơ EAS phù hợp, bundle ID/package name và signing credentials trước khi phát hành. APK/IPA chưa được build trong PR này.

## Đã tích hợp ở bản đầu

- Đăng nhập thành viên: tên tài khoản/số điện thoại + mật khẩu + PIN, không hỗ trợ Admin trên mobile ở giai đoạn này.
- Server cấp phiên thu hồi được (bảng sessions đang có). Token opaque lưu trong OS SecureStore, không dùng AsyncStorage hoặc localStorage.
- Cùng API cho danh sách bạn bè, biệt danh, số chưa đọc, lịch sử tin nhắn, nhắn tin và đánh dấu đã xem.
- WebSocket sử dụng Authorization header, tự kết nối lại; làm mới dữ liệu khi app vào foreground.
- Hiển thị tin nhắn qua FlatList inverted để giảm giật lag, tải lịch sử phân trang, nonce cho thao tác gửi lại để tránh lặp tin.
- Thoát tài khoản thu hồi token trên server; phiên bị thu hồi ngoài app sẽ kết thúc khi nhận sự kiện hoặc gọi API tiếp theo.

## Giới hạn cần hoàn thiện trước khi phát hành

Chưa tích hợp đăng ký mới, chat nhóm, ảnh/video/tệp/ghi âm, thông báo đẩy khi app đóng, gọi thoại/video, biểu cảm và phần Admin. Những tính năng này vẫn hoạt động trên website. **WebSocket chỉ hoạt động khi app còn được hệ điều hành cho phép chạy; không thay thế push notifications.**

Môi trường production yêu cầu HTTPS; ứng dụng không chủ động bỏ qua xác minh chứng chỉ. Tài khoản Admin vẫn dùng website, nơi có kiểm soát PIN/phê duyệt riêng. Khuyến nghị kiểm thử thực tế Android/iOS, chế độ offline, thu hồi phiên và quy trình ký ứng dụng trước khi phân phối. API mobile mới chỉ bổ sung đăng nhập; toàn bộ thao tác chat vẫn do các API hiện có kiểm soát phân quyền.

## Bảo mật

Không in token, mật khẩu hay PIN ra log. Không nhúng DATABASE_URL hay khóa bí mật vào mã mobile. Chỉ cấu hình URL backend trong biến EXPO_PUBLIC_API_URL. Nếu Android/iOS đang sử dụng phiên không hợp lệ, xóa phiên cục bộ và đăng nhập lại.
