<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/brand/logo-dark.png">
    <img src="assets/brand/logo.png" alt="TaskMint" width="440">
  </picture>
</h1>

A time tracker and earnings ledger for the desktop, Android and the web,
built with Tauri v2, React, TypeScript and Rust. You track time in sessions
against tasks with hourly rates, reconcile it against work logs imported from
DataAnnotation, and see what you've earned and when it pays out. Signed in,
your devices and the web app (https://taskmint-f9a05.web.app) share the same
data through Firebase.

## What it does

| Page | What it's for |
|---|---|
| **Home** | Where TaskMint always opens: what's running (or one-click starts for your favorite and most recent tasks), today's and this week's earnings and time as the Calendar counts them, the daily goal, the next withdrawal, your last few sessions, and a reminder to import work logs when the last import is a few days old. |
| **Sessions** | Pick a task and its timer starts; pause, resume and stop timers inside the session, and add timers for other tasks to it (each day's work gets its own session). Each timer's row shows its task, and live totals cover the active session. The list shows which tasks each session ran and their totals; it covers the last 30 days (older ones a click away) and filters by source. **Add time** logs a finished timer after the fact (a "Manual" session). |
| **Tasks** | Tasks with hourly rates and default note templates; start one, star favorites, archive tasks you're done with. Each task lists its newest entries and opens History for the rest. Time keeps the rate it was tracked at, so changing a rate only affects new time. |
| **Notes** | Free-form or template-based notes on a task (pick it on the Notes page), a session or a timer. A session's notes open from its row, which previews the newest one. Note templates have their own tab. |
| **History** | Every tracked, added and imported entry: quick ranges (remembered), search and task filters, totals and charts, the sortable entries table (edit, move an entry to another task, delete, CSV export; imported days are read-only, since each import rebuilds them), and the daily goal's results over the range. |
| **Calendar** | Earnings, hours and released amounts per day, and the month's totals; click a day for its tasks and releases. |
| **Payouts** | Import DataAnnotation work logs and see available, pending and upcoming releases, when the last import was, and a daily reconciliation grouped by month. An import's notice has **Undo**, which puts the ledger and the days it rewrote back as they were (refused once one of those days has changed). **Project mappings** lists which task each project goes to; moving a project moves its past imported days too. |
| **Settings** | Cloud sync, appearance, payouts (funds-release delay, days between withdrawals), idle detection and the long-run reminder, daily goal, backups (and restoring one), data export/import/exact restore/reset, privacy, and About (release notes, and **About TaskMint…**). |

Each page you open starts at its top. **Keyboard shortcuts** (⌘ on macOS,
Ctrl elsewhere): ⌘1–⌘8 open the pages in sidebar order (Home first), ⌘N a
new task, ⇧⌘N starts work, ⇧⌘P pauses or resumes the timer, ⌘, opens
Settings, and ⌘K the command palette, which also has About TaskMint, Check
for updates (desktop) and Sign out of cloud sync. On a phone, tabs along the
bottom open Home, Sessions, Calendar and Payouts, and the top bar's menu
opens every page.

The **menu bar** (macOS; on Windows, menus across the top of the window)
has TaskMint's own menus: About TaskMint and Check for Updates…, Settings
and Cloud Sync…; File (New Task, Start Work…, Add Time…, Import Work
Logs…); View (each page, the command palette); Timer (pause or resume, and
stop, the running timer, by name); and Help (TaskMint's help and a new
problem report on GitHub, What's New, the keyboard shortcuts, and the data
and logs folders). **About TaskMint** shows the version and release date,
checks for updates on the desktop, opens those pages and folders, and
copies diagnostics (version, system, folders, sync status, never your
account) for a problem report.

The **system tray** (menu-bar item on macOS) shows the running or paused
timer and can pause, resume or stop it, start a task's timer, or open the app.
Its Start menu lists starred tasks first, then the ones you used most
recently; **Choose Task…** opens the app's start dialog for any other task.
Starting work behaves the same everywhere (tray, Sessions toolbar, the +
button): with a session active, the task joins it, resuming its paused timer
or starting a new one, and stopping whatever is running (a toast says so). Only
End Session ends a session; a session left active from an earlier day gives way
to a new one. Work starts from existing tasks; create new ones on the Tasks page.
Closing the window hides TaskMint to the tray, where timers keep running; quit
from the tray menu. On macOS, clicking the Dock icon brings the window back.

**Earnings** are rate × time everywhere, at the rate captured for each timer:
its session's when it's on the task the session opened for, otherwise its own
task's when the timer was created (imported days carry the rate the site's pay
implies, so they match Payouts). With a **daily goal** set, the sidebar shows today's progress live,
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

The desktop and Android apps keep everything on the device and work offline.
With [cloud sync](#cloud-sync) on, they also keep it in step with your other
devices and the web app.

| Data | Store |
|---|---|
| Sessions and timer instances | `sessions.json` in the app data dir, owned by the Rust backend |
| Imported work logs and project→task mappings | `worklogs.json` in the app data dir, owned by the Rust backend |
| Tasks, notes, note templates, the daily goal and its history, withdrawals, and the payout settings (funds-release days, days between withdrawals) | `appdata.json` in the app data dir, owned by the Rust backend (see below for data from older versions) |
| Cloud sync: the account this device syncs with, this device's id, and what the cloud last said | `sync.json` in the app data dir, owned by the Rust backend |
| Other settings and UI preferences (appearance, notifications, idle and reminders, backups, analytics) | The webview's `localStorage` (each device has its own) |

App data dir on macOS: `~/Library/Application Support/com.taskmint.desktop/`
(a [dev build](#dev-environment)'s is `com.taskmint.desktop.dev/`).
Before 2.1 the app identifier was `com.taskmint.app`: the first launch of a
newer version moves that data folder and the webview's storage (the
settings) to the new identifier, and logs what it moved. Nothing moves if the
new folder is already there.
Before risky operations (a skipped-record load, an import that rewrites days, a
restore), the backend writes timestamped `*.bak-*` copies next to the stores,
keeping the newest 10 of each.

**Data from older versions.** Earlier versions kept tasks, notes, templates
and the goal in the webview's `localStorage`. On launch, an installed build
moves any it finds into `appdata.json`: list items are added by id, nothing
already in the file is replaced, a copy of what was moved is saved as
`appdata.json.bak-<time>`, and the `localStorage` copies are then removed.
Development builds (`pnpm tauri dev`) skip this: their webview storage is
separate from the installed app's, but the data folder is shared. The payout
settings used to be device settings: an installed build, and the web app,
move this device's values into the `accountSettings` record once, unless
it's set already, and then remove them from `localStorage`.

**Backups.** Settings → Data Management exports everything above to one JSON
file (format v3, with a copy of this device's own settings) and imports it
back. **Import Data** adds what isn't already present (existing data wins) and
leaves this device's settings alone. **Restore Exactly** asks first, then
replaces everything with the file's, this device's settings included, in one
change (the backend keeps its `.bak` copies first);
a section an older file doesn't have (work logs in v1, withdrawals and payout
settings before v3) is left as it is. The app reloads after either. Settings →
Automatic Backups writes the same file to a folder daily, weekly or monthly,
keeping the newest N, and lists the backups in that folder with **Restore
exactly** and **Merge** for each. They start on (weekly, into
`Documents/TaskMint Backups`; macOS asks once for access to Documents) unless
you've saved a backup setting before.

**Reset.** Settings → Data Management → Reset All Data wipes the data files
(`sync.json` too), their `.bak` copies and `localStorage`, and signs this
device out of cloud sync. The cloud's copy and your other devices keep their
data. In the web app, whose data is the cloud's, it deletes the cloud data.

**A scratch data folder.** `TASKMINT_DATA_DIR=<folder>` makes a development
build keep its files and its logs (in `logs/`) there, so the installed app's
are left alone.

## Cloud sync

Settings → Cloud sync signs this device in with an email and password, or
with Google, and keeps its sessions, work logs, tasks, notes, templates,
goal, withdrawals and payout settings in step with your other devices and
the web app. Anyone can make an account. Without one, everything stays on
the device. Device settings (appearance, notifications, idle, backups)
don't sync.

- **First sign-in.** When both this device and the account already have
  data, TaskMint asks: **Merge them** (lists join by id; where the same item
  changed on both, this device's version wins), or **Use the cloud's data**
  (this device's is replaced, after a copy is kept in the data folder).
- **Offline.** Changes wait on the device and go when it's back online. The
  chip says how many are waiting. When two devices changed the same data
  meanwhile, the changes merge: timers added to the same session on both are
  both kept, and where the same task, note or setting changed on both, the
  device that syncs last wins.
- **One running timer.** When devices started timers while apart, the one
  started or resumed last keeps running and the others stop at its start.
  Each timer runs on the device that started it: idle detection and the
  long-run reminder on the desktop act only on timers running there, not on
  the phone's.
- **Sign out** (in Settings → Cloud sync, or "Sign out of cloud sync" in the
  ⌘K palette) asks first, then signs this device out and keeps its data; the
  cloud and the other devices keep theirs. **Delete cloud data** deletes the
  account's data from the cloud and stops every device syncing, each keeping
  its own copy. The foot of the sidebar shows where sync stands (Synced,
  Syncing…, Not signed in, Sync needs attention) and opens these settings.
- **Another account.** A device that syncs with one account and is signed in
  with another says so, and offers to sync with the new one from then on
  (its data joins that account's). After signing out, signing in to a
  different account asks before this device's data goes there, even when
  that account is empty: **Add it to this account**, or **Start empty**
  (this device's data is cleared, after a copy is kept in the data folder).
- **Newer data.** Data saved by a newer TaskMint is left alone and Settings
  says to update.
- **BudgetMint.** A synced device also publishes your payout forecast (what
  the coming withdrawals will take, as amounts and times only) for
  BudgetMint, which keeps its own data in its own Firebase project and signs
  in to TaskMint's only to read the forecast. It's written only when your
  payout data changes. Delete cloud data and Delete account delete it, and
  leave BudgetMint's own data alone. The contract is
  [docs/contracts/payout-forecast.md](docs/contracts/payout-forecast.md),
  the design [ADR 0003](docs/adr/0003-payout-forecast.md).

The design is [ADR 0002](docs/adr/0002-firebase.md). How the Firebase
project is set up, and how to develop against its emulators:
[Firebase](#firebase).

## Browser capture (optional)

`apps/extension/` is a Chrome extension that captures your DataAnnotation
work logs from the payments page and delivers them to the app over
`http://127.0.0.1:43117`, or through a `taskmint://` link that launches the app
if it's closed. The app accepts localhost deliveries only from this
extension's fixed ID. Payloads that arrive only by link wait in Payouts for
review, since any web page can open a link. When the app window isn't in
front, each capture's result also shows as a desktop notification. With cloud
sync on, a capture reaches your other devices and the web app from there. See
[apps/extension/README.md](apps/extension/README.md).

## Error reporting and analytics

If `VITE_SENTRY_DSN` is set at build time, crashes and errors are reported to
Sentry. Reports contain the error and where in the app it happened. Task
names, notes, earnings and work-log data are stripped before sending, and
there's no session replay or tracing. Turn it off in Settings → Privacy.

The web app and the Android app also send which pages are opened to Firebase
Analytics, and nothing else: no data. **Share usage statistics** in Settings
→ Privacy turns it off on that device; in the web app, Google's tag doesn't
load while it's off. The desktop app has no analytics.

## Development

**Prerequisites:** Node 24 (`.node-version`), pnpm (pinned via
`packageManager`; `corepack enable` picks it up), and rustup. The Rust version,
its components and the `wasm32-unknown-unknown` target are pinned in
`rust-toolchain.toml`; `rustup toolchain install` in the repo installs them.
The web app's core also needs the `wasm-bindgen` CLI at the version of the
`wasm-bindgen` crate in `Cargo.lock` (`pnpm build:wasm` says which, and how
to install it), and the Firestore rules' tests need Java 21 or later
(`brew install openjdk`). `node scripts/check-toolchains.mjs` checks the pins
agree.

```bash
pnpm install
pnpm tauri dev      # desktop app with hot reload (Vite on :1420)
pnpm dev            # Vite only, for tauri dev; a plain browser has no backend and stops at the startup error
```

TaskMint in a browser is the web app: see [Web app](#web-app).

**Every build you make here is a dev build:** "TaskMint Dev", which installs
and runs beside the real TaskMint with its own data, on the dev Firebase
project. Only releases are the real app ([Dev environment](#dev-environment)).

**App icons.** The masters are in `assets/brand/`: `icon.png` (the app icon),
`icon-macos.png` (the same on Apple's icon grid), the wordmark `logo.png` and
`logo-dark.png`, and the leaf `mark.png`. After changing the icon, regenerate
the bundle icons, then replace the `.icns` with the macOS-grid one:

```bash
cd apps/desktop && pnpm tauri icon ../../assets/brand/icon.png
```

```bash
cd apps/desktop && pnpm tauri icon ../../assets/brand/icon-macos.png -o /tmp/taskmint-icons && cp /tmp/taskmint-icons/icon.icns src-tauri/icons/
```

`tauri icon` also writes Android, iOS and Windows Store sizes the bundle
doesn't use; delete them again:

```bash
cd apps/desktop/src-tauri/icons && rm -rf android ios Square*Logo.png StoreLogo.png 64x64.png
```

The menu-bar icon (`src-tauri/icons/tray-template.png`, a black leaf on
transparent that macOS tints) and the images in `packages/client/public/` and
`apps/extension/icons/` are made from the same masters, and so is Android's
launch screen ([Android](#android)).

Copy `.env.example` to `.env` to set a Sentry DSN (otherwise reporting stays
off), the desktop's Google sign-in client ([Firebase](#firebase); without
it the desktop signs in by email only), or the Firebase emulators' host.

### Android

The desktop crate also builds as a Tauri Android app (`apps/desktop`, the same
Rust and webview), package `com.taskmint.android` (`tauri.android.conf.json`
sets it; the desktop app stays `com.taskmint.desktop`). A
[dev build](#dev-environment) is `com.taskmint.android.dev`, "TaskMint Dev",
and installs beside it. Each release has
`TaskMint-X.Y.Z-android-arm64.apk` for arm64 phones, every phone from roughly
the last eight years.

**Installing it.** Open the release on the phone and download the APK.
Opening it asks you to let the browser (or Files) install unknown apps;
allow it, go back and install. A later release's APK installs the same way,
over the app, and keeps its data: they're all signed with the same key (see
[Android signing](#android-signing)). The app doesn't update itself.

**Prerequisites**, besides the ones above:

- Android Studio, or the command-line tools, with SDK Manager's Android SDK
  Platform, Platform-Tools, Build-Tools, Command-line Tools and NDK (Side by
  side).
- JDK 17 or later; Android Studio's own works
  (`/Applications/Android Studio.app/Contents/jbr/Contents/Home` on macOS).
- `JAVA_HOME`, `ANDROID_HOME` (usually `~/Library/Android/sdk`) and
  `NDK_HOME` (`$ANDROID_HOME/ndk/<version>`) set in your shell.
- The Rust Android targets. `tauri android init` installs them; by hand:

```bash
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
```

The Android project, `apps/desktop/src-tauri/gen/android`, is committed. It
was made by `pnpm tauri android init` from `tauri.conf.json` and
`tauri.android.conf.json`, and changed in these places (each marked
`TaskMint:`):

- `app/build.gradle.kts` signs release builds with the release key when
  `TASKMINT_ANDROID_KEYSTORE` and `TASKMINT_ANDROID_KEYSTORE_PASSWORD` are set
  ([Android signing](#android-signing)). Without them a release build is
  unsigned. It also reads `TASKMINT_ENV` ([Dev environment](#dev-environment)):
  unless it's `production`, the app is `com.taskmint.android.dev` ("TaskMint
  Dev", `applicationIdSuffix`; the code's package stays the same) with
  Analytics off (`firebase_analytics_collection_deactivated` in the manifest).
- Firebase: `app/firebase/google-services.production.json` and
  `google-services.dev.json` (each project's Android app's public config,
  downloaded from the Firebase console; `app/build.gradle.kts` copies the
  build's to the gitignored `app/google-services.json`), the `google-services` Gradle plugin
  (in the root `build.gradle.kts`, applied in `app/build.gradle.kts`), and
  the Firebase BoM with Analytics, Credential Manager and googleid as
  dependencies. Firebase and googleid need Kotlin 2.3, which the root
  `build.gradle.kts` and `buildSrc/build.gradle.kts` pin.
- `MainActivity.kt` gives the webview four bridges: `TaskMintSplash` (the
  launch screen stays until the app has drawn), `TaskMintSystemBars` (the
  status bar follows the app's theme), `TaskMintGoogleSignIn` (Credential
  Manager's Google sign-in, for cloud sync) and `TaskMintAnalytics` (Firebase
  Analytics, and its off switch). `app/proguard-rules.pro` keeps them, and
  Credential Manager's Play services provider, through R8.
- The launch screen is androidx `core-splashscreen`'s, themed by
  `Theme.taskmint.Starting` (`values/themes.xml`, and `values-v31` for the
  wordmark, which Android 12 and later show): the leaf on the app icon's
  teal. `MainActivity` keeps it up until the page calls
  `TaskMintSplash.hide()` (or 10 s pass), then fades it out. Its images,
  `drawable-*/splash_icon.png` and `splash_branding.png`, come from
  `assets/brand/mark.png` and `logo-dark.png`. After changing those, make
  them again (macOS):

```bash
swift scripts/brand/android-splash.swift
```

- The launcher icons in `app/src/main/res` (`mipmap-*`, and the adaptive
  icon's background in `values/ic_launcher_background.xml`) come from
  `assets/brand/icon-macos.png`. Its padding keeps the clock and leaf
  inside the circle a launcher crops to, and the background is the tile's
  colour, so no edge shows. After changing the icon, make them again and
  copy `android/` over `res`:

```bash
cd apps/desktop && pnpm tauri icon ../../assets/brand/icon-macos.png --ios-color '#0A3A3E' -o /tmp/taskmint-icons && cp -R /tmp/taskmint-icons/android/. src-tauri/gen/android/app/src/main/res/
```

Tauri writes its per-build files into the project (they're gitignored), so a
fresh checkout builds without an `init`. A Tauri upgrade can change the
template: `tauri android init` in a scratch copy shows what's new.

Run it in an emulator or on a phone plugged in over USB, or build a debug
APK:

```bash
cd apps/desktop && pnpm tauri android dev
```

```bash
cd apps/desktop && pnpm tauri android build --debug --apk --target aarch64
```

For a phone on the network, `pnpm tauri android dev --host` serves Vite on
this computer's network address (`vite.config.ts` reads `TAURI_DEV_HOST`;
`tauri.android.conf.json` lets live reload connect to it).

On Android the Rust side reports the runtime `mobile` (`get_capabilities`).
The app has its timers, data, dialogs and notifications (it asks for
permission to notify at the first launch), and cloud sync. Google sign-in
there needs Google Play services, and the build's signing certificate
registered on the Firebase Android app (Firebase console → Project settings
→ Your apps): the debug key's and the release key's SHA-1 are, in both
projects. A new key needs its own in each, and both `google-services.*.json`
downloaded again. The parts only a
desktop has are left out, in the Rust (`#[cfg(desktop)]`, and those crates
are desktop-only dependencies) and in the webview (`tauriBackend.ts`,
`extensions.tsx`): the tray, idle detection and the long-run reminder, folder
backups, showing a file in the file manager, the capture server and
`taskmint://` links for the browser extension, updates, and the move from the
old identifier. Export and Import go through Android's file picker,
which returns a document (a `content://` address) rather than a path:
`tauri-plugin-fs`, a mobile-only dependency, opens it (`platform/os.rs`), and
the export's message names no location.

To check the Rust compiles for Android without the Gradle build, point Cargo
at the NDK's compiler (the `tauri android` commands do this themselves):

```bash
TC=$NDK_HOME/toolchains/llvm/prebuilt/darwin-x86_64/bin CC_aarch64_linux_android=$TC/aarch64-linux-android24-clang AR_aarch64_linux_android=$TC/llvm-ar cargo clippy -p taskmint --target aarch64-linux-android -- -D warnings
```

### Checks

`pnpm verify` (`scripts/verify.sh`) runs every gate below in order; run it
before merging. It needs the [prerequisites](#development) above, Java
included, and nothing else: no Docker, and no network once firebase-tools
and its Firestore emulator have been downloaded the first time.

```bash
pnpm lint                         # Biome: formatting and lint for the TypeScript and JavaScript
pnpm test:rules                   # the Firestore rules' tests, on the emulator (Java 21+)
pnpm build:wasm                   # the web app's core in WebAssembly (apps/web/src/wasm, not committed)
pnpm typecheck                    # tsc for sources and tests, every package (needs build:wasm first)
pnpm build                        # tsc for every package + the desktop and web vite builds
pnpm test                         # vitest in every package
pnpm test:coverage                # vitest, held at 100% coverage
cargo test --workspace            # Rust tests (bare `cargo` skips the desktop crate)
cargo clippy --workspace --all-targets -- -D warnings
cargo fmt --all --check
cargo llvm-cov -p taskmint-core --fail-under-lines 100 --fail-under-functions 100 --fail-under-regions 100  # verify.sh adds the policy's ignore regex
node scripts/check-coverage-policy.mjs   # see docs/coverage-policy.md
node scripts/check-toolchains.mjs        # the wasm target and wasm-bindgen pins agree
pnpm test:scripts                  # the release script's logic (node --test)
```

`pnpm lint:fix` applies Biome's formatting and safe fixes (`biome.jsonc` says
which rules are off and why). `pnpm install` points git at `.githooks/`,
whose pre-commit hook checks the staged TypeScript with Biome and the Rust
with `cargo fmt --check`. It only checks; `git commit --no-verify` skips it.
`.git-blame-ignore-revs` lists the formatting-only commits: GitHub skips
them, and `git blame --ignore-revs-file .git-blame-ignore-revs` does locally.

CI (`.github/workflows/ci.yml`) runs them on pushes to `main` and on pull
requests, on macOS. The Release workflow (`.github/workflows/release.yml`)
builds the release files and deploys the web app (see Releasing).

### Releasing

Each branch with a change users would notice adds a note in `changes/`
([changes/README.md](changes/README.md)). The notes say how big the change
is and what [CHANGELOG.md](CHANGELOG.md) says about it. In the main checkout,
on `main`:

```bash
pnpm release --dry-run    # the next version and its CHANGELOG section; changes nothing
pnpm release              # bump, CHANGELOG, commit "Release X.Y.Z", tag vX.Y.Z
pnpm release publish      # push main and the tag; CI builds and publishes the release
```

`pnpm release` takes the highest `bump` among the notes. It writes that
version into every manifest (the desktop, web, client and contracts
`package.json`s, the three crates and `Cargo.lock`; the extension keeps its
own), adds the CHANGELOG section, deletes the notes, then commits and tags.
It builds nothing: the Release workflow builds every installer from the
pushed tag. If the commit fails, the version files, CHANGELOG and notes are
put back. Nothing is pushed.

| Option | |
|---|---|
| `--patch`, `--minor`, `--major` | bump this level instead (needed when there are no notes) |
| `--publish` | then push `main` and the tag |
| `--rebuild` | only build the current version's installers into `releases/`, with no bump or commit: this computer's (`TaskMint-X.Y.Z-macos-arm64.dmg` on Apple silicon), or the `--target` and `--windows` ones |
| `--target <name>` | with `--rebuild`, build this instead of this computer's installer (repeat it for more): `macos-arm64`, `macos-x64` (cross-compiled on Apple silicon), `windows-x64`, `android-arm64` (on macOS or Linux, with the [Android](#android) prerequisites and the release key, see [Android signing](#android-signing)), `chrome-extension` |
| `--windows` | with `--rebuild`, also build `windows-x64` (on a Mac, cross-compiled with cargo-xwin) |

`pnpm release publish` pushes `main` and the current version's tag. The tag
starts the Release workflow, which builds every file a release ships on
GitHub's runners and then creates the GitHub release with the version's
CHANGELOG section (`gh run list --workflow release.yml` follows it):

| File | Built on |
|---|---|
| `TaskMint-X.Y.Z-macos-arm64.dmg` | macOS, Apple silicon |
| `TaskMint-X.Y.Z-macos-x64.dmg` | macOS, cross-compiled for Intel |
| `TaskMint-X.Y.Z-windows-x64-setup.exe` | Windows |
| `TaskMint-X.Y.Z-android-arm64.apk` | Linux, for arm64 Android phones ([Android](#android) says how to install it) |
| `TaskMint-X.Y.Z-chrome-extension.zip` | Linux ([apps/extension/README.md](apps/extension/README.md) says how to install it) |

Each is the real app: `release.mjs --rebuild` builds with
`TASKMINT_ENV=production` and `tauri.production.conf.json`, then checks the
webview's `dist/environment.json`, the Mac app's identifier and the APK's
package ([Dev environment](#dev-environment)).

Next to them are the desktop updates (see [Desktop updates](#desktop-updates)):
`TaskMint-X.Y.Z-macos-{arm64,x64}.app.tar.gz` and their `.sig` files,
`TaskMint-X.Y.Z-windows-x64-setup.exe.sig`, and `latest.json`.

The release is created only once all five are built, and a re-run replaces
the files of a release that already exists. The repository is public, so a
published release's files are public too. Running the workflow by hand
(Actions → Release → Run workflow), or a pull request that changes how
releases are built, builds the same files as workflow artifacts and
publishes nothing. The desktop builds report errors to Sentry when the
repository has a `VITE_SENTRY_DSN` secret (Settings → Secrets and variables
→ Actions); without it they report nothing. They sign in to cloud sync with
Google when it has `VITE_GOOGLE_DESKTOP_CLIENT_ID` and
`VITE_GOOGLE_DESKTOP_CLIENT_SECRET` ([Firebase](#firebase)); without them,
by email only.

**The web app.** The workflow also builds the web app, and a tag deploys
it to Firebase Hosting (https://taskmint-f9a05.web.app) with the Firestore
rules and indexes, once every build has passed (`deploy-web`). The GitHub
release doesn't wait for the deploy, and a failed deploy can be re-run on
its own. The deploy signs in to Google through Workload Identity Federation,
so no key is stored: the repository variables `GCP_WORKLOAD_IDENTITY_PROVIDER`
and `GCP_DEPLOY_SERVICE_ACCOUNT` name the provider (pool `github`, provider
`taskmint-releases`, which trusts only this repository's `v*` tags) and the
`github-deploy` service account, which can deploy Hosting, the rules and the
indexes, and can't read or change anyone's data (Hosting Admin, Firebase
Rules Admin, Cloud Datastore Index Admin and Service Usage Consumer; no
viewer role, since Firebase Viewer reads Firestore and the user list). [docs/runbook.md](docs/runbook.md) says how to
deploy by hand, or roll back.

The installers aren't signed (the Mac app is signed ad hoc). The first time
a downloaded build is opened, macOS says it can't verify TaskMint: open
System Settings → Privacy & Security and click **Open Anyway**. On Windows,
SmartScreen says it protected the PC: click **More info**, then **Run
anyway**.

A plain `pnpm tauri build` makes a dev build ("TaskMint Dev"); its installer
stays in `target/release/bundle/`.

#### Desktop updates

The installed app updates itself from the latest GitHub release. A few
seconds after launch, and then once a day, it reads
`https://github.com/BeardedUnicorn/taskmint/releases/latest/download/latest.json`
(Settings → Updates checks now, or turns the automatic check off). When that
names a newer version, the app asks. On yes it downloads the update, checks
its signature, installs it and restarts. On macOS the update replaces the app
where it is. On Windows the installer runs in passive mode (a progress window
and no questions), then starts TaskMint again. The Rust side does all this
with `tauri-plugin-updater` (`src/platform/os.rs`, `src/updates.rs`), so the
webview needs no extra permission. A development build checks but won't
install.

Updates are signed with a minisign key:

- The public key is `plugins.updater.pubkey` in
  `apps/desktop/src-tauri/tauri.conf.json`. The private key and its password
  are the repository secrets `TAURI_SIGNING_PRIVATE_KEY` and
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Only the Release workflow's build
  step sees them, and a tag's build stops at once if the key isn't set.
- With the key in the environment, a build also makes the updates
  (`src-tauri/tauri.updater.conf.json` turns on `createUpdaterArtifacts`).
  The macOS update is made from the `app` bundle target, so `bundle.targets`
  must keep `app` next to `dmg`. The Tauri CLI refuses to sign with a public
  key it can't read, such as a placeholder.
  `pnpm release --rebuild` checks each signature against the public key
  before the update goes into `releases/`, so a mismatched key can't ship.
  Without the key, as in a local `pnpm release --rebuild`, it builds the
  installer only.
- The workflow's last step writes `latest.json` from the signatures and the
  CHANGELOG section.
- `requireSignedVersion` is on. The bundler records the version in each
  signature, and the app installs an update only when that matches the
  version `latest.json` announces. So an older signed build can't be passed
  off as a newer one.
- **Keep a copy of the private key and its password** away from this
  computer (in a password manager, say). Without them, no later release can
  update the installed apps.
- **A new key** (lost or leaked): run
  `pnpm --filter @taskmint/desktop tauri signer generate -w ~/.tauri/taskmint-updater.key`,
  replace both secrets and `plugins.updater.pubkey`, and release. Installed
  apps can't verify an update signed with the new key, so that one release
  has to be downloaded and installed by hand. Updates work again after that.
- Releases before 2.3.0 have no updater, so 2.3.0 is installed by hand once.

Settings → Updates and its dialog come from `apps/desktop/src/updates.ts`,
`UpdatePrompt.tsx` and `settings/UpdatesSection.tsx`.
[docs/qa/excluded-code-checklist.md](docs/qa/excluded-code-checklist.md#updates-platformosrs)
says how to try an update against a local feed.

#### Android signing

Android installs an APK over the app only when both are signed with the same
key, so every release's APK is signed with one release key:

- The key is a PKCS12 keystore with one key, alias `taskmint`, whose password
  is the keystore's. The keystore (base64) and its password are the
  repository secrets `ANDROID_KEYSTORE` and `ANDROID_KEYSTORE_PASSWORD`. The
  Android build writes the keystore to the runner's temp folder, and only the
  build step sees the password.
- `pnpm release --rebuild --target android-arm64` refuses to build without
  `TASKMINT_ANDROID_KEYSTORE` (the keystore's path) and
  `TASKMINT_ANDROID_KEYSTORE_PASSWORD`. After the build it runs `apksigner`
  and checks that the APK's one signer has the certificate whose SHA-256 is
  `ANDROID_SIGNER_SHA256` in `scripts/release.mjs`. So an APK that wouldn't
  install over the last one can't ship. A local build with the key:

```bash
TASKMINT_ANDROID_KEYSTORE=~/.android/taskmint-release.p12 TASKMINT_ANDROID_KEYSTORE_PASSWORD="$(cat ~/.android/taskmint-release.password)" pnpm release --rebuild --target android-arm64
```

- **Keep a copy of the keystore and its password** away from this computer
  (in a password manager, say). Without them, no later APK installs over
  the app.
- **A new key** (lost or leaked): make one with `keytool -genkeypair
  -storetype PKCS12 -alias taskmint -keyalg RSA -keysize 4096 -validity 36500
  -dname "CN=TaskMint" -keystore <file>`, replace both secrets and
  `ANDROID_SIGNER_SHA256` (`keytool -list -v -keystore <file>` shows the
  SHA256, without the colons), and release. Phones have to uninstall the app
  before installing that APK, which deletes its data: Settings → Data
  Management → Export first, and Import after (or sync it first, and sign
  in again after). Register the new key's SHA-1 on the Firebase Android
  app and commit the new `google-services.json`, or Google sign-in stops
  working on the phone ([Android](#android)).

### Logs

The backend logs through `tauri-plugin-log` to stdout and to the app log dir
(`~/Library/Logs/com.taskmint.desktop/` on macOS). Release builds log `info` and
above, dev builds include `debug`.

## Firebase

Cloud sync and the web app run on the Firebase project `taskmint-f9a05`,
on the free Spark plan with billing off. Every build that isn't a release
uses its twin, `taskmint-dev` ([Dev environment](#dev-environment)). There's
no server of TaskMint's own: every client runs TaskMint's rules itself, and
Firestore holds the shared copy ([ADR 0002](docs/adr/0002-firebase.md)).

| Part | What it's for |
|---|---|
| **Authentication** | Accounts: email and password, and Google. Anyone can sign up |
| **Firestore** (`(default)`, nam5) | Each account's data: `users/{uid}` holds its epoch, `users/{uid}/data/{kind~key}` one session, work-log entry, project mapping or record each, and `users/{uid}/published/payoutForecast` the forecast for BudgetMint |
| **Hosting** | The web app, at https://taskmint-f9a05.web.app |
| **Analytics** | Page views from the web app and the Android app ([Error reporting and analytics](#error-reporting-and-analytics)) |

Each client has its own Firebase app registration and config, in each
project: the desktop's web config in `apps/desktop/src/firebaseConfig.ts`,
the web app's in `apps/web/src/firebaseConfig.ts`, and Android's
`google-services.*.json`.
They're public by design: the API key only names the project, and the rules
decide what a signed-in user can reach.

**The rules** (`firebase/firestore.rules`) let a signed-in user read and
write only under their own `users/{uid}`. A data document must have exactly
the sync fields, with a known kind, an `updatedAt` of the server's time, and
the account's current epoch, so a device that missed a Delete cloud data
can't write its old copy back. `firebase/firestore.rules.test.mjs` tests
them on the emulator (`pnpm test:rules`), and `firestore.indexes.json` keeps
the `json` and `hash` fields out of the indexes.

**Hosting** (`firebase.json`) serves `apps/web/dist` with a content security
policy (`script-src 'self' 'wasm-unsafe-eval'`, plus Google's sign-in and
Analytics hosts), nosniff, a referrer policy, COOP (`same-origin-allow-popups`,
for Google's popup), CORP, `X-Frame-Options` and a permissions policy. Every
path the app doesn't have serves `index.html`. The hashed files in `/assets`
are cached for a year; everything else is revalidated. Before a deploy,
`scripts/check-web-environment.mjs` checks `apps/web/dist` was built for the
project it's going to.

`pnpm firebase` runs firebase-tools at the version `package.json` pins
(through npx, outside the workspace). Deploys normally come from the
release workflow ([Releasing](#releasing)); [docs/runbook.md](docs/runbook.md)
has deploying by hand and rolling back.

### Dev environment

`TASKMINT_ENV` says which TaskMint a build is: `production` for a release,
`dev` (also when it's unset) for every other build. Vite, Cargo and Gradle
all read it ([scripts/environment.mjs](scripts/environment.mjs)), so
`pnpm tauri dev`, a plain `pnpm tauri build`, an Android build and the web
dev server are all dev builds. Only the release workflow
([Releasing](#releasing)) sets `production`. Any other value stops the
build.

| | Production (releases) | Dev (every other build) |
|---|---|---|
| Firebase project | `taskmint-f9a05` | `taskmint-dev` |
| Web app | https://taskmint-f9a05.web.app | https://taskmint-dev.web.app |
| Desktop app | TaskMint, `com.taskmint.desktop` | TaskMint Dev, `com.taskmint.desktop.dev` |
| Desktop links and capture port | `taskmint://`, 43117 | `taskmint-dev://`, 43127 |
| Desktop updates | from the latest GitHub release | none |
| Android app | TaskMint, `com.taskmint.android` | TaskMint Dev, `com.taskmint.android.dev` |
| Analytics | on, with the off switch | none |
| Sentry `environment` | `production` | `dev` |

A dev build is a separate app: its own data folder, webview storage (the
settings and the Firebase sign-in), single-instance lock and link scheme, so
it runs beside the installed TaskMint and never touches its data. Its
capture server listens on its own port, so the browser extension's captures
always go to the real app. It doesn't take over a pre-2.1 `com.taskmint.app`
folder. `tauri.conf.json` is the dev build, and `tauri.production.conf.json`
makes a build the real app. A build whose identifier and environment don't
match refuses to start (`src-tauri/src/environment.rs`).

**Building production yourself:** both halves, or it won't start.

```bash
cd apps/desktop && TASKMINT_ENV=production pnpm tauri build --config src-tauri/tauri.production.conf.json
```

**The dev project** mirrors production: email and Google sign-in (the dev
project safelists the desktop's Google client, so the same `.env` works),
email enumeration protection, Firestore in nam5 with the same rules and
indexes, and Hosting. It has no Analytics. Sign up there with any account.
`.firebaserc` makes it the default project, so a bare `pnpm firebase` command
works on dev; production needs `--project taskmint-f9a05` (or `production`).

Deploy the web app, rules and indexes to dev (it runs the rules' tests
first):

```bash
pnpm deploy:dev
```

### Develop against the emulators

The Auth and Firestore emulators (`firebase.json`: 9099 and 8085) need Java
21 or later. A development build talks to them when
`VITE_FIREBASE_EMULATOR_HOST` is set; installed builds ignore it. They run as
the dev project, the default in `.firebaserc`.

```bash
pnpm firebase emulators:start --only auth,firestore
```

```bash
VITE_FIREBASE_EMULATOR_HOST=127.0.0.1 pnpm --filter @taskmint/web dev    # http://localhost:1421
```

```bash
TASKMINT_DATA_DIR=$HOME/tmp/taskmint-dev VITE_FIREBASE_EMULATOR_HOST=127.0.0.1 pnpm tauri dev
```

From the Android emulator the host is `10.0.2.2`. Accounts made there exist
only in the emulator, and its data is gone when it stops.

To check the production headers, build the web app and serve it from the
Hosting emulator (port 5002). That build talks to the dev project:

```bash
pnpm build:wasm && pnpm --filter @taskmint/web build && pnpm firebase emulators:start --only hosting
```

### Google sign-in

- **Web app:** Firebase's Google provider (Authentication → Sign-in method),
  in a popup. Its OAuth client was made by Firebase. The popup works only on
  the authorized domains (Authentication → Settings): the Hosting domains
  and `localhost`.
- **Desktop:** the system browser, then back to a loopback address the app
  listens on (`src-tauri/src/google_sign_in.rs`, with PKCE), which answers
  with a page in TaskMint's look (`google_sign_in.html`) and brings the app
  forward, with `taskmint://open` (`taskmint-dev://open` from a dev build)
  for when the browser keeps the focus. It's Google's "Desktop app" OAuth
  client in Google Cloud console → APIs & Services → Credentials, in
  `taskmint-f9a05`; the dev project accepts it too (Authentication → Google
  → Safelist client IDs from external projects). Its id and secret go in `.env` as
  `VITE_GOOGLE_DESKTOP_CLIENT_ID` and `VITE_GOOGLE_DESKTOP_CLIENT_SECRET`,
  and in the repository secrets of the same names. Google treats an
  installed app's secret as public, but keep it out of the repository
  anyway. Without them the button is hidden.
- **Android:** Credential Manager, with the web client's id from the
  build's `google-services.*.json` ([Android](#android) says which
  certificates must be registered).

## Web app

`apps/web` (`@taskmint/web`) is TaskMint in a browser, at
https://taskmint-f9a05.web.app: the same app as the desktop's
(`packages/client`), on TaskMint's own rules compiled to WebAssembly
(`crates/taskmint-wasm`), with the account's data from Firestore.

- **Signing in** comes first: an email and password, a new account, a reset
  link, or Google. The app's code loads only after that, and opens once the
  account's data has been read.
- **Settings → Account:** the email you're signed in with, sign out, change
  password (by an emailed link), and delete the account with its cloud data.
  Reset All Data deletes the cloud data and keeps the account.
- **Live across tabs and devices:** changes from your other devices and tabs
  show up as they're made. Each tab is a device of its own to sync.
- **Offline:** the app needs the network to open. Once open, it keeps
  working, and Firestore keeps the changes in the browser until it's back
  online (if the tab is closed first, they go the next time the app opens
  there).
- **What only the desktop app has:** idle detection and the long-run
  reminder, automatic backups into a folder, the system tray, and the
  localhost capture server. Their settings are hidden. Exports are
  downloads, and imports use the browser's file picker. ⌘N and ⌘, belong to
  the browser, so the command palette (⌘K) offers both instead.

Develop it against the dev project (`pnpm --filter @taskmint/web dev`) or
the emulators ([Firebase](#develop-against-the-emulators)).
`pnpm build:wasm` must run first, and again after a change to
`crates/taskmint-core`.

## Project layout

A pnpm workspace and a Cargo workspace share the repo root. How the code
came to be shared by every app is
[docs/adr/0001-web-support.md](docs/adr/0001-web-support.md); how sync and
the web app work, [docs/adr/0002-firebase.md](docs/adr/0002-firebase.md).

```
packages/client/             React app (@taskmint/client)
  src/components/pages/      One folder/file per page (payouts/, settings/, tasks/)
  src/contexts/              App-wide providers: sessions, tasks, work logs, backups, …
  src/hooks/                 Data hooks (useSessionManagement, useWorkLogs, useDataBackup, …)
  src/services/              Tasks, notes, templates (appRecords.ts: the appdata.json cache)
  src/cloud/                 Cloud sync: the engine, and Firebase behind the CloudStore seam
  src/utils/                 Pure logic: time math, payouts, work-log import, Sentry, analytics
  src/types/                 Shared types and zod schemas
  public/                    Favicon, wordmark and app icon
packages/contracts/          Wire types, CommandMap and constants (@taskmint/contracts),
                             generated from taskmint-core: don't edit src/generated
crates/taskmint-core/        Business rules shared by every host: sessions, timers, work-log
                             import, restore, idle, sync, the wire contract (pure: no I/O, no clock)
  src/sync/                  Cloud sync's rules: what to send, applying the cloud's, merges
crates/taskmint-wasm/        taskmint-core in WebAssembly, for the web app (pnpm build:wasm)
apps/desktop/                Desktop app (@taskmint/desktop): Vite entry + Tauri shell
  src/tauriBackend.ts        The client's Backend: every call goes through dispatch
  src-tauri/src/dispatch.rs  The one IPC command: shell commands here, data commands to the backend
  src-tauri/src/backend/     LocalBackend: one lock, run taskmint-core on a copy, save, then swap
  src-tauri/src/store/       sessions.json / worklogs.json / appdata.json / sync.json and the .bak copies
  src-tauri/src/files.rs     Save/open dialogs, the backup folder, showing a file in Finder
  src-tauri/src/capture_server.rs  localhost capture server and taskmint:// deep links
  src-tauri/src/google_sign_in.rs  Google sign-in for cloud sync: the browser and a loopback address
  src-tauri/src/google_sign_in.html  The page the browser comes back to, in TaskMint's look
  src-tauri/src/tray/        System tray
  src-tauri/src/legacy_identifier.rs  Moves the data left under the pre-2.1 identifier
  src-tauri/src/config.rs    Constants
  src-tauri/capabilities/    Frontend permission grants
  src-tauri/gen/android/     The Android project (see Android)
apps/web/                    Web app (@taskmint/web): sign-in page, then the client on the wasm core
  src/wasmBackend.ts         The client's Backend: taskmint-core in WebAssembly
  src/settings/              The Account section
  src/wasm/                  pnpm build:wasm's output (not committed)
apps/extension/              Work-log capture extension (MV3, TypeScript; built into dist/)
firebase/                    Firestore rules, their tests, and indexes (firebase.json deploys them)
assets/brand/                Logo and app-icon masters (see Development)
docs/                        ADRs, the coverage policy, the security review, the runbook
  qa/                        The manual checklist for the code coverage leaves out
```

After changing a wire type, a command, or a constant in
`crates/taskmint-core/src/contract.rs`, regenerate the TypeScript and commit
it with the Rust (`scripts/verify.sh` fails while they differ):

```bash
cargo test -p taskmint-core --features ts --test contracts
```
