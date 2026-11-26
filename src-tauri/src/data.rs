use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::Path,
    sync::{Mutex, MutexGuard},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

type Result<T> = std::result::Result<T, String>;
type DbResult<T> = std::result::Result<T, DataError>;

const MAX_ESTIMATE_SECONDS: i64 = 9_007_199_254_740;

#[derive(Debug)]
enum DataError {
    Sql(rusqlite::Error),
    Json(serde_json::Error),
    Invalid(&'static str),
}

impl From<rusqlite::Error> for DataError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Sql(error)
    }
}

impl From<serde_json::Error> for DataError {
    fn from(error: serde_json::Error) -> Self {
        Self::Json(error)
    }
}

impl From<DataError> for String {
    fn from(error: DataError) -> Self {
        match error {
            DataError::Sql(error) => format!("SQLite: {error}"),
            DataError::Json(error) => format!("Saved data: {error}"),
            DataError::Invalid(message) => message.to_owned(),
        }
    }
}

#[derive(Clone, Copy, Default, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Priority {
    Low,
    #[default]
    Normal,
    High,
    Urgent,
}

impl Priority {
    fn as_str(self) -> &'static str {
        match self {
            Self::Low => "low",
            Self::Normal => "normal",
            Self::High => "high",
            Self::Urgent => "urgent",
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubtaskInput {
    pub id: Option<i64>,
    pub name: String,
    #[serde(default)]
    pub completed: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskInput {
    pub id: Option<i64>,
    pub project_id: Option<i64>,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub estimate_seconds: i64,
    #[serde(default)]
    pub priority: Priority,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub category: String,
    pub due_date: Option<String>,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub subtasks: Vec<SubtaskInput>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Subtask {
    pub id: i64,
    pub name: String,
    pub completed: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: i64,
    pub project_id: Option<i64>,
    pub name: String,
    pub description: String,
    pub estimate_seconds: i64,
    pub priority: String,
    pub status: String,
    pub tags: Vec<String>,
    pub category: String,
    pub due_date: Option<String>,
    pub notes: String,
    pub subtasks: Vec<Subtask>,
    pub sort_order: i64,
    pub created_at: i64,
    pub completed_at: Option<i64>,
    pub actual_ms: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: i64,
    pub name: String,
    pub color: String,
    pub created_at: i64,
}

#[derive(Deserialize)]
pub struct ProjectInput {
    pub id: Option<i64>,
    pub name: String,
    pub color: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickTask {
    pub name: String,
    pub estimate_seconds: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickTaskPreview {
    pub tasks: Vec<QuickTask>,
    pub total_estimate_seconds: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: i64,
    pub task_id: i64,
    pub started_at: i64,
    pub ended_at: Option<i64>,
}

pub struct ActiveBudget {
    pub task_id: i64,
    pub name: String,
    pub estimate_ms: i64,
    pub elapsed_ms: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub tasks: Vec<Task>,
    pub projects: Vec<Project>,
    pub sessions: Vec<Session>,
    pub active_task_id: Option<i64>,
}

pub struct Data(Mutex<Connection>);

impl Data {
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref();
        if let Some(parent) = path
            .parent()
            .filter(|parent| !parent.as_os_str().is_empty())
        {
            fs::create_dir_all(parent).map_err(|error| format!("Database directory: {error}"))?;
        }
        let conn = Connection::open(path).map_err(DataError::from)?;
        Ok(Self::initialize(conn)?)
    }

    fn initialize(mut conn: Connection) -> DbResult<Self> {
        conn.busy_timeout(Duration::from_secs(5))?;
        conn.pragma_update(None, "foreign_keys", true)?;
        conn.pragma_update(None, "journal_mode", "WAL")?;

        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let version: usize = tx.pragma_query_value(None, "user_version", |row| row.get(0))?;
        let migrations = [include_str!("../migrations/001_initial.sql")];
        if version > migrations.len() {
            return Err(DataError::Invalid(
                "This database requires a newer Dev Focus version.",
            ));
        }
        for (index, migration) in migrations.iter().enumerate().skip(version) {
            tx.execute_batch(migration)?;
            tx.pragma_update(None, "user_version", index + 1)?;
        }
        tx.commit()?;
        Ok(Self(Mutex::new(conn)))
    }

    fn lock(&self) -> Result<MutexGuard<'_, Connection>> {
        self.0
            .lock()
            .map_err(|_| "Could not access the database.".to_owned())
    }

    pub fn get_setting<T: DeserializeOwned>(&self, key: &str) -> Result<Option<T>> {
        let conn = self.lock()?;
        let value: Option<String> = conn
            .query_row("SELECT value FROM settings WHERE key = ?1", [key], |row| {
                row.get(0)
            })
            .optional()
            .map_err(DataError::from)?;
        value
            .map(|value| {
                serde_json::from_str(&value).map_err(|error| DataError::from(error).into())
            })
            .transpose()
    }

    pub fn set_setting<T: Serialize>(&self, key: &str, value: &T) -> Result<()> {
        let conn = self.lock()?;
        let encoded = serde_json::to_string(value).map_err(DataError::from)?;
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, encoded],
        )
        .map_err(DataError::from)?;
        Ok(())
    }

    pub fn snapshot(&self) -> Result<Snapshot> {
        let conn = self.lock()?;
        Ok(read_snapshot(&conn)?)
    }

    pub fn active_budget(&self) -> Result<Option<ActiveBudget>> {
        let conn = self.lock()?;
        let now = now_ms();
        conn.query_row(
            "SELECT task.id, task.name, task.estimate_seconds, running.started_at,
                    (SELECT coalesce(sum(closed.ended_at - closed.started_at), 0)
                     FROM sessions closed
                     WHERE closed.task_id = task.id AND closed.ended_at IS NOT NULL)
             FROM sessions running JOIN tasks task ON task.id = running.task_id
             WHERE running.ended_at IS NULL AND task.estimate_seconds > 0",
            [],
            |row| {
                let estimate_seconds: i64 = row.get(2)?;
                let started: i64 = row.get(3)?;
                let closed_ms: i64 = row.get(4)?;
                let running_ms = now.saturating_sub(started).max(0);
                Ok(ActiveBudget {
                    task_id: row.get(0)?,
                    name: row.get(1)?,
                    estimate_ms: estimate_seconds.saturating_mul(1_000),
                    elapsed_ms: closed_ms.saturating_add(running_ms),
                })
            },
        )
        .optional()
        .map_err(|error| DataError::from(error).into())
    }

    fn change(&self, action: impl FnOnce(&Connection) -> DbResult<()>) -> Result<Snapshot> {
        let mut conn = self.lock()?;
        let tx = conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(DataError::from)?;
        action(&tx)?;
        let snapshot = read_snapshot(&tx)?;
        tx.commit().map_err(DataError::from)?;
        Ok(snapshot)
    }

    pub fn save_task(&self, input: TaskInput) -> Result<Snapshot> {
        self.change(|conn| {
            let name = input.name.trim();
            if name.is_empty() {
                return Err(DataError::Invalid("Enter a task name."));
            }
            if !(0..=MAX_ESTIMATE_SECONDS).contains(&input.estimate_seconds) {
                return Err(DataError::Invalid("Estimate is out of range."));
            }
            if input.due_date.as_deref().is_some_and(|date| !valid_date(date)) {
                return Err(DataError::Invalid("Enter a valid due date."));
            }
            let mut tags: Vec<&str> = Vec::new();
            for tag in input.tags.iter().map(|tag| tag.trim()).filter(|tag| !tag.is_empty()) {
                if !tags.contains(&tag) {
                    tags.push(tag);
                }
            }
            let encoded_tags = serde_json::to_string(&tags)?;
            let id = match input.id {
                Some(id) => {
                    task_status(conn, id)?;
                    conn.execute(
                        "UPDATE tasks SET project_id = ?1, name = ?2, description = ?3,
                         estimate_seconds = ?4, priority = ?5, tags = ?6, category = ?7,
                         due_date = ?8, notes = ?9 WHERE id = ?10",
                        params![input.project_id, name, input.description, input.estimate_seconds,
                            input.priority.as_str(), encoded_tags, input.category.trim(),
                            input.due_date, input.notes, id],
                    )?;
                    id
                }
                None => {
                    conn.execute(
                        "INSERT INTO tasks (project_id, name, description, estimate_seconds, priority,
                         tags, category, due_date, notes, sort_order, created_at)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9,
                         (SELECT coalesce(max(sort_order) + 1, 0) FROM tasks), ?10)",
                        params![input.project_id, name, input.description, input.estimate_seconds,
                            input.priority.as_str(), encoded_tags, input.category.trim(),
                            input.due_date, input.notes, now_ms()],
                    )?;
                    conn.last_insert_rowid()
                }
            };
            save_subtasks(conn, id, &input.subtasks)
        })
    }

