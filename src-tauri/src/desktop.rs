use crate::{data::Data, hotkeys, notifier, window_layout};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{App, AppHandle, Emitter, Manager, State, WebviewWindow};
use tauri_plugin_autostart::ManagerExt;

const PREFERENCES: &str = "desktop";

#[derive(Clone, Copy, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    #[default]
    Full,
    Widget,
    Mini,
    Bubble,
}

impl Mode {
    pub fn next(self) -> Self {
        match self {
            Self::Full => Self::Widget,
            Self::Widget => Self::Mini,
            Self::Mini => Self::Bubble,
            Self::Bubble => Self::Full,
        }
    }
}

#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
enum Theme {
    Dark,
    Light,
}

#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
enum TimerMode {
    Stopwatch,
    Countdown,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
pub struct DesktopState {
    pub mode: Mode,
    pinned: bool,
    opacity: f64,
    theme: Theme,
    timer_mode: TimerMode,
    autostart: bool,
    pub notifications: bool,
    pub hotkeys: hotkeys::Hotkeys,
    shortcut_error: Option<String>,
}

impl Default for DesktopState {
    fn default() -> Self {
        Self {
            mode: Mode::Full,
            pinned: true,
            opacity: 1.0,
            theme: Theme::Dark,
            timer_mode: TimerMode::Stopwatch,
            autostart: false,
            notifications: true,
            hotkeys: hotkeys::Hotkeys::default(),
            shortcut_error: None,
        }
    }
}

#[tauri::command]
pub fn desktop_state(data: State<'_, Data>) -> Result<DesktopState, String> {
    preferences(&data)
}

pub fn preferences(data: &Data) -> Result<DesktopState, String> {
    Ok(data.get_setting(PREFERENCES)?.unwrap_or_default())
}

fn publish(
    window: &WebviewWindow,
    data: &Data,
    state: DesktopState,
) -> Result<DesktopState, String> {
    data.set_setting(PREFERENCES, &state)?;
    window.emit("desktop-changed", &state).map_err(message)?;
    Ok(state)
}

#[tauri::command]
pub fn set_mode(
    window: WebviewWindow,
    data: State<'_, Data>,
    mode: Mode,
) -> Result<DesktopState, String> {
    change_mode(&window, &data, mode, mode == Mode::Full)
}

pub fn change_mode(
    window: &WebviewWindow,
    data: &Data,
    mode: Mode,
    focus: bool,
) -> Result<DesktopState, String> {
    let mut state = preferences(data)?;
    if state.mode != mode {
        window_layout::save(window, data, state.mode, false)?;
        window_layout::configure(window, data, mode, state.pinned, true)?;
        state.mode = mode;
    }
    if focus && mode == Mode::Full {
        show(window).map_err(message)?;
        window.set_focus().map_err(message)?;
    }
    publish(window, data, state)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreferencesInput {
    opacity: Option<f64>,
    hotkeys: Option<hotkeys::Hotkeys>,
    theme: Option<Theme>,
    timer_mode: Option<TimerMode>,
    autostart: Option<bool>,
    notifications: Option<bool>,
}

#[tauri::command]
pub fn set_desktop_preferences(
    window: WebviewWindow,
    data: State<'_, Data>,
    input: PreferencesInput,
) -> Result<DesktopState, String> {
    let previous = preferences(&data)?;
    let mut state = previous.clone();
    if let Some(opacity) = input.opacity {
        if !(0.35..=1.0).contains(&opacity) {
            return Err("Opacity must be between 35% and 100%.".into());
        }
        state.opacity = opacity;
    }
    state.theme = input.theme.unwrap_or(state.theme);
    state.timer_mode = input.timer_mode.unwrap_or(state.timer_mode);
    state.notifications = input.notifications.unwrap_or(state.notifications);
    state.autostart = input.autostart.unwrap_or(state.autostart);
    let replace_keys = input.hotkeys.is_some();
    let change_autostart = state.autostart != previous.autostart;
    let app = window.app_handle();
    if let Some(keys) = input.hotkeys {
        hotkeys::replace(app, &previous.hotkeys, &keys)?;
        state.hotkeys = keys;
        state.shortcut_error = None;
    }
    let persist = (|| {
        if change_autostart {
            set_autostart(app, state.autostart)?;
        }
        data.set_setting(PREFERENCES, &state)
    })();
    if let Err(error) = persist {
        if replace_keys {
            let _ = hotkeys::replace(app, &state.hotkeys, &previous.hotkeys);
        }
        if change_autostart {
            let _ = set_autostart(app, previous.autostart);
        }
        return Err(error);
    }
    notifier::wake(app);
    window.emit("desktop-changed", &state).map_err(message)?;
    Ok(state)
}

fn set_autostart(app: &AppHandle, enabled: bool) -> Result<(), String> {
    let startup = app.autolaunch();
    let result = if enabled {
        startup.enable()
    } else {
        startup.disable()
    };
    result.map_err(|error| format!("Could not change Windows startup. {error}"))
}

#[tauri::command]
pub fn set_pinned(
    window: WebviewWindow,
    data: State<'_, Data>,
    pinned: bool,
) -> Result<DesktopState, String> {
    let mut state = preferences(&data)?;
    state.pinned = pinned;
    window
        .set_always_on_top(pinned && state.mode != Mode::Full)
        .map_err(message)?;
    publish(&window, &data, state)
}

#[tauri::command]
pub fn hide_window(window: WebviewWindow) -> Result<(), String> {
    window.hide().map_err(message)
}

fn message(error: tauri::Error) -> String {
    error.to_string()
}

pub fn show(window: &WebviewWindow) -> tauri::Result<()> {
    if window.is_minimized()? {
        window.unminimize()?;
    }
    window.show()
}

pub fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let window = app
        .get_webview_window("main")
        .ok_or("Missing main window")?;
    let show_item = MenuItem::with_id(app, "show", "Show or hide Dev Focus", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit Dev Focus", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &quit_item])?;
    let icon = app
        .default_window_icon()
        .ok_or("Missing tray icon")?
        .clone();
    TrayIconBuilder::with_id("dev-focus")
        .icon(icon)
        .tooltip("Dev Focus")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => app.exit(0),
            "show" => toggle_visibility(app),
            _ => (),
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_visibility(tray.app_handle());
            }
        })
        .build(app)?;

    app.manage(Arc::new(window_layout::Layout::default()));
    let data = app.state::<Data>();
    let mut state = preferences(&data)?;
    state.shortcut_error = hotkeys::register_startup(app.handle(), &state.hotkeys).err();
    if let Ok(enabled) = app.autolaunch().is_enabled() {
        state.autostart = enabled;
    }
    data.set_setting(PREFERENCES, &state)?;
    window_layout::configure(&window, &data, state.mode, state.pinned, false)?;
    window_layout::watch(&window);
    if !std::env::args_os().any(|argument| argument == "--autostart") {
        show(&window)?;
    }
    Ok(())
}

pub fn toggle_widget(window: &WebviewWindow, data: &Data) -> Result<(), String> {
    let state = preferences(data)?;
    let visible =
        window.is_visible().map_err(message)? && !window.is_minimized().map_err(message)?;
    if visible && state.mode != Mode::Full {
        return window.hide().map_err(message);
    }
    change_mode(window, data, Mode::Widget, false)?;
    show(window).map_err(message)
}

fn toggle_visibility(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let visible =
            window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(false);
        let _ = if visible {
            window.hide()
        } else {
            show(&window)
        };
    }
}
