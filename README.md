# Dev Focus

Dev Focus là ứng dụng Windows để quản lý task, theo dõi phiên làm việc và so sánh Actual với Estimate. Dữ liệu lưu cục bộ trong SQLite và đồng bộ giữa Full, Widget, Mini và Bubble. Ứng dụng chạy offline kể cả khi bộ cập nhật chưa được cấu hình.

## Chạy và đóng gói

Cần Node.js 22.12+ hoặc 24, Rust MSVC, Visual Studio C++ Build Tools, Windows SDK và Microsoft Edge WebView2. Bộ cài NSIS chạy theo tài khoản Windows hiện tại. Trên máy thiếu WebView2, bước cài WebView2 cần kết nối mạng. [Yêu cầu Tauri](https://v2.tauri.app/start/prerequisites/) · [Bộ cài Windows](https://v2.tauri.app/distribute/windows-installer/)

```powershell
npm ci
npm run tauri -- dev
```

```powershell
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri -- build
```

Bộ cài x64 nằm trong `src-tauri\target\release\bundle\nsis`. Cài mới sẽ tạo shortcut Start Menu. Tùy chọn tạo shortcut Desktop được bật sẵn trên màn hình kết thúc cài đặt.

## Sử dụng

1. Dùng **New task** để tạo một task hoặc **Quick input** để nhập nhiều dòng. Ví dụ `Setup Scene : 30m` và `Core Gameplay : 4h`.
2. Bấm **Start** trên task. Khi chuyển task, Dev Focus tự pause phiên cũ. Dùng **History** để xem hoặc chỉnh các phiên đã lưu.
3. Mở Widget từ thanh tiêu đề. Widget có nút mở Mini và Bubble. Mở **Settings** để chỉnh độ trong suốt, theme, Countdown và phím tắt.
4. Mở **Statistics** để chọn khoảng thời gian và xuất CSV hoặc Markdown. Ngày và tuần theo lịch địa phương, tuần bắt đầu thứ Hai.

| Phím tắt | Hành động |
| --- | --- |
| `Ctrl+Alt+F` | Hiện hoặc ẩn Widget |
| `Ctrl+Alt+S` | Chạy hoặc pause timer |
| `Ctrl+Alt+N` | Mở form tạo task |
| `Ctrl+Alt+M` | Chuyển chế độ cửa sổ |

Nút thu gọn và nút đóng cửa sổ đưa ứng dụng về system tray. Chọn **Quit Dev Focus** từ tray để thoát ứng dụng. Phiên đang chạy dùng mốc thời gian đã lưu và tiếp tục tính trong thời gian máy ngủ hoặc ứng dụng đã thoát. Pause phiên trước khi nghỉ nếu muốn loại khoảng thời gian đó khỏi Actual. SQLite nằm ở `%APPDATA%\com.xuankio.devfocus\dev-focus.sqlite3`.

## Nguồn cập nhật

Tạo file cấu hình riêng khi phát hành. Đặt `bundle.createUpdaterArtifacts` thành `true` và cấu hình `plugins.updater.pubkey` cùng `plugins.updater.endpoints` trỏ tới metadata phát hành HTTPS. Đưa khóa ký Tauri vào biến môi trường bí mật của quy trình build. Chạy `npm run tauri -- build --config <file-cau-hinh>` và phát hành metadata, bộ cài cùng chữ ký tương ứng. **Check for updates** trong Settings sẽ kiểm tra phiên bản và cung cấp nút cài đặt khi có bản mới hợp lệ. [Tauri Updater](https://v2.tauri.app/plugin/updater/)

Xem [kế hoạch và schema](IMPLEMENTATION.md) để biết chi tiết về dữ liệu và quy trình kiểm thử.
