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
import androidx.core.app.NotificationChannelCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import app.tauri.notification.ACTION_INTENT_KEY
import app.tauri.notification.DEFAULT_PRESS_ACTION
import app.tauri.notification.NOTIFICATION_INTENT_KEY
import com.taskmint.android.Widgets.time
import java.time.Duration
import java.time.Instant
import kotlin.math.abs
import org.json.JSONException
import org.json.JSONObject

/**
 * The running timer's notification as the shell wants it (timer_notice.rs):
 * the task, and when the timer would have started had it never paused (it
 * runs) or nothing (it's paused). The time isn't shown: it tells one run
 * from the next.
 */
data class TimerNotice(
  val task: String,
  val countingFromMs: Long?,
) {
  val running: Boolean
    get() = countingFromMs != null

  /** Whether `other` shows the same: where a running one counts from may differ by a moment between devices. */
  fun sameAs(other: TimerNotice): Boolean =
    task == other.task &&
      running == other.running &&
      (countingFromMs == null || other.countingFromMs == null || abs(countingFromMs - other.countingFromMs) <= 2_000)

  fun toJson(): String =
    JSONObject()
      .put("task", task)
      .put("countingFromMs", countingFromMs ?: JSONObject.NULL)
      .toString()

  companion object {
    fun fromJson(json: String): TimerNotice? =
      try {
        val saved = JSONObject(json)
        TimerNotice(saved.getString("task"), saved.time("countingFromMs"))
      } catch (_: JSONException) {
        null
      }
  }
}

/**
 * The running timer's notification: the task being worked on, today's time
 * and the money earned today, and buttons to pause or resume, switch task,
 * or stop. It says what the day comes to, not how long the one timer has
 * run. The shell says which task and when (os.rs, through
 * [RemindersPlugin]); today's figures are the widgets' (Widgets), which the
 * page works out, and this draws them, which the notification plugin
 * couldn't do as Android 16 and 17 allow:
 *
 * - Before Android 17 today's time counts in the notification's header
 *   ("Today · 3:12:45") while a timer begun today runs, and the line under
 *   the task has the money ("~$45 earned today"); standing still, the time
 *   is in the line too.
 * - From Android 16 it asks to be a Live Update (the user can turn that off
 *   in the phone's settings for TaskMint): today's time then also counts in
 *   a chip in the status bar. Android 17 makes it one; Android 16's first
 *   release takes the request and shows the notification as before.
 * - Android 17 lays it out as figures (Notification.MetricStyle): Today and
 *   Earned.
 *
 * Both figures keep up with TaskMint closed: the time counts on its own, and
 * the money is worked out from the running timer's rate each time it's
 * drawn, which Widgets.scheduleRefresh asks for as each dollar is earned.
 * Without figures for today (none sent yet, or they're yesterday's) it has
 * the task and "Running" or "Paused".
 *
 * A tap or a button opens TaskMint with the notification plugin's extras,
 * which say what was pressed (MainActivity.keepLaunch), as a reminder's tap
 * does. The intent has an action of its own: the plugin takes down the
 * notification of any ACTION_MAIN intent with those extras, and this one
 * stays up.
 *
 * With TaskMint closed, [WidgetSync] shows the timer another device started
 * (`setRemote`), from the figures that device published. The shell knows
 * nothing of that one, and says again what it shows only when its own timer
 * changes. So when the app comes forward over a notification that isn't the
 * shell's (`resumed`), what the shell last asked for goes back: its notice,
 * or none after a moment (`LET_SYNC_LAND_MS`), in which sync brings the
 * other device's timer in and the shell asks for it itself.
 */
object TimerNotices {
  /** The notification's id (timer_notice.rs TIMER_NOTICE_ID): the page knows the timer's by it. */
  const val ID = 4200

  private const val STORE = "taskmint_timer_notice"
  private const val NOTICE = "notice"
  /** What the shell last asked for (absent: none), and whether what's kept isn't that but a published one. */
  private const val SHELL = "shell"
  private const val REMOTE = "remote"
  /** How long a notice from published figures outlives the shell's "none" as the app opens. */
  private const val LET_SYNC_LAND_MS = 5_000L
  /** Bumped by each change: a clear waiting for sync goes ahead only if nothing changed since. */
  @Volatile private var change = 0
  private const val PRESS = "com.taskmint.android.TIMER_NOTICE"

