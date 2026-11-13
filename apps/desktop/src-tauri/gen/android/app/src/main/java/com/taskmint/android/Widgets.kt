package com.taskmint.android

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.os.SystemClock
import android.text.format.DateFormat
import android.view.View
import android.widget.RemoteViews
import java.util.Date
import org.json.JSONObject

/**
 * The home-screen widgets: Today (the running timer, today's time and
 * money, the daily goal) and Payouts (what's available, when the next
 * withdrawal opens, the next release).
 *
 * The page works the figures out (the money math is the client's) and sends
 * them whenever they change (MainActivity's AppTask.updateWidgets). They're
 * kept here, so a widget added or redrawn later has them, and each widget
 * says when they were worked out. A running timer counts on its own (a
 * Chronometer), and "opens …" turns to "open" once its time passes (the
 * widgets are redrawn every 30 minutes).
 *
 * The snapshot:
 * ```
 * { "updatedAtMs": 0,
 *   "today": { "money": "~$45", "time": "2h 13m", "goalPercent": 64 | null },
 *   "timer": { "task": "Writing", "countingFromMs": 0 | null, "status": "Paused at 1h 23m" } | null,
 *   "payouts": { "amount": "~$1,100", "status": "Opens Mon, Nov 10, 6:25 PM",
 *                "opensAtMs": 0 | null, "nextRelease": "Fri, Nov 14 · $230" | null } }
 * ```
 */
object Widgets {
  private const val PREFS = "TaskMintWidgets"
  private const val SNAPSHOT = "snapshot"

