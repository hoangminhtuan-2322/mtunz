# mtunz Android — APK chính thức với khóa ký MỚI cố định

Ứng dụng Android gốc của chủ sở hữu là một **Trusted Web Activity (TWA)** trỏ về
`https://mtunz.onrender.com/`, dùng package `com.mtunz.web`. Website và APK
dùng cùng backend, tài khoản và WebSocket. APK **không phải** app native offline.

## Cam kết không thay logo

Luôn sử dụng nguyên file `android-web/app/src/main/res/drawable-nodpi/mtunz_icon.png`
của bản mtunz 1.0.0 do chủ sở hữu cung cấp. CI `verify_app_identity.py` khóa Git SHA
của PNG này và kiểm tra launcher icon. **Không thay, crop, vẽ lại, tạo ảnh khác hoặc đổi màu**.

## Tình trạng chữ ký (rất quan trọng)

Chủ sở hữu **không tìm được khóa ký cũ** và đã đồng ý tạo khóa **MỚI cố định**.

- Package: `com.mtunz.web` (không thay).
- Bản đầu tiên với khóa mới: `versionCode=2`, `versionName=1.0.1`.
- **SHA-256 certificate CŨ** của APK 1.0.0:
  `5D:DF:61:E2:71:82:93:40:CF:B4:17:85:D5:20:E9:C5:5A:18:51:E7:F3:7C:CC:F5:CB:1B:D2:64:48:D6:A4:5C`.
- **SHA-256 certificate MỚI cố định**:
  `80:6A:14:7A:41:42:20:3F:05:EA:D8:C5:76:3D:4C:D5:59:C4:D6:CC:B9:EC:FF:02:BA:72:8D:59:AA:1A:8F:7B`.
- Cấu hình khóa mới được chốt tại `android-web/release-signing.json`. Website Digital
  Asset Links vẫn khai báo **cả chứng chỉ cũ và mới** để không tự ý ngắt app cũ.

**Không thể cài đè APK ký bằng khóa mới lên mtunz 1.0.0 ký bằng khóa cũ.** Cài đè sẽ
lỗi `INSTALL_FAILED_UPDATE_INCOMPATIBLE`. Chỉ sau khi APK mới đã build/kiểm thử
xong, xác nhận dữ liệu/tin nhắn đã đồng bộ với server và sao lưu dữ liệu chỉ có trên máy,
người dùng mới chủ động gỡ 1.0.0 rồi cài 1.0.1. Gỡ bản cũ xóa dữ liệu cục bộ của app.
Các bản **1.0.2+** ký cùng **khóa MỚI này** sẽ cập nhật đè bản mới bình thường khi tăng
versionCode. **Không tạo khóa mới mỗi lần build.**

## Cách làm APK bằng GitHub Actions trên Windows (không cần Android Studio)

Chủ sở hữu nhận bộ khóa ký riêng `mtunz-android-NEW-FIXED-KEY-PRIVATE.zip` trong
cuộc trò chuyện, bên trong có:

- `mtunz-web-release-NEW-KEY.jks`: khóa ký bản phát hành **phải giữ suốt vòng đời app**.
- `mtunz-release-credentials-KEEP-PRIVATE.json`: alias và mật khẩu (rất nhạy cảm).
- `setup-mtunz-github.ps1`: cấu hình GitHub Secrets, sau đó tùy chọn bắt đầu build.
- `README-VI-IMPORTANT.txt`: hướng dẫn riêng cho người dùng Windows.

**KHÔNG** commit file .jks, ZIP hoặc mật khẩu lên GitHub. **KHÔNG** gửi lại vào chat.
Sao lưu bộ khóa ở ít nhất hai nơi riêng tư và tin cậy.

### Cách nhanh

1. Tải **bộ khóa ZIP riêng tư** và giải nén vào thư mục riêng trên PC Windows.
2. Cài GitHub CLI nếu chưa có: `winget install --id GitHub.cli -e`.
3. Mở PowerShell trong thư mục vừa giải nén và chạy
   `powershell -ExecutionPolicy Bypass -File .\setup-mtunz-github.ps1`.
