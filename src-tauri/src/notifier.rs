use crate::{data::Data, desktop};
use serde::{Deserialize, Serialize};
use std::{
    sync::mpsc::{self, SyncSender},
    time::Duration,
};
use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;

struct Notifier(SyncSender<()>);

#[derive(Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
enum Level {
    Normal,
    Near,
    Over,
}

#[derive(Serialize, Deserialize)]
struct Announcement {
    estimate_ms: i64,
    level: Level,
}

pub fn start(app: &AppHandle) {
    let (send, receive) = mpsc::sync_channel(1);
    app.manage(Notifier(send));
    let app = app.clone();
    std::thread::spawn(move || loop {
        match inspect(&app) {
            Ok(Some(delay)) => {
                if let Err(mpsc::RecvTimeoutError::Disconnected) = receive.recv_timeout(delay) {
                    break;
                }
            }
            Ok(None) => {
                if receive.recv().is_err() {
                    break;
                }
            }
            Err(error) => {
                eprintln!("Dev Focus could not schedule an estimate notification: {error}");
                if receive.recv().is_err() {
                    break;
                }
            }
        }
    });
}

pub fn wake(app: &AppHandle) {
    if let Some(notifier) = app.try_state::<Notifier>() {
        let _ = notifier.0.try_send(());
    }
}

fn inspect(app: &AppHandle) -> Result<Option<Duration>, String> {
    let data = app.state::<Data>();
    if !desktop::preferences(&data)?.notifications {
        return Ok(None);
    }
    let Some(budget) = data.active_budget()? else {
        return Ok(None);
    };
    let near = budget.estimate_ms.saturating_mul(85).saturating_add(99) / 100;
    let over = budget.estimate_ms.saturating_add(1);
    let level = if budget.elapsed_ms >= over {
        Level::Over
    } else if budget.elapsed_ms >= near {
        Level::Near
    } else {
        Level::Normal
    };
    if level != Level::Normal {
        let key = format!("notification.task.{}", budget.task_id);
        let previous = data.get_setting::<Announcement>(&key)?;
        if !previous
            .is_some_and(|item| item.estimate_ms == budget.estimate_ms && item.level >= level)
        {
            let title = if level == Level::Over {
                "Estimate exceeded"
            } else {
                "Approaching your estimate"
            };
            let result = app
                .notification()
                .builder()
                .title(title)
                .body(&budget.name)
                .show();
            if let Err(error) = result {
                eprintln!("Dev Focus could not show the estimate notification: {error}");
            }
            data.set_setting(
                &key,
                &Announcement {
                    estimate_ms: budget.estimate_ms,
                    level,
                },
            )?;
        }
    }
    let next = match level {
        Level::Normal => near,
        Level::Near => over,
        Level::Over => return Ok(None),
    };
    // Windows wait time can exclude suspended time. Recheck the wall clock after at most 15 seconds.
    Ok(Some(Duration::from_millis(
        (next - budget.elapsed_ms).clamp(50, 15_000) as u64,
    )))
}
