use serde::Serialize;
use std::{sync::Mutex, time::Duration};
use tauri::{AppHandle, State};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Default)]
pub struct PendingUpdate(Mutex<Option<Update>>);

#[derive(Serialize)]
#[serde(tag = "status", rename_all = "lowercase")]
pub enum UpdateStatus {
    Unconfigured,
    Current,
    Available {
        version: String,
        notes: Option<String>,
    },
}

#[tauri::command]
pub async fn check_for_updates(
    app: AppHandle,
    pending: State<'_, PendingUpdate>,
) -> Result<UpdateStatus, String> {
    let configured = app.config().plugins.0.get("updater").is_some_and(|config| {
        config
            .get("pubkey")
            .and_then(serde_json::Value::as_str)
            .is_some_and(|key| !key.trim().is_empty())
            && config
                .get("endpoints")
                .and_then(serde_json::Value::as_array)
                .is_some_and(|endpoints| !endpoints.is_empty())
    });
    if !configured {
        return Ok(UpdateStatus::Unconfigured);
    }

    *pending.0.lock().map_err(|error| error.to_string())? = None;
    let update = app
        .updater_builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|error| error.to_string())?
        .check()
        .await
        .map_err(|error| error.to_string())?;
    let Some(update) = update else {
        return Ok(UpdateStatus::Current);
    };
    let status = UpdateStatus::Available {
        version: update.version.clone(),
        notes: update.body.clone(),
    };
    *pending.0.lock().map_err(|error| error.to_string())? = Some(update);
    Ok(status)
}

#[tauri::command]
pub async fn install_update(pending: State<'_, PendingUpdate>) -> Result<(), String> {
    let update = pending
        .0
        .lock()
        .map_err(|error| error.to_string())?
        .take()
        .ok_or("Check for a signed update before installing it.")?;
    let result = update.download_and_install(|_, _| {}, || {}).await;
    if let Err(error) = result {
        *pending.0.lock().map_err(|error| error.to_string())? = Some(update);
        return Err(error.to_string());
    }
    Ok(())
}