  /** Keeps the page's figures and redraws every widget with them. */
  fun save(context: Context, json: String) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(SNAPSHOT, json).apply()
    redrawAll(context)
  }

  private fun snapshot(context: Context): JSONObject? {
    val json = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(SNAPSHOT, null)
    return json?.let { runCatching { JSONObject(it) }.getOrNull() }
  }

  fun redrawAll(context: Context) {
    val manager = AppWidgetManager.getInstance(context)
    val today = manager.getAppWidgetIds(ComponentName(context, TodayWidget::class.java))
    if (today.isNotEmpty()) manager.updateAppWidget(today, today(context))
    val payouts = manager.getAppWidgetIds(ComponentName(context, PayoutsWidget::class.java))
    if (payouts.isNotEmpty()) manager.updateAppWidget(payouts, payouts(context))
  }

  /** "as of 3:42 PM", in the phone's clock format. */
  private fun asOf(context: Context, snapshot: JSONObject): String =
    context.getString(R.string.widget_as_of, DateFormat.getTimeFormat(context).format(Date(snapshot.getLong("updatedAtMs"))))

  /** A string field that may be null in the JSON. */
  private fun JSONObject.text(name: String): String? = if (isNull(name)) null else getString(name)

  private fun JSONObject.time(name: String): Long? = if (isNull(name)) null else getLong(name)

  fun today(context: Context): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.widget_today)
    views.setOnClickPendingIntent(R.id.widget_root, Launch.pending(context, "home"))
    val snapshot = snapshot(context)
    if (snapshot == null) {
      views.setTextViewText(R.id.widget_as_of, "")
      views.setTextViewText(R.id.today_money, "")
      views.setTextViewText(R.id.today_time, context.getString(R.string.widget_open_app))
      views.setViewVisibility(R.id.goal_row, View.GONE)
      views.setViewVisibility(R.id.timer_row, View.GONE)
      return views
    }
    views.setTextViewText(R.id.widget_as_of, asOf(context, snapshot))
    val today = snapshot.getJSONObject("today")
    views.setTextViewText(R.id.today_money, today.getString("money"))
    views.setTextViewText(R.id.today_time, today.getString("time"))

    if (today.isNull("goalPercent")) {
      views.setViewVisibility(R.id.goal_row, View.GONE)
    } else {
      val percent = today.getInt("goalPercent")
      views.setViewVisibility(R.id.goal_row, View.VISIBLE)
      views.setProgressBar(R.id.goal_bar, 100, percent.coerceIn(0, 100), false)
      views.setTextViewText(R.id.goal_text, context.getString(R.string.widget_goal_percent, percent))
    }

    views.setViewVisibility(R.id.timer_row, View.VISIBLE)
    val timer = if (snapshot.isNull("timer")) null else snapshot.getJSONObject("timer")
    val countingFrom = timer?.time("countingFromMs")
    when {
      timer == null -> {
        views.setTextViewText(R.id.timer_task, context.getString(R.string.widget_not_working))
        views.setViewVisibility(R.id.timer_clock, View.GONE)
        views.setViewVisibility(R.id.timer_status, View.GONE)
        views.setTextViewText(R.id.timer_action, context.getString(R.string.widget_start))
        views.setOnClickPendingIntent(R.id.timer_action, Launch.pending(context, "start-work"))
      }
      countingFrom != null -> {
        views.setTextViewText(R.id.timer_task, timer.getString("task"))
        // The clock counts from the timer's start (pauses left out), in
        // the boot-relative time a Chronometer takes
        val base = SystemClock.elapsedRealtime() - (System.currentTimeMillis() - countingFrom)
        views.setChronometer(R.id.timer_clock, base, null, true)
        views.setViewVisibility(R.id.timer_clock, View.VISIBLE)
        views.setViewVisibility(R.id.timer_status, View.GONE)
        views.setTextViewText(R.id.timer_action, context.getString(R.string.widget_pause))
        views.setOnClickPendingIntent(R.id.timer_action, Launch.pending(context, "pause"))
      }
      else -> {
        views.setTextViewText(R.id.timer_task, timer.getString("task"))
        views.setChronometer(R.id.timer_clock, SystemClock.elapsedRealtime(), null, false)
        views.setViewVisibility(R.id.timer_clock, View.GONE)
        views.setTextViewText(R.id.timer_status, timer.text("status") ?: "")
        views.setViewVisibility(R.id.timer_status, View.VISIBLE)
        views.setTextViewText(R.id.timer_action, context.getString(R.string.widget_resume))
        views.setOnClickPendingIntent(R.id.timer_action, Launch.pending(context, "resume"))
      }
    }
    return views
  }

  fun payouts(context: Context): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.widget_payouts)
    views.setOnClickPendingIntent(R.id.widget_root, Launch.pending(context, "payouts"))
    val snapshot = snapshot(context)
    val payouts = if (snapshot == null || snapshot.isNull("payouts")) null else snapshot.getJSONObject("payouts")
    if (snapshot == null || payouts == null) {
      views.setTextViewText(R.id.widget_as_of, "")
      views.setTextViewText(R.id.payouts_amount, "")
      views.setTextViewText(R.id.payouts_status, context.getString(R.string.widget_open_app))
      views.setViewVisibility(R.id.payouts_release, View.GONE)
      return views
    }
    views.setTextViewText(R.id.widget_as_of, asOf(context, snapshot))
    views.setTextViewText(R.id.payouts_amount, payouts.getString("amount"))
    val opensAt = payouts.time("opensAtMs")
    val status =
      if (opensAt != null && System.currentTimeMillis() >= opensAt) context.getString(R.string.widget_withdrawal_open)
      else payouts.getString("status")
    views.setTextViewText(R.id.payouts_status, status)
    val release = payouts.text("nextRelease")
    views.setViewVisibility(R.id.payouts_release, if (release == null) View.GONE else View.VISIBLE)
    views.setTextViewText(R.id.payouts_release, release ?: "")
    return views
  }
}

/** The Today widget (Widgets.today). */
class TodayWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    manager.updateAppWidget(ids, Widgets.today(context))
  }
}

/** The Payouts widget (Widgets.payouts). */
class PayoutsWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    manager.updateAppWidget(ids, Widgets.payouts(context))
  }
}