    pub fn duplicate_task(&self, id: i64) -> Result<Snapshot> {
        self.change(|conn| {
            task_status(conn, id)?;
            conn.execute(
                "INSERT INTO tasks (project_id, name, description, estimate_seconds, priority,
                 tags, category, due_date, notes, sort_order, created_at)
                 SELECT project_id, name || ' (copy)', description, estimate_seconds, priority,
                 tags, category, due_date, notes,
                 (SELECT coalesce(max(sort_order) + 1, 0) FROM tasks), ?2
                 FROM tasks WHERE id = ?1",
                params![id, now_ms()],
            )?;
            let duplicate = conn.last_insert_rowid();
            conn.execute(
                "INSERT INTO subtasks (task_id, name, sort_order)
                 SELECT ?2, name, sort_order FROM subtasks WHERE task_id = ?1",
                params![id, duplicate],
            )?;
            Ok(())
        })
    }

    pub fn save_project(&self, input: ProjectInput) -> Result<Snapshot> {
        self.change(|conn| {
            let name = input.name.trim();
            if name.is_empty() {
                return Err(DataError::Invalid("Enter a project name."));
            }
            let color = input.color.trim();
            if color.len() != 7
                || !color.starts_with('#')
                || !color.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit)
            {
                return Err(DataError::Invalid("Choose a valid project color."));
            }
            let color = color.to_ascii_lowercase();
            match input.id {
                Some(id) => {
                    let changed = conn.execute(
                        "UPDATE projects SET name = ?1, color = ?2 WHERE id = ?3",
                        params![name, color, id],
                    )?;
                    if changed == 0 {
                        return Err(DataError::Invalid("This project no longer exists."));
                    }
                }
                None => {
                    conn.execute(
                        "INSERT INTO projects (name, color, created_at) VALUES (?1, ?2, ?3)",
                        params![name, color, now_ms()],
                    )?;
                }
            }
            Ok(())
        })
    }

    pub fn import_tasks(&self, text: &str, project_id: Option<i64>) -> Result<Snapshot> {
        let preview = preview_tasks(text)?;
        self.change(|conn| {
            if let Some(project_id) = project_id {
                let found = conn.query_row(
                    "SELECT EXISTS (SELECT 1 FROM projects WHERE id = ?1)",
                    [project_id],
                    |row| row.get::<_, bool>(0),
                )?;
                if !found {
                    return Err(DataError::Invalid("The selected project no longer exists."));
                }
            }
            let first_position: i64 = conn.query_row(
                "SELECT coalesce(max(sort_order) + 1, 0) FROM tasks",
                [],
                |row| row.get(0),
            )?;
            let now = now_ms();
            let mut insert = conn.prepare(
                "INSERT INTO tasks (project_id, name, estimate_seconds, sort_order, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
            )?;
            for (index, task) in preview.tasks.into_iter().enumerate() {
                insert.execute(params![
                    project_id,
                    task.name,
                    task.estimate_seconds,
                    first_position + index as i64,
                    now,
                ])?;
            }
            Ok(())
        })
    }

    pub fn reorder_tasks(&self, ids: &[i64]) -> Result<Snapshot> {
        self.change(|conn| {
            if ids.iter().collect::<HashSet<_>>().len() != ids.len() {
                return Err(DataError::Invalid("The task order contains a duplicate."));
            }
            let mut positions = Vec::with_capacity(ids.len());
            let mut read = conn.prepare("SELECT sort_order FROM tasks WHERE id = ?1")?;
            for id in ids {
                let position = read
                    .query_row([id], |row| row.get::<_, i64>(0))
                    .optional()?
                    .ok_or(DataError::Invalid(
                        "A task in the new order no longer exists.",
                    ))?;
                positions.push(position);
            }
            positions.sort_unstable();
            let mut update = conn.prepare("UPDATE tasks SET sort_order = ?1 WHERE id = ?2")?;
            for (id, position) in ids.iter().zip(positions) {
                update.execute(params![position, id])?;
            }
            Ok(())
        })
    }

    pub fn start_task(&self, id: i64) -> Result<Snapshot> {
        self.change(|conn| start(conn, id, now_ms()))
    }

    pub fn pause_task(&self, id: i64) -> Result<Snapshot> {
        self.change(|conn| {
            task_status(conn, id)?;
            pause(conn, id, now_ms())
        })
    }

    pub fn complete_task(&self, id: i64) -> Result<Snapshot> {
        self.change(|conn| {
            if task_status(conn, id)? == "completed" {
                return Ok(());
            }
            let now = now_ms();
            pause(conn, id, now)?;
            conn.execute(
                "UPDATE tasks SET status = 'completed', completed_at = ?2 WHERE id = ?1",
                params![id, now],
            )?;
            Ok(())
        })
    }

    pub fn reopen_task(&self, id: i64) -> Result<Snapshot> {
        self.change(|conn| {
            if task_status(conn, id)? == "completed" {
                conn.execute(
                    "UPDATE tasks SET status = 'todo', completed_at = NULL WHERE id = ?1",
                    [id],
                )?;
            }
            Ok(())
        })
    }

    pub fn save_session(
        &self,
        id: Option<i64>,
        task_id: i64,
        started_at: i64,
        ended_at: i64,
    ) -> Result<Snapshot> {
        self.change(|conn| {
            if started_at < 0 || ended_at <= started_at || ended_at > now_ms() {
                return Err(DataError::Invalid("Enter a valid past work interval."));
            }
            task_status(conn, task_id)?;
            match id {
                Some(id) => {
                    let rows = conn.execute(
                        "UPDATE sessions SET started_at = ?1, ended_at = ?2
                         WHERE id = ?3 AND task_id = ?4 AND ended_at IS NOT NULL",
                        params![started_at, ended_at, id, task_id],
                    )?;
                    if rows == 0 {
                        return Err(DataError::Invalid(
                            "Pause the timer before editing this session.",
                        ));
                    }
                }
                None => {
                    conn.execute(
                        "INSERT INTO sessions (task_id, started_at, ended_at) VALUES (?1, ?2, ?3)",
                        params![task_id, started_at, ended_at],
                    )?;
                }
            }
            Ok(())
        })
    }

    pub fn toggle_timer(&self) -> Result<Snapshot> {
        self.change(|conn| {
            let now = now_ms();
            if let Some(current) = running_task_id(conn)? {
                return pause(conn, current, now);
            }
            let next = conn
                .query_row(
                    "SELECT t.id FROM tasks t WHERE t.status <> 'completed'
                 ORDER BY t.status = 'paused' DESC,
                   (SELECT max(s.ended_at) FROM sessions s WHERE s.task_id = t.id) DESC,
                   t.sort_order, t.id LIMIT 1",
                    [],
                    |row| row.get(0),
                )
                .optional()?;
            if let Some(id) = next {
                start(conn, id, now)?;
            }
            Ok(())
        })
    }
}

