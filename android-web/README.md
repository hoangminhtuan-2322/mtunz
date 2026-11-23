# mtunz cho Android

Ứng dụng `com.mtunz.web` mở mtunz qua Trusted Web Activity của trình duyệt Android. Trang, tài khoản, dữ liệu và WebSocket đều dùng trực tiếp `https://mtunz.onrender.com/`. Đây là mã nguồn riêng với ứng dụng Expo trong `mobile/`. Cài được song song, và nhà phát hành có thể cập nhật giao diện web ngay trên máy chủ.

## Build

Cần JDK 17, Gradle 8.13, Android SDK Platform 36 và Build Tools 36.0.0.

```sh
gradle -p android-web :app:assembleRelease
```

APK unsigned nằm tại `android-web/app/build/outputs/apk/release/app-release-unsigned.apk`. Dùng `zipalign` và `apksigner` với khóa phát hành riêng. SHA‑256 của chứng chỉ APK phải khớp fingerprint công khai trong `static/android-assetlinks.json`, do máy chủ trả về ở `/.well-known/assetlinks.json`. Giữ cùng khóa và tăng `versionCode` cho các bản cập nhật APK sau này.

Android dùng quyền thông báo của ứng dụng và Web Push của trình duyệt. Sau khi cài, mở **Thông báo → Thông báo trên thiết bị** trong mtunz để bật và gửi thử. Dùng Chrome Android đã cập nhật để máy hỗ trợ đầy đủ Trusted Web Activity.
