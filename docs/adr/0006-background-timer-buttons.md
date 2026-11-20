# ADR 0006: Timer buttons that act with the app closed

- **Status:** accepted (2026-11-19)
- **Scope:** how the Android Today widget's Start, Pause and Resume, and the
  running timer's notification's Pause, Resume and Stop, act without opening
  TaskMint

## Context

Every timer button on the phone opened TaskMint: the activity started, the
page loaded, took the action (`takeLaunch`) and passed it to the shell, which
ran it. The work was always the shell's (`launch.rs`, `tray::run`), but the
shell only exists once an activity has started Tauri, and the data
(`LocalBackend`) lived inside Tauri's state. Pausing from the home screen
meant watching the app open.

A receiver can run without an activity. What it needs is the data layer
without Tauri, and one rule kept: the data files have a single reader and
writer in a process. `LocalBackend` loads them once and saves whole files, so
a second copy over the same files would overwrite the first one's changes.

## Decisions

1. **The buttons call the Rust directly.** A receiver (`WidgetAction.kt`)
   calls one JNI function (`platform/os.rs`,
   `Java_com_taskmint_android_Headless_act`) with the data folder and the
   action. The decisions are in `headless.rs`, under test like the rest of
   the shell; the JNI function only passes strings.
2. **One backend per process, opened by whoever comes first**
   (`headless::shared`). The app, when it starts, builds its state around the
   backend already open (`AppState::over`) and listens to its changes from
   then on; a button pressed while the app is alive in the background goes
   through the same backend, so the page hears of it through the usual
   events. Before the app has started nobody listens, and nothing needs to:
   the page reads everything as it loads.
3. **The phone shows the result itself.** The reply says how the timer
   stands (`{done, timer: {task, countingFromMs, beganToday}}`). Kotlin moves
   the kept widget figures on as the page would have written them
   (`WidgetFigures.afterAction`, under test), and sets or clears the
   notification. For that the snapshot gained three additive fields (still
   schema 2): `start` (the task used last, which Start begins and the idle
   card names), `timer.perHourCents` and `start.perHourCents` (what the money
   grows by), and `today.moneyCents`.
4. **A button acts here only on the phone's own figures.** The kept snapshot
   says whose it is (`own`: the page's, or a button's since). Over figures
   another device published, the phone's data may not have that timer yet,
   and the button opens TaskMint as before. So does an action that couldn't
   be done (`done: false`), and Start when no task has been used yet.
5. **What only the page does waits for the app.** Cloud sync runs in the
   page ([ADR 0002](0002-firebase.md) decision 6), so other devices hear of a
   button's action when TaskMint is next opened on the phone, and the
   reminders for a running timer (set by the page) come then too. A timer
   that stops running loses those reminders at once. Until the page has sent
   its own figures again the phone refuses published ones (`Widgets.ahead`):
   its own are newer than anything the cloud has.

## Consequences

- Pausing on the phone and walking to the desktop shows the timer still
  running there until the phone's TaskMint has been opened. A phone-side
  sync without the page would mean the merge in Kotlin or a second Firestore
  client, which [ADR 0005](0005-widget-push.md) decision 1 turned down.
- `Shell.backend` is an `Arc`; a desktop opens its own as before.
- The Android build depends on `jni` directly (the version Tauri uses).
- Kotlin stays out of coverage; its arithmetic is in `WidgetFigures.kt` with
  JUnit tests, which `scripts/check-android.sh` runs.
