# TaskMint

A desktop time tracker and earnings ledger built with Tauri v2, React and
TypeScript. You track time in sessions against tasks with hourly rates,
reconcile it against work logs imported from DataAnnotation, and see what
you've earned and when it pays out.

## What it does

| Page | What it's for |
|---|---|
| **Sessions** | Pick a task and its timer starts; pause, resume and stop timers inside its session (each day's work gets its own session). Live totals for the active session. The list shows the last 30 days (older ones a click away) and filters by source. **Add time** logs a finished timer after the fact (a "Manual" session). |
| **Tasks** | Tasks with hourly rates and default note templates; start one, star favorites, archive tasks you're done with. Each task lists its newest entries and opens History for the rest. Time keeps the rate it was tracked at, so changing a rate only affects new time. |
| **Notes** | Free-form or template-based notes on a task (pick it on the Notes page), a session or a timer. A session's notes open from its row, which previews the newest one. Note templates have their own tab. |
| **History** | Every tracked, added and imported entry: quick ranges (remembered), search and task filters, totals and charts, the sortable entries table (edit, move an entry to another task, delete, CSV export; imported days are read-only, since each import rebuilds them), and the daily goal's results over the range. |
| **Calendar** | Earnings, hours and released amounts per day, and the month's totals; click a day for its tasks and releases. |
| **Payouts** | Import DataAnnotation work logs and see available, pending and upcoming releases, when the last import was, and a daily reconciliation grouped by month. **Project mappings** lists which task each project goes to; moving a project moves its past imported days too. |
| **Settings** | Appearance, funds-release delay, idle detection and the long-run reminder, daily goal, backups, data export/import/reset, privacy. |

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

**Inactivity detection** (off by default; Settings → Idle & Reminders)
uses the system idle time, so work in any app counts. When there's been no
keyboard or mouse input for the threshold, the running timer pauses as of when
input stopped, so the away time isn't counted. When you're back, TaskMint comes
to the front and asks whether to discard the away time and resume, keep it and
resume, or stay paused; the tray offers the same choices. This works on macOS
and Windows.

The **long-run reminder** (on by default, after 4 hours) sends a notification
when a timer has run that long without a pause, for the timer you forgot to
stop. It works with inactivity detection off.

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
restore), the backend writes timestamped `*.bak-*` copies next to the stores,
keeping the newest 10 of each.

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
the same file to a folder daily, weekly or monthly, keeping the newest N. They
start on (weekly, into `Documents/TaskMint Backups`; macOS asks once for access
to Documents) unless you've saved a backup setting before.

**Reset.** Settings → Data Management → Reset All Data wipes all three data
files, their `.bak` copies and `localStorage`.

## Browser capture (optional)

`apps/extension/` is a Chrome extension that captures your DataAnnotation
work logs from the payments page and delivers them to the app over
`http://127.0.0.1:43117`, or through a `taskmint://` link that launches the app
if it's closed. The app accepts localhost deliveries only from this
extension's fixed ID. Payloads that arrive only by link wait in Payouts for
review, since any web page can open a link. When the app window isn't in
front, each capture's result also shows as a desktop notification. See
[apps/extension/README.md](apps/extension/README.md).

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

`scripts/verify.sh` runs every gate below in order; run it before merging.

