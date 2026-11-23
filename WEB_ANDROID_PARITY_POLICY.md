# Quy tắc đồng bộ tính năng: mtunz Web ↔ Android

Đây là **điều kiện phát triển bắt buộc** cho những thay đổi sau này. Web và Android dùng chung backend, tài khoản, tin nhắn và API, nhưng có **hai lớp giao diện độc lập** (Web JavaScript và Android React Native). Vì thế **không tự động có 100% tính năng chỉ nhờ dùng chung dữ liệu**.

## Nguyên tắc

1. **Một tính năng, hai giao diện.** Khi thêm/chỉnh tính năng ảnh hưởng người dùng (nhắn tin, đăng ký, hồ sơ, nhóm, chat thế giới, thông báo, hỗ trợ, Admin…), phải cập nhật cách sử dụng trên cả `static/` và `mobile/` trong **cùng pull request**; thêm hoặc cập nhật các bài test ở `tests/native_*.cjs` hoặc `tests/test_native_mobile.py`.
2. **Cùng backend, cùng quyền và cùng sự kiện.** Web và app phải sử dụng cùng API, nguồn dữ liệu và quy tắc phân quyền; cập nhật WebSocket, trạng thái đọc, offline/reconnect đồng bộ. Không tạo database chat riêng cho app.
3. **Không đưa ra production tính năng web mới trước khi native có phương án tương ứng.** Nếu app không hỗ trợ một tính năng, giữ nó ẩn/không kích hoạt theo năng lực phiên bản, hoặc hoãn phát hành; không quảng bá là đã hoàn chỉnh.
4. **Không phát hành APK trùng versionCode với APK đã phát hành.** Mỗi lần thay đổi mã Android chuẩn bị phát hành phải tăng `mobile/app.json` versionCode và versionName phù hợp. CI đối chiếu tên artifact, package, versionCode và chứng chỉ với workflow ký.
5. **APK phải cập nhật bằng đúng khóa.** Package `com.mtunz.web`, ký bằng chứng chỉ cố định; build debug/Preview không được giới thiệu như bản cập nhật production.
6. **Kiểm thử hai phía.** CI cho web, Android bundle, PostgreSQL và kiểm tra parity phải thành công. Kiểm thử thiết bị thật cần thực hiện trước phân phối rộng (đăng nhập/PIN, chat realtime, Admin, ảnh/file, thông báo khi đóng app, mạng yếu, nâng cấp bản cũ).
7. **Khả năng tương thích.** Không phá API đang dùng bởi APK đã cài mà chưa có lộ trình thay thế. Nếu cần thay đổi không tương thích, phải giữ API cũ theo giai đoạn hoặc khóa tính năng mới trên web cho tới khi app được cập nhật.
8. **Phân biệt trạng thái code và trạng thái phát hành.** GitHub `main`, Render Live, APK đã ký và phiên bản người dùng cài có thể khác nhau. Chỉ thông báo đồng bộ “100%” sau khi xác minh đúng phiên bản đã triển khai và thử cả hai giao diện.

## Kiểm tra tự động

Workflow `.github/workflows/web-android-parity.yml` chạy cho mọi PR vào `main` và mọi commit `main`. `tests/web_android_parity_gate.cjs` kiểm tra:

- Các API/hành vi chung quan trọng phải có ở cả mã web và React Native.
- Nếu PR đổi JavaScript/HTML/CSS web hoặc thêm route API mới, phải kèm thay đổi màn native **và** kiểm thử native.
- Nếu thay đổi mã Android, phải tăng versionCode so với `main`.
- Ngoại lệ có lý do rõ ràng trong phần mô tả PR (ví dụ sửa màu web không ảnh hưởng hành vi; hoặc nhiều sửa nhỏ được gom vào một bản Android).

**Ngoại lệ hợp lệ khi không cần sửa app** (mô tả PR, ít nhất 25 ký tự):

```text
Parity-Impact: none
Parity-Reason: Chỉ thay đổi hình thức web; không đổi chức năng, API hay hành vi Android.
```

**Trường hợp có sửa mã app nhưng gom vào bản APK sau**:

```text
Release-Plan: batched
Release-Reason: Các thay đổi native này được gom và sẽ phát hành trong bản APK đã ký kế tiếp.
```

Ngoại lệ phải được người rà soát xác nhận; **không dùng để che giấu tính năng chưa hỗ trợ trên app**. Để CI thật sự chặn merge khi fail, cấu hình GitHub Branch Protection/Rulesets và yêu cầu status `web-android-parity` phải thành công trước merge (cần quyền quản trị repo).

## Các tính năng hiện tại

| Nhóm | Nguồn dữ liệu/API chung | Kiểm thử native | Lưu ý |
| --- | --- | --- | --- |
| Đăng nhập, PIN, session | FastAPI, session có thể thu hồi | `test_native_mobile.py`, `native_session_recovery.cjs` | Bảo vệ Admin trên cả hai nền tảng |
| Chat riêng, nhóm, ảnh/file | FastAPI, PostgreSQL, WebSocket | `native_realtime_stability.cjs`, `native_world_typing_parity.cjs` | Phải kiểm tra lại upload, read receipt, reconnect trên máy thật |
| Chat thế giới, ẩn danh, đang gõ | API/world events | `native_world_typing_parity.cjs` | Kiểm tra giao diện nhỏ và dữ liệu có độ trễ |
| Hỗ trợ và thao tác quản trị | API hỗ trợ/Admin | `native_admin_parity.cjs`, `test_native_mobile.py` | Chưa khẳng định toàn bộ Admin tương đương web |
| Thông báo khi đóng ứng dụng | Expo Push + FCM v1 | `native_push_release.cjs`, `test_native_mobile.py` | **Chưa có Firebase/Expo credentials production**, không coi là đã hoàn tất |
| Gọi thoại/video | WebRTC web | Chưa có test ngang bằng native | **Chưa đạt parity 100%** |

## Quy trình phát hành chuẩn

PR tính năng → kiểm tra parity + test web + test native → merge `main` → deploy Render và xác nhận `/health` đúng commit → build APK ký cố định với versionCode mới → kiểm tra chữ ký/package/JS bundle → thử trên thiết bị Android thật → công bố bản phát hành và ghi lại phiên bản web/API/Android đã thử.

**Giới hạn khách quan:** Dù CI xanh, không thể ép điện thoại tự cập nhật APK tải ngoài Play Store. Cần người dùng cài bản mới hoặc có hệ thống phân phối/cập nhật hợp lệ. Vì vậy, tính năng backend phải duy trì tương thích với app cũ trong khoảng thời gian chuyển đổi.