pub fn preview_tasks(text: &str) -> Result<QuickTaskPreview> {
    let mut tasks = Vec::new();
    let mut total_estimate_seconds: i64 = 0;
    for (index, line) in text.lines().enumerate() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let error = |message| format!("Line {}: {message}", index + 1);
        let (name, duration) = line
            .rsplit_once(':')
            .ok_or_else(|| error("Enter a task and estimate in the form Task : 30m."))?;
        let name = name.trim();
        if name.is_empty() {
            return Err(error("Enter a task name before the colon."));
        }
        let estimate_seconds = parse_estimate(duration)
            .ok_or_else(|| error("Enter an estimate such as 30m, 4h, or 1h 30m."))?;
        total_estimate_seconds = total_estimate_seconds
            .checked_add(estimate_seconds)
            .filter(|total| *total <= MAX_ESTIMATE_SECONDS)
            .ok_or_else(|| error("The total estimate is out of range."))?;
        tasks.push(QuickTask {
            name: name.to_owned(),
            estimate_seconds,
        });
    }
    if tasks.is_empty() {
        return Err("Enter at least one task.".into());
    }
    Ok(QuickTaskPreview {
        tasks,
        total_estimate_seconds,
    })
}

fn parse_estimate(value: &str) -> Option<i64> {
    fn amount(value: &str) -> Option<i64> {
        let value = value.trim();
        if !value.bytes().all(|byte| byte.is_ascii_digit()) {
            return None;
        }
        value.parse().ok()
    }

    let value = value.trim().to_ascii_lowercase();
    let (hours, minutes) = match value.split_once('h') {
        Some((hours, "")) => (amount(hours)?, 0),
        Some((hours, minutes)) => (amount(hours)?, amount(minutes.strip_suffix('m')?)?),
        None => (0, amount(value.strip_suffix('m')?)?),
    };
    let seconds = hours
        .checked_mul(3_600)?
        .checked_add(minutes.checked_mul(60)?)?;
    (seconds <= MAX_ESTIMATE_SECONDS).then_some(seconds)
}

