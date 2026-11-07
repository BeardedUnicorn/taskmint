# Changelog

What changed in each TaskMint release, newest first. Versions follow
[semantic versioning](https://semver.org): a major release can break what
older desktops, servers or data expect, a minor one adds features, and a
patch fixes things.

`pnpm release` writes each section from the change notes in `changes/`
(see [changes/README.md](changes/README.md)). Settings → About shows this file.

## 2.0.0 – 2026-11-07

### Added

- TaskMint in a browser: an invite-only server, with accounts, an admin, and per-device tokens, and a web app that runs against it. Docker Compose runs them together.
- The desktop app can keep its data on a TaskMint server instead of on this computer.
- The browser extension can deliver work logs to a TaskMint server, with a "Browser extension" token from the web app.
- A session can hold timers on several tasks. Starting another task joins the active session, and each timer earns at its own task's rate.
- A History page for every past session, with date presets and CSV export.
- Idle detection across the whole system, which asks what to do with the idle time when you come back.
- One-click start, Add time, tray pause and favorite tasks, and starting work from the Tasks page.
- A long-run reminder for timers left running.
- Moving time entries between tasks, and renaming a task renames its history too.
- Project mappings in Payouts: moving a project moves its past imported days. Payouts also shows when the last import was.
- Undo for deletes, in place of confirmation dialogs.
- A notification history (the bell), and settings for which notifications reach the OS.
- Keyboard shortcuts and a command palette (⌘K).
- Referral bonuses are imported instead of skipped.

### Changed

- Earnings stay at the rate the time was tracked at, and the daily goal's progress is live.
- Sessions are per day, and imported work-log entries are read-only.
- Tasks, notes, note templates and the daily goal are kept in the app's data folder with the sessions, instead of the webview's storage.
- Backups are on by default.
- One theme for light and dark, with readable light colors, and the same page layout and empty states on every page.
- The note editor and notes list are rebuilt, with templates on the Notes page.

### Fixed

- Work-log imports no longer change task rates. They had been writing blended averages.
- Starting up when the data file doesn't exist yet.
- Backups report their file and whether they're valid correctly again.
- Several cases where data could be lost or errors weren't reported.

## 1.0.0 – 2026-10-11

The first numbered release.

### Added

- Sessions with timers on tasks, each task with its own hourly rate.
- Notes and note templates.
- A Calendar of earnings and hours per day.
- Payouts: DataAnnotation work-log imports, available, pending and upcoming releases, and a daily reconciliation.
- The Chrome extension, which captures work logs from the payments page and delivers them to the app, or through a `taskmint://` link that opens it.
- Backups to a folder, with restore.
- The system tray, and hiding to the tray on close.
- Resetting all data from Settings.
- Error reporting to Sentry when a DSN is set at build time, which can be turned off in Settings → Privacy.

### Removed

- Google Drive sync, which never worked, and the client-side paywall.
