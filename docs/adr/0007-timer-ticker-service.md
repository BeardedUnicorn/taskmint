# ADR 0007: A foreground service that draws a running timer's money each second

- **Status:** accepted (2026-11-20)
- **Scope:** how the Android running timer's notification (the lock screen's
  Live Update) and the Today widget show today's time and money moving in
  real time

## Context

The notification and the Today widget show what the day comes to: today's
time and the money earned today (never the one timer's own clock). Neither
moved in real time on Android 17:

- Today's time was a `Notification.Metric.TimeDifference` in its adaptive
  format, which the system writes in words ("3h 12m"), so it changed once a
  minute.
- The money was fixed text in whole dollars ("~$45"), drawn again by an
  inexact alarm as each dollar was earned and at most once a minute.

Android counts a clock on its own, with the app dead. It has no figure that
counts money: a notification's metric and a widget's text change only when
the app sends them again. And Android 17 freezes an app about a minute after
it leaves the screen, so nothing in TaskMint can run each second in the
background, except in a foreground service. An alarm can't stand in: Android
holds alarms at least five seconds apart, and each one would wake a frozen
process.

The snapshot already says how the money grows (`today.earning`: a base, a
rate and where the running timer's time counts from; [the widgets'
contract](../contracts/widgets.md)), so the phone can work the money out at
any moment by itself. Only the drawing was missing.

## Decisions

1. **Today's time is a clock the system counts.** The Android 17 figure uses
   `FORMAT_CHRONOMETER` ("3:12:45"), running and paused alike. It costs
   nothing and moves each second with TaskMint dead.
2. **While a timer earns, a foreground service draws the money each
   second** (`TimerTicker.kt`), to the cent ("~$45.37"), on the notification
   and the Today widget. Its type is `specialUse` (Android 14 and later): no
   other type describes it, it has no time limit, and it may start as the
   phone does. TaskMint isn't on the Play Store, which is where that type
   needs a review.
3. **Its notification is the timer's own** (id 4200). A foreground service
   has to show one, and a second notification for the same timer would be
   noise. Two things follow, and `TimerNotices` handles both:
   - Android won't take a service's notification down while the service
     runs, so the ticker removes it as it stops when the timer has gone.
   - Android removes it when the process dies. So the notification no
     longer asks "am I still showing?" before a redraw; a swipe is recorded
     instead (a delete intent), and a notification that's gone for any other
     reason comes back at the next draw.
4. **It runs only while there's something to tick for, and draws only while
   the screen is lit.** Something to tick for: the notification is up (not
   swiped away) over a running timer whose money grows today
   (`WidgetFigures.ticks`). The lock screen counts as lit; with the screen
   off, or dimmed to the always-on display, nothing is scheduled and no wake
   lock is held. It stops on a pause, a stop, at midnight (the figures are
   then yesterday's) and when the user swipes the notification away.
5. **Without the ticker, the figures are as they were.** Android lets a
   service like this start only from certain places: with TaskMint in front,
   from a tap on a notification or a widget, from a high-priority push, as
   the phone starts or TaskMint is updated. `TimerTicker.sync` asks wherever
   the figures or the timer change (`Widgets.scheduleRefresh`) and when
   TaskMint comes forward, and leaves it when Android refuses. The dollar
   alarm stays exactly as it was, so a refused start, a killed process and
   Android 13 and earlier all show the money in whole dollars, drawn as each
   dollar is earned. Growing money has cents only while the ticker draws it:
   cents that stood still would look stuck. A paused timer's money keeps the
   cents it had got to (`today.moneyCents`) wherever the ticker can run, so
   a pause doesn't round "~$1.69" to "~$2".
6. **Nothing changes in what the page or other devices send.** The snapshot
   is the same, still sent when its text changes (about once a minute while
   a timer runs); a figure that moved each second must never be put in it.
   All the arithmetic the ticker needs is in `WidgetFigures`, under test.

## Consequences

- While a timer earns, TaskMint's process stays alive on the phone, page
  included, and Android lists TaskMint among the apps active in the
  background. The cost is a notification update and a Today widget redraw a
  second while the screen is lit, and nothing while it's off.
- The Today widget is redrawn whole each second (every size's layout). An
  update of just the money text isn't safe: a widget's views are sent per
  size class, and a partial update doesn't reach inside them. Setting the
  clock's base again to the same moment doesn't make it jump.
- Swiping the notification away stops the ticking on the Today widget too,
  until the timer next changes: without its notification the service can't
  run.
- A timer started on another device ticks on the phone once a push, a tap or
  opening TaskMint has let the service start; a background check of the
  published figures (WorkManager) can't start it, and until then the money
  is drawn by the dollar.

## Not chosen

- **An exact alarm every few seconds.** No service, but the money would
  step, not count, and each alarm wakes the process.
- **A custom notification layout with its own views.** A notification with
  custom views can't be a Live Update, and there is still no view that
  counts money.
- **A second, minimal notification for the service.** Two notifications for
  one timer.
