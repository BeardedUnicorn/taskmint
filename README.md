# TaskMint

A desktop time tracker and earnings ledger built with Tauri v2, React and
TypeScript. You track time in sessions against tasks with hourly rates,
reconcile it against work logs imported from DataAnnotation, and see what
you've earned and when it pays out.

## What it does

| Page | What it's for |
|---|---|
| **Sessions** | Pick a task and its timer starts; pause, resume and stop timers inside its session. Live totals for the active session. **Add time** logs a finished timer after the fact (a "Manual" session). |
| **Tasks** | Tasks with hourly rates and default note templates; star favorites; archive tasks you're done with. |
| **Notes** | Free-form or template-based notes attached to a task, session or timer. |
| **Time Entries** | Every finished timer as a filterable list; edit durations or delete entries. |
| **Reports** | Totals, earnings and charts over a date range. |
| **Calendar** | Earned and transferable amounts per day. |
| **Payouts** | Import DataAnnotation work logs, map projects to tasks, and see available, pending and upcoming releases. |
| **Settings** | Rounding, funds-release delay, inactivity detection, daily goal, backups, data export/import/reset, privacy, note templates. |

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

## Where data lives

TaskMint stores everything locally. Nothing is synced anywhere.

| Data | Store |
|---|---|
| Sessions and timer instances | `sessions.json` in the app data dir, owned by the Rust backend |
| Imported work logs and project→task mappings | `worklogs.json` in the app data dir, owned by the Rust backend |
| Tasks, notes, note templates, goals, settings | The webview's `localStorage` |

App data dir on macOS: `~/Library/Application Support/com.taskmint.app/`.
Before risky operations (a skipped-record load, an import that rewrites days, a
restore), the backend writes timestamped `*.bak-*` copies next to the stores.

**Backups.** Settings → Data Management exports everything above to one JSON
file (format v2) and imports it back. Import adds what isn't already present
(existing data wins), then the app reloads. Settings → Automatic Backups writes
the same file to a folder daily, weekly or monthly, keeping the newest N.

**Reset.** Settings → Data Management → Reset All Data wipes both stores, their
`.bak` copies and `localStorage`.

## Browser capture (optional)

`chrome-extension/` is a Chrome extension that captures your DataAnnotation
work logs from the payments page and delivers them to the app over
`http://127.0.0.1:43117`, or through a `taskmint://` link that launches the app
if it's closed. The app accepts localhost deliveries only from this
extension's fixed ID. Payloads that arrive only by link wait in Payouts for
review, since any web page can open a link. See
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
  services/              localStorage-backed services (tasks, notes, templates)
  utils/                 Pure logic: time math, payouts, work-log import, Sentry
  types/                 Shared types and zod schemas
src-tauri/               Rust backend
  src/commands/          IPC commands (sessions, worklogs, restore, backup, reset, …)
  src/storage.rs         sessions.json / worklogs.json persistence and .bak copies
  src/capture_server.rs  localhost capture server and taskmint:// deep links
  src/tray.rs            System tray
  config.toml            Build-time constants (generated into Rust by build.rs)
  capabilities/          Frontend permission grants
chrome-extension/        Work-log capture extension (MV3)
```
