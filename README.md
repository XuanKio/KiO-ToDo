# Dev Focus

Dev Focus là ứng dụng Windows dành cho developer muốn quản lý task, ghi thời gian làm việc thực tế và so sánh với Estimate ngay bên cạnh IDE. Task, project, phiên làm việc và tùy chọn được lưu bằng SQLite trên máy. Các tính năng chính chạy offline và không cần tài khoản.

**[Tải bộ cài Windows x64 mới nhất](https://github.com/XuanKio/KiO-ToDo/releases/latest)** · **[Xem tất cả phiên bản](https://github.com/XuanKio/KiO-ToDo/releases)**

## Cài đặt trên Windows

1. Mở GitHub Releases và tải file `Dev-Focus_<version>_x64-setup.exe` trong **Assets**. Bản 0.1.0 dành cho Windows x64 và chưa ký Authenticode.
2. Chạy bộ cài NSIS bằng tài khoản Windows đang sử dụng. Nếu máy chưa có Microsoft Edge WebView2 Runtime, bộ cài cần kết nối mạng để tải runtime.
3. Mở **Dev Focus** từ Start Menu hoặc shortcut Desktop. Tùy chọn tạo shortcut Desktop được bật sẵn ở màn hình kết thúc cài đặt.

## Tính năng

| Mục | Thao tác |
| --- | --- |
| Tasks | Tạo, chỉnh sửa, nhân bản, kéo thả và lọc task theo project hoặc trạng thái. Task có Estimate, ưu tiên, ngày đến hạn, category, tags, subtasks và ghi chú. |
| Projects | Tạo và phân loại project. Xem số task đã hoàn thành, Estimate, Actual, Remaining và chênh lệch. |
| Timer | Chọn Stopwatch hoặc Countdown. App lưu từng phiên, tự pause task trước khi chuyển sang task khác và cho phép thêm hoặc sửa phiên trong History. |
| Báo cáo | Dashboard tổng hợp thời gian hôm nay và tuần này, theo project và category. Statistics so sánh Estimate với Actual và xuất CSV hoặc Markdown. |
| Windows | System tray, Always on Top, phím tắt toàn cục, thông báo Estimate, khởi động cùng Windows và chế độ Dark/Light. |

## Bắt đầu

1. Chọn **New task** để tạo một task. Dùng **Quick input** để xem trước và nhập nhiều task một lần. Mỗi dòng theo mẫu `Tên task : thời lượng`, chẳng hạn `Setup Scene : 30m`, `Core Gameplay : 4h` hoặc `QA : 1h 30m`.
2. Bấm **Start** để ghi thời gian. App báo gần hết Estimate từ 85%, hiển thị phần vượt khi quá Estimate và tiếp tục ghi phiên đang chạy. Đổi giữa Stopwatch và Countdown trong **Settings**.
3. Bấm **Open widget** trên thanh tiêu đề để giữ timer cạnh IDE. Dùng biểu tượng ghim trên Widget để bật hoặc tắt Always on Top. **Settings** cho phép chỉnh độ trong suốt của các chế độ thu gọn từ 35% đến 100%.
4. Dùng **History** để xem hoặc chỉnh phiên theo task. Vào **Statistics**, chọn **Today**, **This week** hoặc **All time**, rồi chọn **CSV** hoặc **Markdown**. Tuần bắt đầu thứ Hai theo giờ địa phương.

### Chế độ cửa sổ

| Chế độ | Dùng để |
| --- | --- |
| Full | Quản lý toàn bộ workspace, task, project, phiên làm việc, báo cáo và Settings. |
| Widget · 320 × 420 | Theo dõi task hiện tại, tiến độ Estimate và danh sách hôm nay. Có Start, Pause, Resume, Complete và chuyển sang task tiếp theo. |
| Mini · 240 × 48 | Xem tên task và đồng hồ, điều khiển timer hoặc mở rộng về Widget. |
| Bubble · 72 × 72 | Xem đồng hồ và vòng tiến độ Estimate. Kéo bằng tay nắm, bấm đồng hồ để mở Widget. |

Các kích thước trên tính theo pixel logic. Cả bốn chế độ dùng chung timer. Dev Focus ghi nhớ chế độ, vị trí và độ trong suốt. Các cửa sổ thu gọn tự căn gần mép màn hình.

### Phím tắt mặc định

| Phím tắt | Hành động |
| --- | --- |
| `Ctrl+Alt+F` | Hiện hoặc ẩn Widget |
| `Ctrl+Alt+S` | Chạy hoặc pause timer |
| `Ctrl+Alt+N` | Mở form tạo task |
| `Ctrl+Alt+M` | Chuyển giữa Full, Widget, Mini và Bubble |

Có thể đổi cả bốn phím tắt trong **Settings**. Nút thu gọn và thao tác đóng cửa sổ đưa app về system tray. Chọn **Quit Dev Focus** trong menu biểu tượng tray để thoát hẳn.

## Thời gian và dữ liệu

Phiên đang chạy dùng mốc thời gian đã lưu. Actual vẫn tính khoảng thời gian máy ngủ hoặc app đã thoát cho tới khi bạn bấm **Pause** hoặc **Complete**. Pause trước khi nghỉ nếu muốn loại khoảng thời gian đó khỏi Actual. Khi thiếu Estimate, timer hiển thị thời gian đã ghi.

File dữ liệu nằm ở `%APPDATA%\com.xuankio.devfocus\dev-focus.sqlite3`. Để sao lưu file trực tiếp, chọn **Quit Dev Focus** từ tray trước khi sao chép. Khi cần chia sẻ tiến độ, dùng nút xuất báo cáo trong **Statistics**.

## Phát triển và đóng gói

Ứng dụng dùng Tauri 2 và Rust cho desktop, SQLite cho lưu trữ, React và TypeScript cho giao diện, Tailwind CSS cho style, Zustand cho trạng thái và Lucide cho biểu tượng. `src/` chứa giao diện theo tính năng. `src-tauri/src/` chứa IPC, timer, truy cập dữ liệu và tích hợp Windows. Migration SQLite nằm trong `src-tauri/migrations/`.

Cài Node.js 22.12 trở lên, Rust stable (MSVC), Visual Studio C++ Build Tools, Windows SDK và WebView2 Runtime. Chạy các lệnh sau ở thư mục gốc của repo. [Yêu cầu Tauri trên Windows](https://v2.tauri.app/start/prerequisites/)

```powershell
npm ci
npm run tauri -- dev
```

```powershell
npm run build
cargo test --locked --manifest-path src-tauri/Cargo.toml
npm run tauri -- build
```

Bộ cài được tạo tại `src-tauri\target\release\bundle\nsis\`. Bản 0.1.0 đã qua 10 test Rust và smoke test Windows. Cài từ NSIS thành công, khởi chạy từ shortcut Desktop và mở lại từ system tray bằng shortcut Start Menu. Hồ sơ từng phase, schema và quyết định về timer nằm trong [IMPLEMENTATION.md](IMPLEMENTATION.md).

## Phát hành phiên bản mới

1. Đồng bộ số phiên bản trong `package.json`, `src-tauri/Cargo.toml` và `src-tauri/tauri.conf.json`, rồi làm mới lockfile nếu cần.
2. Build NSIS và kiểm tra cài mới trên Windows. Tạo GitHub Release `v<version>` từ commit tương ứng và đính kèm bộ cài x64 cùng SHA-256 để người dùng kiểm tra file tải về.
3. Khi bật cập nhật trong app, build bằng cấu hình phát hành riêng với `bundle.createUpdaterArtifacts`, `plugins.updater.pubkey` và `plugins.updater.endpoints`. Dùng khóa ký Tauri trong môi trường build và phát hành metadata HTTPS cùng các artifact đã ký. Bản 0.1.0 dùng GitHub Releases để tải và cài thủ công. [Tauri Updater](https://v2.tauri.app/plugin/updater/)
