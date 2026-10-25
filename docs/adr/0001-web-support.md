# ADR 0001: TaskMint on the web

- **Status:** accepted (2026-10-25)
- **Scope:** monorepo layout, server, web client, desktop server mode, extension targets, Docker, coverage

## Context

TaskMint is a Tauri desktop app. Its session, timer, work-log, restore, and reset rules live in Rust and are reached through 38 `invoke` commands and 12 backend events. A plain browser can't use them, so in a browser sessions, work logs, and backups fail.

We want:
- TaskMint in any browser against a server, with several accounts;
- the desktop app able to use the same server;
- one monorepo with a Docker image per service and a local compose stack;
- 100% test coverage in every package.

## Decisions

1. **Accounts:** multiple accounts, invite-only. Admins create invite links and password-reset links; there is no email server.
2. **Server:** Rust (axum) on PostgreSQL. The business rules move into `crates/taskmint-core`, which both the desktop app and the server use. The core is pure: no I/O, no async, and no clock reads. Hosts do *lock → load → execute → backup → save → publish*.
3. **Desktop server mode goes through Rust**, never through the webview. The tray, idle monitor, capture server, and deep links keep working. The token stays in the OS keychain. Neither the desktop CSP nor the server's CORS policy changes (the server has no CORS at all).
4. **Client:** one React package, `packages/client`, behind a `Backend` interface, with two thin shells, `apps/desktop` and `apps/web`.
5. **Storage:** one JSONB row per record in Postgres, plus a per-user lock row. A record that fails to parse is skipped and never overwritten. Records carry revisions, and a new `app-records-changed` event keeps devices in step.
6. **API:** core commands use RPC, `POST /api/v1/commands/:name`, with the same names, camelCase args, and exact error strings as today's Tauri commands. Auth, invites, tokens, admin, and capture use REST.
7. **Time zones** are explicit through `DayZone { Local | Named(Tz) }`. Desktop local mode keeps using `chrono::Local`.
8. **Tasks** are derived from the `predefinedTasks` record on both hosts. `update_session` is removed.
9. **Contracts:** ts-rs generates the wire types, and golden tests generate the shared constants. CI fails on drift.
10. **Hosting:** local docker compose only for now, with production-shaped images.

The full design and phase list are in [web-support-plan.md](../web-support-plan.md). The sections below record what the P0 spikes established.

## Baseline (2026-10-25, commit 5e7cc3e)

| Area | Lines | Branches / regions | Functions | Tests |
|---|---|---|---|---|
| Frontend (vitest v8) | floor 79 | branches floor 71 | floor 75 | 99 files, ~983 cases |
| Desktop Rust (`cargo llvm-cov`, regions) | 60.05% | 62.79% regions | 53.0% (355/670) | 156 |
| Extension | – | – | – | none |

The Rust files most in need of tests are those at 0%: `lib.rs`, `events.rs`, `commands/{capture,idle,notifications,records,reset,tasks}.rs`. Also low: `startup.rs` (14%), `commands/sessions/instances.rs` (14%), `tray.rs` (32%), and `commands/backup.rs` (34%).

## Spike results

| Question | Answer | Consequence |
|---|---|---|
| Does llvm-cov count `#[derive]` code? | No. Derived impls (serde, Debug, PartialEq, Default) are not instrumented | No exclusion needed for derives |
| Do `log::*!` macros leave uncovered regions? | No, even with no logger installed | No test logger needed for coverage |
| Does test code count? | Yes. `#[cfg(test)]` functions inside a crate are counted | Every test helper must actually run; delete unused ones |
| Can an async Tauri command be tested through IPC? | Yes. `tauri::test::mock_builder()` + `mock_context(noop_assets())` + `get_ipc_response`. The rejection comes back as the plain string (`"inactive session"`) | The desktop `dispatch` is an async command, tested end to end |
| Can a Tauri command reach 100%? | Yes, but `generate_handler!` expands one argument-error closure per argument. It is covered only by an IPC test that omits or mistypes that argument | Every command gets "missing key" and "wrong type" IPC cases. Commands must not be `pub` at the crate root (macro name clash) |
| ts-rs version and attribute parsing | ts-rs **12.0.1**. v10 silently ignored a whole `#[serde(...)]` attribute containing `skip_serializing_if`, emitting `end_time` instead of `endTime`. v12 parses it, and maps `skip_serializing_if` + `default` to an optional `?:` field | Use ts-rs 12. Keep clippy `-D warnings`, since ts-rs reports parse failures as warnings |
| ts-rs large integers | `u64`/`i64` become `bigint` by default. `TS_RS_LARGE_INT = "number"` switches them all to `number` | Set it once in `.cargo/config.toml` `[env]`; no per-field annotations |
| ts-rs `Option<T>` | `T \| null`; `?:` only with `skip_serializing_if`/`#[ts(optional)]` | Client types extend the generated ones; type-compatibility tests catch mismatches |
| Type-check the frontend tests | `tsc` over `src/` including `__tests__` reports **65 errors in ~30 test files**. Today `tsc` never sees tests | P2 fixes them and includes tests in every package's `typecheck` |
| vitest per-glob thresholds | Supported: `thresholds: { 'src/utils/**': { 100: true }, … }` | `packages/client` ratchets to 100% slice by slice |
| pnpm release-age gate | pnpm 12.8.1's effective `minimumReleaseAge` is 1440 minutes (workspace state), even though `.npmrc` doesn't set it | New dependencies must be at least a day old; pin older versions when needed |
| `restart()` with the single-instance plugin | On macOS the plugin removes its socket on `RunEvent::Exit`. `AppHandle::restart()` from a non-main thread goes through `request_exit`, so that cleanup runs before the relaunch. From the main thread it calls `cleanup_before_exit()` directly and the socket could race | Trigger the mode switch only from an async command (off the main thread). Verify in the bundled app (P12), with "quit and reopen" as the fallback |

## Consequences

- Phases P1–P15 follow the plan. Each merges into local `main` with `scripts/verify.sh` green, and coverage floors are never lowered.
- Coverage exclusions live in `coverage-policy.json` (added in P2) and are explained in [docs/coverage-policy.md](../coverage-policy.md). Inline ignore comments are banned.
- GitHub Actions runs have been failing at startup with zero jobs (an account or billing issue). Local `scripts/verify.sh` is the gate until that is fixed.
