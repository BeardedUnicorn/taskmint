# Web support plan (approved 2026-10-25)

Status: P0 (spikes, ADR), P1 (monorepo move), P2 (shared TS config), P3 (frontend seam), P4 (core extraction), P5 (command layer and LocalBackend), P6 (contracts codegen), P7 (desktop Rust to 100%), P8 (server auth), P9 (server workspace and realtime), P10 (the web app), P11 (stack hardening) and P12 (desktop server mode) are done; see [ADR 0001](adr/0001-web-support.md) for what the spikes established.


## Context

TaskMint only runs as a Tauri desktop app. Every session, timer, work-log, restore, and reset rule lives in Rust (`src-tauri/`, about 9.3k lines, 156 tests). The webview reaches it through 38 `invoke` commands and 12 events. In a plain browser, sessions, work logs, and backups fail.

The goal: TaskMint runs in any browser against a server with **multiple invite-only accounts**. The desktop app can optionally use that same server, so the data is the same everywhere; local-only mode stays the default. Everything is reorganised as a **monorepo**, with a **Docker image per service**, a **compose stack** for local testing, and **100% coverage in every package**.

Decisions you made:
- **Server:** Rust axum + PostgreSQL. The business rules move into a shared `taskmint-core` crate, so there is one implementation.
- **Auth:** invite-only accounts (admin-created invite links), with admin-issued password-reset links. No email server.
- **Desktop:** gains a "use a server" mode. No offline sync.
- **Extension:** targets either the desktop (as today) or a server URL plus a per-user API token.
- **Hosting:** local compose only for now, with production-shaped images.

Baseline: vitest floors are 71/75/79/78 (branches/functions/lines/statements). Rust has no coverage tooling. The extension (plain JS) has no tests.

## Key design decisions

1. **Functional core, thin shells.** `taskmint-core` does no I/O, no async, and never reads the clock. The flow is `Command::parse(name, args)`, then `execute(cmd, &mut Workspace, &Ctx)`, which returns `Executed { reply, dirty, backups, events }`. Each host (desktop or server) owns only *lock → load → execute → backup → save → publish*: about 40 lines per host, instead of glue for every command.
2. **Desktop reaches the server through Rust, never from the webview.** The webview always speaks Tauri IPC. Rust picks `LocalBackend` (JSON files plus core in process) or `RemoteBackend` (reqwest plus SSE, with events re-emitted to the webview).
   - The tray, idle monitor, capture server, and deep links all keep working in server mode.
   - The token stays in the OS keychain, out of JS.
   - The desktop CSP is unchanged.
   - The server needs **no CORS at all**: the browser is same-origin through nginx, and the extension is exempt for hosts it has been granted.
3. **One React package (`packages/client`) with two thin shells (`apps/desktop`, `apps/web`).** The client depends on a `Backend` interface only; pnpm's strict node_modules keeps `@tauri-apps/*` out of it.
4. **Postgres stores one JSONB row per record** (sessions, ledger entries, mappings, app records), plus a per-user `workspaces` lock row.
   - Core runs unchanged on `Vec<TaskSession>`. A before/after diff writes only the rows that changed.
   - A row that fails to parse is skipped and **never overwritten**.
   - Rejected alternatives: one document per user (megabytes rewritten on every timer click) and normalized columns (core would need re-modelling).
5. **The API is RPC for core commands and REST for everything else.** `POST /api/v1/commands/:name` uses the same names, the same camelCase args, and the exact same error strings as today's Tauri commands. Auth, invites, tokens, admin, and capture are REST.
6. **Time zone is explicit.** `Ctx.zone: DayZone { Local | Named(Tz) }`.
   - Desktop local mode passes `Local`, so behaviour is byte-identical to today.
   - Web and desktop server mode send `X-TaskMint-TZ` (IANA). The server falls back to `users.time_zone`.
7. **Tasks come from the `predefinedTasks` record** on both hosts. Saving that record runs the rate fill and rename sync in the same unit of work.
   - That fixes "Rust doesn't know tasks until the frontend mirrors them".
   - `update_tasks` stays a compatibility alias until the frontend stops calling it. The unused `update_session` is dropped.
8. **Records carry a revision.** `set_app_record` accepts an optional `baseRevision` and returns a conflict on mismatch. A new `app-records-changed {key, revision}` event refreshes other tabs and devices, so a stale tab can't silently erase another device's edit.
9. **Contracts are generated, not hand-paired.** ts-rs generates the wire types. Golden tests generate the command, event, error, capture, and record-key constants into `packages/contracts`. CI fails on drift.
10. **No router library.** The web shell has a tiny path matcher for `/login`, `/invite/:token`, and `/reset/:token`. In-app navigation stays `NavigationContext`.

## 1. Monorepo layout

```
/
├─ package.json  pnpm-workspace.yaml (packages + catalog + allowBuilds)  tsconfig.base.json  vitest.shared.ts
├─ Cargo.toml  Cargo.lock  rust-toolchain.toml (1.93.0 + llvm-tools-preview)
├─ coverage-policy.json   compose.yaml   .env.example   .dockerignore (deny-all)
├─ scripts/ check-coverage-policy.mjs  rust-coverage.mjs  smoke.mjs  verify.sh
├─ docs/ adr/0001-web-support.md  coverage-policy.md  qa/excluded-code-checklist.md
├─ crates/taskmint-core/           all business rules; no I/O (clippy disallowed-methods enforces it)
├─ apps/
│  ├─ desktop/                     @taskmint/desktop: Vite shell (main.tsx, tauriBackend.ts, ServerConnectionSection)
│  │  └─ src-tauri/                desktop crate, package name `taskmint` kept (the bundle executable derives from it)
│  ├─ web/                         @taskmint/web: Vite shell, httpBackend, auth pages, account/tokens/admin
│  │                               sections, nginx template, Dockerfile
│  ├─ server/                      taskmint-server: axum + sqlx, migrations/, Dockerfile, tests/
│  └─ extension/                   @taskmint/extension: MV3 in TypeScript, esbuild, options page
└─ packages/
   ├─ client/                      @taskmint/client: the React app (today's src/ + public/), bootstrap, Backend seam
   └─ contracts/                   @taskmint/contracts: generated wire types and constants
```

- **Cargo workspace:** `members` is core, server, and desktop. **`default-members` is core and server**, because the desktop crate needs WebKitGTK on Linux. Edition 2021 stays everywhere; moving to 2024 would change the idle FFI, so it's a separate task.
- **pnpm catalog:** pins the shared versions (react, vite, vitest, TypeScript, MUI, zod). Packages export source TS via `exports` rather than TS 7 project references.
- **Moves use `git mv` to keep history:**
  - `src/` and `public/` → `packages/client/`
  - `index.html` and `vite.config.ts` → `apps/desktop/`
  - `src-tauri/` → `apps/desktop/src-tauri/`
  - `chrome-extension/` → `apps/extension/`
- **Unchanged:** the identifier `com.taskmint.app`, the productName, and the `taskmint://` scheme. `tauri.conf.json` gets updated paths for `frontendDist`, `beforeDevCommand`, `$schema`, and `version` (now `apps/desktop/package.json`).

## 2. `crates/taskmint-core`

