# Changelog

What changed in each TaskMint release, newest first. Versions follow
[semantic versioning](https://semver.org): a major release can break what
older desktops, servers or data expect, a minor one adds features, and a
patch fixes things.

`pnpm release` writes each section from the change notes in `changes/`
(see [changes/README.md](changes/README.md)). Settings → About shows this file.

## 4.5.0 – 2026-11-13

### Added

- On Android, long-pressing TaskMint's icon offers shortcuts: Start for your three likeliest tasks (favourites first, then the ones you used last), Add time, and Payouts.
- On Android, a short buzz as a timer starts or resumes, pauses or stops, as your phone's touch feedback setting allows. On a phone, the menu also opens with a swipe in from the left edge just above the bottom tabs (the rest of that edge stays Android's Back), and swipes shut.
- On Android, the long-run reminder, the end-of-day summary and the daily goal's milestones arrive with TaskMint closed. The phone sets each as an alarm ahead of time, from a running timer: the summary already holds the day's figures, and each milestone goes off when the timer will have earned it. Pausing or stopping moves or takes them back. The long-run reminder now works on a phone too, with its hours set under Settings → Notifications.
- On Android, a running timer shows in a notification: its task, its time counting up, and Pause (or Resume), Switch task and Stop buttons, which bring TaskMint forward as they act. Tapping it opens Sessions. It goes when the timer stops, and comes back after the phone restarts once you open TaskMint. Settings' "System notifications" switch turns it off, as does the phone's own setting for TaskMint's "Running timer" notifications.
- The Android app checks for new releases at launch and once a day, as the desktop app does, with Settings → Updates and About to check now. Download opens the new version in your browser; open it once it's downloaded and Android updates TaskMint, keeping your data.
- On Android, two home-screen widgets. Today shows today's money and time, your daily goal, and the running timer counting, with Pause, Resume or Start. Payouts shows the next withdrawal's amount, when it opens (or that it's open) and the next release. Each says when its figures were worked out: the timer counts on its own, and the figures refresh whenever TaskMint is open.
- On a phone, a search button in the top bar opens the command palette, to jump to a page or setting or start a task by typing. Before, only ⌘K or Ctrl+K opened it, which a phone doesn't have.

### Changed

- On Android, TaskMint asks to send notifications when you first start work on the phone, set a withdrawal reminder or send a test notification, instead of over the launch screen before you've seen the app.
- The Android app stays in portrait. Turned sideways, a phone used to get the desktop layout, with the clock drawn over the logo and details cut off.
- History's charts show time or earnings, one at a time, with a Time | Earnings switch above them, instead of both on two scales in two similar greens. On a phone the bars run across with the task names beside them. The task pie uses colours that colour-blind readers can tell apart, keeps each task's colour as shares change, and puts tasks past the fifth into Other.
- Tapping a notification opens the page it's about: Payouts for a withdrawal reminder or captured work logs, Home for the daily goal, History for the end-of-day summary, Sessions for a long run or an idle pause. On Android, notifications show the TaskMint leaf instead of a generic "i", and come in two groups, Reminders and Activity, which your phone's notification settings can silence or let pop up separately (Reminders pop up by default). That's also where Android now sets their sound, in place of Settings' "Play a sound" switch, which did nothing there.
- On a phone, the Calendar lists the month week by week instead of squeezing the desktop's grid: each week shows its time and earnings, and each day with work, a release, a withdrawal or the next withdrawal's opening gets a row with its time, goal bar, amount and badges. Tapping a day opens its breakdown in place, with each task, release and withdrawal on its own line and Record withdrawal at hand. The month now comes before the next-withdrawal panel, and a day's screen-reader label says how it did against the daily goal.
- On a phone, Settings opens as a list of its sections, and each opens on its own screen with a way back (Android's back too), instead of one very long page. In About, this version's notes fold away like the earlier ones, and open by themselves when you come from What's new.
- On a phone, Payouts' upcoming releases, withdrawals and daily reconciliation, History's time entries and daily goal, and a task's own entries are lists of rows instead of tables that scrolled sideways and cut their last columns off. Each row shows what it is, its amount, and the rest underneath; tap a release to schedule a withdrawal, and Edit or Delete an entry or withdrawal from its ⋮ menu. History's entries sort from a Sort by menu. Dates read "Fri, Nov 13" rather than "2026-11-13".
- On a phone, each task in the list has one ⋮ button for Edit, Archive (or Unarchive) and Delete, in place of three icons on every row.

### Fixed

- On Android, the back gesture no longer closes TaskMint from wherever you are. It closes the open dialog, menu, date picker or navigation menu first, then goes from a task back to the task list, then back to Home; from Home it leaves the app as before.
- On Android, the tabs along the bottom, notices and full-screen dialogs keep clear of the gesture bar, instead of their labels running under its handle.
- On Android, a dialog moves up above the on-screen keyboard, so its fields and its Save, Add or Cancel buttons stay in reach while you type. Before, the keyboard covered them in Add task, Import work logs, notes and the withdrawal note.
- On Android, a scheduled withdrawal's reminder still arrives after the phone restarts, without opening TaskMint first. If it came due while the phone was off, it shows once the phone has started and been unlocked.
- Times and dates read the same everywhere. A task's time entries and History's entries show clock times as the rest of the app does ("7:12 PM" rather than "19:12"), dates drop the leading zero ("Nov 7, 2026" rather than "Nov 07, 2026"), and a task's created time no longer reads "08:42 PM".
- In light mode, mint-green text is now a darker green that reads on white: the figures on summary cards (Session time, This week), outlined task chips on Home, and the selected tab along the bottom of a phone's screen. They were too pale to read comfortably.
- Settings → Notifications lists only what the device can send. On a phone and on the web, it no longer shows the long-run reminder, idle pauses, work logs from the browser or automatic backups, which only the desktop app sends. Its wording now fits the device, including where Android keeps TaskMint's notification settings.
- On a phone, Payouts' third summary card (Estimated) takes the whole row instead of sitting alone beside an empty half.
- On a phone, a session's buttons on Home and Sessions line up: Resume (or Pause) and Switch task share a row with the menu, and End Session runs across the card below them, instead of wrapping unevenly.
- On a phone, the task list no longer paints the last task you opened in a bright green bar: the list and the task are separate screens there, so there's nothing beside it to mark.
- Release notes in Settings → About show bold text in bold, instead of with the asterisks around it ("**Stop syncing**").
- Switch task opens a dialog called "Switch task" instead of "Start Work".
- The cloud sync line at the foot of a phone's menu is tall enough to tap comfortably.

## 4.4.1 – 2026-11-12

No user-facing changes.

## 4.4.0 – 2026-11-12

### Added

- About TaskMint (in the ⌘K palette, and from Settings → About) shows the version and when it was released, with What's new and links to TaskMint on GitHub and to report a problem. On the desktop it also checks for updates and shows the data and logs folders, and on a phone it opens the links. Copy diagnostics puts the version, system, folders and sync status (never your account) on the clipboard to paste into a report. The palette also has Check for updates on the desktop.
- The desktop app has its own menus: on a Mac in the menu bar, on Windows across the top of the window. TaskMint (or Help on Windows) has About TaskMint and Check for Updates…, then Settings and Cloud Sync…; File has New Task, Start Work…, Add Time… and Import Work Logs…; View opens each page and the command palette; Timer pauses, resumes and stops the timer that's running, naming its task; Help opens TaskMint's help and a new problem report on GitHub, What's New, the keyboard shortcuts, and the data and logs folders. The menus show each item's shortcut.
- New shortcuts on the desktop: ⇧⌘N (Ctrl+Shift+N) starts work, and ⇧⌘P (Ctrl+Shift+P) pauses the timer or resumes it.
- A Home page: what's running (with one-click starts for your favorite and most recent tasks when nothing is), what you've earned today and this week (the Calendar's figures, `~` on estimates), your daily goal, the next withdrawal, your last few sessions, and a reminder with an Import button when your work logs haven't been imported for a few days.
- On a phone, tabs along the bottom of the screen open Home, Sessions, Calendar and Payouts with one tap; tapping the tab you're on goes back to the top of its page. The menu in the top bar still opens every page, and notices now appear above the tabs.

### Changed

- Cloud sync's **Stop syncing** is now **Sign out**, also in the ⌘K palette ("Sign out of cloud sync"). It asks first, then signs this device out and keeps its data, and says when it's done or why it couldn't. Settings → Cloud sync says how you sign in (Google, or email and password).
- The foot of the sidebar shows where cloud sync stands (Synced, Syncing…, Not signed in, Sync needs attention); clicking it opens Settings → Cloud sync.
- After signing out of one account, signing in to a different one asks before this device's data goes there, even when that account is empty: add it to the new account, or start this device empty (a copy of its data is kept first).
- TaskMint always opens on Home instead of the page you had open last. The page shortcuts move up one to make room: ⌘1 (Ctrl+1 on Windows) opens Home, ⌘2 Sessions, and so on to ⌘8 Settings.

### Fixed

- On a phone, the daily goal's milestone notifications arrive while the menu is closed too, and each day keeps the goal it had.
- A page you open starts at its top, instead of scrolled as far down as the page before it was.
- A task with "&" in its name (R&D) shows it in the tray's menu, instead of losing it.

## 4.3.0 – 2026-11-11

### Changed

- Delete account deletes only your TaskMint data and account. BudgetMint keeps its data on its own now, so deleting your TaskMint account leaves it alone; BudgetMint just stops seeing your payouts.
- After you choose your account in Google sign-in on the desktop, TaskMint comes back to the front by itself, even when its window was minimized or closed to the tray. Where the browser keeps the focus, it offers to open TaskMint instead. The browser page you land on now looks like TaskMint, in the app's light or dark mode, with an Open TaskMint button.

### Fixed

- Cancelling Google sign-in on the desktop, or a sign-in that fails, no longer shows "You're signed in" in the browser.

## 4.2.4 – 2026-11-11

### Changed

- Google sign-in for cloud sync uses newer versions of the libraries that hash and encode its sign-in challenge. Signing in works as before.

## 4.2.3 – 2026-11-11

### Changed

- The payout forecast BudgetMint reads now says which day each payout was earned on, so BudgetMint's calendar can show your earnings on the days you worked until a withdrawal takes them.

## 4.2.2 – 2026-11-11

### Fixed

- In light mode, the outline around the focused day on the Calendar is dark enough to see.
- In Safari and the Mac app, a field's border no longer runs through its label while it's selected, or leaves a gap above an empty field you've left.

## 4.2.1 – 2026-11-11

### Fixed

- In dark mode, the text on colored chips and buttons and the teal text are easier to read.
- In light mode, the outline around the focused button or field is dark enough to see.

## 4.2.0 – 2026-11-10

### Added

- With cloud sync on, TaskMint shares your upcoming withdrawals with BudgetMint (signed in with the same account), so it can plan your bills around them. Only amounts and times are shared: no task names or notes. Deleting your account from TaskMint deletes your BudgetMint data too.

## 4.1.0 – 2026-11-10

### Added

- On Android, TaskMint opens on a launch screen with its logo and name on the app icon's teal, which stays until the app has drawn, instead of a black screen.
- Schedule your next withdrawal from Payouts → Upcoming releases: choose a release (or its alarm button) and TaskMint notifies you "Withdrawal ready", with the amount, when you can take that money out. One is scheduled at a time; the Next withdrawal panel shows it with Remove, and recording a withdrawal finishes it. It syncs, so every signed-in device reminds you: a phone sets an alarm that fires even with TaskMint closed, and a computer notifies while TaskMint runs (or as soon as it runs again, if it was asleep or closed at the time).
- Upcoming releases marks the ones held by Days between withdrawals: a lock on each release that lands before your next withdrawal opens, and a "Withdrawals open …" line where it does. A withdrawal scheduled for a held release reminds you when withdrawals open.

### Fixed

- Android notifications show their text when expanded too, not just the title.

## 4.0.0 – 2026-11-09

### Added

- The web app and the Android app send which pages you open to Firebase Analytics, so we can see what's used; never your data. Turn it off in Settings → Privacy → Share usage statistics. The desktop app sends none.
- TaskMint runs on Android phones: each release has an APK (`TaskMint-X.Y.Z-android-arm64.apk`) to install on arm64 phones, and a later release's APK installs over it and keeps your data (see the README's Android section). On a phone it has its timers, data and notifications, and Export, Import and Restore Exactly go through Android's own file picker. The tray, idle detection and the long-run reminder, folder backups, browser capture and updates stay on the desktop. The desktop app is unchanged.
- Cloud sync: sign in under Settings → Cloud sync, with an email and password or with Google, and your computers and phones keep their sessions, work logs, tasks, notes, templates, daily goal, withdrawals and payout settings in step. Each device keeps working offline and catches up when it's back; timers from two devices in the same session are both kept, and only the timer started last keeps running. Signing in on a device that already has data asks whether to merge it with the account's or use the account's. Stop syncing signs a device out and keeps its data; Delete cloud data removes the account's copy and stops every device, each keeping its own. Device settings (appearance, notifications, idle, backups) stay on each device, and idle detection and the long-run reminder act only on timers running on that computer. Without signing in, everything stays on the device as before.
- TaskMint runs in a browser at https://taskmint-f9a05.web.app, signed in to the same account as your devices: sign up there or with the apps, by email or with Google. Its settings have Account (sign out, change password, delete the account). Browser captures reach it through the desktop app's sync.
- TaskMint fits a phone screen. Below 600px wide, a top bar with a menu replaces the sidebar, pages stack into one column, Tasks shows the list or one task at a time, dialogs fill the width (the larger ones the whole screen), and wide tables scroll sideways with their first column pinned. On a touch screen, small buttons get bigger and the keyboard shortcuts list is hidden. The desktop layout is unchanged.

### Changed

- While a session is active, the Sessions page shows only that session. The All Sessions list and its Add time button come back once the session ends (Add time is still in the command palette and on the History page).
- Choosing a task is a plain dropdown everywhere you start work, add a timer, log or edit time, or match an imported project: tasks are added on the Tasks page, so there's no search box to type into. Favorites are starred and each task's hourly rate shows in the list, and the import no longer offers archived tasks (a project already matched to one still imports to it).

### Removed

- The self-hosted TaskMint server, its web app and the desktop's server mode are gone, replaced by cloud sync. Settings → Server is now Settings → Cloud sync, and the browser extension delivers captures only to the desktop app (its option to send them to a server is gone). Data kept on a TaskMint server isn't moved: export it from that server's web app first, then import it on a device.

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
