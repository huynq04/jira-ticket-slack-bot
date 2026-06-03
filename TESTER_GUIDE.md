# Hướng Dẫn Dùng Jira Ticket Bot Cho Tester

Tài liệu này hướng dẫn tester tạo Jira ticket trực tiếp từ Slack message bằng bot `Jira ticket bot`.

## Bot Này Dùng Để Làm Gì?

Bot giúp tạo Jira ticket từ một message Slack đã có sẵn. Tester chỉ cần soạn nội dung bug trong Slack, tag người xử lý nếu có, chọn message đó, rồi bấm shortcut `Create Jira Ticket`.

Bot sẽ:

- Tạo Jira ticket theo project đã map với Slack channel.
- Dùng AI để tạo title Jira từ nội dung bug.
- Dùng tag người dùng hoặc `Assignee` để gán người xử lý nếu tìm thấy user trên Jira.
- Upload file/ảnh/video đính kèm trên message Slack sang Jira.
- Reply link Jira vào thread của message gốc.

Bot không dùng slash command và không mở modal.

## Điều Kiện Trước Khi Dùng

Channel Slack phải đã được map với Jira project. Nếu chưa map, bot sẽ báo:

```text
Không tạo được Jira ticket.
Lý do: Channel này chưa được map với Jira project.
```

Bot phải có mặt trong channel. Nếu là private channel, cần invite bot:

```text
/invite @Jira ticket bot
```

## Cách Tạo Jira Ticket

1. Soạn message bug trong Slack.
2. Đính kèm ảnh/video/file vào chính message đó nếu cần.
3. Hover hoặc mở menu của message.
4. Chọn `More actions`.
5. Chọn `Create Jira Ticket`.
6. Đợi bot reply trong thread của message gốc.

## Mẫu Message Khuyến Nghị

Tester có thể viết ngắn gọn theo ngôn ngữ tự nhiên:

```text
Không đăng nhập được LaoID trên UAT, iPhone 14 iOS 17.
Steps: mở app, nhập số điện thoại hợp lệ, bấm Đăng nhập, nhập OTP.
Actual: app báo "Something went wrong" và không vào được Home.
Expected: đăng nhập thành công và vào Home.
Severity High. @huy.nq2
```

Nếu muốn kiểm soát title/assignee rõ hơn, có thể dùng format có label:

```text
Title: Không đăng nhập được LaoID
Assignee: @huy.nq2

Environment: UAT
Device: iPhone 14 - iOS 17

Steps:
1. Mở app LaoID
2. Nhập số điện thoại hợp lệ
3. Bấm Đăng nhập
4. Nhập OTP

Actual:
App báo lỗi "Something went wrong" và không vào được màn Home.

Expected:
User đăng nhập thành công và vào màn Home.

Severity: High
```

## Quy Tắc Nội Dung

Nếu message có `Title:` hoặc `Tiêu đề:`, bot dùng luôn giá trị đó làm title Jira và không gọi AI.

Nếu không có `Title:`, bot dùng AI để tự tạo title Jira từ nội dung message.

Title trên Jira sẽ tự có prefix `[App]`, `[Web]`, hoặc `[App/Web]` dựa theo nội dung bug.

Nếu AI lỗi hoặc không tạo được title hợp lệ, bot sẽ báo lỗi và không tạo Jira ticket.

Description Jira là phần nội dung còn lại sau khi bỏ `Title:` và `Assignee:`.

Nếu message có thread, bot sẽ đọc thêm reply của tester trong thread, bỏ qua message của bot, rồi dùng AI để tổng hợp vào description Jira.

Assignee là optional. Có thể tag trực tiếp trong nội dung:

```text
... Severity High. @huy.nq2
```

Hoặc dùng label:

```text
Assignee: @huy.nq2
Assignee: huy.nq2
```

Nếu bot tìm thấy user trên Jira, ticket sẽ được assign. Nếu không tìm thấy, ticket vẫn được tạo nhưng chưa assign.

Phần description trên Jira chỉ gồm nội dung bug còn lại. Bot sẽ không đưa các dòng sau vào description:

- `Title: ...`
- `Assignee: ...`
- Slack channel
- Người bấm shortcut
- Link message Slack
- Nội dung thread
- Danh sách tên file đính kèm

## Đính Kèm File, Ảnh, Video

Bot sẽ upload file/ảnh/video nằm trên message được chọn sang Jira.

Nên đính kèm file vào chính message bug, không để file trong reply thread khác.

Giới hạn dung lượng phụ thuộc cấu hình hệ thống, hiện tại mặc định:

```text
50 MB / file
```

Nếu file upload lỗi, bot vẫn tạo ticket và reply cảnh báo tên file lỗi.

## Bot Reply Như Thế Nào?

Thành công:

```text
Đã tạo Jira ticket: JBT-123
Title: Không đăng nhập được LaoID
Project: JBT
Assignee: @huy.nq2
Attachments: 2 file uploaded
Link: https://jira.tinasoft.io/browse/JBT-123
```

Ticket đã từng được tạo từ message đó:

```text
Jira ticket đã tồn tại: JBT-123
```

Channel chưa map Jira project:

```text
Không tạo được Jira ticket.
Lý do: Channel này chưa được map với Jira project.
```

Assignee không tìm thấy:

```text
Đã tạo Jira ticket: JBT-123
Không tìm thấy Jira account của @abc nên ticket chưa được assign.
```

File lỗi:

```text
Đã tạo Jira ticket: JBT-123
Attachments: 1 file uploaded
File lỗi: video.mp4 (...)
```

## Lưu Ý Quan Trọng

Không bấm shortcut nhiều lần trên cùng một message. Bot có cơ chế duplicate theo Slack message, nên nếu message đã tạo ticket rồi, bot sẽ trả về ticket cũ.

Nếu muốn tạo ticket mới, hãy gửi message mới.

Nếu sửa nội dung message sau khi ticket đã tạo, Jira ticket cũ không tự cập nhật.

Nếu muốn ticket có file đính kèm, file phải nằm trên message được chọn.

## Lỗi Thường Gặp

Không thấy `Create Jira Ticket` trong `More actions`:

- Kiểm tra Slack app đã được install vào workspace.
- Kiểm tra shortcut đúng là message shortcut, không phải global shortcut.

Bot không reply:

- Kiểm tra bot đã được invite vào channel chưa.
- Private channel bắt buộc invite bot.

Báo channel chưa map:

- Báo dev/admin map Slack channel hiện tại với Jira project.

Báo assignee không tìm thấy:

- Kiểm tra user có tồn tại trên Jira không.
- Thử dùng username Jira dạng plain text, ví dụ `Assignee: huy.nq2`.

File không upload:

- Kiểm tra file có nằm trên message được chọn không.
- Kiểm tra file có vượt giới hạn dung lượng không.
- Thử lại với file nhỏ hơn hoặc ảnh screenshot.

Lỗi Jira permission/auth:

- Báo dev/admin kiểm tra quyền Jira của bot user.

## Khi Cần Báo Lỗi Cho Dev

Hãy gửi kèm các thông tin sau:

- Slack channel đang test.
- Thời điểm bấm shortcut.
- Link Jira ticket nếu có.
- Nội dung bot reply trong thread.
- Tên file bị lỗi nếu có.