| Module | Lifted from |
|---|---|
| `model/` | `types.rs`, with ts-rs 12 derives behind a `ts` feature (`TS_RS_LARGE_INT=number` in `.cargo/config.toml`) |
| `timer.rs`, `sessions/{start,instances,lifecycle,undo,manual,task_links}.rs` | the pure functions in today's `commands/sessions/*`. `local_day` becomes `zone.day(at)`; `task_rate(tasks, id)` becomes pure |
| `worklogs.rs` | `sync_work_log_task_names`, `upsert_entries`/`upsert_mappings`, `validate_rewrite_group`/`apply_rewrite_group` |
| `records.rs` | `APP_RECORD_KEYS`, `merge_imported_records`, plus `tasks_from_records` (unwraps `{version,data}`, skips bad items) |
| `restore.rs`, `reset.rs` | `restore.rs` lines 58–169; the in-memory part of reset |
| `capture.rs`, `idle.rs`, `notifications.rs` | origin and shape checks, the pinned origin; `idle_tick`, `long_run_tick`, `apply_idle_choice`; `NotificationPrefs::allows` |
| `contract.rs` | every wire-visible constant: the matched error strings (`inactive session`, `Another timer instance is already running`, `timer is not running`, `Export cancelled by user`, `cancelled by user`), capture header/port/path, `WORKLOG_IMPORT_SOURCE`, the max of 50 timers |
| `command/{catalog,execute}.rs`, `workspace.rs`, `diff.rs`, `zone.rs`, `testkit/` | new: `Command` enum (`serde(tag="command", content="args")`, camelCase arg structs, `{}` accepted for no-arg commands), `access() -> {parts, write}`, `Parts` bitflags, `diff_rows`, data-driven conformance scenarios |

Error type: `CoreError { Rejected(String) | InvalidArgs | UnknownCommand | Conflict }`. Messages are byte-identical to today's.

## 3. Desktop host (`apps/desktop/src-tauri`)

- **Split `AppState`:** domain data moves into the backend. Shell state (tray, idle, notification preferences, capture status) goes into `Desktop<R>`.
- **One `Mutex<Workspace>`** replaces the per-field mutexes, so the lock-order rule disappears.
  - A mutation runs on a draft. The dirty parts are saved atomically, and memory is swapped only after the save succeeds. Today, memory can diverge when a save fails.
- **IPC entry point:** `async fn dispatch(command, args)`. It must be async, because sync commands run on the main thread. It routes shell commands locally and everything else through `DataBackend::call(Command)`.
- **`store/json_file.rs` replaces tauri-plugin-store:** the same file shapes, written via tmp + fsync + rename. Fixture-compatibility tests are written against the real plugin first. This also retires the `reload_store` gotcha. `.bak` copies and pruning to 10 stay.
- **`trait Platform`** covers notify, pick save/open/folder, documents_dir, app_data_dir, reveal, open_dir, show_main_window, `render_tray(&TrayMenuSpec)`, register_deep_links, and restart. `trait SecretStore` wraps the keychain.
  - JS dialogs, paths, and reveal move into Rust shell commands (`pick_backup_dir`, `default_backup_dir`, `reveal_path`), and the webview capability shrinks to `core:default`.
- **Tray:** `tray/model.rs` is pure (a menu spec built from a snapshot) and `tray/controller.rs` maps menu ids to backend calls.
  - `ticker.rs` replaces the bare `loop {}` threads.
  - The capture server binds to a configurable address, so tests use `127.0.0.1:0`.
- **Server mode:**
  - `RemoteBackend` (reqwest/rustls, SSE via eventsource-stream, a read cache refreshed on events).
  - Shell commands `connect_server` (username/password → `POST /auth/device-token` → a full-scope token in the keychain), `disconnect_server`, and `get_server_connection`.
  - `upload_local_data` sends the local workspace through `import_app_records` and `restore_backup_data{mode:merge}`, with a warning that live timers get finalized.
  - A `/meta` version check runs on connect, and switching modes restarts the app.
  - The tray and idle monitor act through core commands (`StopLiveTimer`, `PauseLiveTimer`, `StartTask`, `PauseTimerAt`, `ApplyIdleChoice`) against the cache.
  - Captures and deep links are forwarded via `AcceptCapture`.

**As built in P5:**
- **Core command layer** (`taskmint_core::command`):
  - `Command::parse(name, args)` takes the 30 commands by their names and camelCase args. Missing or null args count as `{}`, and unknown keys are ignored, as with Tauri.
  - `access()` gives `{ parts, write }`. `execute(command, &mut Workspace, &Ctx)` returns `Executed { reply, dirty, backups, events, purge_backups }`.
  - `CoreError` is `Rejected | InvalidArgs | UnknownCommand`; P9 added `Conflict` for record revisions.
  - Five commands are new, for the tray, the idle monitor and captures: `stop_live_timer`, `pause_live_timer`, `pause_timer_at`, `apply_idle_choice` and `accept_capture`. The webview doesn't call them; P12's server mode sends them.
- **Workspace:** the sessions, the ledger, the records, the pending capture, and what the host found at load (warnings, and an unreadable records file).
  - Tasks are read from the `predefinedTasks` record (`tasks_from_records`). It looks through a `{ version, data }` wrapper and skips items that don't parse.
  - Saving or importing the tasks record fills in missing rates and follows renames in the same unit of work. `update_tasks` and `update_session` are gone, and the client no longer sends the task list.
- **Backups are data:** a command asks for `Backup::Saved { parts, failure, required }` or `Backup::Incoming { records, failure }`, and the host makes the copy (files on the desktop, `data_snapshots` rows in P9).
- **Desktop:**
  - **`LocalBackend`:** one `Mutex<Workspace>`. A write runs on a clone; the dirty parts are saved, then the clone replaces the live data. If a later file fails, the files saved before it are put back. Reads run on the live data.
  - **`JsonFileStore`** keeps the plugin's pretty-printed format and writes through tmp + fsync + rename. `.bak` copies are pruned to 10.
  - **Fixtures:** `tests/fixtures/plugin-store` was written by tauri-plugin-store 2.4.4. The plugin stays as a dev-dependency, so a test proves it can read what the app writes now.
  - **Startup** repairs stranded timers, stray keys and task links, and saves each repaired file on its own.
- **One async IPC command, `dispatch`:**
  - Its 15 shell commands are in `dispatch.rs`. Everything else goes to the backend by name.
  - Dialogs, the default backup folder and reveal moved to Rust (`pick_backup_dir`, `default_backup_dir`, `reveal_path`).
  - The capability is `core:default` only, and the JS dialog and opener packages are gone.
- **Not yet:**
  - The `DataBackend` trait arrives with its second implementation in P12; `LocalBackend` is concrete until then.
  - The `Desktop<R>` split and the Platform seams are P7.
  - `get_capabilities` is P12.
- **Behaviour changes:**
  - Rates and renames now follow the tasks at launch, since Rust reads the record; before, this happened once the frontend first sent the task list.
  - An import that rewrites days fills in its sessions' rates straight away; before, that waited for the next launch or task edit.
  - The tray menu rebuilds when its listed tasks change, including edits made in the app.
  - A failed save leaves memory as it is on disk. Before, memory kept the change.
  - Invalid-argument errors read "Invalid arguments for start_task: missing field `taskId`" instead of Tauri's wording. A reset writes empty-shaped files (`{"sessions": []}`) instead of `{}`.
- **Conformance:**
  - Nine JSON scenarios live in `crates/taskmint-core/src/testkit/scenarios`.
  - Core runs them in memory and checks that each command changes only the parts it declares and reports every part it changed.
  - The desktop runs them on files, reloading from disk (`tests/conformance.rs`). P9 added the server, over HTTP.
- **Coverage findings:**
  - Core is at 100%, testkit included. `run_all` isn't generic, because llvm-cov scores a generic by one instantiation.
  - Log macro arguments that call methods (`path.display()`, `keys.join(..)`) leave uncovered regions when no logger is installed. The P0 spike only tried plain arguments, so P7 needs a test logger after all.
  - The desktop crate is at 60% regions overall, with the store and backend at about 97%. Their I/O failures are left for P7's failpoints.