4. Script có thể yêu cầu `gh auth login` để đăng nhập tài khoản có quyền quản trị
   GitHub repo `hoangminhtuan-2322/mtunz`. Sau đó script tải khóa lên **4 GitHub
   Actions repository secrets**, *không commit vào mã nguồn*:
   `MTUNZ_ANDROID_WEB_KEYSTORE_BASE64`,
   `MTUNZ_ANDROID_WEB_KEYSTORE_PASSWORD`,
   `MTUNZ_ANDROID_WEB_KEY_ALIAS`,
   `MTUNZ_ANDROID_WEB_KEY_PASSWORD`.
5. Nhập `Y` nếu muốn script khởi chạy build; hoặc tự mở
   [Actions → Build mtunz Android (web-synced TWA)](https://github.com/hoangminhtuan-2322/mtunz/actions/workflows/android-web-apk.yml)
   → `Run workflow` → chọn `main` → bật **sign_release = true** → `Run workflow`.
6. Đợi Actions báo **Success**. Ở cuối workflow, tải artifact
   `mtunz-web-android-RELEASE-new-fixed-key`, giải nén để lấy
   **`mtunz-web-release.apk`**. Đây là APK phát hành ký cố định, **không phải**
   `mtunz-web-android-PREVIEW-debug-signed`.
7. Trước khi gỡ ứng dụng cũ, kiểm tra APK mới tồn tại, chứng chỉ đã đúng,
   tính năng đăng nhập/chat/file/thông báo trên điện thoại kiểm thử không chứa
   bản 1.0.0. Sau đó chủ máy mới tự quyết định sao lưu/gỡ app cũ để cài bản mới.

### Cơ chế bảo vệ tự động

- Workflow build **chỉ ký phát hành khi người dùng chủ động chạy thủ công
  và bật `sign_release=true`**; push/PR chỉ build APK thử nghiệm.
- Thiếu secrets → từ chối ký release.
- Sai SHA-256 chứng chỉ mới → từ chối ký release.
- Logo thay đổi hoặc package `com.mtunz.web` đổi → CI thất bại.
- Build APK debug và kiểm tra cài/mở trên Android giả lập, rồi mới ký APK release.
- `verify_release_artifact.py` kiểm tra chứng chỉ, package, phiên bản của signed APK.
- Không tạo hoặc upload AAB/Google Play ở giai đoạn **chỉ làm APK** này.

## Kiểm tra Android thật và trường hợp có bản cũ

Cần Internet, Chrome Android tương thích TWA, backend web hoạt động. Nên dùng
điện thoại kiểm thử khác hoặc emulator trước. Script `android-web/tools/device_upgrade_smoke.py`
là công cụ ADB để **từ chối cố cài đè bản 1.0.0**, không tự gỡ app hoặc xóa dữ liệu.

Chạy sau khi có APK ký khóa mới:

```powershell
python android-web/tools/device_upgrade_smoke.py --apk "C:\duong-dan\mtunz-web-release.apk"
```

Script chỉ cài khi không có app cũ, hoặc để Android tự xác minh chữ ký nếu đã có
một phiên bản khác; nếu thấy mtunz 1.0.0 sẽ dừng trước khi đụng tới điện thoại.

**Kiểm thử thủ công cần xác nhận**: mở app, logo và giao diện; đăng nhập; nhắn tin
web ↔ APK realtime; tải/gửi ảnh/video/tệp; thông báo khi vào nền, khóa màn hình
và vuốt đóng; chức năng Admin; Wi‑Fi/4G, kết nối yếu; dữ liệu tài khoản trên web.
Build CI không chứng minh thông báo khi app bị đóng hoạt động trên mọi dòng máy.

## Play Protect

APK tải ngoài Google Play vẫn có thể bị cảnh báo. Khóa ký cố định và xác thực
Digital Asset Links **không đảm bảo** hết cảnh báo Play Protect. Không hướng dẫn
tắt Play Protect để cài. Hiện **chỉ làm APK**, chưa phát hành Google Play.

## Build APK thủ công (dành cho kỹ thuật)

Cần JDK 17, Android SDK 36, Build Tools 36.0.0 và Gradle 8.13:

```bash
python android-web/tools/verify_app_identity.py
gradle -p android-web :app:assembleDebug :app:assembleRelease
```

`app-release-unsigned.apk` **không cài trực tiếp được**. Phải ký bằng đúng keystore
MỚI cố định theo GitHub Actions, kiểm tra bằng `apksigner`, và tuyệt đối không
commit tệp khóa, mật khẩu hoặc file cấu hình chứa bí mật lên repo.