  /** The buttons, as timer_notice.rs knows them. */
  private const val PAUSE = "pause"
  private const val RESUME = "resume"
  private const val SWITCH = "switch"
  private const val STOP = "stop"

  /** The leaf's tint, as os.rs `routed` gives the plugin's notifications. */
  private val ICON_COLOR = Color.parseColor("#65D6A1")

  /** The "Running timer" channel before Android 16, and from it (see [channel]). */
  private const val QUIET_CHANNEL = "timer"
  private const val LIVE_CHANNEL = "timer-live"

  /**
   * Makes the "Running timer" channel, which the phone's settings list
   * under TaskMint, and gives its id (Android 8 and later have channels).
   *
   * Before Android 16 it's a quiet one: low importance, so no sound or
   * pop-up, and the shade's silent section. A lock screen leaves silent
   * notifications out, though, a Live Update among them, so where the
   * notification asks to be one (Android 16 and later) its channel has the
   * default importance, with no sound or vibration of its own: as quiet, and
   * on the lock screen too. An app can't raise a channel's importance once
   * it's made, hence a second id; the quiet one an earlier TaskMint made
   * goes.
   */
  fun channel(context: Context): String {
    val live = Build.VERSION.SDK_INT >= Build.VERSION_CODES.BAKLAVA
    val notifications = NotificationManagerCompat.from(context)
    val importance =
      if (live) NotificationManagerCompat.IMPORTANCE_DEFAULT else NotificationManagerCompat.IMPORTANCE_LOW
    val channel =
      NotificationChannelCompat.Builder(if (live) LIVE_CHANNEL else QUIET_CHANNEL, importance)
        .setName(context.getString(R.string.timer_notice_channel))
        .setDescription(context.getString(R.string.timer_notice_channel_description))
        .setSound(null, null)
        .setVibrationEnabled(false)
        .build()
    notifications.createNotificationChannel(channel)
    if (live) notifications.deleteNotificationChannel(QUIET_CHANNEL)
    return channel.id
  }

  /** The shell's: shows `notice`, in place of the one before, and keeps it to draw again when today's figures change. */
  fun set(context: Context, notice: TimerNotice) {
    change++
    saved(context).edit().putString(SHELL, notice.toJson()).putBoolean(REMOTE, false).apply()
    put(context, notice)
  }

  /**
   * The shell's: takes it down, as nothing runs or waits paused. One from
   * published figures stays a moment longer: the shell may not have the
   * other device's timer yet, and asks for it once it does.
   */
  fun clear(context: Context) {
    saved(context).edit().remove(SHELL).apply()
    if (saved(context).getBoolean(REMOTE, false)) clearUnlessChanged(context) else takeDown(context)
  }

  /**
   * From published figures, with TaskMint closed: shows `notice` (null:
   * takes it down) unless that's what is kept already, so one the user
   * swiped away stays gone until the timer changes.
   */
  fun setRemote(context: Context, notice: TimerNotice?) {
    val kept = saved(context).getString(NOTICE, null)?.let(TimerNotice::fromJson)
    if (notice == null) {
      if (kept != null) takeDown(context)
      return
    }
    if (kept != null && kept.sameAs(notice)) return
    change++
    saved(context).edit().putBoolean(REMOTE, true).apply()
    put(context, notice)
  }

  /**
   * The phone has started (RemindersRestore): the system dropped the
   * notification, and the timer it was up for still runs or waits paused.
   */
  fun restore(context: Context) {
    saved(context).getString(NOTICE, null)?.let(TimerNotice::fromJson)?.let { show(context, it) }
  }

  /** The app came forward: over a notice from published figures, what the shell last asked for goes back. */
  fun resumed(context: Context) {
    if (!saved(context).getBoolean(REMOTE, false)) return
    val shell = saved(context).getString(SHELL, null)?.let(TimerNotice::fromJson)
    if (shell != null) set(context, shell) else clearUnlessChanged(context)
  }

