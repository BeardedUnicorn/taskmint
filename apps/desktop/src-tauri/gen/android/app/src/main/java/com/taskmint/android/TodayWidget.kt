package com.taskmint.android

import android.content.Context
import android.os.SystemClock
import android.util.TypedValue
import android.view.View
import android.widget.RemoteViews
import com.taskmint.android.Widgets.text
import com.taskmint.android.Widgets.time
import com.taskmint.android.Widgets.visible
import com.taskmint.android.Widgets.whole
import org.json.JSONObject

/** The Today widget (TodayViews). */
class TodayWidget : TaskMintWidget() {
  override val kind: WidgetKind
    get() = TodayViews
}

/**
 * Today: today's money and time, the daily goal and the live timer, from
 * the snapshot's `today` and `timer`. While a timer runs its clock is the
 * big figure (widget_today_running); otherwise today's money is
 * (widget_today). One row tall, it's a line with the timer's button
 * (widget_today_row); tall, it adds this week's figures.
 */
object TodayViews : WidgetKind {
  override val provider = TodayWidget::class.java

  /** Its timer button has words only when roomy. */
  override val sizes = Fit.sizes(roomy = true)

  override fun part(snapshot: JSONObject) =
    listOf(snapshot.opt("updatedAtMs"), snapshot.opt("day"), snapshot.opt("today"), snapshot.opt("timer")).toString()

  /** What the timer's button does: its words, icon, action and spoken name. */
  private enum class Action(val label: Int, val icon: Int, val launch: String, val description: Int) {
    START(R.string.widget_start, R.drawable.ic_widget_play, "start-work", R.string.widget_start_description),
    PAUSE(R.string.widget_pause, R.drawable.ic_widget_pause, "pause", R.string.widget_pause_description),
    RESUME(R.string.widget_resume, R.drawable.ic_widget_play, "resume", R.string.widget_resume_description),
  }

  override fun views(context: Context, snapshot: JSONObject?, fit: Fit, id: Int, scroll: Int?): RemoteViews {
    val timer = snapshot?.optJSONObject("timer")
    val countingFrom = timer?.time("countingFromMs")
    val oneRow = fit.height == Height.ROW
    val layout =
      when {
        oneRow -> R.layout.widget_today_row
        countingFrom != null -> R.layout.widget_today_running
        else -> R.layout.widget_today
      }
    val views = RemoteViews(context.packageName, layout)
    views.setOnClickPendingIntent(android.R.id.background, Launch.pending(context, "home"))
    if (snapshot == null) {
      Widgets.header(views, context.getString(R.string.widget_today_label), null)
      return Widgets.message(views, context.getString(R.string.widget_open_app))
    }

    Widgets.content(views)
    val today = snapshot.getJSONObject("today")
    val money = today.getString("money")
    val time = today.getString("time")
    val goal = today.whole("goalPercent")
    Widgets.header(views, Widgets.dayLabel(context, snapshot.getString("day")), if (fit.narrow) null else Widgets.asOf(context, snapshot))

    views.setTextViewText(R.id.today_money, money)
    views.setContentDescription(R.id.today_money, Widgets.spoken(context, money))
    views.setTextViewText(R.id.today_time, time)
    views.setTextViewText(R.id.today_time_under, time)

    views.setViewVisibility(R.id.goal_row, visible(goal != null))
    views.setViewVisibility(R.id.goal_bar, visible(goal == null || goal < 100))
    views.setViewVisibility(R.id.goal_bar_met, visible(goal != null && goal >= 100))
    if (goal != null) {
      views.setProgressBar(if (goal >= 100) R.id.goal_bar_met else R.id.goal_bar, 100, goal.coerceIn(0, 100), false)
      views.setTextViewText(
        R.id.goal_text,
        context.getString(if (fit.narrow) R.string.widget_goal_short else R.string.widget_goal_percent, goal)
      )
    }

    val week = today.getJSONObject("week")
    views.setViewVisibility(R.id.week_block, visible(fit.height == Height.TALL))
    views.setTextViewText(R.id.week_money, week.getString("money"))
    views.setContentDescription(R.id.week_money, Widgets.spoken(context, week.getString("money")))
    views.setTextViewText(R.id.week_time, week.getString("time"))

    val action =
      when {
        timer == null -> Action.START
        countingFrom != null -> Action.PAUSE
        else -> Action.RESUME
      }
    button(context, views, action, iconOnly = oneRow || !fit.roomy)

    if (countingFrom != null) {
      // The clock counts from the timer's start (pauses left out), in the
      // boot-relative time a Chronometer takes
      val base = SystemClock.elapsedRealtime() - (System.currentTimeMillis() - countingFrom)
      views.setChronometer(R.id.today_clock, base, null, true)
      views.setTextViewTextSize(R.id.today_clock, TypedValue.COMPLEX_UNIT_SP, clockSize(fit))
      // A narrow card has no room beside the button: the clock goes under it
      val under = !oneRow && fit.narrow
      views.setChronometer(R.id.today_clock_under, base, null, under)
      views.setViewVisibility(R.id.today_clock_under, visible(under))
      if (!oneRow) views.setViewVisibility(R.id.today_clock, visible(!under))
    } else {
      // Paused or idle: a clock left from a run stops counting
      views.setChronometer(R.id.today_clock, SystemClock.elapsedRealtime(), null, false)
    }
    if (oneRow) {
      row(context, views, timer, countingFrom, money, time, goal, fit)
    } else {
      card(context, views, timer, layout == R.layout.widget_today_running, fit)
    }
    return views
  }

