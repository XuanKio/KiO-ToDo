# Kế hoạch triển khai Dev Focus

Dev Focus là ứng dụng Windows chạy offline. Rust xử lý nghiệp vụ, SQLite và tích hợp desktop. React, TypeScript, Tailwind CSS, Zustand và Lucide tạo giao diện dùng chung cho bốn chế độ. Tauri 2 chạy ứng dụng trong một cửa sổ để mọi chế độ đọc cùng trạng thái timer.

## Dữ liệu

SQLite đặt trong `app_data_dir`. Migration chạy theo thứ tự trong transaction. Bật foreign keys trên kết nối. Các thời điểm của timer dùng Unix epoch mili giây theo UTC. Ngày đến hạn dùng `YYYY-MM-DD` theo lịch của người dùng.

| Bảng | Trường chính | Quy tắc |
| --- | --- | --- |
| `projects` | `id`, `name`, `color`, `created_at` | Tên bắt buộc. Task có thể không thuộc project. |
| `tasks` | `id`, `project_id`, `name`, `description`, `estimate_seconds`, `priority`, `status`, `tags`, `category`, `due_date`, `notes`, `sort_order`, `created_at`, `completed_at` | Trạng thái gồm `todo`, `in_progress`, `paused`, `completed`. Estimate không âm. Tags lưu dưới dạng mảng JSON. |
| `subtasks` | `id`, `task_id`, `name`, `completed`, `sort_order` | Tham chiếu task, theo thứ tự trong danh sách. |
| `sessions` | `id`, `task_id`, `started_at`, `ended_at` | `ended_at` để trống khi đang chạy. Unique partial index giới hạn một phiên đang chạy. Kết thúc phiên không sớm hơn lúc bắt đầu. |
| `settings` | `key`, `value` | Giá trị JSON theo khóa cho theme, timer, chế độ cửa sổ, độ trong suốt, ghim, khởi động cùng Windows và phím tắt. |

Actual Time là tổng khoảng thời gian của các phiên. Chỉnh thời gian thủ công lưu thành phiên hoặc cập nhật phiên hiện có để lịch sử và báo cáo khớp với Actual Time. Chuyển task chốt phiên hiện tại và mở phiên mới trong cùng transaction. Hoàn thành đóng phiên đang chạy của task trước khi cập nhật trạng thái. Duplicate sao chép thông tin task và tên subtasks, bắt đầu với trạng thái `todo` và chưa có thời gian làm. Các chỉ mục phụ hỗ trợ truy vấn phiên theo task và thời điểm, task theo project và thứ tự.

Countdown hiển thị Estimate trừ Actual Time. Sau khi vượt Estimate, timer tiếp tục chạy và hiển thị phần chênh lệch. Mỗi lần hiển thị đọc lại đồng hồ hệ thống và trừ timestamp đã lưu. Một phiên chưa pause hoặc complete tiếp tục qua đóng ứng dụng, Sleep và Hibernate. Khoảng thời gian trước lúc pause hoặc complete được tính theo đồng hồ hệ thống, kể cả thời gian máy ngủ. Khi đồng hồ lùi, chặn thời lượng âm.

Thống kê theo ngày dùng múi giờ của máy, cắt phiên tại ranh giới ngày hoặc tuần khi tổng hợp. Tuần bắt đầu thứ Hai. Remaining là tổng thời gian Estimate còn lại của các task chưa hoàn thành, với tối thiểu bằng 0 cho từng task. Variance bằng Actual trừ Estimate.

## Cấu trúc thư mục

```text
src/
  app/                  Shell, điều hướng và khởi tạo
  features/             Tasks, timer, projects, dashboard, history và settings
  shared/               Kiểu dữ liệu IPC, định dạng và thành phần giao diện dùng chung
src-tauri/
  src/                  Nghiệp vụ, truy cập SQLite, IPC và tích hợp Windows
  migrations/           Các bước migration SQLite có phiên bản
  capabilities/         Quyền IPC cho cửa sổ chính
  icons/                Biểu tượng cửa sổ, tray và installer
```

