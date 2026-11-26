use crate::{
    commands,
    data::Data,
    desktop::{self, Mode},
    notifier,
};
use serde::{Deserialize, Serialize};
use tauri::{plugin::TauriPlugin, AppHandle, Emitter, Manager, Wry};
use tauri_plugin_global_shortcut::{Builder, GlobalShortcutExt, Shortcut, ShortcutState};

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Hotkeys {
    toggle_window: String,
    toggle_timer: String,
    quick_task: String,
    cycle_mode: String,
}

#[derive(Clone, Copy)]
enum Action {
    Window,
    Timer,
    QuickTask,
    Mode,
}

impl Default for Hotkeys {
    fn default() -> Self {
        Self {
            toggle_window: "Ctrl+Alt+F".into(),
            toggle_timer: "Ctrl+Alt+S".into(),
            quick_task: "Ctrl+Alt+N".into(),
            cycle_mode: "Ctrl+Alt+M".into(),
        }
    }
}

impl Hotkeys {
    fn parse(&self) -> Result<Vec<(&str, Action, Shortcut)>, String> {
        let mut shortcuts = Vec::with_capacity(4);
        for (text, action) in [
            (&self.toggle_window, Action::Window),
            (&self.toggle_timer, Action::Timer),
            (&self.quick_task, Action::QuickTask),
            (&self.cycle_mode, Action::Mode),
        ] {
            let shortcut: Shortcut = text.trim().parse().map_err(|_| {
                format!("Invalid shortcut '{text}'. Use a combination such as Ctrl+Alt+F.")
            })?;
            if shortcut.mods.is_empty() {
                return Err(format!("Add Ctrl, Alt, Shift, or Super to '{text}'."));
            }
            if shortcuts
                .iter()
                .any(|(_, _, registered): &(_, _, Shortcut)| registered.id() == shortcut.id())
            {
                return Err(format!(
                    "The shortcut '{text}' is assigned to more than one action."
                ));
            }
            shortcuts.push((text.as_str(), action, shortcut));
        }
        Ok(shortcuts)
    }
}

pub fn register_startup(app: &AppHandle, keys: &Hotkeys) -> Result<(), String> {
    let mut conflicts = Vec::new();
    for (label, _, shortcut) in keys.parse()? {
        if app.global_shortcut().register(shortcut).is_err() {
            conflicts.push(label);
        }
    }
    if conflicts.is_empty() {
        Ok(())
    } else {
        Err(format!(
            "Windows could not register {}. Choose another shortcut in Settings.",
            conflicts.join(", ")
        ))
    }
}

pub fn replace(app: &AppHandle, previous: &Hotkeys, next: &Hotkeys) -> Result<(), String> {
    let desired = next.parse()?;
    let manager = app.global_shortcut();
    let registered: Vec<_> = previous
        .parse()
        .unwrap_or_default()
        .into_iter()
        .map(|(_, _, shortcut)| shortcut)
        .filter(|key| manager.is_registered(*key))
        .collect();
    manager
        .unregister_multiple(registered.iter().copied())
        .map_err(|error| error.to_string())?;

    let mut added = Vec::with_capacity(desired.len());
    for (label, _, shortcut) in desired {
        if let Err(error) = manager.register(shortcut) {
            let _ = manager.unregister_multiple(added);
            manager.register_multiple(registered).map_err(|restore| {
                format!("Could not register '{label}': {error}. Restoring the previous shortcuts also failed: {restore}.")
            })?;
            return Err(format!(
                "Could not register '{label}'. It may already be in use: {error}"
            ));
        }
        added.push(shortcut);
    }
    Ok(())
}

pub fn plugin() -> TauriPlugin<Wry> {
    Builder::new()
        .with_handler(|app, shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }
            let id = shortcut.id();
            let handle = app.clone();
            let _ = app.run_on_main_thread(move || {
                if let Err(error) = dispatch(&handle, id) {
                    let _ = handle.emit("desktop-error", error);
                }
            });
        })
        .build()
}

fn dispatch(app: &AppHandle, id: u32) -> Result<(), String> {
    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };
    let data = app.state::<Data>();
    let state = desktop::preferences(&data)?;
    let Some((_, action, _)) = state
        .hotkeys
        .parse()?
        .into_iter()
        .find(|(_, _, key)| key.id() == id)
    else {
        return Ok(());
    };
    match action {
        Action::Window => desktop::toggle_widget(&window, &data)?,
        Action::Timer => {
            commands::toggle_timer(&data)?;
            notifier::wake(app);
            window
                .emit("data-changed", ())
                .map_err(|error| error.to_string())?;
        }
        Action::QuickTask => {
            desktop::change_mode(&window, &data, Mode::Full, true)?;
            window
                .emit("quick-task", ())
                .map_err(|error| error.to_string())?;
        }
        Action::Mode => {
            desktop::change_mode(&window, &data, state.mode.next(), false)?;
            desktop::show(&window).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::Hotkeys;

    #[test]
    fn shortcuts_normalize_aliases_and_require_a_modifier() {
        let mut keys = Hotkeys::default();
        assert_eq!(keys.parse().unwrap().len(), 4);
        keys.cycle_mode = "Control+Alt+F".into();
        assert!(keys.parse().err().unwrap().contains("more than one action"));
        keys.cycle_mode = "M".into();
        assert!(keys.parse().err().unwrap().contains("Add Ctrl"));
    }
}
