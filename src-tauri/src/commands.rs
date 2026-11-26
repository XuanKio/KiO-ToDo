use crate::data::{Data, ProjectInput, QuickTaskPreview, Snapshot, TaskInput};
use tauri::{AppHandle, State};

type Result<T> = std::result::Result<T, String>;

#[tauri::command]
pub fn snapshot(data: State<'_, Data>) -> Result<Snapshot> {
    data.snapshot()
}

#[tauri::command]
pub fn save_task(app: AppHandle, data: State<'_, Data>, input: TaskInput) -> Result<Snapshot> {
    let snapshot = data.save_task(input)?;
    crate::notifier::wake(&app);
    Ok(snapshot)
}

#[tauri::command]
pub fn duplicate_task(data: State<'_, Data>, id: i64) -> Result<Snapshot> {
    data.duplicate_task(id)
}

#[tauri::command]
pub fn save_project(data: State<'_, Data>, input: ProjectInput) -> Result<Snapshot> {
    data.save_project(input)
}

#[tauri::command]
pub fn preview_tasks(text: String) -> Result<QuickTaskPreview> {
    crate::data::preview_tasks(&text)
}

#[tauri::command]
pub fn import_tasks(
    data: State<'_, Data>,
    text: String,
    project_id: Option<i64>,
) -> Result<Snapshot> {
    data.import_tasks(&text, project_id)
}

#[tauri::command]
pub fn reorder_tasks(data: State<'_, Data>, ids: Vec<i64>) -> Result<Snapshot> {
    data.reorder_tasks(&ids)
}

#[tauri::command]
pub fn start_task(app: AppHandle, data: State<'_, Data>, id: i64) -> Result<Snapshot> {
    let snapshot = data.start_task(id)?;
    crate::notifier::wake(&app);
    Ok(snapshot)
}

#[tauri::command]
pub fn pause_task(app: AppHandle, data: State<'_, Data>, id: i64) -> Result<Snapshot> {
    let snapshot = data.pause_task(id)?;
    crate::notifier::wake(&app);
    Ok(snapshot)
}

#[tauri::command]
pub fn complete_task(app: AppHandle, data: State<'_, Data>, id: i64) -> Result<Snapshot> {
    let snapshot = data.complete_task(id)?;
    crate::notifier::wake(&app);
    Ok(snapshot)
}

#[tauri::command]
pub fn reopen_task(data: State<'_, Data>, id: i64) -> Result<Snapshot> {
    data.reopen_task(id)
}

#[tauri::command]
pub fn save_session(
    app: AppHandle,
    data: State<'_, Data>,
    id: Option<i64>,
    task_id: i64,
    started_at: i64,
    ended_at: i64,
) -> Result<Snapshot> {
    let snapshot = data.save_session(id, task_id, started_at, ended_at)?;
    crate::notifier::wake(&app);
    Ok(snapshot)
}

pub fn toggle_timer(data: &Data) -> Result<Snapshot> {
    data.toggle_timer()
}
