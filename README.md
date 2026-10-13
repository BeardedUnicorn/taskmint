# TaskMint

A desktop time tracker and earnings ledger built with Tauri v2, React and
TypeScript. You track time in sessions against tasks with hourly rates,
reconcile it against work logs imported from DataAnnotation, and see what
you've earned and when it pays out.

## What it does

| Page | What it's for |
|---|---|
| **Sessions** | Pick a task and its timer starts; pause, resume and stop timers inside its session. Live totals for the active session. **Add time** logs a finished timer after the fact (a "Manual" session). |
| **Tasks** | Tasks with hourly rates and default note templates; star favorites; archive tasks you're done with. Time keeps the rate it was tracked at, so changing a rate only affects new time. |
| **Notes** | Free-form or template-based notes on a task (pick it on the Notes page), a session or a timer. A session's notes open from its row, which previews the newest one. |
| **History** | Every tracked, added and imported entry: quick ranges (remembered), search and task filters, totals and charts, the sortable entries table (edit, delete, CSV export), and the daily goal's results over the range. |
| **Calendar** | Earnings, hours and released amounts per day, and the month's totals; click a day for its tasks and releases. |
| **Payouts** | Import DataAnnotation work logs, map projects to tasks, and see available, pending and upcoming releases; daily reconciliation grouped by month. |
| **Settings** | Appearance, funds-release delay, inactivity detection, daily goal, backups, data export/import/reset, privacy, note templates. |

The **system tray** (menu-bar item on macOS) shows the running or paused
timer and can pause, resume or stop it, start a task's timer, or open the app.
Its Start menu lists starred tasks first, then the ones you used most
recently; **Choose Task…** opens the app's start dialog for any other task.
Starting work behaves the same everywhere (tray, Sessions toolbar, the +
button): starting the task that's already active continues its session
(resuming a paused timer); any other task gets a new session with a running
timer. Work starts from existing tasks; create new ones on the Tasks page.
Closing the window hides TaskMint to the tray, where timers keep running; quit
from the tray menu. On macOS, clicking the Dock icon brings the window back.

**Earnings** are rate × time everywhere, at each session's rate (captured when
it started; imported days carry the rate the site's pay implies, so they match
Payouts). With a **daily goal** set, the sidebar shows today's progress live,
and notifications fire at 50%, 75% and 100% as you cross them.

**Inactivity detection** (off by default; Settings → Inactivity Detection)
uses the system idle time, so work in any app counts. When there's been no
keyboard or mouse input for the threshold, the running timer pauses as of when
input stopped, so the away time isn't counted. When you're back, TaskMint comes
to the front and asks whether to discard the away time and resume, keep it and
resume, or stay paused; the tray offers the same choices. This works on macOS
and Windows.

## Where data lives

TaskMint stores everything locally. Nothing is synced anywhere.

| Data | Store |
|---|---|
| Sessions and timer instances | `sessions.json` in the app data dir, owned by the Rust backend |
| Imported work logs and project→task mappings | `worklogs.json` in the app data dir, owned by the Rust backend |
| Tasks, notes, note templates, the daily goal and its history | `appdata.json` in the app data dir, owned by the Rust backend (see below for data from older versions) |
| Settings and UI preferences | The webview's `localStorage` |

App data dir on macOS: `~/Library/Application Support/com.taskmint.app/`.
Before risky operations (a skipped-record load, an import that rewrites days, a
restore), the backend writes timestamped `*.bak-*` copies next to the stores.

**Data from older versions.** Earlier versions kept tasks, notes, templates
and the goal in the webview's `localStorage`. On launch, an installed build
moves any it finds into `appdata.json`: list items are added by id, nothing
already in the file is replaced, a copy of what was moved is saved as
`appdata.json.bak-<time>`, and the `localStorage` copies are then removed.
Development builds (`pnpm tauri dev`) skip this: their webview storage is
separate from the installed app's, but the data folder is shared.

**Backups.** Settings → Data Management exports everything above to one JSON
file (format v2) and imports it back. Import adds what isn't already present
(existing data wins), then the app reloads. Settings → Automatic Backups writes
the same file to a folder daily, weekly or monthly, keeping the newest N.

**Reset.** Settings → Data Management → Reset All Data wipes all three data
files, their `.bak` copies and `localStorage`.

## Browser capture (optional)

`chrome-extension/` is a Chrome extension that captures your DataAnnotation
work logs from the payments page and delivers them to the app over
`http://127.0.0.1:43117`, or through a `taskmint://` link that launches the app
if it's closed. The app accepts localhost deliveries only from this
extension's fixed ID. Payloads that arrive only by link wait in Payouts for
review, since any web page can open a link. When the app window isn't in
front, each capture's result also shows as a desktop notification. See
[chrome-extension/README.md](chrome-extension/README.md).

## Error reporting

If `VITE_SENTRY_DSN` is set at build time, crashes and errors are reported to
Sentry. Reports contain the error and where in the app it happened. Task
names, notes, earnings and work-log data are stripped before sending, and
there's no session replay or tracing. Turn it off in Settings → Privacy.

## Development

**Prerequisites:** Node 20+ (24 recommended), pnpm (pinned via
`packageManager`; `corepack enable` picks it up), and stable Rust.

```bash
pnpm install
pnpm tauri dev      # desktop app with hot reload (Vite on :1420)
pnpm dev            # UI only in a browser; no Rust backend, so sessions won't load
```

**Quit the installed TaskMint before running `pnpm tauri dev`.** Dev and
release builds share the app identifier, so they share the data dir. The
single-instance lock and the capture server port also collide.

Copy `.env.example` to `.env` to set a Sentry DSN; otherwise reporting stays
off.

### Checks

```bash
pnpm build                        # tsc + vite build
pnpm test                         # vitest
pnpm test:coverage                # vitest with enforced coverage floors
cd src-tauri && cargo test        # backend unit tests
cd src-tauri && cargo clippy --all-targets -- -D warnings
cd src-tauri && cargo fmt --check
```

CI (`.github/workflows/ci.yml`) runs all of these on pushes to `main` and on
pull requests.

### Building

```bash
pnpm tauri build    # .dmg on macOS, NSIS installer on Windows
pnpm build:win      # cross-compile the Windows installer from macOS (needs cargo-xwin)
```

### Logs

The backend logs through `tauri-plugin-log` to stdout and to the app log dir
(`~/Library/Logs/com.taskmint.app/` on macOS). Release builds log `info` and
above, dev builds include `debug`.

## Project layout

```
src/                     React frontend
  components/pages/      One folder/file per page (payouts/, settings/, tasks/)
  contexts/              App-wide providers: sessions, tasks, work logs, backups, …
  hooks/                 Data hooks (useSessionManagement, useWorkLogs, useDataBackup, …)
  services/              Tasks, notes, templates (appRecords.ts: the appdata.json cache)
  utils/                 Pure logic: time math, payouts, work-log import, Sentry
  types/                 Shared types and zod schemas
src-tauri/               Rust backend
  src/commands/          IPC commands (sessions, worklogs, restore, backup, reset, …)
  src/storage.rs         sessions.json / worklogs.json / appdata.json persistence and .bak copies
  src/capture_server.rs  localhost capture server and taskmint:// deep links
  src/tray.rs            System tray
  config.toml            Build-time constants (generated into Rust by build.rs)
  capabilities/          Frontend permission grants
chrome-extension/        Work-log capture extension (MV3)
```
