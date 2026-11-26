CREATE TABLE projects (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    color TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE tasks (
    id INTEGER PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    description TEXT NOT NULL DEFAULT '',
    estimate_seconds INTEGER NOT NULL DEFAULT 0 CHECK (estimate_seconds >= 0),
    priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'paused', 'completed')),
    tags TEXT NOT NULL DEFAULT '[]',
    category TEXT NOT NULL DEFAULT '',
    due_date TEXT,
    notes TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    completed_at INTEGER,
    CHECK ((status = 'completed') = (completed_at IS NOT NULL))
);

CREATE TABLE subtasks (
    id INTEGER PRIMARY KEY,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
    sort_order INTEGER NOT NULL
);

CREATE TABLE sessions (
    id INTEGER PRIMARY KEY,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    started_at INTEGER NOT NULL CHECK (started_at >= 0),
    ended_at INTEGER CHECK (ended_at >= started_at)
);

CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE INDEX tasks_project_sort ON tasks(project_id, sort_order);
CREATE INDEX subtasks_task_sort ON subtasks(task_id, sort_order);
CREATE INDEX sessions_task_time ON sessions(task_id, started_at);
CREATE INDEX sessions_time ON sessions(started_at);
CREATE UNIQUE INDEX sessions_one_open ON sessions((1)) WHERE ended_at IS NULL;
