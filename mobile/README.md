# mtunz Android NATIVE 1.1.0 — giao diện React Native, đồng bộ realtime với web

Ứng dụng **React Native + Expo SDK 58**, dùng **cùng FastAPI, PostgreSQL/SQLite, tài khoản và lịch sử chat** với website. Không dùng WebView hoặc database chat riêng. Bản APK native dùng package `com.mtunz.web` (giống TWA 1.0.1), versionCode **3**, versionName **1.1.0**, icon gốc không thay đổi.

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

Cần tài khoản Expo EAS, cấu hình projectId và khóa ký, tài khoản phân phối (nếu phát hành App Store/Play Store). Để Android nhận push khi đóng app, tạo ứng dụng Android `com.mtunz.web` trong Firebase và đăng ký thông tin xác thực FCM v1 trong EAS cùng dự án Expo. Với workflow GitHub, lưu nội dung `google-services.json` vào secret `MTUNZ_ANDROID_GOOGLE_SERVICES` và UUID dự án vào biến `EXPO_PROJECT_ID`. Với EAS, cung cấp đường dẫn file bằng `GOOGLE_SERVICES_FILE` và liên kết UUID bằng `EXPO_PROJECT_ID` hoặc cấu hình dự án Expo. iOS dùng APNs. Nếu bật bảo mật nâng cao cho Expo Push, đặt `EXPO_ACCESS_TOKEN` trong môi trường máy chủ Render.

Trong app, vào **Trang cá nhân → Thông báo** hoặc **Admin → Tổng quan → Thông báo quản trị** để bật, gửi thử hoặc tắt trên từng thiết bị. Âm thanh dùng kênh Thông báo mtunz trong cài đặt hệ điều hành.

    cd mobile
    npx eas-cli login
    npx eas-cli init
    npx eas-cli build --platform android --profile preview
    npx eas-cli build --platform ios --profile preview

Profile preview xuất Android APK để thử nội bộ sau khi có signing; production dùng gói phù hợp nhà phát hành. Thư mục Git chỉ chứa mã nguồn; file APK đã ký được tạo dưới dạng GitHub Actions artifact, không commit vào repo. Trên Android SDK53+, Expo Go không hỗ trợ remote push; hãy dùng development build hoặc app đã ký để test.

## Giới hạn và an toàn trước khi phát hành

- WebSocket chỉ hoạt động khi OS cho phép chạy; khi đóng app cần push. Thông báo đẩy không đảm bảo giao đúng tuyệt đối mọi lúc.
- Render Free có thể tự ngủ, gây mất realtime hoặc chậm tin. Với mục tiêu đồng bộ liên tục, cần backend always-on và giám sát hạ tầng, xử lý reconnect, delivery/retry, kiến trúc pub/sub khi chạy nhiều worker.
- Backend hiện có giới hạn tệp 2 MB trên Render Free và khoảng 25 MB mỗi người dùng; app tuân theo. Chưa hỗ trợ mã hóa đầu cuối E2EE.
- Chưa thể khẳng định ngang bằng 100% với web: gọi thoại/video WebRTC native, toàn bộ Admin, một số nâng cấp cộng đồng/thế giới, test tự động E2E trên máy thật, build và ký ứng dụng chưa hoàn tất.
- **Bắt buộc kiểm thử Android/iOS thật**: HTTPS, native WebSocket bearer, PIN, bật/tắt push, chế độ nền, quyền micro, upload/preview/download, phân trang, cuộn tin và session revoke. Không coi CI bundle xanh là xác nhận mọi tính năng đã chạy tốt trên điện thoại.
- Không lưu mật khẩu/PIN/token ở log, không bỏ qua TLS hoặc để lộ khóa DB trong mã app.


## APK native thật (không WebView/TWA/Custom Tabs)

APK từ `mobile/` là ứng dụng React Native tự dựng giao diện đăng nhập, hội thoại, trình soạn tin, ảnh/file, nhóm, chat thế giới và quản trị cơ bản. Nó đóng gói `assets/index.android.bundle` trong file APK để chạy giao diện JavaScript trên React Native. **Không mở trang mtunz.onrender.com trong trình duyệt** để hiển thị màn chat.

Ứng dụng vẫn dùng `https://mtunz.onrender.com` làm **API + WebSocket backend**; đây là đồng bộ dữ liệu thực sự với website chứ không phải mở trang web. Tin nhắn và tài khoản vẫn nằm trên máy chủ.

### Giữ nguyên logo và cập nhật trực tiếp bản APK 1.0.1

- Package: `com.mtunz.web`. Native 1.1.0 tăng versionCode từ 2 lên **3**.
- Asset `mobile/assets/icon.png` có Git blob SHA **282a6971e38d51ce570b094e07d5624663bbedbb**, chính xác bằng file logo `android-web/app/src/main/res/drawable-nodpi/mtunz_icon.png` của APK trước.
- Sử dụng **cùng 4 GitHub Actions secrets** của khóa ký cố định đã dùng cho APK 1.0.1:
  `MTUNZ_ANDROID_WEB_KEYSTORE_BASE64`,
  `MTUNZ_ANDROID_WEB_KEYSTORE_PASSWORD`,
  `MTUNZ_ANDROID_WEB_KEY_ALIAS`, `MTUNZ_ANDROID_WEB_KEY_PASSWORD`.
- Không tạo khóa mới, không đổi `applicationId`. Bản Native **phải được ký đúng cùng chứng chỉ** SHA-256
  `80:6A:14:7A:41:42:20:3F:05:EA:D8:C5:76:3D:4C:D5:59:C4:D6:CC:B9:EC:FF:02:BA:72:8D:59:AA:1A:8F:7B`.
