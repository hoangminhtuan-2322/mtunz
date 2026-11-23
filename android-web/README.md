# mtunz Android — ứng dụng dùng trực tiếp website (Trusted Web Activity)

Dự án `android-web/` là **APK dùng chính website** `https://mtunz.onrender.com/`: cùng giao diện, tài khoản, dữ liệu và WebSocket với trình duyệt web. Nó độc lập với dự án React Native/Expo trong `mobile/` (package `com.mtunz.mobile`); package của bản web là `com.mtunz.web`.

## Tải bản APK thử nghiệm

Mở GitHub → **Actions** → **Build mtunz Android (web-synced TWA)** → chọn một lần chạy thành công → **Artifacts** → `mtunz-web-android-PREVIEW-debug-signed`. Giải nén ZIP và cài file `app-debug.apk`.

**Bản này chỉ dành cho kiểm thử:** mỗi máy CI có thể dùng một debug key khác, nên không bảo đảm cập nhật đè lên APK preview cũ. Nếu gặp `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, gỡ **riêng** app `com.mtunz.web` cũ trước khi cài preview mới (xóa dữ liệu app cũ). Không nhầm với bản native `com.mtunz.mobile`. Bản preview cũng có thể chỉ mở Chrome Custom Tab kèm thanh URL vì chứng chỉ debug chưa được xác minh qua Digital Asset Links; nó không đại diện cho bản TWA phát hành.

Trên điện thoại cần kết nối Internet và trình duyệt Android hỗ trợ Trusted Web Activity (nên cập nhật Chrome). Website/backend phải hoạt động; tính năng trực tuyến không có khi máy chủ offline. Thông báo nền còn phụ thuộc quyền thông báo của trình duyệt/hệ điều hành và cấu hình Web Push phía server.

## Quy trình bản phát hành có chữ ký cố định

Không bao giờ commit keystore hoặc mật khẩu vào repo công khai. **Giữ một keystore cố định, sao lưu ngoại tuyến** để các bản cập nhật có cùng chữ ký. Nhà phát hành tạo keystore riêng trên máy tin cậy, ví dụ:

```bash
keytool -genkeypair -keystore mtunz-web-release.jks -alias mtunz_web \
  -keyalg RSA -keysize 3072 -validity 10000
keytool -list -v -keystore mtunz-web-release.jks -alias mtunz_web
```

Lấy SHA-256 certificate fingerprint do `keytool -list -v` in ra, thêm vào đúng entry `com.mtunz.web` của `static/android-assetlinks.json`, commit và **triển khai phiên bản này lên Render**. Kiểm tra `https://mtunz.onrender.com/.well-known/assetlinks.json` trả JSON chứa fingerprint vừa thêm. Khi phát hành trên Google Play với Play App Signing, cần thêm **Play app signing certificate SHA-256** (có thể khác upload key) vào cùng danh sách.

Trong **GitHub → Settings → Secrets and variables → Actions**, tạo bốn repository secrets:

- `MTUNZ_ANDROID_WEB_KEYSTORE_BASE64`: toàn bộ bytes của keystore được mã hóa base64 (không thêm ký tự khác).
- `MTUNZ_ANDROID_WEB_KEYSTORE_PASSWORD`: mật khẩu keystore.
- `MTUNZ_ANDROID_WEB_KEY_ALIAS`: alias của khóa.
- `MTUNZ_ANDROID_WEB_KEY_PASSWORD`: mật khẩu của khóa.

Workflow `.github/workflows/android-web-apk.yml` sẽ build, kiểm tra manifest, cài/chạy thử trên emulator và, nếu **đủ cả bốn secrets**, chỉ tạo `mtunz-web-android-RELEASE-stable-signing` khi SHA-256 chứng chỉ trùng với fingerprint trong assetlinks. Sau khi giải nén artifact, APK phát hành là `mtunz-web-release.apk`. Nếu không có secrets, chỉ có APK thử nghiệm; thiếu một phần secrets sẽ làm workflow thất bại để tránh tạo bản phát hành ký sai.

## Google Play Protect và cách phân phối

**Đổi chữ ký hoặc dùng TWA không bảo đảm Google Play Protect hết cảnh báo.** APK cài từ trang web/GitHub vẫn là tải ngoài Google Play và có thể bị cảnh báo hoặc quét. Để mang lại trải nghiệm cài đặt chính thống và giảm cảnh báo nguồn không xác định, đăng ký tài khoản Google Play Console, hoàn tất xác minh nhà phát triển, thiết lập Play App Signing rồi phát hành qua **Google Play Internal testing** trước khi phát hành công khai. Tuyệt đối không yêu cầu người dùng tắt Play Protect.

Bản Android TWA hiện là lối tắt đồng bộ giao diện với website, không phải ứng dụng native hoàn toàn offline. Luồng thông báo, camera, file, đăng nhập/Admin và các thao tác trên máy thật cần kiểm tra trước khi công bố đạt 100%.

## Build thủ công

Cần JDK 17, Gradle 8.13, Android SDK Platform 36 và Build Tools 36.0.0.

```bash
gradle -p android-web :app:assembleDebug
gradle -p android-web :app:assembleRelease
```

APK debug có thể cài ở `android-web/app/build/outputs/apk/debug/app-debug.apk`; APK release tại `android-web/app/build/outputs/apk/release/app-release-unsigned.apk` **chưa được ký, không thể phát hành trực tiếp**. Dùng `zipalign` và `apksigner` với khóa phát hành như trong workflow. Không đăng tải khóa bí mật, tệp `.jks`, mật khẩu hay cấu hình người dùng vào repo.
