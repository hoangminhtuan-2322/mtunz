# mtunz — Quy trình phát hành an toàn (V10)

## Mục tiêu

Không xóa người dùng, tin nhắn, log hoặc chỉnh CSDL Neon trên môi trường
production trong quá trình sửa UI, tối ưu hoặc kiểm thử. Mọi nâng cấp đều
được thực hiện trên nhánh riêng, có kiểm thử và có cách quay lại bản trước.

## 1. Thứ tự PR

1. PR #18 — nền tảng hộp thư/Admin/PostgreSQL → \`main\` sau khi review.
2. PR #19 — World Chat V9/Profile mobile/PIN-only/URL → \`main\`
   **sau #18** và sau khi kiểm thử lại trên base mới.
3. PR #20 (V10) — cache/CSS bundle/pool/bảo trì/kiểm thử → \`main\`
   **sau #19** và sau khi kiểm thử lại trên base mới.

Không gộp đồng thời hoặc bỏ qua thứ tự. Chỉ sau khi người vận hành
xác minh backup Neon thích hợp và mọi check xanh mới deploy. Không
chạy migrate, reset dữ liệu hoặc script backup dưới đặc quyền production
qua GitHub Actions.

## 2. Backup Neon: luôn dùng đường kết nối trực tiếp

Neon cung cấp hai URL: ứng dụng dùng URL *pooled* có thể kết thúc bằng
\`-pooler\`, nhưng \`pg_dump\` / \`pg_restore\` phải dùng URL **direct**
không có \`-pooler\`. Xác minh đúng **project**, **branch** và **database**
đang được Render dùng trước khi lấy backup. Tài khoản có nhiều dự án
\`mtunz*\`, tuyệt đối không tự giả định tên nào là production.

Cài PostgreSQL client tương thích phiên bản database, sau đó đặt URL vào
\`BACKUP_DATABASE_URL\` trên máy cá nhân qua trình quản lý bí mật phù hợp
(không in URL ra chat, GitHub hoặc log; không lưu vào lịch sử dòng lệnh).

\`\`\`bash
python scripts/backup_neon.py --output-dir ~/mtunz-backups
\`\`\`

Script thực hiện \`pg_dump -Fc\` không ghi dữ liệu vào Neon, dùng các biến
\`PG*\` để tránh lộ mật khẩu trong tham số command, kiểm tra mục lục
\`pg_restore --list\`, tính SHA256, lưu archive/manifest bên **ngoài Git**
với quyền filesystem hạn chế. Nếu thất bại sẽ xóa bản tạm; không bao giờ
tự chạy restore vào production.

Bảo quản backup **mã hóa** ở một vị trí khác máy chủ. Không đưa file dump
lên GitHub repository, PR, Actions artifacts, Render logs hay thư mục
\`static/\`. Dùng tính năng khôi phục theo lịch sử/branch của Neon nếu gói
đang dùng hỗ trợ; **một branch Neon không thay thế bản backup độc lập**.

## 3. Thử khôi phục, chỉ trên DB rỗng tách biệt

Trước khi merge, chuẩn bị một cơ sở dữ liệu PostgreSQL **mới, rỗng** có
tên rõ ràng như \`mtunz_restore_test\`, tách khỏi database production.
Không dùng URL production trong \`PG*\` khi khôi phục.

\`\`\`bash
# Trên một PostgreSQL DEV/TEST instance, không phải Neon production:
createdb mtunz_restore_test
pg_restore --exit-on-error --no-owner --no-acl \
  --dbname mtunz_restore_test ~/mtunz-backups/<ten-archive>.dump

# Kiểm tra các bảng thiết yếu trong DB thử nghiệm:
psql --dbname mtunz_restore_test \
  -c 'SELECT COUNT(*) FROM users;'
psql --dbname mtunz_restore_test \
  -c 'SELECT COUNT(*) FROM world_messages;'
\`\`\`

Lưu ý dữ liệu backup có thông tin người dùng: bảo vệ môi trường thử,
không đăng nhập hay gửi thông báo từ bản clone, và xóa bản clone khi
không còn cần thiết.

## 4. CI / deploy

- Test Python, quyền Admin/PIN, luồng chat, PostgreSQL 16 và kết quả audit.
- Kiểm thử WebKit (engine Safari) và Chromium trên màn hình 320–1440px.
  Đây là **giả lập trình duyệt**, không phải thử trên iPhone thật.
- Render build gộp CSS từ các file nguồn, không xóa file nào.
  Tên bundle có SHA nội dung; Javascript và route/API giữ thứ tự cũ.
- Render autoDeployTrigger=\`checksPass\`. Không cài job "chờ Render"
  thành required check trên cùng commit trước deploy vì gây deadlock.
- Workflow \`release-gate.yml\` chạy thủ công **sau deploy** hoặc mỗi
  sáu giờ theo lịch. Đây là kiểm tra chỉ đọc: /health, /terms, /privacy,
  HTML shell và commit SHA. Nếu commit không khớp main, điều tra drift
  và giữ nguyên dịch vụ — không tự rollback/xóa dữ liệu.
- Nếu deploy có vấn đề: rollback code bằng Render/GitHub tới commit đã
  kiểm chứng. **Không tự rollback schema/dữ liệu.** Xác nhận tính tương
  thích ngược với dữ liệu mới trước khi rollback.

## 5. Hiệu năng và giới hạn

- CSS được gộp lúc build theo đúng thứ tự gốc, từ 40 HTTP requests còn
  1 CSS request. Cache public tối đa 600 giây chỉ trên \`/static/\`.
  Trang HTML, API, file người dùng vẫn \`no-store\`.
- Reuse một pool PostgreSQL có số kết nối giới hạn (mặc định 3, tối đa
  6), với \`prepare_threshold=None\` cho Neon pooled endpoint.
  Có thể đặt \`PG_POOL_SIZE=1\` nếu Neon compute quá nhỏ.
- Pool chỉ giảm chi phí bắt tay/kết nối và không biến các truy vấn sync
  trong async endpoints thành non-blocking. Nếu cần mở rộng, đo p95/p99,
  số kết nối, CPU và chuyển dần các đường nóng sang async DB theo PR riêng.
- Render Free + một worker vẫn có thể cold start/mất kết nối WebSocket.
  Không được khẳng định zero-downtime khi dùng gói này.
- TURN, E2EE, kiểm tra virus toàn diện, bảo vệ bot/DDoS tập trung và
  TOTP/passkey đòi hỏi dịch vụ hạ tầng hoặc thiết kế bổ sung, chưa thể
  đánh dấu là đã triển khai chỉ dựa vào các thay đổi V10.

## 6. Checklist phát hành

- [ ] Đã xác minh đúng dịch vụ Render và Neon database production
- [ ] Đã có backup mới (direct connection) và manifest SHA256
- [ ] Đã thử restore trên DB riêng; không mất bảng hoặc tệp đính kèm
- [ ] PR #18 → #19 → #20 review và CI xanh trên đúng base mới
- [ ] Không thay đổi quyền riêng tư hoặc dữ liệu mà không được cho phép
- [ ] Sau deploy, chạy Verify deployed mtunz release bằng workflow_dispatch
- [ ] Kiểm tra Chat thế giới, Profile mobile, Enter và PIN bằng tài khoản test
- [ ] Thử thêm iPhone Safari và Android Chrome thật nếu có thiết bị
