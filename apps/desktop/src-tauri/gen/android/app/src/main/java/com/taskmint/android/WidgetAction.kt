package com.taskmint.android

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import kotlin.concurrent.thread
import org.json.JSONObject

/**
 * A timer button pressed on the Today widget (Start, Pause, Resume) or on
 * the running timer's notification (Pause, Resume, Stop): it acts here, in
 * the background, and TaskMint doesn't open.
 *
 * The action runs in TaskMint's own code, on the phone's data (Headless).
 * Then the phone shows it at once: the widgets' figures are moved on as the
 * page would have written them (WidgetFigures.afterAction: the timer, and
 * today's time and money counting or standing still), the notification is
 * set or taken down, and a timer that no longer runs loses the reminders
 * that were set for a running one.
 *
 * What only the page does waits for TaskMint to be opened: cloud sync, so
 * other devices hear of it then, and the reminders for a timer started
 * here. Until the page has sent its own figures again, another device's
 * published ones are left alone (Widgets.ahead): this phone's are newer than
 * anything the cloud has.
 *
 * A button is one of these only while the figures shown are the phone's own
 * (TodayViews, TimerNotices). When they're another device's, the phone's
 * data may not have that timer yet, and the button opens TaskMint as it
 * always did; so does an action that couldn't be done.
 */
class WidgetAction : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.getStringExtra(Launch.ACTION) ?: return
    val app = context.applicationContext
    val pending = goAsync()
    thread {
      try {
        TimerButtons.press(app, action)
      } catch (e: Exception) {
        Log.w(TimerButtons.TAG, "Couldn't $action", e)
      } finally {
        pending.finish()
      }
    }
  }
}

object TimerButtons {
  const val TAG = "TaskMintButtons"
  private const val PRESS = "com.taskmint.android.TIMER_BUTTON"

  /** The notification's Stop (timer_notice.rs STOP); the others are Launch's. */
  const val STOP = "stop"

  /** Starts the task whose id follows (contract::launch START_TASK). */
  fun start(taskId: String) = "start-task:$taskId"

  /** The reminders set for a running timer (contract.rs): the long run's, and the goal's four milestones. */
  private val RUNNING_REMINDERS = listOf(4110, 4130, 4131, 4132, 4133)

  /** What a button does when pressed: `action`, here, without opening TaskMint. */
  fun pending(context: Context, action: String): PendingIntent =
    PendingIntent.getBroadcast(
      context,
      // One per action: Android treats intents that differ only in their extras as one
      "button:$action".hashCode(),
      Intent(context, WidgetAction::class.java).setAction(PRESS).putExtra(Launch.ACTION, action),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )

  /** Runs `action` and shows what it came to. Reads and saves files: not on the main thread. */
  fun press(context: Context, action: String) {
    val acted =
      runCatching { Headless.act(context.dataDir.absolutePath, action) }
        .onFailure { Log.w(TAG, "Couldn't run $action", it) }
        .getOrNull()
        ?.let { runCatching { JSONObject(it) }.getOrNull() }
    if (acted == null || !acted.optBoolean("done")) {
      Log.w(TAG, "$action wasn't done here; opening TaskMint for it")
      openApp(context, action)
      return
    }

    val now = System.currentTimeMillis()
    Widgets.snapshot(context)?.let { figures ->
      Widgets.save(context, WidgetFigures.afterAction(figures, acted, now, Widgets.today()).toString(), own = true)
    }
    Widgets.setAhead(context, true)

    val timer = acted.optJSONObject("timer")
    val countingFrom = timer?.time("countingFromMs")
    if (WidgetSync.timerNoticeWanted(context)) {
      if (timer != null) TimerNotices.set(context, TimerNotice(timer.getString("task"), countingFrom))
      else TimerNotices.clear(context)
    }
    if (countingFrom == null) for (id in RUNNING_REMINDERS) Reminders.cancel(context, id)
  }

  /**
   * The action couldn't be done here: TaskMint opens for it, as the button
   * did before. The figures are no longer taken for the phone's own, so the
   * buttons drawn from now on open TaskMint themselves (Android may not let
   * a receiver open it).
   */
  private fun openApp(context: Context, action: String) {
    Widgets.snapshot(context)?.let { Widgets.save(context, it.toString(), own = false) }
    runCatching {
      if (action == STOP) TimerNotices.open(context, action).send() else context.startActivity(Launch.intent(context, action))
    }.onFailure { Log.w(TAG, "Couldn't open TaskMint for $action", it) }
  }
}
