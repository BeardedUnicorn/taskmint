# Excluded-code QA checklist

The coverage gate leaves out the files listed below
([coverage-policy.json](../../coverage-policy.json),
[docs/coverage-policy.md](../coverage-policy.md)). They need a real event loop,
a UI session or an OS prompt, so no test runs them. By rule they only make
calls, and every decision lives in tested code. That leaves the calls
themselves, which this checklist checks by hand.

Run it before a release, and after any change to one of these files, to the
Tauri or plugin versions, or to the `Platform` trait they implement.

| File | What it does | Section |
|---|---|---|
| `apps/desktop/src-tauri/src/app.rs` | the Tauri builder: plugins, setup, window events, the run loop | [Startup and wiring](#startup-and-wiring-apprs) |
| `apps/desktop/src-tauri/src/platform/os.rs` | `TauriPlatform`: events, notifications, dialogs, reveal and open, the window, the tray, the updater | [The platform](#the-platform-platformosrs), [Updates](#updates-platformosrs) |
| `apps/desktop/src-tauri/src/main.rs` | calls `taskmint_lib::run`; no console window on Windows | [Windows and Linux](#windows-and-linux) |
| `apps/desktop/src-tauri/gen/android/…/MainActivity.kt` | the webview's bridges: system bars, Google sign-in, analytics (Kotlin isn't measured) | [Android](#android) |
| cloud sync against the real Firebase project | the tested engine and rules, on Google's servers and in real webviews | [Cloud sync](#cloud-sync) |
| desktop `cfg(target_os = "windows" \| "linux")` code | not compiled on the macOS coverage run | [Windows and Linux](#windows-and-linux) |

## Before you start

- **Quit the installed TaskMint.** A development build shares its data
  folder, its single-instance lock and port 43117.
- **Back up the data folder:** `~/Library/Application Support/com.taskmint.desktop/`
  (`com.taskmint.app/` before 2.1).
- **Use a dev build with its own data for most of this:**
  `TASKMINT_DATA_DIR=$HOME/tmp/taskmint-qa pnpm tauri dev`. That build uses
  the folder you give it, so the installed app's data is left alone.
- **Use the bundled app (`pnpm tauri build`, then open the `.dmg`) for deep
  links.** On macOS, `taskmint://` is registered only by an installed bundle.

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
- [ ] **Open in the browser.** Settings → Cloud sync → Continue with Google
      (a build with the Google client in `.env`) opens Google's sign-in in
      the default browser.
- [ ] **Tray menu.** The menu lists the start entries, the disabled label
      lines, separators and Quit. Renaming or archiving a task updates it
      without a restart.
- [ ] **Tray icon.** On macOS the menu-bar icon is the one-color leaf, black
      on a light menu bar and white on a dark one; on Windows and Linux it's
      the app icon.
- [ ] **Tray status.** While a timer runs, the tooltip names the task and its
      time, and on macOS the elapsed time shows beside the icon. Stopping
      clears that title.
- [ ] **Tray double-click** (Windows and Linux) shows the window.
- [ ] **Version.** The capture server's `/api/health` reports the version in
      `apps/desktop/package.json`.

## Updates (platform/os.rs)

An update needs a release build and a feed newer than it. Try it on a build
with its own identifier, so the installed app and its data are left alone, and against a local feed signed with a throwaway key (the
real key never leaves CI). Every file goes in one scratch folder, `$S`:

1. **A key:** `pnpm --filter @taskmint/desktop exec tauri signer generate --ci -p "" -w $S/test.key`.
2. **Two configs**, `$S/config-old.json` and `$S/config-new.json`, alike but
   for `version` (`2.2.0` and `2.2.99`, say):

   ```json
   {
     "productName": "TaskMint Update Test",
     "version": "2.2.0",
     "identifier": "com.taskmint.updatetest",
     "plugins": {
       "deep-link": { "desktop": { "schemes": ["taskmint-updatetest"] } },
       "updater": {
         "pubkey": "<the contents of $S/test.key.pub>",
         "endpoints": ["http://127.0.0.1:8765/latest.json"],
         "dangerousInsecureTransportProtocol": true
       }
     },
     "bundle": { "createUpdaterArtifacts": true, "targets": ["app"] }
   }
   ```

3. **Both builds**, from `apps/desktop` with
   `TAURI_SIGNING_PRIVATE_KEY=$S/test.key TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""`.
   Run `pnpm tauri build --config $S/config-old.json`, and copy
   `target/release/bundle/macos/TaskMint Update Test.app` to `$S/install/`.
   Then run `pnpm tauri build --config $S/config-new.json`, and copy its
   `TaskMint Update Test.app.tar.gz` and `.sig` to `$S/feed/`.
4. **The feed:** in `$S/feed/latest.json`, put `"version": "2.2.99"`, some
   `"notes"`, and
   `"platforms": { "darwin-aarch64": { "url": "http://127.0.0.1:8765/TaskMint%20Update%20Test.app.tar.gz", "signature": "<the .sig's contents>" } }`.
   Serve it with `python3 -m http.server 8765 --bind 127.0.0.1 -d $S/feed`.
5. **Open** `$S/install/TaskMint Update Test.app`. Afterwards, delete `$S`,
   `~/Library/Application Support/com.taskmint.updatetest`,
   `~/Library/Logs/com.taskmint.updatetest` and
   `~/Library/WebKit/com.taskmint.updatetest`.

- [ ] **Automatic check.** About 10 seconds after launch, the dialog says
      TaskMint 2.2.99 is available and that you have 2.2.0, with the notes.
      Later closes it.
- [ ] **Check now.** Settings → Updates → Check for updates opens the dialog
      again. Stop the feed and check again: the section says why it couldn't
      check. Turning off "Check for updates automatically" survives a
      relaunch.
- [ ] **Install.** Start a timer, then click Download and install. The
      progress shows MB downloaded, then "Installing…". The app restarts as
      2.2.99: Check for updates now says it's up to date, and the timer is
      still running. The bundle's `Contents/Info.plist` says 2.2.99.
- [ ] **Bad signature.** Change a character in the feed's `signature` and try
      again from the old build. The dialog says the update couldn't be
      installed, and the app stays as it was.
- [ ] **In the tray.** With the window closed to the tray when the launch
      check finds the update, an OS notification says it's available.
      Clicking it opens the window on the dialog.
- [ ] **Development build.** In `pnpm tauri dev`, Download and install says a
      development build can't install updates.
- [ ] **A real release.** After a release, an install of the version before
      it finds and installs it from GitHub.

## Cloud sync

With the bundled desktop app on a scratch data folder
(`TASKMINT_DATA_DIR`), the Android APK, and the web app, all signed in to
one test account of your own on the real project:

- [ ] **Sign in by email** on the desktop: Settings → Cloud sync shows
      "Signed in as …" and "Up to date".
- [ ] **Google on the desktop:** Continue with Google opens the browser;
      after choosing the account, the page says "You're signed in", and the
      app is. Cancelling on Google's page says the sign-in was cancelled;
      closing the tab instead times out after 5 minutes.
- [ ] **Both have data:** signing in on a device with data, to an account
      with data, asks Merge them / Use the cloud's data.
- [ ] **A change travels:** a task made on the desktop shows on the phone
      and in the web app within seconds, and the other way round.
- [ ] **A phone timer** shows in the desktop's tray, and the desktop's idle
      detection doesn't pause it.
- [ ] **Offline:** with a device offline, start a timer and edit a task;
      back online, both arrive, and only one timer is left running.
- [ ] **Stop syncing** keeps the device's data and signs it out.
- [ ] **Delete cloud data** (on a test account): every device says the
      cloud data was deleted and keeps its data; **Sync again** uploads it.
- [ ] **The web app on Hosting** (after a deploy): https://taskmint-f9a05.web.app
      opens to sign-in, Continue with Google signs in through the popup, and
      the browser console shows no Content Security Policy errors.

## Android

On a phone with Google Play services, with the release APK:

- [ ] **Google sign-in:** Settings → Cloud sync → Continue with Google shows
      Android's account sheet and signs in. (A debug APK works too: both
      keys' SHA-1s are registered.)
- [ ] **Analytics:** with Settings → Privacy → Share usage statistics on,
      page views reach Firebase (Analytics → DebugView, after
      `adb shell setprop debug.firebase.analytics.app com.taskmint.android`);
      off, they stop.
- [ ] **Status bar** follows the app's theme, light and dark.

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
- [ ] **Windows update:** an install of the version before a release finds
      it. Download and install runs the installer in passive mode (a progress
      window and no questions), and TaskMint starts again on the new version
      with its data.