  /** The running clock's size (sp) beside its button: as big as a 20-hour "20:44:57" fits. */
  private fun clockSize(fit: Fit): Float =
    when (fit.height) {
      Height.ROW -> if (fit.narrow) 22f else 24f
      Height.CARD -> 30f
      Height.TALL -> 40f
    }

  private fun button(context: Context, views: RemoteViews, action: Action, iconOnly: Boolean) {
    val launch = Launch.pending(context, action.launch)
    views.setTextViewText(R.id.timer_button, context.getString(action.label))
    views.setTextViewCompoundDrawablesRelative(R.id.timer_button, action.icon, 0, 0, 0)
    views.setOnClickPendingIntent(R.id.timer_button, launch)
    views.setImageViewResource(R.id.timer_icon_button, action.icon)
    views.setContentDescription(R.id.timer_icon_button, context.getString(action.description))
    views.setOnClickPendingIntent(R.id.timer_icon_button, launch)
    views.setViewVisibility(R.id.timer_button, visible(!iconOnly))
    views.setViewVisibility(R.id.timer_icon_button, visible(iconOnly))
  }

  /**
   * Two rows and more: the figures sized to the room, and the timer card
   * (its clock is set already). Tall, the height to spare is split around
   * this week.
   */
  private fun card(context: Context, views: RemoteViews, timer: JSONObject?, running: Boolean, fit: Fit) {
    val tall = fit.height == Height.TALL
    views.setViewVisibility(R.id.week_spacer, visible(tall))
    // Narrow, the time goes under the money
    views.setViewVisibility(R.id.today_time, visible(!fit.narrow))
    views.setViewVisibility(R.id.today_time_under, visible(fit.narrow))
    if (running) {
      if (tall) views.setTextViewTextSize(R.id.today_money, TypedValue.COMPLEX_UNIT_SP, 22f)
    } else {
      // and the money is a little smaller
      val hero =
        when {
          fit.narrow -> 28f
          tall -> 40f
          else -> 34f
        }
      views.setTextViewTextSize(R.id.today_money, TypedValue.COMPLEX_UNIT_SP, hero)
    }
    if (timer == null) {
      views.setViewVisibility(R.id.timer_task, View.GONE)
      views.setTextViewText(R.id.timer_status, context.getString(R.string.widget_no_timer))
      return
    }
    views.setViewVisibility(R.id.timer_task, View.VISIBLE)
    views.setTextViewText(R.id.timer_task, timer.getString("task"))
    views.setTextViewText(R.id.timer_status, timer.text("status") ?: "")
  }

  /**
   * One row: the running clock over its task, a paused timer's time over
   * "Paused · its task", or today's money over its time; wide, today's
   * figures (or the goal) on the right.
   */
  private fun row(
    context: Context,
    views: RemoteViews,
    timer: JSONObject?,
    countingFrom: Long?,
    money: String,
    time: String,
    goal: Int?,
    fit: Fit,
  ) {
    val paused = timer != null && countingFrom == null
    views.setViewVisibility(R.id.today_clock, visible(countingFrom != null))
    views.setViewVisibility(R.id.today_money, visible(timer == null))
    views.setViewVisibility(R.id.row_paused, visible(paused))
    if (paused) views.setTextViewText(R.id.row_paused, timer!!.text("pausedFor") ?: "")
    val detail =
      when {
        timer == null -> context.getString(R.string.widget_time_today, time)
        paused -> context.getString(R.string.widget_paused_task, timer.getString("task"))
        else -> timer.getString("task")
      }
    views.setTextViewText(R.id.row_detail, detail)

    // Wide: today's money and time beside a timer, or the goal beside today's money
    val aside: Pair<String, String>? =
      when {
        fit.narrow -> null
        timer != null -> money to time
        goal != null -> context.getString(R.string.widget_goal_short, goal) to context.getString(R.string.widget_of_goal)
        else -> null
      }
    views.setViewVisibility(R.id.row_aside, visible(aside != null))
    if (aside != null) {
      views.setTextViewText(R.id.row_aside_figure, aside.first)
      views.setContentDescription(R.id.row_aside_figure, Widgets.spoken(context, aside.first))
      views.setTextViewText(R.id.row_aside_detail, aside.second)
    }
  }
}