- **Checked on real data:** a copy of the installed app's data folder loads with no warnings, and opening it rewrites nothing.

**As built in P7:**
- **Platform seam:** `platform::Platform` covers emit, notify, the save/open/folder dialogs, documents_dir, reveal, open_dir, show_main_window, `render_tray(&TrayMenu)`, `set_tray_status`, has_tray and app_version.
  - `platform/os.rs` implements it on Tauri. It's excluded from coverage and holds calls only.
  - Tests use `platform::fake::FakePlatform`, which records every call, answers dialogs from a queue, and can be told to fail a call mid-test.
- **Shell state:** `AppState` (an `Arc<Shell>`) holds the backend, the platform, the clock, and the tray, idle, notification and capture state.
  - `AppState::open(store, clock, platform)` builds it with `Arc::new_cyclic`, so the backend publishes events and tray updates through the shell without a `tauri::AppHandle`.
  - Nothing outside `app.rs` and `os.rs` touches Tauri. `dispatch` takes only `State<AppState>`, so its tests go through the mock runtime's IPC.
- **Tray:** `tray/model.rs` is pure: a snapshot, the menu and status as data (`TrayMenu`, `TrayStatus`), and `TrayAction::from_id`.
  - `tray/mod.rs` redraws only what changed: the whole menu, compared by value, and the status. That replaces the live-timer key and the 60-second refresh, since the menu shows elapsed minutes. It also runs the menu's actions through backend commands.
- **Ticker and monitors:** `ticker.rs` (a stoppable interval thread) replaces the bare `loop {}` threads.
  - The idle monitor is one `idle::tick(state, idle_ms)`.
  - The capture server is `CaptureServer::start(state, address)`, stopped on drop. Tests bind it to `127.0.0.1:0` and send real HTTP.
- **`app.rs`** (excluded) holds the builder, the plugins, setup wiring and the run loop. `lib.rs` only declares modules.
- **Coverage:** 100% of regions, functions and lines with only `src/main.rs`, `src/app.rs` and `src/platform/os.rs` excluded. `verify.sh` and CI gate it with `--features failpoints`.
  - A `ctor` test logger takes every level, so log arguments run.
  - There's one failpoint: putting a file back after a later save failed.
  - The other error paths are reached with real faults, or restructured where no fault can reach them (see docs/coverage-policy.md).
- **Behaviour changes:**
  - The tray tooltip updates when its minute changes rather than every second, and a menu rebuild follows the same rule.
  - The shell's locks recover from poisoning instead of failing the call.
  - Backups take their timestamp from the shell's clock.
  - `dispatch` now requires `args`; the desktop shell sends `{}` when there are none.
  - A tray call no longer holds a lock while Tauri waits on the main thread. The old code did, which could deadlock against a menu click.
- **Not yet:** `SecretStore` and `platform/keychain.rs` arrive with their first caller, P12's `connect_server`. Built now, they would be an untested keychain adapter with nothing calling it.

**As built in P12:**
- **`DataBackend`** (`backend/mod.rs`) is an enum, `Local(Box<LocalBackend>)` or `Remote(RemoteBackend)`, not a trait.
  - The shell calls it by the webview's command names and JSON arguments: `call(name, args)`. The tray, idle monitor and captures build `json!` arguments instead of typed `Command`s, since `Command` only deserializes.
  - `read(|workspace| …)` reads the live data in local mode, and a copy of the server's sessions and records in server mode.
