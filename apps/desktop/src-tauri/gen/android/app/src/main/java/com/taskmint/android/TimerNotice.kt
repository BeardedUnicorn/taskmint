package com.taskmint.android

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.Icon
import android.os.Build
import android.os.Bundle
import androidx.annotation.RequiresApi
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import app.tauri.notification.ACTION_INTENT_KEY
import app.tauri.notification.DEFAULT_PRESS_ACTION
import app.tauri.notification.NOTIFICATION_INTENT_KEY
import com.taskmint.android.Widgets.text
import com.taskmint.android.Widgets.time
import java.time.Duration
import java.time.Instant
import org.json.JSONException
import org.json.JSONObject

/**
 * The running timer's notification as the shell wants it (timer_notice.rs):
 * the task, the line under it ("Running", "Paused at 1h 23m"), and either
 * when the timer would have started had it never paused (it runs, and the
 * system's clock counts from there) or how long it had run (it's paused).
 */
data class TimerNotice(
  val task: String,
  val text: String,
  val countingFromMs: Long?,
  val pausedMs: Long?,
  val channel: String,
) {
  val running: Boolean
    get() = countingFromMs != null

  fun toJson(): String =
    JSONObject()
      .put("task", task)
      .put("text", text)
      .put("countingFromMs", countingFromMs ?: JSONObject.NULL)
      .put("pausedMs", pausedMs ?: JSONObject.NULL)
      .put("channel", channel)
      .toString()

  companion object {
    fun fromJson(json: String): TimerNotice? =
      try {
        val saved = JSONObject(json)
        TimerNotice(
          saved.getString("task"),
          saved.getString("text"),
          saved.time("countingFromMs"),
          saved.time("pausedMs"),
          saved.getString("channel"),
        )
      } catch (_: JSONException) {
        null
      }
  }
}

/**
 * The running timer's notification: the task, its time counting, and buttons
 * to pause or resume, switch task, or stop. The shell says what it shows and
 * when (os.rs, through [RemindersPlugin]); this draws it, which the
 * notification plugin couldn't do as Android 16 and 17 allow:
 *
 * - From Android 16 it asks to be a Live Update (the user can turn that off
 *   in the phone's settings for TaskMint): the time then also counts in a
 *   chip in the status bar. Android 17 makes it one; Android 16's first
 *   release takes the request and shows the notification as before.
 * - Android 17 lays it out as figures (Notification.MetricStyle): the timer,
 *   and today's time and money from the widgets' figures (Widgets), which
 *   the page works out. They're as fresh as the page last sent: the times
 *   count on their own, the money waits for the page.
 *
 * A tap or a button opens TaskMint with the notification plugin's extras,
 * which say what was pressed (MainActivity.keepLaunch), as a reminder's tap
 * does. The intent has an action of its own: the plugin takes down the
 * notification of any ACTION_MAIN intent with those extras, and this one
 * stays up.
 */
object TimerNotices {
  /** The notification's id (timer_notice.rs TIMER_NOTICE_ID): the page knows the timer's by it. */
  const val ID = 4200

  private const val STORE = "taskmint_timer_notice"
  private const val NOTICE = "notice"
  private const val PRESS = "com.taskmint.android.TIMER_NOTICE"

  /** The buttons, as timer_notice.rs knows them. */
  private const val PAUSE = "pause"
  private const val RESUME = "resume"
  private const val SWITCH = "switch"
  private const val STOP = "stop"

  /** The leaf's tint, as os.rs `routed` gives the plugin's notifications. */
  private val ICON_COLOR = Color.parseColor("#65D6A1")

  /** Shows `notice`, in place of the one before, and keeps it to draw again when today's figures change. */
  fun set(context: Context, notice: TimerNotice) {
    saved(context).edit().putString(NOTICE, notice.toJson()).apply()
    show(context, notice)
    // Today's figures are a day's: they go at midnight (Widgets.redrawAll)
    Widgets.scheduleRefresh(context)
  }

  /** Takes it down: nothing runs or waits paused. */
  fun clear(context: Context) {
    saved(context).edit().remove(NOTICE).apply()
    NotificationManagerCompat.from(context).cancel(ID)
    Widgets.scheduleRefresh(context)
  }

  /** Whether it shows figures that change without the timer changing (Android 17's, with today's). */
  fun followsFigures(context: Context): Boolean =
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.CINNAMON_BUN && saved(context).contains(NOTICE)

  /**
   * Draws it again with today's figures as they are now, if it's still up:
   * one the user swiped away stays gone until the timer changes.
   */
  fun redraw(context: Context) {
    if (!followsFigures(context)) return
    val notice = saved(context).getString(NOTICE, null)?.let(TimerNotice::fromJson) ?: return
    val showing = context.getSystemService(NotificationManager::class.java).activeNotifications.any { it.id == ID }
    if (showing) show(context, notice)
  }

  /** The part of the widgets' figures it shows: it's drawn again when this changes. */
  fun part(snapshot: JSONObject): String {
    val today = snapshot.optJSONObject("today")
    return listOf(snapshot.opt("day"), today?.opt("money"), today?.opt("countingFromMs"), today?.opt("timeMs")).toString()
  }

  private fun saved(context: Context) = context.getSharedPreferences(STORE, Context.MODE_PRIVATE)

