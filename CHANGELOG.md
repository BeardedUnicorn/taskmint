# Changelog

What changed in each TaskMint release, newest first. Versions follow
[semantic versioning](https://semver.org): a major release can break what
older desktops, servers or data expect, a minor one adds features, and a
patch fixes things.

`pnpm release` writes each section from the change notes in `changes/`
(see [changes/README.md](changes/README.md)). Settings → About shows this file.

## 3.1.0 – 2026-11-08

### Added

- Settings → Data Management → Restore Exactly puts an export file's data in place of everything here, after asking, as one change, with safety copies of what it replaces kept first. Import Data still only adds what's missing.
- Settings → Automatic Backups lists the backups in its folder (when each was made, its size, and whether it can be read), each with Restore exactly and Merge.
- Exports and backups also carry this device's settings (appearance, notifications, idle and reminders, backups). Import Data leaves yours as they are; Restore Exactly applies the file's.
- A work-log import, pasted in Payouts or captured by the browser extension, can be undone from its notice, as a delete can: the imported work logs and the days the import rewrote go back to how they were. Undo is refused, and says so, once one of those days has changed. It works in server mode too.

### Changed

- "Days Before Funds Released" and "Days Between Withdrawals" are now kept with your data instead of on each device, so they're in exports and backups, and in server mode the web app and every computer use the same values and show the same release and withdrawal dates. Each device's values move over the first time you open this version, unless the data already has them (a computer in server mode moves its own the next time it runs on its own files). An older version of the desktop app doesn't know them, and opening one drops them.

## 3.0.0 – 2026-11-08

### Removed

- TaskMint no longer upgrades data from builds older than mid-October 2026. A backup from before then may restore without moving its sessions' notes into Notes, and note templates with fields that ran shell commands won't load; records an old build left in the app's local storage aren't moved in either. To bring such data forward, open or restore it in 2.4 first, then update.

## 2.4.0 – 2026-11-08

### Added

- Record the withdrawals you take from the payment site. The Calendar and Payouts show when your next withdrawal opens (date and time, from the "Days Between Withdrawals" setting, 3 by default) and how much it will be, with what waiting longer would add. The tray menu shows it too. Withdrawals are part of exports and backups.
- Payouts' "Available now" becomes "Available to withdraw" once a withdrawal is recorded: the money released since your last one.

### Changed

- The Calendar is rebuilt. Each day shows what you earned (with `~` on estimates) and how long you worked, a bar toward your daily goal, and separate markers for money released (or still to be released), withdrawals and the next withdrawal's opening, with a legend. Weeks have totals, the month has a summary, and days can be reached and opened from the keyboard. A day's breakdown now compares tracked and reported time, shows release times and the site's statuses, lists that day's withdrawals, and steps to the previous or next day.

## 2.3.0 – 2026-11-07

### Added

- The desktop app updates itself. It checks GitHub for a new release when it starts and once a day, and asks before installing one; on yes it downloads it, installs it and restarts. Settings → Updates checks now, or turns the automatic check off.

## 2.2.0 – 2026-11-07

### Added

- Each release on GitHub now has installers for Intel Macs and Windows, next to the Apple silicon one, and the Chrome extension as a zip to load unpacked.

## 2.1.0 – 2026-11-07

### Added

- Clicking a TaskMint notification brings the window forward, even when it's hidden in the tray.
- Settings → About shows TaskMint's version and its release notes, with earlier releases below. After an update, a notice links to what's new.

### Changed

- TaskMint's app identifier is now `com.taskmint.desktop` (it was `com.taskmint.app`). The first launch moves your data, settings and server sign-in over from the old one, so nothing needs redoing, except that macOS asks once more for permission to show notifications and to use Documents for backups.
- A new app icon and logo, in the Dock, the installer, the browser extension, the sidebar, the sign-in pages and Settings → About. On macOS the menu-bar icon is now a one-color leaf that follows the menu bar's light or dark look.

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
