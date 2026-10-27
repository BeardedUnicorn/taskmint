-- Each user's data: the parts the desktop app keeps in its JSON files, one
-- row per record, so a change writes only the records it changed.
-- Forward-only.
--
-- A row's `data` is the record as the desktop stores it (its camelCase
-- JSON), read and written through taskmint-core's types. A row the server
-- can't read is skipped and reported, and never written over.

-- One per user, made by their first change. Every change locks it first, so
-- one user's changes run one at a time; `version` counts them.
CREATE TABLE workspaces (
    user_id    uuid PRIMARY KEY REFERENCES users (id),
    version    bigint NOT NULL DEFAULT 1,
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Sessions, in the order they were added (`seq`).
CREATE TABLE sessions (
    user_id   uuid NOT NULL REFERENCES workspaces (user_id),
    id        text NOT NULL,
    seq       bigint GENERATED ALWAYS AS IDENTITY,
    data      jsonb NOT NULL,
    -- For looking across sessions without reading each one
    task_id   text GENERATED ALWAYS AS (data ->> 'taskId') STORED,
    day       text GENERATED ALWAYS AS (data ->> 'date') STORED,
    is_active boolean GENERATED ALWAYS AS ((data ->> 'isActive') = 'true') STORED,
    PRIMARY KEY (user_id, id)
);
CREATE INDEX sessions_user_seq ON sessions (user_id, seq);

-- The imported work-log ledger.
CREATE TABLE work_log_entries (
    user_id uuid NOT NULL REFERENCES workspaces (user_id),
    id      text NOT NULL,
    seq     bigint GENERATED ALWAYS AS IDENTITY,
    data    jsonb NOT NULL,
    PRIMARY KEY (user_id, id)
);
CREATE INDEX work_log_entries_user_seq ON work_log_entries (user_id, seq);

-- Which task each work-log project's time goes to.
CREATE TABLE project_mappings (
    user_id    uuid NOT NULL REFERENCES workspaces (user_id),
    project_id text NOT NULL,
    seq        bigint GENERATED ALWAYS AS IDENTITY,
    data       jsonb NOT NULL,
    PRIMARY KEY (user_id, project_id)
);
CREATE INDEX project_mappings_user_seq ON project_mappings (user_id, seq);

-- The frontend's records (tasks, notes, templates, the goal), as opaque
-- JSON. A removed record keeps its row, with no value, so its revision
-- keeps counting and a client that saw it before can't save over it.
CREATE TABLE app_records (
    user_id  uuid NOT NULL REFERENCES workspaces (user_id),
    key      text NOT NULL CHECK (key IN (
        'predefinedTasks', 'taskNotes', 'noteTemplates', 'dailyGoal', 'dailyGoalAchievements'
    )),
    value    jsonb,
    revision bigint NOT NULL CHECK (revision > 0),
    PRIMARY KEY (user_id, key)
);

-- The latest browser capture, until the frontend takes it.
CREATE TABLE pending_captures (
    user_id     uuid PRIMARY KEY REFERENCES workspaces (user_id),
    data        jsonb NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now()
);

-- Copies kept before a change that replaces data (a restore, an import that
-- rewrites days, records moving in): what the desktop keeps as .bak files.
-- The newest 10 of each kind are kept; Reset All Data deletes them all.
CREATE TABLE data_snapshots (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    uuid NOT NULL REFERENCES workspaces (user_id),
    kind       text NOT NULL CHECK (kind IN ('sessions', 'work_logs', 'records', 'incoming_records')),
    -- The command that made it
    reason     text NOT NULL,
    data       jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX data_snapshots_user_kind ON data_snapshots (user_id, kind, id);