fn read_snapshot(conn: &Connection) -> DbResult<Snapshot> {
    let mut projects_stmt =
        conn.prepare("SELECT id, name, color, created_at FROM projects ORDER BY id")?;
    let projects = projects_stmt
        .query_map([], |row| {
            Ok(Project {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                created_at: row.get(3)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let mut subtasks_stmt = conn.prepare(
        "SELECT task_id, id, name, completed FROM subtasks ORDER BY task_id, sort_order, id",
    )?;
    let mut subtasks: HashMap<i64, Vec<Subtask>> = HashMap::new();
    let mut rows = subtasks_stmt.query([])?;
    while let Some(row) = rows.next()? {
        subtasks.entry(row.get(0)?).or_default().push(Subtask {
            id: row.get(1)?,
            name: row.get(2)?,
            completed: row.get(3)?,
        });
    }

    let mut sessions_stmt = conn.prepare(
        "SELECT id, task_id, started_at, ended_at FROM sessions ORDER BY started_at DESC, id DESC",
    )?;
    let sessions = sessions_stmt
        .query_map([], |row| {
            Ok(Session {
                id: row.get(0)?,
                task_id: row.get(1)?,
                started_at: row.get(2)?,
                ended_at: row.get(3)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let mut actual: HashMap<i64, i64> = HashMap::new();
    let mut active_task_id = None;
    for session in &sessions {
        if let Some(ended_at) = session.ended_at {
            let duration = actual.entry(session.task_id).or_default();
            *duration = duration.saturating_add(ended_at - session.started_at);
        } else {
            active_task_id = Some(session.task_id);
        }
    }

    let mut tasks_stmt = conn.prepare(
        "SELECT id, project_id, name, description, estimate_seconds, priority, status,
         tags, category, due_date, notes, sort_order, created_at, completed_at
         FROM tasks ORDER BY sort_order, id",
    )?;
    let mut tasks = Vec::new();
    let mut rows = tasks_stmt.query([])?;
    while let Some(row) = rows.next()? {
        let id = row.get(0)?;
        let tags: String = row.get(7)?;
        tasks.push(Task {
            id,
            project_id: row.get(1)?,
            name: row.get(2)?,
            description: row.get(3)?,
            estimate_seconds: row.get(4)?,
            priority: row.get(5)?,
            status: row.get(6)?,
            tags: serde_json::from_str(&tags)?,
            category: row.get(8)?,
            due_date: row.get(9)?,
            notes: row.get(10)?,
            subtasks: subtasks.remove(&id).unwrap_or_default(),
            sort_order: row.get(11)?,
            created_at: row.get(12)?,
            completed_at: row.get(13)?,
            actual_ms: actual.get(&id).copied().unwrap_or(0),
        });
    }
    Ok(Snapshot {
        tasks,
        projects,
        sessions,
        active_task_id,
    })
}

fn save_subtasks(conn: &Connection, task_id: i64, inputs: &[SubtaskInput]) -> DbResult<()> {
    let mut read = conn.prepare("SELECT id FROM subtasks WHERE task_id = ?1")?;
    let mut omitted = read
        .query_map([task_id], |row| row.get::<_, i64>(0))?
        .collect::<rusqlite::Result<HashSet<_>>>()?;
    for (index, input) in inputs.iter().enumerate() {
        let name = input.name.trim();
        if name.is_empty() {
            return Err(DataError::Invalid("Enter a name for each subtask."));
        }
        match input.id {
            Some(id) => {
                if !omitted.remove(&id) {
                    return Err(DataError::Invalid(
                        "A subtask is duplicated or no longer exists.",
                    ));
                }
                conn.execute(
                    "UPDATE subtasks SET name = ?1, completed = ?2, sort_order = ?3 WHERE id = ?4",
                    params![name, input.completed, index as i64, id],
                )?;
            }
            None => {
                conn.execute(
                    "INSERT INTO subtasks (task_id, name, completed, sort_order) VALUES (?1, ?2, ?3, ?4)",
                    params![task_id, name, input.completed, index as i64],
                )?;
            }
        }
    }
    for id in omitted {
        conn.execute("DELETE FROM subtasks WHERE id = ?1", [id])?;
    }
    Ok(())
}

fn task_status(conn: &Connection, id: i64) -> DbResult<String> {
    conn.query_row("SELECT status FROM tasks WHERE id = ?1", [id], |row| {
        row.get(0)
    })
    .optional()?
    .ok_or(DataError::Invalid("This task no longer exists."))
}

fn running_task_id(conn: &Connection) -> DbResult<Option<i64>> {
    Ok(conn
        .query_row(
            "SELECT task_id FROM sessions WHERE ended_at IS NULL",
            [],
            |row| row.get(0),
        )
        .optional()?)
}

fn start(conn: &Connection, id: i64, now: i64) -> DbResult<()> {
    if task_status(conn, id)? == "completed" {
        return Err(DataError::Invalid(
            "Reopen this task before starting its timer.",
        ));
    }
    if let Some(current) = running_task_id(conn)? {
        if current == id {
            return Ok(());
        }
        pause(conn, current, now)?;
    }
    conn.execute(
        "INSERT INTO sessions (task_id, started_at) VALUES (?1, ?2)",
        params![id, now],
    )?;
    conn.execute(
        "UPDATE tasks SET status = 'in_progress' WHERE id = ?1",
        [id],
    )?;
    Ok(())
}

fn pause(conn: &Connection, id: i64, now: i64) -> DbResult<()> {
    let closed = conn.execute(
        "UPDATE sessions SET ended_at = max(?1, started_at) WHERE task_id = ?2 AND ended_at IS NULL",
        params![now, id],
    )?;
    if closed > 0 {
        conn.execute("UPDATE tasks SET status = 'paused' WHERE id = ?1", [id])?;
    }
    Ok(())
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn valid_date(date: &str) -> bool {
    let bytes = date.as_bytes();
    if bytes.len() != 10
        || bytes[4] != b'-'
        || bytes[7] != b'-'
        || !bytes
            .iter()
            .enumerate()
            .all(|(index, byte)| index == 4 || index == 7 || byte.is_ascii_digit())
    {
        return false;
    }
    let year = date[..4].parse::<u16>().unwrap_or_default();
    let month = date[5..7].parse::<u8>().unwrap_or_default();
    let day = date[8..].parse::<u8>().unwrap_or_default();
    let days = match month {
        2 if year % 4 == 0 && (year % 100 != 0 || year % 400 == 0) => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        _ => 0,
    };
    year > 0 && day > 0 && day <= days
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn memory() -> Data {
        Data::initialize(Connection::open_in_memory().unwrap()).unwrap()
    }

    fn task(name: &str) -> TaskInput {
        serde_json::from_value(json!({ "name": name })).unwrap()
    }

    fn create(data: &Data, name: &str) -> i64 {
        data.save_task(task(name)).unwrap().tasks.last().unwrap().id
    }

    #[test]
    fn switching_tasks_closes_and_pauses_the_previous_session() {
        let data = memory();
        let first = create(&data, "Implement movement");
        let next = create(&data, "Build level");
        data.change(|conn| start(conn, first, 1_000)).unwrap();
        let state = data.change(|conn| start(conn, next, 3_500)).unwrap();
        assert_eq!(state.active_task_id, Some(next));
        assert_eq!(state.tasks[0].status, "paused");
        assert_eq!(state.tasks[0].actual_ms, 2_500);
        assert_eq!(state.tasks[1].status, "in_progress");
        assert_eq!(state.sessions[1].ended_at, Some(3_500));

        let state = data.start_task(next).unwrap();
        assert_eq!(state.sessions.len(), 2);
        let state = data.complete_task(next).unwrap();
        assert_eq!(state.tasks[1].status, "completed");
        assert_eq!(state.active_task_id, None);
        assert!(data.start_task(next).is_err());
        let state = data.reopen_task(next).unwrap();
        assert_eq!(state.tasks[1].status, "todo");
        assert_eq!(state.tasks[1].completed_at, None);
        assert_eq!(state.sessions.len(), 2);
    }

    #[test]
    fn pause_and_resume_add_only_time_with_the_timer_running() {
        let data = memory();
        let id = create(&data, "Profile draw calls");
        data.change(|conn| start(conn, id, 1_000)).unwrap();
        let paused = data.change(|conn| pause(conn, id, 3_500)).unwrap();
        assert_eq!(paused.active_task_id, None);
        assert_eq!(paused.tasks[0].status, "paused");
        assert_eq!(paused.tasks[0].actual_ms, 2_500);
        data.change(|conn| start(conn, id, 9_000)).unwrap();
        let paused_again = data.change(|conn| pause(conn, id, 12_500)).unwrap();
        assert_eq!(paused_again.tasks[0].actual_ms, 6_000);
        assert_eq!(paused_again.sessions.len(), 2);
    }

    #[test]
    fn reopening_the_database_preserves_work_and_settings() {
        let path = std::env::temp_dir().join(format!(
            "dev-focus-test-{}-{}.db",
            std::process::id(),
            now_ms()
        ));
        let data = Data::open(&path).unwrap();
        let id = create(&data, "Continue after relaunch");
        let state = data.start_task(id).unwrap();
        data.set_setting("widget", &json!({ "opacity": 0.85 }))
            .unwrap();
        drop(data);

        let reopened = Data::open(&path).unwrap();
        let restored = reopened.snapshot().unwrap();
        assert_eq!(restored.active_task_id, Some(id));
        assert_eq!(
            restored.sessions[0].started_at,
            state.sessions[0].started_at
        );
        assert_eq!(restored.sessions[0].ended_at, None);
        assert_eq!(
            reopened.get_setting::<serde_json::Value>("widget").unwrap(),
            Some(json!({ "opacity": 0.85 }))
        );
        drop(reopened);
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn invalid_subtasks_roll_back_and_duplicate_resets_work_state() {
        let data = memory();
        let input = serde_json::from_value(json!({
            "name": " Draw HUD ",
            "estimateSeconds": 1800,
            "tags": [" UI ", "UI"],
            "dueDate": "2028-02-29",
            "subtasks": [{"name": "Export icons", "completed": true}]
        }))
        .unwrap();
        let original = data.save_task(input).unwrap().tasks.remove(0);
        let bad_edit = serde_json::from_value(json!({
            "id": original.id, "name": "Wrong", "subtasks": [{"id": 999, "name": "Missing"}]
        }))
        .unwrap();
        assert!(data.save_task(bad_edit).is_err());
        data.save_session(None, original.id, 1_000, 2_000).unwrap();
        data.complete_task(original.id).unwrap();

        let snapshot = data.duplicate_task(original.id).unwrap();
        assert_eq!(snapshot.tasks[0].name, "Draw HUD");
        assert_eq!(snapshot.tasks[0].tags, ["UI"]);
        assert!(snapshot.tasks[0].subtasks[0].completed);
        let copy = &snapshot.tasks[1];
        assert_eq!(copy.estimate_seconds, 1800);
        assert_eq!(copy.status, "todo");
        assert_eq!(copy.actual_ms, 0);
        assert!(!copy.subtasks[0].completed);
    }

    #[test]
    fn order_updates_only_the_filtered_slots() {
        let data = memory();
        let a = create(&data, "First");
        let b = create(&data, "Hidden");
        let c = create(&data, "Last");
        let reordered = data.reorder_tasks(&[c, a]).unwrap();
        assert_eq!(
            reordered
                .tasks
                .iter()
                .map(|task| task.id)
                .collect::<Vec<_>>(),
            [c, b, a]
        );
        assert!(data.reorder_tasks(&[a, a]).is_err());
    }

    #[test]
    fn manual_edits_recompute_actual_and_cannot_change_running_sessions() {
        let data = memory();
        let task = create(&data, "Fix light mode");
        let state = data.save_session(None, task, 1_000, 5_000).unwrap();
        let session = state.sessions[0].id;
        assert_eq!(state.tasks[0].actual_ms, 4_000);
        let updated = data
            .save_session(Some(session), task, 2_000, 5_000)
            .unwrap();
        assert_eq!(updated.tasks[0].actual_ms, 3_000);
        let running = data.start_task(task).unwrap();
        assert!(data
            .save_session(Some(running.sessions[0].id), task, 2_000, 5_000)
            .is_err());
        assert!(data.save_session(None, task, 5_000, 2_000).is_err());
    }

    #[test]
    fn quick_input_parses_estimates_and_keeps_colons_in_task_names() {
        let preview = preview_tasks(
            "Setup Scene : 30m\r\n\r\nCore: Gameplay : 4h\r\nTutorial : 1h 30m\r\nVFX : 2H\r\n",
        )
        .unwrap();
        assert_eq!(preview.tasks.len(), 4);
        assert_eq!(preview.tasks[1].name, "Core: Gameplay");
        assert_eq!(preview.tasks[1].estimate_seconds, 14_400);
        assert_eq!(preview.tasks[2].estimate_seconds, 5_400);
        assert_eq!(preview.total_estimate_seconds, 28_800);
        assert_eq!(
            preview_tasks("Quick : 0m").unwrap().total_estimate_seconds,
            0
        );
        assert!(preview_tasks("Some task : -1h").is_err());
        assert!(preview_tasks("Some task : 30s").is_err());
        assert!(preview_tasks("Some task : 100000000000000000000h").is_err());
        assert!(preview_tasks("Some task : 2000000000h\nAnother task : 600000000h").is_err());
        assert!(preview_tasks("  \r\n \n").is_err());
    }

    #[test]
    fn failed_batch_leaves_tasks_unchanged_and_success_assigns_a_project() {
        let data = memory();
        let project = data
            .save_project(ProjectInput {
                id: None,
                name: "Playable Ads".into(),
                color: "#A485FA".into(),
            })
            .unwrap()
            .projects
            .remove(0);
        let existing = create(&data, "Existing");
        let invalid = data
            .import_tasks(
                "Setup Scene : 30m\n\nCore Gameplay : invalid",
                Some(project.id),
            )
            .err()
            .unwrap();
        assert!(invalid.starts_with("Line 3:"));
        assert!(data.import_tasks("Setup Scene : 30m", Some(9_999)).is_err());
        assert_eq!(data.snapshot().unwrap().tasks.len(), 1);

        let snapshot = data
            .import_tasks("Setup Scene : 30m\nCore Gameplay : 4h", Some(project.id))
            .unwrap();
        assert_eq!(snapshot.tasks[0].id, existing);
        assert_eq!(snapshot.projects[0].color, "#a485fa");
        assert_eq!(snapshot.tasks[1].project_id, Some(project.id));
        assert_eq!(snapshot.tasks[2].estimate_seconds, 14_400);

        let state = data
            .save_project(ProjectInput {
                id: Some(project.id),
                name: "Personal Game".into(),
                color: "#7256dd".into(),
            })
            .unwrap();
        assert_eq!(state.projects.len(), 1);
        assert_eq!(state.projects[0].name, "Personal Game");
        assert_eq!(state.projects[0].created_at, project.created_at);
        assert_eq!(state.tasks[1].project_id, Some(project.id));
    }

    #[test]
    fn active_budget_combines_the_open_session_with_closed_time_for_the_active_task() {
        let data = memory();
        let no_estimate = create(&data, "No estimate");
        data.start_task(no_estimate).unwrap();
        assert!(data.active_budget().unwrap().is_none());

        let input = serde_json::from_value(json!({
            "name": "Tune input timing",
            "estimateSeconds": 120
        }))
        .unwrap();
        let id = data.save_task(input).unwrap().tasks.last().unwrap().id;
        data.save_session(None, id, 1_000, 61_000).unwrap();
        data.save_session(None, no_estimate, 1_000, 661_000)
            .unwrap();
        data.change(|conn| start(conn, id, now_ms() - 35_000))
            .unwrap();

        let budget = data.active_budget().unwrap().unwrap();
        assert_eq!(budget.task_id, id);
        assert_eq!(budget.name, "Tune input timing");
        assert_eq!(budget.estimate_ms, 120_000);
        assert!((95_000..100_000).contains(&budget.elapsed_ms));
        data.pause_task(id).unwrap();
        assert!(data.active_budget().unwrap().is_none());
    }
}