  private fun put(context: Context, notice: TimerNotice) {
    saved(context).edit().putString(NOTICE, notice.toJson()).apply()
    show(context, notice)
    // Today's figures are a day's: they go at midnight (Widgets.redrawAll)
    Widgets.scheduleRefresh(context)
  }

  private fun takeDown(context: Context) {
    change++
    saved(context).edit().remove(NOTICE).putBoolean(REMOTE, false).apply()
    NotificationManagerCompat.from(context).cancel(ID)
    Widgets.scheduleRefresh(context)
  }

  private fun clearUnlessChanged(context: Context) {
    val app = context.applicationContext
    val asked = ++change
    Widgets.later(LET_SYNC_LAND_MS) { if (change == asked) takeDown(app) }
  }

  /** Whether it's up, showing today's figures, which change without the timer changing. */
  fun followsFigures(context: Context): Boolean = saved(context).contains(NOTICE)

  /**
   * Draws it again with today's figures as they are now, if it's still up:
   * one the user swiped away stays gone until the timer changes.
   */
  fun redraw(context: Context) {
    val notice = saved(context).getString(NOTICE, null)?.let(TimerNotice::fromJson) ?: return
    val showing = context.getSystemService(NotificationManager::class.java).activeNotifications.any { it.id == ID }
    if (showing) show(context, notice)
  }

  /** The part of the widgets' figures it shows: it's drawn again when this changes. */
  fun part(snapshot: JSONObject): String {
    val today = snapshot.optJSONObject("today")
    return listOf(
      snapshot.opt("day"),
      today?.opt("money"),
      today?.opt("countingFromMs"),
      today?.opt("timeMs"),
      today?.opt("earning"),
    ).toString()
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

  /**
   * Today's figures as the notification shows them: the time counting
   * (`countingFromMs`) or standing still (`stillMs`), and the money.
   */
  private class Today(val countingFromMs: Long?, val stillMs: Long?, val money: String?)

  /**
   * Today's figures from the widgets', while those are today's. The page
   * says whether today's time counts (`countingFromMs`, with a running timer
   * begun today) or stands still (`timeMs`); the shell's word on the timer
   * comes first, so in the moment between a pause here and the page's next
   * figures, today's time stops where it had counted to.
   */
  private fun today(context: Context, notice: TimerNotice): Today? {
    val snapshot = Widgets.snapshot(context)?.takeIf { it.optString("day") == Widgets.today() } ?: return null
    val today = snapshot.optJSONObject("today") ?: return null
    val now = System.currentTimeMillis()
    val countingFrom = today.time("countingFromMs")
    val still = if (countingFrom != null) (now - countingFrom).coerceAtLeast(0) else today.time("timeMs")
    return Today(
      countingFromMs = countingFrom.takeIf { notice.running },
      stillMs = still.takeIf { countingFrom == null || !notice.running },
      money = Widgets.todayMoney(today, notice.running, now),
    )
  }

  private fun status(context: Context, notice: TimerNotice): String =
    context.getString(if (notice.running) R.string.timer_notice_running else R.string.timer_notice_paused)

  /**
   * The line under the task, before Android 17: the money earned today, with
   * today's time when the header's clock doesn't count it, after "Paused"
   * for a paused timer. Just "Running" or "Paused" without today's figures.
   */
  private fun line(context: Context, notice: TimerNotice, today: Today?): String {
    val money = today?.money
    val time = today?.stillMs?.let(Widgets::timeInWords)
    val figures =
      when {
        money != null && time != null -> context.getString(R.string.timer_notice_time_and_earned, time, money)
        money != null -> context.getString(R.string.timer_notice_earned_today, money)
        time != null -> context.getString(R.string.widget_time_today, time)
        else -> return status(context, notice)
      }
    return if (notice.running) figures else context.getString(R.string.timer_notice_paused_with, figures)
  }

  // Posting without permission (Android 13 and later) does nothing, and
  // areNotificationsEnabled says so first
  @SuppressLint("MissingPermission")
  private fun show(context: Context, notice: TimerNotice) {
    val notifications = NotificationManagerCompat.from(context)
    if (!notifications.areNotificationsEnabled()) return
    val today = today(context, notice)
    val notification =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.BAKLAVA) liveUpdate(context, notice, today)
      else plain(context, notice, today)
    notifications.notify(ID, notification)
  }