- **HTTP:** `backend/server_api.rs` uses ureq 2 (blocking, rustls), not reqwest. The shell is threads and blocking calls, and `dispatch` already blocks its async worker on dialogs. A blocking reqwest client would panic inside that runtime.
  - Every request carries `Authorization: Bearer` and `X-TaskMint-TZ` (from `iana-time-zone`; none if unknown, so the account's zone applies).
  - Failures are `Unreachable`, `Unauthorized` (401) or `Refused` (the server's own `error` message). Commands reject with the server's message, as they do on the web.
- **`RemoteBackend`** (`backend/remote.rs`):
  - A command is parsed locally first, so a bad name or bad arguments fail before anything is sent, and `access()` says what it touches. After a successful write, the copy re-reads the sessions and records it may have changed and publishes them, so the tray updates at once.
  - A thread follows `GET /events` through a `Weak` reference. Each forwarded event refreshes what it changed (timer events, sessions, records, work logs) before it reaches the webview. Unknown events are dropped.
  - Each (re)connect refreshes everything and sends the webview `resync`. A dropped or silent stream (45 s against the server's 15 s keep-alive) reconnects with a doubling wait (1 to 30 s). A 401 stops the thread: only signing in again helps.
  - The link (`connecting`, `connected`, `unreachable`, `signedOut`) goes to the webview as the new core event `server-connection-changed` `{status, detail}`. The tray shows a problem as its first line and in its tooltip.
- **Connection** (`server.rs`):
  - `server.json` beside the data files holds `{url, username, deviceName}`. The token is the keychain item `server-token` (`platform/keychain.rs`, keyring 3, excluded from coverage like `os.rs`), behind the `SecretStore` seam.
  - No file means local mode, and so does a file that can't be read. A missing token means signed out.
- **Shell commands:**
  - `get_capabilities` is read before the client starts.
  - `get_server_connection`.
  - `connect_server {url, username, password}`: the URL is checked, then `/meta` (API version 1, `minDesktopVersion`), then a device token named `TaskMint on <device>`. A token or file that can't be kept is signed out again, and a connection it replaces is signed out.
  - `disconnect_server` → `{signedOut}`.
  - `upload_local_data` opens the local files with `LocalBackend` and sends `import_app_records`, then `restore_backup_data` `{mode: merge, exportedAt: now}`. Load warnings are returned.
  - `restart_app` (`Platform::restart`).
  - Switching modes always goes through a restart. Uploading is a separate, confirmed action after connecting, not part of it.
- **Server:** `DELETE /api/v1/auth/device-token` lets a bearer token revoke itself (and end its user's streams). Token management otherwise needs a cookie session, which the desktop doesn't have.
- **Client and desktop TS:**
  - `AppExtensions.StartupErrorActions` puts "Disconnect and use this computer's data" on the startup error in server mode.
  - `apps/desktop` gained React and MUI for `settings/ServerSection.tsx`: connect, sign in again, copy data here, disconnect.
  - Legacy localStorage records are imported only in local mode.
- **Dev builds:** `TASKMINT_DATA_DIR` (debug builds only) points the app at another folder and keychain service (`<identifier>.dev`), so server mode can be tried while the installed app's data is left alone.
- **Tests:**
  - `testing::FakeServer` is a `TcpListener` with canned replies, recorded requests and writable event streams.
  - `tests/server_mode.rs` (`#[ignore]`) runs connect → restart → upload → tray start/stop heard by a second device → disconnect against the real stack. verify.sh runs it on its throwaway stack after the smoke test.
  - Generic test helpers delegate to non-generic ones, since llvm-cov scores a generic by its best instantiation.

## 4. Server (`apps/server`)

**Endpoints** (all under `/api/v1` except health):

| Endpoint | Auth | Notes |
|---|---|---|
| `GET /healthz`, `/readyz`, `/api/v1/meta` | none | readyz pings the DB; meta returns `{version, apiVersion, minDesktopVersion}` |
| `POST auth/login`, `POST auth/logout`, `GET auth/me`, `POST auth/password` | rate-limited / cookie | login sets the cookie and returns `{user, csrfToken}`. A password change revokes other sessions |
| `POST auth/device-token` | credentials in the body, rate-limited | desktop sign-in; returns a `full` token named after the device |
| `GET invites/:token`, `POST invites/:token/accept`, `POST password-resets/:token/accept` | none, rate-limited, Origin check | accept creates the user and workspace row, then logs in |
| `GET/POST/DELETE tokens` | cookie only | scopes `capture` and `full`. The secret is shown once, stored as a SHA-256 hash with a prefix |
| `POST commands/:name` | cookie (plus CSRF) or bearer `full` | always scoped to the caller's user; reads `X-TaskMint-TZ`; 32 MB body limit; 400 `{error, code}` carries the exact core string, 409 means a conflict |
| `GET events` | cookie or bearer `full` | SSE, 15 s keep-alive, `resync` on lag, closed when the user is disabled |
| `POST capture`, `GET capture/ping` | bearer `capture`/`full` + `X-TaskMint-Capture` | Origin must be absent or the pinned extension; 8 MB limit |
| `admin/users`, `admin/invites` | cookie + admin role | disable/enable users and change roles (never remove the last admin); create/revoke invites; `POST users/:id/password-reset` returns a one-time link; actions written to `audit_events` |

**Auth mechanics:**
- **Passwords:** argon2id, run on `spawn_blocking`. An unknown username is checked against a dummy hash, so timing doesn't reveal which accounts exist.
- **Tokens:** every token (`tmk_` + 32 random bytes) is stored as a hash.
- **Cookie:** `taskmint_session`, `HttpOnly; SameSite=Strict`, sliding 30 days. `Secure` follows `TASKMINT_COOKIE_SECURE`.
- **CSRF:** an `X-CSRF-Token` header plus an Origin / `Sec-Fetch-Site` check on unsafe cookie requests.
- **Rate limits:** `governor`, keyed by IP and by (IP, username).
- **First admin:** created from `TASKMINT_ADMIN_USERNAME`/`_PASSWORD` when the users table is empty. Recovery from the CLI: `taskmint-server admin create-invite|reset-password`.
- **Tenant isolation:** user ids never appear in command bodies, and `tests/isolation.rs` proves one user can't read another's data.

**Command execution:**
- **Writes:** `BEGIN`, then `SELECT … FROM workspaces WHERE user_id=$1 FOR UPDATE`. Then load the declared parts (`ORDER BY seq`), `execute`, write the snapshot rows, apply the `diff_rows` upserts and deletes, `version += 1`, and `COMMIT`. Only then does `EventHub` publish, to that user's `tokio::broadcast`.
- **Reads:** a `REPEATABLE READ READ ONLY` transaction.

**Schema** (sqlx migrations embedded, forward-only, `.sqlx` offline data committed):
- `0001_auth`:
  - `users(id, username unique lower, display_name, password_hash, role, time_zone, disabled_at, …)`
  - `invites(token_hash, role, note, created_by, expires_at, used_at, used_by, revoked_at)`
  - `password_resets(user_id, token_hash, created_by, expires_at, used_at)`
  - `auth_sessions(token_hash, csrf_token, user_id, expires_at, last_seen_at, user_agent, ip)`
  - `api_tokens(user_id, name, scope, token_prefix, token_hash, last_used_at, revoked_at)`
  - `audit_events`
- `0002_workspace`:
  - `workspaces(user_id pk, version)`
  - `sessions(user_id, id, seq identity, data jsonb, generated task_id/day/is_active)`
  - `work_log_entries(user_id, id, seq, data)`
  - `project_mappings(user_id, project_id, seq, data)`
  - `app_records(user_id, key check(5 keys), value, revision)`
  - `pending_captures(user_id pk, payload, received_at, source)`
  - `data_snapshots(user_id, kind, reason, data, created_at)`: the server's `.bak`, newest 10 kept

**Config:**
- `TASKMINT_BIND` (`0.0.0.0:3000`)
- `DATABASE_URL`/`PG*`, with `_FILE` variants
- `TASKMINT_PUBLIC_ORIGIN`, `TASKMINT_COOKIE_SECURE`, `TASKMINT_TRUST_PROXY`
- `TASKMINT_SESSION_TTL_DAYS`, `TASKMINT_INVITE_TTL_HOURS`, `TASKMINT_RESET_TTL_HOURS`
- `TASKMINT_MAX_BODY_MB`
- `RUST_LOG`, `TASKMINT_LOG_FORMAT`

**CLI** (clap): `serve | migrate | healthcheck | admin …`.

**As built in P8:**
- sqlx is 0.8.6, because 0.9 needs rustc 1.94. The offline query data is in `apps/server/.sqlx`, and `.cargo/config.toml` sets `SQLX_OFFLINE=true` so builds never need a database.
- Each operation is one SQL statement (CTEs), so a write and its audit row commit together with no explicit transaction.
- Two additions:
  - `GET password-resets/:token`, so the reset page can show whose password it sets.
  - `api_tokens.kind` (`api` or `device`), so the tokens list can tell device tokens apart.
- Accepting an invite creates the user and a session only. The `workspaces` row comes with the user's first change (P9).
- Compose publishes the server on `127.0.0.1:${SERVER_PORT:-3000}` for the Vite proxy, and `db` on `${DB_PORT:-5433}`.
- The image's `test` stage and the compose `test` profile are left for P11.

**As built in P9:**
- **Endpoints:**
  - `POST commands/{name}` (a cookie session with its CSRF token, or a `full` token). The body is the arguments, and an empty one means none.
  - Errors are `{error, code}` with core's message: 400 `rejected`, `invalid_args`, `invalid_body` or `invalid_time_zone`; 404 `unknown_command`; 409 `conflict`.
  - `X-TaskMint-TZ` (`SERVER_API.TIME_ZONE_HEADER` in the contracts) names the zone. Without it the account's `time_zone` is used, and UTC if that isn't a zone.
  - `GET events` is server-sent events named as the desktop's, with JSON data, a 15 s keep-alive and a 64-event buffer. A stream gets `resync` when it falls behind, and every stream gets it after a reset.
  - Streams close when access changes: sign-out, a password change or reset, a revoked token, any admin change to the user. Clients still signed in reconnect.
  - `POST capture` and `GET capture/ping` take a `capture` or `full` token, `X-TaskMint-Capture`, and no Origin or the pinned extension's. They sit outside the CSRF layer, since only bearer tokens reach them, with an 8 MB limit. The ping returns `{app, version, username}`.
- **Store** (`apps/server/src/workspace`):
  - A read is one `SELECT` over the declared parts (`jsonb_agg` per table), so it's one consistent snapshot without a transaction.
  - A change runs lock, load, execute, keep copies, save, commit, then publish. The lock is an upsert on `workspaces`, which also counts `version` and makes the row on the user's first change.
  - Rows keep core's order by `seq`. `diff_rows` writes only changed and new rows; a reorder (a replace-mode restore) writes the whole list again.
  - Rows that can't be read (bad JSON, or a record whose id isn't the row's) are skipped with a load warning ("… They're kept as they are.") and never written over, unless a record with that id comes back.
  - Copies go in `data_snapshots` (kinds `sessions`, `work_logs`, `records`, `incoming_records`; `reason` is the command), inside the change's transaction. So every copy is required on the server: a database that can't take the copy can't take the change either.
  - Reset All Data deletes every row and copy of the user's in one statement.
- **Core:**
  - Records carry revisions (`Workspace.record_revisions`). `get_app_records` and `import_app_records` reply `revisions` for every key (0 for one never saved).
  - `set_app_record` takes an optional `baseRevision` and replies `{ revision }`. A stale base is `CoreError::Conflict(ERR_RECORD_CONFLICT)`. A removed record keeps counting.
  - The desktop keeps revisions in memory and counts afresh at each launch, when its one webview reads the records again.
  - `app-records-changed {key, revision}` goes out for each saved record.
  - A replace-mode restore keeps the first record with each id, since rows are keyed by it. Duplicates count as already present.
  - Also new: `DayZone::named`, `DayZone::UTC`, `events::RESYNC` and `TIME_ZONE_HEADER`.
- **Conformance:**
  - Core's memory host runs each command twice. On the whole workspace (the desktop's way) it checks what the command changed. On just the declared parts (the server's way) it keeps the result, so a command that reads more than it declares fails its scenario.
  - The server passes every scenario over HTTP (`tests/api/conformance.rs`), each as a new user. `resync` is left out there and tested on its own.
  - `tests/api/isolation.rs` shows one account can't see or change another's data or events.
- **Not yet:**
  - Event streams live in the server process, so there's one server instance (`LISTEN/NOTIFY` is deferred).
  - A change loads all of each part it declares, as the desktop holds them in memory. That's fine for one person's history; revisit if it grows large.

## 5. Frontend

**`packages/client/src/backend/`:**
- `Backend { capabilities; call(command, args) → Promise<reply> (rejects with a plain string); subscribe(event, handler) → unsubscribe; platform: { files, notifications, captureStatus, idle?, folderBackups?, reveal? } }`
- `Capabilities { runtime, dataLocation, idleDetection, systemTray, folderBackups, revealInFileManager, notifications, localCaptureServer, accounts, serverConnection }`
- `setBackend`/`getBackend` for non-React services; `BackendProvider`, `useBackend()`, `useCapabilities()`, and `useBackendEvent` (replaces `useTauriEvent`).
- `createFakeBackend()`, exported from `@taskmint/client/testing`.

**Migrating the 15 Tauri-coupled files:**
- **Sessions, work logs, capture, reset:** `useSessionManagement`, `useWorkLogs`, `useWorkLogCapture`, and `useResetAppData` use `call`, and match errors against the generated `CORE_ERRORS`.
- **Files:** `useDataBackup` and `useCsvExport` use `platform.files`. On the web that's a Blob download and `<input type=file>`, where cancel returns `null`.
- **Folder backups:** `useBackupSettings` and `BackupSettingsContext` use `platform.folderBackups`, behind its capability.
- **Idle:** `useIdleReturn`, `useEnhancedTimerSettings`, and `InactivitySettingsSection` use `platform.idle`, behind its capability.
- **Notifications:** `NotificationContext` and `notifications/desktop.ts` use `platform.notifications`.
- **Small call sites:** `utils/reveal.ts` uses `platform.reveal`; `PayoutsPage` uses `platform.captureStatus`; `useEnhancedSystemTray` drops `update_tasks`.
- **`services/appRecords.ts`** becomes always active, which removes the localStorage fallback branches in `StorageService`/`useAppRecord`. It also tracks revisions and refetches on `app-records-changed`; a conflict refetches and shows "changed on another device". The legacy import becomes a desktop-only bootstrap option.
- **Deleted:** `utils/tauri.ts` and the `__TAURI__` global type.

**Test codemod:** the global `vi.mock('@tauri-apps/…')` becomes `createFakeBackend()`. In the 21 test files that mock Tauri, `vi.mocked(invoke)` → `backend.call` and captured `listen` handlers → `backend.emit`. The signature is the same, so the change is mechanical.

**Bootstrap:** `startClient(root, { backend, extensions, importLegacyRecords })` does today's `main.tsx` work. `AppExtensions` lets each shell inject Settings sections, filtered by capabilities.

**As built in P3:**
- **One backend per page, no context.** `setBackend`/`getBackend` hold it (startClient sets it), and hooks call `getBackend()` directly. There's no `BackendProvider`, `useBackend()` or `useCapabilities()`: the backend never changes while a page is open, so a context added nothing, and tests need no provider wrappers.
- **An optional platform feature is its own capability.** `platform.idle`, `folderBackups`, `reveal` and `captureStatus` exist only where they work, and the client checks for the member. `Capabilities` keeps only what no member expresses: `{ runtime, dataLocation }`.
- **Platform API:**
  - `files.save({ contents, suggestedName, format })` resolves to a `SavedFile` (`{kind:'path'}` or `{kind:'download'}`) or `null`; `files.openJson()` resolves to the text or `null`.
  - `notifications.show(kind, title, body)`, plus an optional `setPreferences`.
  - `idle.isSupported/setSettings/getPending/resolve`.
  - `folderBackups.defaultFolder/pickFolder/validateFolder/write`.
  - On the desktop, `apps/desktop/src/tauriBackend.ts` maps each to today's Tauri commands and plugins. It owns `EXPORT_CANCELLED`/`IMPORT_CANCELLED` (a cancelled dialog resolves `null`) and the default backup folder name.
- **Behaviour changes:**
  - Dismissing the import dialog is now silent, like export.
  - The platform's own reasons ("Invalid JSON file", read errors) reach the user; `safeInvoke` used to swallow them.
- **Left for later phases:**
  - `useEnhancedSystemTray` kept sending `update_tasks` until P5, when Rust started reading the tasks from their record.
  - Error matching stays on literal strings until P6 generates `CORE_ERRORS`.
  - Record revisions and `app-records-changed` came in P9; using them (and the conflict message) is P10's.
  - The browser implementations are P10, in `apps/web`: the Blob download, the Web Notification API, and hiding the Idle and Backups settings where those features are missing. The client's old browser fallbacks were deleted with the backend-less preview.
- **Tests:** `src/__tests__/setup/global-mocks.ts` installs one fake backend per test file and starts each test with empty records (`seedAppRecords`). `installFakeBackendForTest({ without: [...] })` swaps in a web-like fake for one test.
- **`apps/desktop` has its own vitest config at 100%**, listed in `coverage-policy.json`. The Tauri JS packages moved there, pinned with `~` to the Rust crates' minor releases (the Tauri CLI rejects a minor mismatch).

**As built in P6:**
- **Generation:** `crates/taskmint-core/tests/contracts.rs` (`cargo test -p taskmint-core --features ts --test contracts`) rebuilds `packages/contracts/src/generated` from scratch:
  - ts-rs 12 types for every wire type. ts-rs is an optional dependency behind core's `ts` feature, configured in code (large ints as `number`), so `.cargo/config.toml` needs no `TS_RS_*` settings.
  - `commands.ts`: `CommandMap`, with each command's args (`void` for none) and reply, plus `CommandName`, `CommandArgs<K>` and `CommandReply<K>`.
  - `constants.ts`: `CORE_ERRORS`, `CORE_ERROR_PARTS` (the substrings clients match), `EVENTS` and `EventName`, `COMMAND_NAMES`, the record keys, sources, start outcomes, idle choices, and the capture and deep-link values.
  - The generator reads contract.rs and fails if any `pub const` there is missing from `constants.ts`.
- **One command table** in `command/catalog.rs` (name, argument type, reply type) gives `COMMAND_NAMES`, `CommandMap`, and `check_reply`.
  - The conformance runner checks every reply against its declared type on every host: the reply must deserialize as that type and serialize back unchanged.
  - A reset's core reply is now a `ResetSummary` with a count of 0, which the host fills in.
- **Drift check:** `scripts/check-contracts.sh` regenerates the files and fails on any unstaged or untracked change in the generated folder. It runs early in verify.sh (before the TypeScript checks) and in CI, and clippy now also lints core with `--features ts`.
- **TypeScript precision:**
  - Input-only defaults are optional (`ts(optional_fields)`, or `ts(as = "Option<…>", optional)`).
  - `StartTaskResult.outcome` and the idle `choice` are literal unions.
  - The snake_case `alias`es on `TimerInstanceUpdates` were dropped: nothing sends them, and ts-rs can't express them.
- **Client:**
  - `Backend.call<K extends CommandName>(command, ...args)` is typed by `CommandMap`; explicit `call<T>` type arguments are gone, and `subscribe` takes an `EventName`.
  - The fake backend stays loosely typed, so tests can make a command return anything; `asBackend(fake)` hands it over as a `Backend`.
  - Session replies are the generated `TaskSession`. `normalizeSession` turns them into the client's types, which add `state`.
  - The client's timer types are now honest: timestamps are the strings the backend sends, not `Date`, and fields can be `null`. About 80 test fixtures changed with them.
  - `buildSynthesizedSession` builds the backend's shape directly, and Undo converts a client timer back with `backendInstance`.
  - The work-log, capture, restore and reset types, `DesktopKind`, `BACKEND_EVENTS`, `APP_RECORD_KEYS`, `MANUAL_SOURCE` and `WORKLOG_IMPORT_SOURCE` now come from the contracts. Error matching uses `CORE_ERROR_PARTS`.
  - `events.test.ts`, which read contract.rs, is gone; the drift check replaces it.
- **Not generated:** the desktop shell's own commands (dialogs, idle, backups, notifications) live in the desktop crate, so `Platform` keeps its hand-written types. Event payloads are untyped beyond their names.

**Web shell:**
- `start.tsx` matches auth routes. Otherwise it calls `GET auth/me`: a 401 goes to `/login?next=`, a 200 calls `startClient(HttpBackend)`.
- **`HttpBackend`:** fetch with `X-CSRF-Token` and `X-TaskMint-TZ`. A 401 calls `onUnauthorized`. It keeps one lazy `EventSource`; on reconnect or a `resync` it fans out the reload events locally.
- **Settings sections:** Account (password, sign out), API tokens (create with a copy-once dialog, revoke, list device tokens), and Users & invites (admin only).
- **Development:** the Vite dev server proxies `/api` to `:3000`. This replaces the backend-less browser preview.
- **Shortcuts:** ⌘N and ⌘, are browser-reserved, so the web drops those two bindings and the palette still offers both commands.
- **Desktop shell:** `TauriBackend` = `invoke('dispatch', {command, args})` + `listen`. Capabilities come from `get_capabilities` before render.

**What runs where:**

| Feature | Desktop local | Desktop server mode | Web |
|---|---|---|---|
| Data commands | LocalBackend | RemoteBackend → server | HttpBackend → server |
| Tray, idle, long-run reminder | yes | yes (local detection, actions on the server) | no; settings hidden |
| Folder backups, reveal | yes | yes | hidden; manual export/import only |
| Capture | localhost:43117 + deep links | same, forwarded to the server | extension → `POST /capture` |
| OS notifications | native | native | Web Notification API, else toast |
| Legacy localStorage record import | yes | no | no |

Device settings (theme, filters, backup schedule, idle) stay in localStorage, per device.

**As built in P10:**
- **`apps/web`** (`@taskmint/web`, 100% covered): `start.tsx` routes `/login`, `/invite/<token>` and `/reset/<token>` to its own pages. Every other path checks `auth/me`: a 401 goes to `/login?next=` (only same-site paths are honoured), and a 200 loads the client (a dynamic import) with `HttpBackend`. Signing in and out reload the page, so each page load has one backend.
- **`server.ts`:** fetch with `X-TaskMint-TZ` (the browser's zone), and `X-CSRF-Token` on a session's changes. Failures are `ServerError { status, code, message }`; no answer is `unreachable`.
- **`HttpBackend`:**
  - Commands go to `POST /commands/{name}`. A failure rejects with the server's message as a plain string, as the desktop's does.
  - One `EventSource` opens with the first subscription.
  - The client listens for `resync` itself, instead of the planned fan-out of reload events. The stream sends it on lag and after a reset; the backend adds one after the browser reconnects a dropped stream.
  - When the server ends the stream for good (a revoked session), the backend checks `auth/me` every 5 s. A 401 there sends the page to sign in.
- **Web platform:** exports are Blob downloads, and imports use `<input type=file>` (null on cancel; "Invalid JSON file: …" as on the desktop). Notifications use the Web Notification API, asking for permission at the first one, and otherwise fall back to the toast.
- **Settings sections:** Account (change password, sign out), API tokens (create with a shown-once dialog, revoke, device tokens marked), and for admins Users (role, disable/enable, reset links) and Invites. The client exports `@taskmint/client/ui` (the theme provider, `SettingsSection`, `ConfirmDialog`, `useNotification`) for them.
- **Client changes:**
  - **Records:** saves send `baseRevision`; a save's new revision is base + 1, as both hosts count. On a conflict the cache takes the newer version, saves queued behind the stale one are dropped, and a warning says the change wasn't saved.
  - **Following other tabs:** `app-records-changed` from elsewhere and `resync` re-read the records. Tasks, notes, templates and `useAppRecord` follow along (`useAppRecordsChanged`).
  - **Other refreshes:** sessions reload on `resync`, the ledger on `work-logs-imported` and `resync`, and a pending capture is taken on `resync`.
  - **Desktop-only parts hidden:** the Idle and Backups sections (and their palette commands) are hidden without `platform.idle` and `folderBackups`. ⌘N and ⌘, are left to the browser.
  - The startup error names the server, not `appdata.json`.
- **Core:** `apply_work_log_import` now always sends `work-logs-imported`, and a restore sends `sessions-changed` and `work-logs-imported` for what it replaced, so other tabs and devices refresh.
- **Image:**
  - `apps/web/Dockerfile` runs `pnpm fetch`, then `install --offline --filter @taskmint/web...` on Node 24, and serves the app with `nginx-unprivileged`.
  - nginx sets CSP (`style-src 'unsafe-inline'` for emotion), nosniff, a Referrer-Policy, COOP and a Permissions-Policy. Hashed assets are immutable. `/api/v1/events` is unbuffered, with a 1 h read timeout.
- **Compose:** `web` runs on `127.0.0.1:${WEB_PORT:-8080}`, read-only, with tmpfs owned by uid 101 for the rendered config and temp files. `TRUST_PROXY` now defaults to true, since nginx adds the client's address. `verify.sh` brings `web` up and checks `/healthz` and `/api/v1/meta` through it.
- **Not yet:** the smoke script and CI's docker job (P11). Saving the account's time zone (the header covers each request).

## 6. Extension (`apps/extension`)

- **Build:** esbuild. `background.ts` is ESM; `content.ts`/`interceptor.ts` are IIFE. The build copies `manifest.json` (the **`key` is kept**, so the extension ID and the desktop's Origin check are unchanged), icons, and `options.html` into `dist/`.
- **Config:** `{kind:'desktop'} | {kind:'server', url, token}`, in `chrome.storage.local`.
- **Options page:**
  - The "Test" button calls `GET capture/ping`.
  - "Save" calls `chrome.permissions.request` for that origin. Manifest: `optional_host_permissions: ["https://*/*","http://*/*"]`.
- **Delivery:**
  - `delivery/desktop.ts` keeps today's behaviour: localhost, then the deep-link fallback.
  - `delivery/server.ts` uses Bearer + `X-TaskMint-Capture`. A 401/403 shows a "Token rejected" badge and pauses retries until the options change.
  - The queue, alarms, and hash dedupe are shared by both.
- **Tests:** vitest + jsdom with a typed `chromeFake.ts`.
- **No Docker image:** CI uploads `dist/` as a zip.

## 7. Docker and compose

- **Server image:**
  - Build: `rust:1.93-slim-trixie`, then cargo-chef (`cook`/`build --release --locked -p taskmint-server`, BuildKit cache mounts, `SQLX_OFFLINE=true`).
  - Runtime: `gcr.io/distroless/cc-debian13:nonroot`, so glibc matches; rustls, so no libssl.
  - `ENTRYPOINT taskmint-server`, `CMD serve`. `HEALTHCHECK` uses the `healthcheck` subcommand, since there's no shell.
  - `Dockerfile.dockerignore` allowlist: root Cargo files, `.sqlx`, `crates/`, `apps/server/`, and the desktop crate's manifest and src (Cargo needs every member).
  - A `test` stage runs llvm-cov.
- **Web image:**
  - Build: `node:24-alpine`, then corepack pnpm, `pnpm fetch`, `install --offline --frozen-lockfile --filter @taskmint/web...` (so no Tauri CLI binaries), and `build` (`ARG VITE_SENTRY_DSN`).
  - Runtime: `nginxinc/nginx-unprivileged:alpine`, from an envsubst template.
  - Routing: SPA fallback, `/api/` → server with `client_max_body_size 32m`, and `/api/v1/events` with `proxy_buffering off`, `proxy_read_timeout 3600s`, HTTP/1.1.
  - Headers: `/healthz`, immutable `/assets`, CSP (`connect-src 'self'` + Sentry ingest), nosniff, Referrer-Policy, COOP.
- **`compose.yaml`:**
  - `db`: `postgres:18-alpine`, volume at `/var/lib/postgresql` (PG18 path), `pg_isready` healthcheck, published on `127.0.0.1:${DB_PORT}` for `sqlx::test`.
  - `migrate`: the server image running `migrate`, after `db` is healthy.
  - `server`: `serve`, after `migrate` completes; `expose 3000`; read_only; `cap_drop ALL`; no-new-privileges.
  - `web`: `${WEB_PORT:-8080}:8080`, after `server` is healthy; read_only with tmpfs.
  - Profile `test`: `server-tests`.
  - `.env.example` holds the admin bootstrap, `COOKIE_SECURE=false`, and `PUBLIC_ORIGIN=http://localhost:8080`.
- **`scripts/smoke.mjs`:** admin login → invite → accept → token → start/stop a timer → assert the SSE event → POST a capture.

**As built in P11:**
- **`scripts/smoke.mjs`** (plain Node, no dependencies) runs through nginx:
  - It checks the security headers on the app, and that the API sends one `nosniff`.
  - The admin (`ADMIN_USERNAME`/`ADMIN_PASSWORD` from the environment or `.env`) invites a user, who accepts and makes a `full` and a `capture` token. An event stream opens with the full token.
  - It saves a task, starts and stops a timer, and posts a capture, waiting for each change's event. A stale `baseRevision` must be refused (409).
  - It checks that a capture token can't run commands, and that the admin can't see the user's data.
  - Revoking the tokens must end the stream. The user is signed out and disabled, and the admin signs out. Failure messages leave out link tokens and secrets.
- **Test profile:** the server Dockerfile's `test` stage has llvm-tools, cargo-llvm-cov 0.9.1, sqlx-cli 0.8.6, and node (copied from `node:24-trixie-slim`, for the coverage policy). The compose `server-tests` service runs `scripts/check-server.sh` against `db`: migrate, `sqlx prepare --check`, then llvm-cov at 100%. Its build is kept in the `server-tests-*` volumes, and the release build copies only the sources, so the test stage's scripts don't rebuild it.
- **CI:** the macOS `check` job skips the server's tests (`--exclude taskmint-server`). A Linux `docker` job runs the test profile, then `up --build --wait`, the smoke test and `down -v`, printing the logs on failure.
- **`verify.sh`:** after the host Rust tests and the core and desktop coverage, it runs the test profile, then builds the images and smoke-tests them as a throwaway project (`taskmint-verify`, ports 18080/13000/15433, a random admin password, `down -v` on exit). The dev stack and its data are untouched.
- **Hardening:**
  - **Compose:** every long-running service is read-only, with no capabilities, no-new-privileges, `json-file` logs at 3 × 10 MB, and memory and pids limits. `db` runs as uid 70 from the start, with tmpfs for its socket, so its entrypoint needs no capabilities. `web` is on a `frontend` network with `server` only; `db` is on `backend`.
  - **nginx:** the headers live in one `security-headers.conf` snippet, included wherever a location adds headers, with CORP and `X-Frame-Options` added. The API's own `nosniff` is hidden, since nginx adds its own.
  - **Shutdown:** a graceful shutdown waited for every response, and an event stream never ends, so with a tab open `docker stop` ended in SIGKILL (exit 137). Now `EventHub::close` ends every stream, and any opened later, when shutdown begins.
  - **Hashing:** argon2 runs one hash per CPU at a time (a semaphore), so the 512 MB limit holds under a burst of sign-ins.

## 8. 100% coverage policy

- **Gates:**
  - TS: lines, branches, functions, and statements, each at 100.
  - Rust: `cargo llvm-cov --fail-under-lines 100 --fail-under-functions 100 --fail-under-regions 100`, on stable (so there's no branch metric).
  - Each crate is measured on its own tests (`--ignore-filename-regex 'crates/'` for server and desktop).
  - `coverage-policy.json` is the single source of exclusions. `check-coverage-policy.mjs` fails CI on any inline `v8/istanbul/c8 ignore` or `coverage(off)`, or if a config drifts from the policy.

| Package | Excluded | Why |
|---|---|---|
| core | nothing | pure |
| server | `src/main.rs` | `#[tokio::main]` + signal wiring only; calls the tested `cli::run` |
| desktop Rust | `src/main.rs`, `src/app.rs`, `src/platform/os.rs`, `src/platform/keychain.rs` | the Tauri builder and run loop; the native tray, dialog, and notification adapters; and keychain prompts. They need a real UI session, so they're logic-free by rule and on the manual QA checklist |
| desktop Rust (implicit) | `cfg(windows/linux)` code | not compiled on the macOS coverage runner. The macOS idle FFI *is* covered (a real call test) |
| all TS | `test/`, `__tests__/`, `*.config.ts`, `*.d.ts`, build scripts | not shipped code; each `main.tsx` is covered by an import test |

- **TS:**
  - Tests get type-checked: each package's tsconfig includes them, and the type errors this exposes get fixed.
  - `packages/client` keeps today's floors through the move, then ratchets with per-glob 100 thresholds slice by slice. New packages start at 100.
  - Boundaries are validated with zod. Defensive `??`/`?.`/default branches that the types make unreachable get deleted, along with environment forks like `process.env.NODE_ENV !== 'test'`, rather than tested.
- **Rust:**
  - Core: unit tests.
  - Server: `Router::oneshot` + `#[sqlx::test]` against real Postgres. **Integration tests count toward the 100%**, stated in the policy, since DB adapters can't be meaningfully unit-tested without a DB.
  - Desktop: `tauri::test::mock_builder` + `get_ipc_response`, `FakePlatform`, an in-memory `SecretStore`, and the capture server on port 0.
  - Infrastructure error paths use the `fail` crate's failpoints (a `failpoints` feature, serial tests). A TRACE-level test logger covers the `log`/`tracing` macro regions.
  - Shared `testkit` conformance scenarios run against core in memory, desktop `LocalBackend` on a temp directory, and the server over HTTP. This gives parity without async/sync trait gymnastics.

## 9. CI (`.github/workflows/ci.yml`)

1. `policy`: runs `check-coverage-policy.mjs`.
2. `js` (ubuntu): install, `pnpm -r typecheck`, `pnpm -r test:coverage`, build web and extension, upload the extension zip.
3. `rust` (ubuntu + `postgres:18` service): fmt; clippy for core and server `-D warnings`; `sqlx prepare --check`; contracts drift (`cargo test -p taskmint-core --features ts golden` + `git diff --exit-code`); llvm-cov for core and server.
4. `desktop` (macos): desktop frontend build (must precede cargo, because `generate_context!` embeds dist), then clippy and llvm-cov for the desktop crate.
5. `docker` (ubuntu, after `js` and `rust`): compose build, `up --wait`, `smoke.mjs`, `down -v`.

Note: GitHub Actions has been `startup_failure` with zero jobs (an account or billing issue). `scripts/verify.sh` runs the same gates locally, and it is the real exit check for each phase.

## 10. Phases

Each phase merges into local `main` (`git merge --no-ff`) with `verify.sh` green, and thresholds are never lowered.

| # | Phase | Size | Needs | Exit |
|---|---|---|---|---|
| P0 | **Baseline + spikes**: ADR, coverage policy, and baseline Rust coverage. Spikes: derive and log-macro regions, ts-rs output, TS 7 with tests type-checked (error count), vitest per-glob thresholds, pnpm `minimumReleaseAge` (default 1440), a mock-IPC async command, `restart()` alongside single-instance | S | – | every spike answered in the ADR |
| P1 | **Monorepo move**, no behaviour change (`git mv`, workspaces, catalog, tauri.conf paths, CI paths, README) | M | P0 | old gates green; `tauri dev` and the bundled build open existing data |
| P2 | **Shared TS config**: tsconfig.base, vitest.shared, tests type-checked and fixed, unused aliases dropped | M | P1 | `pnpm -r typecheck` green |
| P3 | **Frontend seam**: the `Backend` seam, capabilities, fake backend, test codemod, desktop `TauriBackend`, records always active, `startClient` + `AppExtensions` | L | P2 | no `@tauri-apps` in the client; floors held |
| P4 | **Core extraction**: pure lift; `DayZone::Local`; `contract.rs`; 156 tests moved and gaps filled | L | P1 | core 100%; desktop identical |
| P5 | **Command layer + LocalBackend**: tasks from records, `JsonFileStore` (fixtures first), single-mutex draft/swap, async `dispatch`, Rust dialogs/reveal, capability `core:default`, desktop conformance | XL | P3, P4 | conformance green; old files load |
| P6 | **Contracts codegen**: ts-rs + golden constants; client typed by `CommandMap`/`CORE_ERRORS` | M | P5 | drift check; 100% |
| P7 | **Desktop Rust to 100%**: Platform/SecretStore seams, tray model, ticker, failpoints | L | P5 | 100% with only the listed exclusions |
| P8 | **Server auth**: config, CLI, health/meta, migration 0001, login/invites/resets/tokens/admin/audit, rate limits, admin bootstrap, server Dockerfile, compose (db/migrate/server) | L | P1 | 100%; compose services healthy |
| P9 | **Server workspace + realtime**: migration 0002, `PgWorkspaceStore`, `/commands`, TZ header, SSE, capture, record revisions + `app-records-changed`, isolation + conformance | XL | P5, P8 | conformance passes on both hosts; 100% |
| P10 | **Web app**: HttpBackend, auth pages, account/tokens/admin, web platform, conflict UX, web Dockerfile, compose `web` | L | P3, P6, P9 | 100%; browser run through compose |
| P11 | **Stack hardening**: smoke.mjs, CI docker job, test profile, container hardening, README "run the stack" | M | P10 | smoke green |
| P12 | **Desktop server mode**: RemoteBackend, keychain, connect/disconnect/upload, meta check, forwarding, tray/idle via cache | L | P7, P9, P10 | 100%; desktop and web show the same data live |
| P13a | **Extension → TS** + tests, today's behaviour | M | P2 | 100%; loads unpacked, same ID |
| P13b | **Extension server target**: options, optional permissions, token-rejected state | M | P9, P13a | 100%; a capture reaches the web app |
| P14 | **Client to 100%** (about 25k lines), in slices: a) utils/services/types/theme; b) hooks; c) contexts + notifications; d) components/pages + App | XL | P3 | global 100/100/100/100 |
| P15 | **Wrap-up**: security review, excluded-code QA checklist, runbook (pg_dump, admin recovery) | M | all | docs merged |

**Tracks after P2.** Each can run as its own worktree session:
- TS: P3 → P14 slices
- Rust desktop: P4 → P5 → P7 → P12
- Server: P8 (right after P1) → P9
- Extension: P13a

**Critical path:** P1 → P4 → P5 → P9 → P10 → P11.

## 11. Deferred

- **Production hosting:** TLS, a domain, and pg_dump scheduling (documented `docker compose exec db pg_dump` only).
- **Sync and scale:** offline sync; `LISTEN/NOTIFY` for more than one server instance (SSE fan-out is in-process).
- **Settings:** an `accountSettings` record for data-affecting settings.
- **Web parity:** idle detection and the long-run reminder.
- **Email:** email-based flows.
- **Lint:** ESLint/Prettier.

## 12. Risks and gotchas

- **Contracts:** error strings and camelCase are part of the API. `TimerInstance`/`TaskSession` use per-field renames, so keep them. ts-rs 12 (not 10, which drops `skip_serializing_if` attributes) with `TS_RS_LARGE_INT=number`; `Option` maps to `T | null`.
- **Moving the Tauri crate:** keep the identifier, productName, scheme, and bin name. Linux jobs must exclude the desktop crate.
- **Live desktop data:** never run `tauri dev` while the installed TaskMint is open (shared lock, port 43117, data folder). The P1 and P5 checks open real data, so take a backup first.
- **DST:** never load the dayjs `timezone` plugin app-wide. Core's `DayZone::Named` needs DST tests; `Local` must match today byte for byte.
- **Desktop server mode:**
  - Offline means commands fail, and the tray shows "server unreachable".
  - Uploading local data finalizes live timers, so warn first.
  - Version skew is handled by `/meta`.
  - Sessions are dated in the zone of the device that created them (documented).
- **SSE:**
  - nginx buffering must be off.
  - HTTP/1.1 allows six connections per origin, so many open tabs starve (documented).
  - A lagged subscriber gets `resync`.
- **Body limits:** axum's default of 2 MB is too small for restore and import payloads; nginx needs a matching limit.
- **Cookies:** `Secure=false` only for local compose; the `__Host-` prefix only when secure.
- **Images:** PG18 changed the volume path; distroless needs the healthcheck subcommand; read-only nginx needs tmpfs.
- **Extension:** `permissions.request` needs a user click; content scripts must be IIFE.
- **Dependencies:** pnpm `minimumReleaseAge` blocks dependencies younger than a day, so pin older versions.
- **Dev server:** removing the localStorage fallback ends the backend-less preview, so web development needs the server (Vite proxy + compose `db`).

## Verification

- **Every phase:** `scripts/verify.sh`. It runs `pnpm -r typecheck`, `pnpm -r test:coverage`, the coverage-policy check, `cargo fmt --check`, clippy, `cargo llvm-cov` per crate with fail-under 100 (DB from `docker compose up -d db`), `sqlx prepare --check`, and the contracts drift check.
- **Stack (P10+):**
  ```bash
  cp .env.example .env && docker compose up --build -d --wait
  ```
  Then open http://localhost:8080, sign in as the bootstrap admin, create an invite, accept it in a private window, and track time in two tabs, checking that SSE keeps them in sync. Then run:
  ```bash
  node scripts/smoke.mjs
  ```
  The built-in browser drives login, invite, admin, sessions, history, payouts, and export/import.
- **Desktop (you, bundled app; quit the installed app before any dev run):**
  - Local mode unchanged: tray, idle, capture, backups, existing data.
  - Server mode: connect to `http://localhost:8080`, upload local data, and check the same data shows in the browser. A tray start/stop should show up live in the web tab.
- **Extension:** load `apps/extension/dist` unpacked (same ID). Set the target to the server with a capture token, visit the payments page, and check that the web app auto-imports.