  /** What a press opens TaskMint with: `action` is a button's, or the plugin's for a tap. */
  private fun press(context: Context, action: String): PendingIntent =
    PendingIntent.getActivity(
      context,
      // One per action: Android treats intents that differ only in their extras as one
      "timer:$action".hashCode(),
      Intent(context, MainActivity::class.java)
        .setAction(PRESS)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        .putExtra(NOTIFICATION_INTENT_KEY, ID)
        .putExtra(ACTION_INTENT_KEY, action),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

  /** The buttons, in order: each one's words and what it reports. */
  private fun buttons(context: Context, notice: TimerNotice): List<Pair<String, String>> =
    listOf(
      if (notice.running) context.getString(R.string.timer_notice_pause) to PAUSE
      else context.getString(R.string.timer_notice_resume) to RESUME,
      context.getString(R.string.timer_notice_switch) to SWITCH,
      context.getString(R.string.timer_notice_stop) to STOP,
    )

  // Posting without permission (Android 13 and later) does nothing, and
  // areNotificationsEnabled says so first
  @SuppressLint("MissingPermission")
  private fun show(context: Context, notice: TimerNotice) {
    val notifications = NotificationManagerCompat.from(context)
    if (!notifications.areNotificationsEnabled()) return
    val notification =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.BAKLAVA) liveUpdate(context, notice) else plain(context, notice)
    notifications.notify(ID, notification)
  }

  /** Before Android 16: the task, the system's clock counting while it runs, and the buttons. */
  private fun plain(context: Context, notice: TimerNotice): Notification {
    val builder =
      NotificationCompat.Builder(context, notice.channel)
        .setSmallIcon(R.drawable.ic_stat_taskmint)
        .setColor(ICON_COLOR)
        .setContentTitle(notice.task)
        .setContentText(notice.text)
        .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
        // Android 7, which has no channels: quiet, as the Running timer channel is
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setContentIntent(press(context, DEFAULT_PRESS_ACTION))
        .setShowWhen(notice.running)
    notice.countingFromMs?.let { builder.setWhen(it).setUsesChronometer(true) }
    for ((label, action) in buttons(context, notice)) builder.addAction(0, label, press(context, action))
    return builder.build()
  }

  /**
   * Android 16 and later: asks to be a Live Update, through the
   * notification's extras (Android 16's first release has no setter for it,
   * and doesn't promote it either). The chip in the status bar counts the
   * timer, or says it's paused.
   */
  @RequiresApi(Build.VERSION_CODES.BAKLAVA)
  private fun liveUpdate(context: Context, notice: TimerNotice): Notification {
    val builder =
      Notification.Builder(context, notice.channel)
        .setSmallIcon(R.drawable.ic_stat_taskmint)
        .setColor(ICON_COLOR)
        .setContentTitle(notice.task)
        .setContentText(notice.text)
        .setCategory(Notification.CATEGORY_STOPWATCH)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setContentIntent(press(context, DEFAULT_PRESS_ACTION))
        .addExtras(Bundle().apply { putBoolean(Notification.EXTRA_REQUEST_PROMOTED_ONGOING, true) })
    if (!notice.running) builder.setShortCriticalText(context.getString(R.string.timer_notice_paused))
    for ((label, action) in buttons(context, notice)) {
      builder.addAction(Notification.Action.Builder(null as Icon?, label, press(context, action)).build())
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.CINNAMON_BUN) {
      // The timer is one of the figures: no clock beside the task as well
      builder.setStyle(figures(context, notice)).setShowWhen(false)
    } else {
      builder.setShowWhen(notice.running)
      notice.countingFromMs?.let { builder.setWhen(it).setUsesChronometer(true) }
    }
    return builder.build()
  }

  /**
   * Android 17's layout: the timer (the figure the status bar's chip shows),
   * then today's time and money while the widgets' figures are today's.
   */
  @RequiresApi(Build.VERSION_CODES.CINNAMON_BUN)
  private fun figures(context: Context, notice: TimerNotice): Notification.MetricStyle {
    val style = Notification.MetricStyle()
    val clock = Notification.Metric.TimeDifference.FORMAT_CHRONOMETER
    val timer =
      notice.countingFromMs?.let { Notification.Metric.TimeDifference.forStopwatch(Instant.ofEpochMilli(it), clock) }
        ?: Notification.Metric.TimeDifference.forPausedStopwatch(Duration.ofMillis(notice.pausedMs ?: 0), clock)
    style.addMetric(Notification.Metric(timer, context.getString(R.string.timer_notice_timer)))
    style.setCriticalMetric(0)

    val today = Widgets.snapshot(context)?.takeIf { it.optString("day") == Widgets.today() }?.optJSONObject("today")
    if (today != null) {
      todayTime(today, notice)?.let { style.addMetric(Notification.Metric(it, context.getString(R.string.timer_notice_today))) }
      today.text("money")?.let { money ->
        style.addMetric(
          Notification.Metric(Notification.Metric.FixedText(money), context.getString(R.string.timer_notice_earned))
        )
      }
    }
    return style
  }

  /**
   * Today's time: counting with a running timer begun today, else standing
   * still. The page says which (`countingFromMs` or `timeMs`); the shell's
   * word on the timer comes first, so in the moment between a pause here and
   * the page's next figures, today's time stops where it had counted to.
   * Null from a page too old to say.
   */
  @RequiresApi(Build.VERSION_CODES.CINNAMON_BUN)
  private fun todayTime(today: JSONObject, notice: TimerNotice): Notification.Metric.TimeDifference? {
    val words = Notification.Metric.TimeDifference.FORMAT_ADAPTIVE
    val countingFrom = today.time("countingFromMs")
    val still = today.time("timeMs")
    return when {
      countingFrom != null && notice.running ->
        Notification.Metric.TimeDifference.forStopwatch(Instant.ofEpochMilli(countingFrom), words)
      countingFrom != null ->
        Notification.Metric.TimeDifference.forPausedStopwatch(
          Duration.ofMillis((System.currentTimeMillis() - countingFrom).coerceAtLeast(0)),
          words,
        )
      still != null -> Notification.Metric.TimeDifference.forPausedStopwatch(Duration.ofMillis(still), words)
      else -> null
    }
  }
}