  /** Before Android 16: the task, today's time counting in the header while it does, the money, and the buttons. */
  private fun plain(context: Context, notice: TimerNotice, today: Today?): Notification {
    val builder =
      NotificationCompat.Builder(context, channel(context))
        .setSmallIcon(R.drawable.ic_stat_taskmint)
        .setColor(ICON_COLOR)
        .setContentTitle(notice.task)
        .setContentText(line(context, notice, today))
        .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
        // Android 7, which has no channels: quiet, as the Running timer channel is
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setContentIntent(press(context, DEFAULT_PRESS_ACTION))
        .setShowWhen(today?.countingFromMs != null)
    today?.countingFromMs?.let {
      builder.setSubText(context.getString(R.string.timer_notice_today)).setWhen(it).setUsesChronometer(true)
    }
    for ((label, action) in buttons(context, notice)) builder.addAction(0, label, press(context, action))
    return builder.build()
  }

  /**
   * Android 16 and later: asks to be a Live Update, through the
   * notification's extras (Android 16's first release has no setter for it,
   * and doesn't promote it either). The chip in the status bar counts
   * today's time, or says the timer is paused.
   */
  @RequiresApi(Build.VERSION_CODES.BAKLAVA)
  private fun liveUpdate(context: Context, notice: TimerNotice, today: Today?): Notification {
    val figures = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.CINNAMON_BUN) figures(context, today) else null
    val builder =
      Notification.Builder(context, channel(context))
        .setSmallIcon(R.drawable.ic_stat_taskmint)
        .setColor(ICON_COLOR)
        .setContentTitle(notice.task)
        // The figures have today's time and money: the line just says how the timer is
        .setContentText(if (figures != null) status(context, notice) else line(context, notice, today))
        .setCategory(Notification.CATEGORY_STOPWATCH)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setContentIntent(press(context, DEFAULT_PRESS_ACTION))
        .addExtras(Bundle().apply { putBoolean(Notification.EXTRA_REQUEST_PROMOTED_ONGOING, true) })
    if (!notice.running) builder.setShortCriticalText(context.getString(R.string.timer_notice_paused))
    for ((label, action) in buttons(context, notice)) {
      builder.addAction(Notification.Action.Builder(null as Icon?, label, press(context, action)).build())
    }
    val countingFrom = today?.countingFromMs
    if (figures != null) {
      // Today's time is one of the figures: no clock beside the task as well
      builder.setStyle(figures).setShowWhen(false)
    } else if (countingFrom != null) {
      builder
        .setSubText(context.getString(R.string.timer_notice_today))
        .setShowWhen(true)
        .setWhen(countingFrom)
        .setUsesChronometer(true)
    } else {
      builder.setShowWhen(false)
    }
    return builder.build()
  }

  /**
   * Android 17's layout: today's time (the figure the status bar's chip
   * shows), counting or standing still, then the money earned today. Null
   * without figures for today.
   */
  @RequiresApi(Build.VERSION_CODES.CINNAMON_BUN)
  private fun figures(context: Context, today: Today?): Notification.MetricStyle? {
    if (today == null) return null
    val words = Notification.Metric.TimeDifference.FORMAT_ADAPTIVE
    val time =
      when {
        today.countingFromMs != null ->
          Notification.Metric.TimeDifference.forStopwatch(Instant.ofEpochMilli(today.countingFromMs), words)
        today.stillMs != null ->
          Notification.Metric.TimeDifference.forPausedStopwatch(Duration.ofMillis(today.stillMs), words)
        else -> null
      }
    if (time == null && today.money == null) return null
    val style = Notification.MetricStyle()
    if (time != null) {
      style.addMetric(Notification.Metric(time, context.getString(R.string.timer_notice_today)))
      style.setCriticalMetric(0)
    }
    today.money?.let { money ->
      style.addMetric(
        Notification.Metric(Notification.Metric.FixedText(money), context.getString(R.string.timer_notice_earned))
      )
    }
    return style
  }
}
