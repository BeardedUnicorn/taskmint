# Excluded-code QA checklist

The coverage gate leaves out the files listed below
([coverage-policy.json](../../coverage-policy.json),
[docs/coverage-policy.md](../coverage-policy.md)). They need a real event loop,
a UI session or an OS prompt, so no test runs them. By rule they only make
calls, and every decision lives in tested code. That leaves the calls
themselves, which this checklist checks by hand.

Run it before a release, and after any change to one of these files, to the
Tauri or plugin versions, or to the `Platform`/`SecretStore` traits they
implement.

| File | What it does | Section |
|---|---|---|
| `apps/desktop/src-tauri/src/app.rs` | the Tauri builder: plugins, setup, window events, the run loop | [Startup and wiring](#startup-and-wiring-apprs) |
| `apps/desktop/src-tauri/src/platform/os.rs` | `TauriPlatform`: events, notifications, dialogs, reveal and open, the window, the tray | [The platform](#the-platform-platformosrs) |
| `apps/desktop/src-tauri/src/platform/keychain.rs` | `Keychain`: the device token in the OS keychain | [The keychain](#the-keychain-platformkeychainrs) |
| `apps/desktop/src-tauri/src/main.rs` | calls `taskmint_lib::run`; no console window on Windows | [Windows and Linux](#windows-and-linux) |
| `apps/server/src/main.rs` | arguments, environment and signals into the tested `cli::run` | [The server process](#the-server-process-mainrs) |
| desktop `cfg(target_os = "windows" \| "linux")` code | not compiled on the macOS coverage run | [Windows and Linux](#windows-and-linux) |

## Before you start

- **Quit the installed TaskMint.** A development build shares its data
  folder, its single-instance lock and port 43117.
- **Back up the data folder:** `~/Library/Application Support/com.taskmint.desktop/`
  (`com.taskmint.app/` before 2.1).
- **Use a dev build with its own data for most of this:**
  `TASKMINT_DATA_DIR=$HOME/tmp/taskmint-qa pnpm tauri dev`. That build uses
  the folder you give it and the `com.taskmint.desktop.dev` keychain service, so
  the installed app's data and keychain item are left alone.
- **Use the bundled app (`pnpm tauri build`, then open the `.dmg`) for deep
  links.** On macOS, `taskmint://` is registered only by an installed bundle.
- **Server-mode items need the stack:** `docker compose up -d --wait` (README,
  "Run the stack").

Note anything that fails with the build, the OS version and what you saw.

## Startup and wiring (app.rs)

- [ ] **Launch.** The window opens, the tray icon appears, and your tasks and
      sessions load.
- [ ] **Second launch.** Launching again while it runs brings the first window
      forward and starts no second app (single-instance, the first plugin).
- [ ] **Close to tray.** Closing the window hides it. A running timer keeps
      counting in the tray, and the tray menu still works. Clicking the Dock
      icon brings the window back.
- [ ] **Quit.** Tray → Quit ends the app.
- [ ] **Tray menu.** Start a task from the tray's menu, then pause and stop it.
      The window shows each change at once (menu events reach
      `tray::handle_menu_event`, and the change is emitted to the webview).
- [ ] **Logs.** `~/Library/Logs/com.taskmint.desktop/` has today's log at
      `info` and above; a dev build adds `debug`.
- [ ] **Capture server.** `curl -s http://127.0.0.1:43117/api/health` answers
      `{"app":"TaskMint","version":…}` with the app's version.
- [ ] **Capture server in use.** Quit the app, run `nc -l 43117` in a terminal,
      and launch. Payouts warns that the browser capture server couldn't
      start; the rest of the app works. Stop `nc` and relaunch.
- [ ] **Idle monitor.** Turn on idle detection with a 1-minute threshold, then
      start a timer and leave the keyboard and mouse alone for over a minute.
      The timer pauses as of when input stopped; on your return the app comes
      forward and asks what to do with the away time.
- [ ] **Dev data folder.** With `TASKMINT_DATA_DIR` set, the dev build's data
      is in that folder and its log in `logs/` there. A release build ignores
      the variable.
- [ ] **Notification click.** With the window hidden to the tray, clicking a
      TaskMint notification (Settings → Notifications → Send test
      notification) brings the window forward. Check it in the bundled app:
      a dev build's notifications come from Terminal.

**Moving the pre-2.1 identifier's data (bundled app, once per Mac).** Back up
`~/Library/Application Support/com.taskmint.app/` and
`~/Library/WebKit/com.taskmint.app/` first, and quit the old version.
- [ ] The first launch moves both folders to `com.taskmint.desktop`: tasks,
      sessions and work logs are there, and so are settings kept in the
      webview (the funds-release delay, idle settings). The log names each
      move.
- [ ] Connected to a server before the update: still connected, with the
      token in the `com.taskmint.desktop` keychain service and none left in
      `com.taskmint.app`.
- [ ] A second launch moves nothing.
- [ ] macOS asks again for notification permission, and for access to
      Documents at the next folder backup (both are granted per identifier).

**Deep links (bundled app):**
- [ ] With the app quit, `open 'taskmint://capture-pending'` launches it and
      shows the window.
- [ ] With the app running and its window hidden, the same command brings
      the window forward.
- [ ] An import link from the extension (turn the capture server off by
      quitting the app first, then open the payments page) launches the app,
      and the payload waits in Payouts for review ("arrived by link").

## The platform (platform/os.rs)

- [ ] **Events.** Covered by "Tray menu" above.
- [ ] **Notifications.** Settings → Notifications → Send test notification
      shows an OS notification. With "Play a sound" on, it plays (Glass on
      macOS).
- [ ] **Save dialog.** Settings → Data Management → Export opens an "Export
      Data" save dialog with a JSON filter and a name like
      `taskmint_export_20261028_141500.json`. Cancelling says the export was
      cancelled, without an error.
- [ ] **Open folder.** After an export is saved, its folder opens in Finder.
- [ ] **Open dialog.** Import opens a file picker that shows JSON files.
- [ ] **Folder picker.** Settings → Automatic Backups → choose a folder opens
      a folder picker.
- [ ] **Documents folder.** A fresh data folder's backups default to
      `~/Documents/TaskMint Backups` (macOS asks once for access to Documents).
- [ ] **Reveal.** After a backup, its notification's "Show in Finder" button
      reveals the file, selected, in Finder.
- [ ] **Bring the window forward.** Covered by "Second launch" and the deep
      links.
- [ ] **Tray menu.** The menu lists the start entries, the disabled label
      lines, separators and Quit. Renaming or archiving a task updates it
      without a restart.
- [ ] **Tray status.** While a timer runs, the tooltip names the task and its
      time, and on macOS the elapsed time shows beside the icon. Stopping
      clears that title.
- [ ] **Tray double-click** (Windows and Linux) shows the window.
- [ ] **Version.** The capture server's `/api/health` reports the version in
      `apps/desktop/package.json`. Connecting to a server checks the same
      version.
- [ ] **Restart.** Connecting to or disconnecting from a server restarts the
      app on the other data.

## The keychain (platform/keychain.rs)

With the stack running and a dev build on its own data folder:
- [ ] **Store.** Settings → Server → connect to `http://localhost:8080` with
      a user's credentials. Keychain Access then has an item for the
      `com.taskmint.desktop.dev` service, account `server-token`.
- [ ] **Read.** After the restart and after quitting and relaunching, the app
      is still connected, with no prompt (or one prompt that "Always Allow"
      ends).
- [ ] **Delete.** Disconnect removes the item. Disconnecting again, or
      relaunching, gives no keychain error.
- [ ] **Refused.** Deny the keychain prompt (lock the login keychain first, or
      choose Deny). The Server settings say the keychain couldn't be read, and
      the app runs on its local data.
- [ ] **Revoked elsewhere.** Revoke the device token in the web app (Settings
      → API tokens), or change the user's password there. The desktop shows
      "Signed out" and asks to sign in again.

## The server process (main.rs)

- [ ] **Stopping.** `docker compose stop server` returns within a couple of
      seconds: SIGTERM ends the event streams and the server exits cleanly.
      Open web tabs reconnect once it's back.
- [ ] **Ctrl-C.** `cargo run -p taskmint-server -- serve` (with the
      environment from `.env`) stops on Ctrl-C.
- [ ] **Exit codes.** `docker compose exec server taskmint-server healthcheck; echo $?`
      prints 0. An unknown subcommand prints its usage and exits 2.

## Windows and Linux

These builds run code the macOS coverage run never compiles. Check them on
those systems before releasing there.

- [ ] **Windows installer** (`pnpm build:win`): it installs and launches with
      no console window (`windows_subsystem`), and its tray works.
- [ ] **Windows idle detection** (`GetLastInputInfo`): the idle-monitor check
      above.
- [ ] **Windows deep links:** the installer registers `taskmint://`, and a
      link opened while the app runs reaches the running app through
      single-instance.
- [ ] **Linux deep links:** `register_all` registers the scheme at startup.
- [ ] **Linux idle detection:** the platform has none, so the idle settings
      say idle time isn't available here.