```bash
pnpm typecheck                    # tsc for sources and tests, every package
pnpm build                        # tsc for every package + desktop vite build
pnpm test                         # vitest in every package
pnpm test:coverage                # vitest with enforced coverage floors
cargo test                        # Rust workspace tests (server tests need DATABASE_URL; see "Server")
cargo clippy --workspace --all-targets -- -D warnings
cargo fmt --all --check
node scripts/check-coverage-policy.mjs   # see docs/coverage-policy.md
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

## Server

`apps/server` (`taskmint-server`) is the multi-user server that the web app,
and later the desktop app's server mode, talk to: Rust, axum and PostgreSQL.
Accounts are invite-only: an admin hands out one-time invite and
password-reset links, and there's no email. So far it does accounts and
sign-in (phase P8 of [the web-support plan](docs/web-support-plan.md)); the
time-tracking API comes next.

### Run it with Docker

```bash
cp .env.example .env    # optional: every value has a default
docker compose up --build -d --wait db migrate server
curl http://127.0.0.1:3000/healthz
```

- `db`: Postgres 18, published on `127.0.0.1:${DB_PORT:-5433}` (5433, since a
  local Postgres often has 5432).
- `migrate`: applies the database migrations, then exits.
- `server`: the API, on `127.0.0.1:${SERVER_PORT:-3000}`. Read-only root
  filesystem, no Linux capabilities, non-root user.

`docker compose down` stops the stack; `down -v` also deletes the database.

**The first admin.** Set `ADMIN_USERNAME` and `ADMIN_PASSWORD` in `.env`
before the first start: when the server starts with no users, it creates
that admin. To recover access later, print a one-time link from the
command line:

```bash
docker compose exec server taskmint-server admin create-invite --role admin
docker compose exec server taskmint-server admin reset-password <username>
```

### API

Everything except the health checks is under `/api/v1`. Errors are JSON
`{"error": "…", "code": "…"}`.

| Endpoint | Who | What |
|---|---|---|
| `GET /healthz`, `GET /readyz` | anyone | the process is up; the database answers too |
| `GET meta` | anyone | `{version, apiVersion, minDesktopVersion}` |
| `POST auth/login` | anyone, rate-limited | sets the session cookie, returns `{user, csrfToken}` |
| `POST auth/logout`, `GET auth/me`, `POST auth/password` | session | a password change signs out the other sessions; `me` also accepts a `full` token |
| `POST auth/device-token` | username and password, rate-limited | a `full` token for the desktop app |
| `GET invites/:token`, `POST invites/:token/accept` | anyone, rate-limited | accepting creates the account and signs it in |
| `GET password-resets/:token`, `POST password-resets/:token/accept` | anyone, rate-limited | sets the password, signs out everywhere, signs in |
| `GET/POST tokens`, `DELETE tokens/:id` | session | API tokens, scope `capture` (browser extension) or `full`; the secret is shown once |
| `GET admin/users`, `PATCH admin/users/:id`, `POST admin/users/:id/password-reset` | admin session | disable/enable and change roles (never the last active admin); reset links |
| `GET/POST admin/invites`, `DELETE admin/invites/:id` | admin session | invite links with a role and a note |

**Sessions** are an `HttpOnly`, `SameSite=Strict` cookie that slides to 30
days on use. Requests that change something and use the cookie must send the
session's CSRF token in `X-CSRF-Token`, and cross-origin ones are refused
(`Sec-Fetch-Site`/`Origin`). There's no CORS: browsers reach the API through
the web app's origin. **Tokens** go in `Authorization: Bearer tmk_…`.
Passwords are hashed with argon2id; tokens, cookies and links are stored as
SHA-256 hashes. Disabling a user signs them out and revokes their tokens.
Admin actions, password changes and token changes go to `audit_events`.

### Configuration

Environment variables; each also accepts `<NAME>_FILE`, a file holding the
value (for Docker secrets).

| Variable | Default | |
|---|---|---|
| `TASKMINT_BIND` | `0.0.0.0:3000` | listen address |
| `DATABASE_URL` | – | Postgres URL; without it the libpq `PG*` variables are used |
| `TASKMINT_PUBLIC_ORIGIN` | `http://localhost:8080` | where people open the web app: link base and the trusted origin |
| `TASKMINT_COOKIE_SECURE` | `true` | `Secure` cookie named `__Host-taskmint_session`; `false` for plain HTTP |
| `TASKMINT_TRUST_PROXY` | `false` | take the client IP from the last `X-Forwarded-For` hop |
| `TASKMINT_SESSION_TTL_DAYS` | `30` | idle time before a session expires |
| `TASKMINT_INVITE_TTL_HOURS`, `TASKMINT_RESET_TTL_HOURS` | `72`, `24` | link lifetimes |
| `TASKMINT_MAX_BODY_MB` | `32` | request body limit |
| `TASKMINT_ADMIN_USERNAME`, `TASKMINT_ADMIN_PASSWORD` | – | the first admin, created when there are no users |
| `RUST_LOG`, `TASKMINT_LOG_FORMAT` | `info`, `text` | log filter; `json` for one JSON object per line |

The binary's subcommands: `serve`, `migrate`, `healthcheck` (the image's
`HEALTHCHECK`; there's no shell in it), and `admin create-invite|reset-password`.

### Develop and test

The tests run against a real Postgres: each test gets its own fresh
database on the compose `db`.

```bash
docker compose up -d --wait db
export DATABASE_URL=postgres://taskmint:taskmint@127.0.0.1:5433/taskmint
cargo test -p taskmint-server
cargo llvm-cov -p taskmint-server --fail-under-lines 100 --fail-under-functions 100 \
  --fail-under-regions 100 \
  --ignore-filename-regex "$(node scripts/check-coverage-policy.mjs --rust-ignore-regex apps/server)"
```

SQL queries are checked at compile time against `apps/server/.sqlx`, so
builds need no database (`.cargo/config.toml` sets `SQLX_OFFLINE`). After
changing a query or adding a migration, refresh it with sqlx-cli 0.8.6
(`cargo install sqlx-cli --version 0.8.6 --no-default-features --features rustls,postgres --locked`):

```bash
cd apps/server
cargo sqlx migrate run    # bring the compose database up to date
cargo sqlx prepare        # rewrite .sqlx; commit it
```

Migrations are forward-only: never edit one that has shipped.

## Project layout

A pnpm workspace and a Cargo workspace share the repo root. The plan for
running TaskMint in browsers against a server is in
[docs/adr/0001-web-support.md](docs/adr/0001-web-support.md).

```
packages/client/             React app (@taskmint/client)
  src/components/pages/      One folder/file per page (payouts/, settings/, tasks/)
  src/contexts/              App-wide providers: sessions, tasks, work logs, backups, …
  src/hooks/                 Data hooks (useSessionManagement, useWorkLogs, useDataBackup, …)
  src/services/              Tasks, notes, templates (appRecords.ts: the appdata.json cache)
  src/utils/                 Pure logic: time math, payouts, work-log import, Sentry
  src/types/                 Shared types and zod schemas
  public/                    Favicon and logos
apps/desktop/                Desktop app (@taskmint/desktop): Vite entry + Tauri shell
  src-tauri/src/commands/    IPC commands (sessions, worklogs, restore, backup, reset, …)
  src-tauri/src/storage.rs   sessions.json / worklogs.json / appdata.json persistence and .bak copies
  src-tauri/src/capture_server.rs  localhost capture server and taskmint:// deep links
  src-tauri/src/tray.rs      System tray
  src-tauri/src/config.rs    Constants
  src-tauri/capabilities/    Frontend permission grants
apps/extension/              Work-log capture extension (MV3)
apps/server/                 Server (taskmint-server): axum + Postgres, see "Server" above
  migrations/                SQL migrations, embedded in the binary
  .sqlx/                     Query metadata for offline builds (cargo sqlx prepare)
  tests/api/                 HTTP and CLI tests against Postgres
docs/                        ADRs and the coverage policy
```
