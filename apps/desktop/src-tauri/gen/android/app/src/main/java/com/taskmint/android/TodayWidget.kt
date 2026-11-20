package com.taskmint.android

import android.content.Context
import android.os.SystemClock
import android.util.TypedValue
import android.view.View
import android.widget.RemoteViews
import com.taskmint.android.Widgets.visible
import org.json.JSONObject

/** The Today widget (TodayViews). */
class TodayWidget : TaskMintWidget() {
  override val kind: WidgetKind
    get() = TodayViews
}

/**
 * Today: today's money and time, the daily goal and the task being worked
 * on, from the snapshot's `today` and `timer`. While a timer runs, its task
 * and today's time are the big figures (widget_today_running), the time
 * counting when the timer began today, with the money earned today under
 * them, drawn again with each dollar (WidgetFigures.todayMoney). Otherwise today's
 * money is the big figure (widget_today). One row tall, it's a line with the
 * timer's button (widget_today_row); tall, it adds this week's figures. It
 * shows what the day comes to, as the timer's notification does, not how
 * long the one timer has run.
 */
object TodayViews : WidgetKind {
  override val provider = TodayWidget::class.java

  /** Its timer button has words only when roomy. */
  override val sizes = Fit.sizes(roomy = true)

  override fun part(snapshot: JSONObject) =
    listOf(snapshot.opt("updatedAtMs"), snapshot.opt("day"), snapshot.opt("today"), snapshot.opt("timer")).toString()

  /** Four columns wide: its button has its words. */
  override val previewFit = Fit(Height.CARD, narrow = false, roomy = true)

