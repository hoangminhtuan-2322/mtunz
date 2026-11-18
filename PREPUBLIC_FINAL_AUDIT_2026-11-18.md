# mtunz — Rà soát phát hành lần cuối (18/11/2026)

> **Quyết định: NO-GO cho public rộng rãi.** Mã ở nhánh `main` đã được gia cố và có CI xanh, nhưng website Render production chưa chạy cùng phiên bản và Neon chưa thực hiện các migration mới. Không được coi CI là chứng nhận kiểm thử trình duyệt hay pentest.

## A. Phạm vi và bằng chứng

- GitHub: `hoangminhtuan-2322/mtunz` (`main`), commit ứng dụng đã được kiểm thử `d60a588ed54be411ec57cf03eb1cfd18c56169fe`.
- CI **Verify mtunz premium UI**: đạt; kiểm thử JavaScript, giao diện tĩnh, API pytest, phân quyền, xóa tài khoản, thiết bị, kỷ luật Chat thế giới và hồ sơ.
- CI **Render PostgreSQL integration**: đạt; khởi tạo trên Postgres 16, mô phỏng nâng cấp một DB đã tồn tại và chạy smoke đăng ký, PIN, nội dung cộng đồng/báo cáo trên cơ sở dữ liệu **CI dùng một lần**.
- Render `mtunz` (`srv-dbu46url550s739sq7c0`): deploy cuối cùng được xác minh `live` ở commit **`0a838120a5dfd24ef87324969ec7e99757ea11a4`**, không phải commit mới nhất. Cấu hình thực tế `serviceDetails.healthCheckPath=""`; `render.yaml` đã khai báo `/health` nhưng không tự đồng bộ cho dịch vụ tạo thủ công.
- Neon `mtunz-db` (`autumn-water-86055170`), branch production `main` (`br-red-mud-a1ttvi03`): sẵn sàng, có 1 quản trị viên đã bật PIN và 1 thành viên tại lần kiểm tra; chưa có tin nhắn; `needs_display_name`, `terms_accepted_at`, `terms_accepted_version` và `world_settings` **chưa tồn tại** trong production, dự kiến được migration ở lần chạy mã mới.
- Render logs: không ghi nhận error-level hoặc HTTP 5xx trong khoảng truy vấn cuối cùng; điều này không thay thế kiểm thử tải/người dùng thật.

## B. Các lỗi và thiếu sót đã được sửa trong mã

1. **Ảnh tối ưu bị CSP chặn:** cho phép `img-src 'self' data: blob:` trong khi tiếp tục giới hạn nguồn script. Kiểm thử ngăn cấu hình lỗi quay lại.
2. **Điều khoản đăng ký chỉ xác nhận ở trình duyệt:** máy chủ hiện bắt buộc `accepted_terms=true`, ghi `terms_accepted_at` và `terms_accepted_version='2026-11-18'`. Không tự gán đồng ý cho tài khoản cũ. Xuất dữ liệu của người dùng gồm metadata đồng ý này.
3. **Thiếu trang văn bản người dùng có thể xem:** đã tạo `GET /terms` và `GET /privacy` và giao diện liên kết truy cập trước khi đăng ký. Chính sách nêu rõ không có E2EE, quyền kiểm duyệt, thông tin liên hệ và vị trí, lưu trữ, xóa tài khoản, giới hạn dự phòng.
4. **Tệp đính kèm không điều khiển được bằng bàn phím:** nút Ảnh/Tệp hỗ trợ Tab, Enter, Space; giữ nguyên chọn ảnh trên điện thoại, ảnh kéo thả và quyền upload hiện có.
5. **Không phải mọi thay đổi đều kích hoạt CI:** hai workflow chính hiện chạy trên **mọi commit `main`**, không bỏ sót `world_chat.py`, migrations, policy hay file phụ. CI có smoke nâng cấp PostgreSQL có dữ liệu sẵn và kiểm tra chính sách public.
6. **Không nhận biết phiên bản đang được Render chạy:** `GET /health` trả thêm `commit` dạng 12 ký tự nếu `RENDER_GIT_COMMIT` hợp lệ. Chỉ hiển thị SHA từ repo công khai, không xuất biến môi trường khác.
7. **Thiếu kiểm tra go-live độc lập:** tạo workflow GitHub Actions `Verify deployed mtunz release` (chạy thủ công) chỉ dùng GET để xác nhận `/health`, SHA bằng `main`, `/terms`, `/privacy`.
8. Đã duy trì quyết định UX trước đây: **không khôi phục accordion “Quyền riêng tư và xử lý dữ liệu” trong Cài đặt**. Chính sách được đọc từ trang pháp lý độc lập.

## C. Rào cản phải giải quyết (P0 trước public)