Rust kiểm tra dữ liệu đầu vào, thực hiện transaction và trả kết quả qua IPC. Zustand giữ dữ liệu đã tải và trạng thái giao diện. Cửa sổ cập nhật dữ liệu sau mỗi thao tác ghi thành công và khi tích hợp desktop thay đổi trạng thái. Hiển thị lỗi ở thao tác liên quan để người dùng có thể thử lại.

## Các phase và điểm kiểm tra

| Phase | Phạm vi triển khai | Kiểm tra trước khi sang phase tiếp theo |
| --- | --- | --- |
| 1 · MVP | Tạo, sửa, duplicate, sắp xếp task và quản lý subtasks. Migration SQLite. Stopwatch, Actual, Estimate và sửa thời gian. Full và Widget, cửa sổ tùy chỉnh, ghim và tray. | Chạy build frontend, test Rust và build Tauri chưa đóng gói. Kiểm tra tạo task, start, pause, resume, đổi task, complete, mở lại dữ liệu, ghim và ẩn/hiện tray. |
| 2 · Điều khiển nhanh | Mini, Bubble, ghi nhớ cửa sổ, snap theo vùng làm việc, DPI, opacity. Global hotkeys chỉnh được. Nhập task hàng loạt. Tạo project và tính tổng project. | Chạy lại build và test. Kiểm tra bốn chế độ giữ đúng timer, nhập `30m` và `4h`, đổi phím tắt và xử lý xung đột. Kiểm tra đổi project, snap và khôi phục vị trí trên thiết lập màn hình khả dụng. |
| 3 · Báo cáo và phân phối | Dashboard, History, Statistics, xuất CSV/Markdown, Countdown và cảnh báo Estimate. Light Mode, autostart, thông báo, installer Windows và Tauri Updater. | Chạy build release và test. Đối chiếu báo cáo với phiên đã lưu, tạo và mở file xuất. Tạo installer, kiểm tra đường khởi chạy từ desktop và Start Menu trên môi trường phù hợp. Khi có release hợp lệ, chạy kiểm tra cập nhật với chữ ký Tauri. |

## Điều kiện môi trường

Kiểm tra Node, npm, Rust MSVC, Visual Studio C++ Build Tools, Windows SDK và WebView2 trước build native. NSIS tạo bộ cài Windows từ bản release. [Yêu cầu Tauri trên Windows](https://v2.tauri.app/start/prerequisites/) · [Đóng gói installer](https://v2.tauri.app/distribute/windows-installer/)

Updater dùng nguồn phát hành HTTPS và khóa công khai để xác minh chữ ký. Bản build cục bộ cần chạy offline khi chưa cấu hình nguồn. Kiểm tra cài đặt cập nhật đầu cuối cần ít nhất hai phiên bản đã ký và nguồn phát hành truy cập được. [Tauri Updater](https://v2.tauri.app/plugin/updater/)

## Kết quả kiểm tra

| Phase | Kết quả |
| --- | --- |
| 1 | Build React và Tauri Windows thành công. 6 test Rust qua. Smoke trên WebView2 thật kiểm tra tạo task, start/pause/resume, đổi task, chỉnh phiên, ghim Widget, ẩn và mở lại app, tiếp tục timer. |
| 2 | Build React và Tauri Windows thành công. 9 test Rust qua. Smoke kiểm tra project và import nguyên tử, kích thước bốn chế độ, opacity, snap, khôi phục vị trí và đăng ký phím tắt qua Win32, kể cả rollback khi xung đột. |
| 3 | 10 test Rust qua. Smoke trên WebView2 kiểm tra Dashboard, History, Statistics, Light Mode, Countdown khi gần và vượt Estimate, updater chưa cấu hình, và khởi động vào tray. Hộp thoại lưu Windows đã tạo CSV và Markdown có nội dung khớp dữ liệu phiên kiểm thử. Tauri đã đóng gói bộ cài NSIS x64. |

## Phạm vi tái sử dụng

Workspace ban đầu có `README.md`. Tìm kiếm trong cây mã nguồn của repo chưa thấy ứng dụng, schema hoặc cấu hình bundler. Dùng API Tauri cho desktop, plugin chính thức cho hotkeys, thông báo, autostart và cập nhật, cùng SQLite thông qua `rusqlite` với `bundled` để bộ cài không phụ thuộc vào một bản SQLite riêng trên máy.
