#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod data;
mod desktop;
mod hotkeys;
mod notifier;
mod reports;
mod updates;
mod window_layout;

use data::Data;
use tauri::Manager;

fn main() {
    let result = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, arguments, _| {
            if arguments.iter().any(|argument| argument == "--autostart") {
                return;
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = desktop::show(&window);
            }
        }))
        .plugin(hotkeys::plugin())
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .args(["--autostart"])
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(updates::PendingUpdate::default())
        .setup(|app| {
            let directory = app.path().app_data_dir()?;
            std::fs::create_dir_all(&directory)?;
            app.manage(Data::open(directory.join("dev-focus.sqlite3"))?);
            desktop::setup(app)?;
            notifier::start(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            } else if matches!(
                event,
                tauri::WindowEvent::Resized(_) | tauri::WindowEvent::Focused(false)
            ) && window.is_minimized().unwrap_or(false)
                && window.is_visible().unwrap_or(false)
            {
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::snapshot,
            commands::save_task,
            commands::duplicate_task,
            commands::reorder_tasks,
            commands::start_task,
            commands::pause_task,
            commands::complete_task,
            commands::reopen_task,
            commands::save_session,
            commands::save_project,
            commands::preview_tasks,
            commands::import_tasks,
            desktop::desktop_state,
            desktop::set_mode,
            desktop::set_pinned,
            desktop::set_desktop_preferences,
            desktop::hide_window,
            reports::save_report,
            updates::check_for_updates,
            updates::install_update,
        ])
        .run(tauri::generate_context!());

    if let Err(error) = result {
        eprintln!("Dev Focus could not start: {error}");
        std::process::exit(1);
    }
}