| Mục | Trạng thái hiện tại | Tiêu chí vượt qua |
| --- | --- | --- |
| Render triển khai trễ | **NO-GO**: `live 0a83812` trong khi GitHub `main` có mã mới | Deploy và xác nhận cùng SHA (bài kiểm tra phát hành) |
| Cấu hình HTTP health | **NO-GO**: cấu hình dịch vụ thực tế còn để trống | Trên Render Settings → Health Checks đặt `/health`; xác minh `healthCheckPath` |
| Neon schema production | **NO-GO**: thiếu cột onboard/consent và bảng World mới | Sau deploy, xác minh migration, tài khoản cũ giữ nguyên, `world_settings.enabled=0` |
| Sao lưu | **HẠN CHẾ**: snapshot `mtunz-prepublic-safe-2026-11-18` đang có; lần tạo snapshot tiếp theo bị **HTTP 422: snapshots limit exceeded** | Xây dựng một bản sao lưu **độc lập, được mã hóa, có thể thử khôi phục**; không phụ thuộc một bản snapshot của cùng dự án |
| Bảo vệ nhánh | **HẠN CHẾ GÓI FREE**: Neon từ chối bảo vệ `main` (HTTP 422 quota protected branches) | Bảo vệ bằng gói hỗ trợ hoặc phương án kiểm soát quyền/khôi phục tương đương |
| E2E thực tế | **CHƯA KIỂM THỬ** người dùng thực trên bản mới | Ít nhất 2 tài khoản thử; DM/nhóm, upload ảnh, vị trí, lời mời, PIN, sửa/thu hồi, ghim/chuyển tiếp, báo cáo, khóa, khôi phục, xóa; desktop và mobile |
| Legal / vận hành | **CHƯA DUYỆT độc lập** | Chủ dự án duyệt bản điều khoản và riêng tư, kênh liên hệ, quy trình xử lý khiếu nại và dữ liệu |

### Phương án dự phòng Neon đã thực hiện

- Snapshot cũ: `snap-green-salad-a192r0a7`, đã thử restore sang `br-ancient-dew-a1atml14` trước đó.
- Khi snapshot quota báo 422, đã tạo nhánh **copy-on-write không có compute** `mtunz-prepublic-safety-branch-2026-11-18` (`br-calm-scene-a10o4rio`) từ `main`, trạng thái `ready`, `default=false`, có `parent_lsn`. Đây là điểm rẽ nhánh dự phòng trong Neon **không phải bản backup độc lập khỏi Neon** và chưa được kiểm tra nội dung trên compute vì nhánh không có compute.
- **Không xóa hay restore/finalize nhánh production**, không thay đổi dữ liệu người dùng và không nâng gói trong đợt rà soát.
- Tác vụ tự động kiểm tra snapshot lúc 03:00 có nguy cơ gặp quota khi còn snapshot cũ; cần giải quyết thay vì mặc định backup đã được đảm bảo.

## D. Rủi ro P1 / giới hạn cần chấp nhận minh bạch

- Render Free: máy có thể ngủ, cold start, 1 worker; WebSocket nội bộ không đồng bộ giữa nhiều instance.
- Tin nhắn chưa mã hóa đầu-cuối; Admin có quyền kiểm duyệt và dữ liệu metadata phiên chỉ dành cho Admin.
- Tệp tối đa 2 MB trên chế độ hosted; không có chương trình antivirus toàn diện.
- Rate limit HTTP chủ yếu theo tiến trình, vẫn cần hạ tầng giới hạn dùng chung khi tăng instance. Kỷ luật spam World có trạng thái trong DB.
- Gọi WebRTC 1-1 có thể không hoạt động khi không có TURN trong một số mạng.
- Số điện thoại/email chỉ được khai báo, không xác minh sở hữu bằng OTP.
- Chưa có kiểm thử thâm nhập độc lập, bài kiểm thử hiệu năng tải lớn hay xác nhận truy cập/hiển thị trên nhiều trình duyệt thật.
- Website còn `X-Robots-Tag: noindex, nofollow` cho giai đoạn thử nghiệm; không tự bỏ trước khi được phê duyệt mở public.

## E. Thứ tự go-live chính xác

1. Duyệt tài liệu pháp lý và chuẩn bị **backup ngoài Neon** (hoặc bản dự phòng có thể phục hồi độc lập).
2. Đảm bảo commit ở GitHub `main` có cả UI và PostgreSQL CI xanh.
3. Xác minh liên kết Git của Render; deploy commit `main` dự kiến; thiết lập health check HTTP `/health`.
4. Kiểm tra Render `live` đúng SHA và Neon migration (kể cả bảo toàn mật khẩu băm/ID tài khoản cũ, World `enabled=0`).
5. Chạy GitHub Actions `Verify deployed mtunz release` từ `main` để xác nhận website đã đồng bộ; kiểm tra log không phát sinh lỗi mới.
6. Chạy thử end-to-end bằng nhiều tài khoản/thiết bị và đo tải ở mức dự kiến; hoàn tất công cụ xử lý báo cáo, cảnh báo sao lưu và quy trình sự cố.
7. **Chỉ chốt GO PUBLIC** khi P0 đều đã khép kín. Cho đến lúc đó, **NO-GO cho phát hành rộng rãi**.

_Tài liệu này ghi nhận bằng chứng kiểm tra tự động và kết nối dịch vụ tại thời điểm 18/11/2026, không phải chứng chỉ kiểm toán bảo mật hay đánh giá tuân thủ pháp lý._