- Android cho phép cài cập nhật từ 1.0.1 lên 1.1.0 khi **cùng package và chứng chỉ**, versionCode tăng. Không đảm bảo dữ liệu web cũ chuyển tự động vào SecureStore: vì kiến trúc TWA/Chrome khác native, người dùng **đăng nhập lại** bằng tài khoản web đã có; tin nhắn lưu trên backend vẫn dùng chung.

### Cách build APK Native bản đã ký trên GitHub

Mở [Actions → Build mtunz TRUE Native Android APK](https://github.com/hoangminhtuan-2322/mtunz/actions/workflows/android-apk.yml), chọn `main`, nhấn `Run workflow`, bật **sign_release** rồi chạy. Đợi tất cả bước xanh, tải artifact **`mtunz-NATIVE-1.1.0-RELEASE-fixed-key`**, giải nén lấy `app-release.apk`. File này là ứng dụng **React Native**, không phải APK TWA.

Workflow `push`/PR tạo artifact **`mtunz-NATIVE-SIDEBYSIDE-PREVIEW-debug`** cho ứng dụng **mtunz Preview**, package `com.mtunz.web.preview`, dùng khóa debug. Preview này cài **song song** với bản đang có (`com.mtunz.web`) mà không yêu cầu gỡ bản cũ. Preview không dùng Firebase production nên **không có thông báo nền**. Khi thử, đăng nhập cùng tài khoản với website. Bản này chỉ để kiểm thử, không thể cài đè bản chính thức. APK release được kiểm tra có JS bundle nội bộ, đúng package/version, chữ ký gốc mới, cài/mở trên giả lập, và tiến trình Android vẫn đang chạy.

### Những chức năng chưa thể cam kết khi chỉ có APK

- **Thông báo khi đóng app:** Expo Push cần Expo EAS projectId và Firebase FCM v1 cho **`com.mtunz.web`**; cần `MTUNZ_ANDROID_GOOGLE_SERVICES` chứa `google-services.json` cho package này cùng biến `EXPO_PROJECT_ID`, và credential FCM v1 trong EAS. Nếu chưa cấu hình, chức năng thông báo nền chưa sẵn sàng. Từ bản nâng cấp này, workflow **từ chối ký bản RELEASE chính thức** khi thiếu cả hai thông tin cấu hình để tránh phân phối APK có nút bật thông báo nhưng không thể nhận thông báo lúc đóng app. Preview debug vẫn có thể build và ghi cảnh báo rõ ràng. Dù CI kiểm tra hai thông tin cấu hình, vẫn phải gửi thông báo thử trên điện thoại thật để xác nhận FCM v1 hoạt động.
- Một số màn quản trị nâng cao, cuộc gọi thoại/video và một số chức năng chat thế giới chưa có mức tương đương 100% website. Không giả vờ là đã đạt full tính năng.
- Realtime WebSocket được duy trì khi ứng dụng đang mở/foreground. Khi hệ điều hành đóng/treo ứng dụng, chỉ push đã cấu hình mới có thể thông báo, không thể hứa kết nối WebSocket mãi.
- Chưa kiểm thử toàn diện trên **điện thoại thật**. Trước khi đưa bản native cho nhiều người cài, cần thử xác thực + PIN, chat 2 thiết bị, gửi và lưu tệp, realtime, thông báo khi app nền, quyền Admin và kết nối yếu.

APK tải ngoài Google Play vẫn có thể kích hoạt thông báo Google Play Protect. Điều này **không thể khắc phục bằng thay logo hay đổi WebView thành native**; cần phân phối qua Google Play hoặc cho người dùng quét ứng dụng theo thông báo hệ thống.

### Firebase + Expo Push bắt buộc trước bản phát hành ký chính thức

1. Kết nối đúng dự án Firebase của chủ sở hữu, tạo/kiểm tra Android app `com.mtunz.web` và lấy **google-services.json**.
2. Kết nối hoặc tạo Expo EAS project cùng ứng dụng, lấy UUID `EXPO_PROJECT_ID`; trong Expo → Project settings → Credentials → Android → `com.mtunz.web` → **FCM v1 service account key**, tải khóa dịch vụ Firebase riêng lên Expo. KHÔNG commit khóa dịch vụ lên repo.
3. Trong GitHub Actions đặt **secret** `MTUNZ_ANDROID_GOOGLE_SERVICES` = nội dung `google-services.json` và **variable** `EXPO_PROJECT_ID` = UUID Expo EAS. Sau khi xác nhận FCM v1 đã liên kết chính xác, đặt **variable** `EXPO_FCM_V1_READY=true`. Biến này không thay thế việc upload khóa FCM.
4. Trên Render, chỉ cấu hình `EXPO_ACCESS_TOKEN` nếu đã bật bảo mật tăng cường cho Expo Push trên expo.dev; tuyệt đối không lưu khóa FCM v1 private vào mã nguồn hay biến client.
5. Chạy `Build mtunz TRUE Native Android APK` → branch `main` → `sign_release=true`; workflow kiểm tra Project ID, Firebase project number/app ID/API key, package và xác nhận FCM v1 trước khi ký cố định.
6. Cài release lên điện thoại Android thật, đăng nhập và bật thông báo trong app, gửi thử; kiểm tra **tin nhắn DM/nhóm, phản hồi hỗ trợ, đăng ký/hỗ trợ admin** khi ứng dụng đóng. HTTP 200 của Expo chỉ là chấp nhận yêu cầu, không khẳng định thông báo đã đến.

Không dùng Preview `com.mtunz.web.preview` để thử FCM production; Preview không có Firebase credentials. Chỉ khi đã xác minh push thực tế và chứng chỉ ký bản 1.0.1 mới phát hành rộng.