  /** Without the timer: the picker's picture would keep a clock running long after the timer stopped. */
  override fun previewOf(snapshot: JSONObject): JSONObject = JSONObject(snapshot.toString()).put("timer", JSONObject.NULL)

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
    val now = System.currentTimeMillis()
    // Only today's figures move with a running timer: once the day has
    // gone (TaskMint closed since, and no other device publishing), they
    // stand as they were written, under "Yesterday"
    val current = snapshot.optString("day") == Widgets.today()
    val growing = countingFrom != null && current
    val money = WidgetFigures.todayMoney(today, growing, now) ?: ""
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
    // "This week" until the week has ended: then it's last week's
    views.setTextViewText(R.id.week_label, Widgets.weekTitle(context, Widgets.weekNow(snapshot)))
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
      // The clock is today's time: counting from where the page says it
      // would have started (a timer begun today), else stopped at what
      // today has come to (one begun yesterday: its time is yesterday's).
      // A Chronometer takes boot-relative time. Figures from a day gone by
      // stand where they had counted to when they were written, as the
      // money does.
      val todayFrom = today.time("countingFromMs")
      val until = if (current) now else snapshot.optLong("updatedAtMs", now)
      val todayMs = if (todayFrom != null) (until - todayFrom).coerceAtLeast(0) else today.time("timeMs") ?: 0
      val base = SystemClock.elapsedRealtime() - todayMs
      val counts = todayFrom != null && current
      views.setChronometer(R.id.today_clock, base, null, counts)
      // Sized for the longest it will read while it counts: "9:59:59", or
      // "20:44:57" from ten hours on
      val longest = if (todayMs >= 10 * 3_600_000L) "20:44:57" else "9:59:59"
      val width = Widgets.widthDp(context, fit, id)
      val beside = width - (if (oneRow) ROW_PADDING_DP else CARD_PADDING_DP + INNER_PADDING_DP) - buttonDp(fit, oneRow)
      views.setTextViewTextSize(
        R.id.today_clock,
        TypedValue.COMPLEX_UNIT_SP,
        Widgets.figureSp(context, clockSize(fit), longest, beside - (if (oneRow && !fit.narrow) ASIDE_DP else 0f))
      )
      // A narrow card has no room beside the button: the clock goes under it
      val under = !oneRow && fit.narrow
      views.setChronometer(R.id.today_clock_under, base, null, under && counts)
      views.setTextViewTextSize(
        R.id.today_clock_under,
        TypedValue.COMPLEX_UNIT_SP,
        Widgets.figureSp(context, 26f, longest, width - CARD_PADDING_DP - INNER_PADDING_DP)
      )
      views.setViewVisibility(R.id.today_clock_under, visible(under))
      if (!oneRow) views.setViewVisibility(R.id.today_clock, visible(!under))
      // The clock has today's time: beside the money, what it is
      val earned = context.getString(if (current) R.string.widget_earned_today else R.string.widget_earned)
      views.setTextViewText(R.id.today_time, earned)
      views.setTextViewText(R.id.today_time_under, earned)
    } else {
      // Paused or idle: a clock left from a run stops counting
      views.setChronometer(R.id.today_clock, SystemClock.elapsedRealtime(), null, false)
    }
    if (oneRow) {
      // The row has no header to say whose day the figures are
      val day = if (current) null else Widgets.dayLabel(context, snapshot.getString("day"))
      row(context, views, timer, countingFrom, money, time, goal, fit, day)
      // Its big figure (today's money, or the time standing still), as big as fits
      val room = Widgets.widthDp(context, fit, id) - ROW_PADDING_DP - buttonDp(fit, true) - (if (fit.narrow) 0f else ASIDE_DP)
      views.setTextViewTextSize(R.id.today_money, TypedValue.COMPLEX_UNIT_SP, Widgets.figureSp(context, 24f, money, room))
      views.setTextViewTextSize(R.id.row_paused, TypedValue.COMPLEX_UNIT_SP, Widgets.figureSp(context, 24f, time, room))
    } else {
      val running = layout == R.layout.widget_today_running
      card(context, views, timer, running, fit)
      if (!running) {
        // Today's money, as big as fits beside its time (under it when narrow)
        val room = Widgets.widthDp(context, fit, id) - CARD_PADDING_DP - (if (fit.narrow) 0f else TIME_BESIDE_DP)
        views.setTextViewTextSize(R.id.today_money, TypedValue.COMPLEX_UNIT_SP, Widgets.figureSp(context, heroSize(fit), money, room))
      }
    }
    return views
  }

  /** What's beside a figure, in dp: the widget's padding, the timer card's, a button, a row's right-hand figure, the time by the money. */
  private const val CARD_PADDING_DP = 32f
  private const val ROW_PADDING_DP = 24f
  private const val INNER_PADDING_DP = 18f
  private const val ASIDE_DP = 92f
  private const val TIME_BESIDE_DP = 70f

  /** The timer button's width with its margin: with words when roomy, else the round one. */
  private fun buttonDp(fit: Fit, oneRow: Boolean): Float = if (!oneRow && fit.roomy) 104f else 56f

  /** Today's money at its biggest, by the card's size (a little smaller when narrow). */
  private fun heroSize(fit: Fit): Float =
    when {
      fit.narrow -> 28f
      fit.height == Height.TALL -> 40f
      else -> 34f
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
    }
    if (timer == null) {
      views.setViewVisibility(R.id.timer_task, View.GONE)
      views.setTextViewText(R.id.timer_status, context.getString(R.string.widget_no_timer))
      return
    }
    views.setViewVisibility(R.id.timer_task, View.VISIBLE)
    views.setTextViewText(R.id.timer_task, timer.getString("task"))
    views.setTextViewText(R.id.timer_status, context.getString(R.string.timer_notice_paused))
  }

  /**
   * One row: today's time over the task while a timer runs (counting) or
   * waits paused ("Paused · its task"), or today's money over its time;
   * wide, the money earned today (or the goal) on the right. `day` names
   * the day the figures are from once it isn't today ("Yesterday · 3h 12m").
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
    day: String?,
  ) {
    val paused = timer != null && countingFrom == null
    views.setViewVisibility(R.id.today_clock, visible(countingFrom != null))
    views.setViewVisibility(R.id.today_money, visible(timer == null))
    views.setViewVisibility(R.id.row_paused, visible(paused))
    if (paused) views.setTextViewText(R.id.row_paused, time)
    val detail =
      when {
        timer == null -> if (day == null) context.getString(R.string.widget_time_today, time) else time
        paused -> context.getString(R.string.widget_paused_task, timer.getString("task"))
        else -> timer.getString("task")
      }
    views.setTextViewText(R.id.row_detail, if (day == null) detail else context.getString(R.string.widget_figures, day, detail))

    // Wide: the money earned today beside a timer, or the goal beside today's money
    val aside: Pair<String, String>? =
      when {
        fit.narrow -> null
        timer != null -> money to context.getString(R.string.widget_earned)
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
