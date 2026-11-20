package com.taskmint.android

import android.content.Context
import android.view.View
import android.widget.RemoteViews
import androidx.core.widget.RemoteViewsCompat
import com.taskmint.android.Widgets.visible
import org.json.JSONArray
import org.json.JSONObject

/** The Calendar widget (CalendarViews). */
class CalendarWidget : TaskMintWidget() {
  override val kind: WidgetKind
    get() = CalendarViews
}

/**
 * The Calendar: the phone's Calendar agenda as a list, from recent weeks to
 * the releases ahead (the snapshot's `agenda`: rows the page works out). Each
 * week is a header, then its days in a card. It opens at this week when
 * placed, after a restart, and when a new week starts; a figures update
 * leaves the list where it was scrolled. A tap opens the Calendar.
 *
 * What depends on the clock follows the phone's, since the rows were
 * written when the page last worked them out: which day is today (and so
 * which week the list opens at), and the badge for the next withdrawal's
 * opening, which becomes "Open now" on today's row once its time has passed
 * (WidgetFigures.badgesNow).
 */
object CalendarViews : WidgetKind {
  override val provider = CalendarWidget::class.java

  /** Only narrow and wide differ (its list is redrawn for each). */
  override val sizes = Fit.sizes(listOf(Height.ROW))

  /** Where the lists were opened at last (thisWeek). */
  private const val OPENED_WEEK = "calendarOpenedWeek"
  /** Between opening a list's steps: time for it to lay out, then to scroll. */
  private const val OPEN_STEP_MS = 1_200L
  /** The week the lists are being opened at now (the steps are under way). */
  @Volatile private var opening: String? = null

  private val badgeSlots =
    listOf(
      R.id.badge_0_info to R.id.badge_0_success,
      R.id.badge_1_info to R.id.badge_1_success,
      R.id.badge_2_info to R.id.badge_2_success,
    )

  override fun part(snapshot: JSONObject): String {
    val payouts = snapshot.optJSONObject("payouts")
    return listOf(snapshot.opt("day"), snapshot.opt("agenda"), payouts?.opt("opensAtMs"), payouts?.opt("isOpen")).toString()
  }

  /** From this week on: the picker's picture can't be scrolled to it. */
  override fun previewOf(snapshot: JSONObject): JSONObject {
    val preview = JSONObject(snapshot.toString())
    val agenda = preview.optJSONObject("agenda") ?: return preview
    val rows = agenda.optJSONArray("rows") ?: return preview
    val fromThisWeek = JSONArray()
    for (index in thisWeekRow(agenda) until rows.length()) fromThisWeek.put(rows.get(index))
    agenda.put("rows", fromThisWeek).put("thisWeekIndex", 0)
    return preview
  }

  /** The row of the week the phone's today is in (the page's own, until its day has gone). */
  private fun thisWeekRow(agenda: JSONObject): Int =
    WidgetFigures.thisWeekRow(agenda.optJSONArray("rows") ?: JSONArray(), Widgets.today(), agenda.optInt("thisWeekIndex"))

  /** Whether the next withdrawal is open now: the page said so, or its time has passed since. */
  private fun opened(snapshot: JSONObject): Boolean {
    val payouts = snapshot.optJSONObject("payouts") ?: return false
    val opensAt = if (payouts.isNull("opensAtMs")) null else payouts.optLong("opensAtMs")
    return payouts.optBoolean("isOpen") || (opensAt != null && System.currentTimeMillis() >= opensAt)
  }

  /** This week's header: its date and row ("2026-11-08@7"), which moves when earlier weeks come or go. */
  private fun thisWeek(snapshot: JSONObject?): String? {
    val agenda = snapshot?.optJSONObject("agenda") ?: return null
    val index = thisWeekRow(agenda)
    return agenda.optJSONArray("rows")?.optJSONObject(index)?.optString("date")?.let { "$it@$index" }
  }

  override fun views(context: Context, snapshot: JSONObject?, fit: Fit, id: Int, scroll: Int?): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.widget_calendar)
    views.setOnClickPendingIntent(android.R.id.background, Launch.pending(context, "calendar"))
    val agenda = snapshot?.optJSONObject("agenda")
    if (agenda == null) {
      Widgets.header(views, context.getString(R.string.widget_calendar_label), null)
      return Widgets.message(views, context.getString(R.string.widget_open_app))
    }
    Widgets.content(views)
    val month = agenda.getString("month")
    val aside = agenda.text("monthMoney")?.let { context.getString(R.string.widget_figures, month, it) } ?: month
    Widgets.header(views, context.getString(R.string.widget_calendar_label), if (fit.narrow) null else aside)

    val rows = agenda.getJSONArray("rows")
    val today = Widgets.today()
    val opened = opened(snapshot)
    val items = RemoteViewsCompat.RemoteCollectionItems.Builder().setHasStableIds(true).setViewTypeCount(2)
    for (index in 0 until rows.length()) {
      val row = rows.getJSONObject(index)
      val week = row.getString("kind") == "week"
      items.addItem(
        "${row.getString("kind")}:${row.getString("date")}".hashCode().toLong(),
        if (week) week(context, row) else day(context, row, fit, today, opened)
      )
    }
    RemoteViewsCompat.setRemoteAdapter(context, views, id, R.id.agenda_list, items.build())
    views.setEmptyView(R.id.agenda_list, R.id.agenda_empty)
    views.setPendingIntentTemplate(R.id.agenda_list, Launch.template(context))
    if (scroll != null) views.setScrollPosition(R.id.agenda_list, scroll)
    return views
  }

  /**
   * Opens the lists at this week when placed or restarted, and when a new
   * week starts (or earlier weeks come or go, which moves it). A list scrolls a row only as far as shows it, so from above
   * this week would end at the bottom: once the list is laid out, it goes to
   * the end, then back up to this week, which lands at the top.
   */
  override fun drawn(context: Context, ids: IntArray, snapshot: JSONObject?, fresh: Boolean) {
    val week = thisWeek(snapshot) ?: return
    val prefs = Widgets.prefs(context)
    if (!fresh && (week == prefs.getString(OPENED_WEEK, null) || week == opening)) return
    opening = week
    val agenda = snapshot!!.getJSONObject("agenda")
    val last = agenda.getJSONArray("rows").length() - 1
    val target = thisWeekRow(agenda)
    Widgets.later(OPEN_STEP_MS) { Widgets.drawScrolled(context, this, ids, Widgets.snapshot(context), last) }
    Widgets.later(2 * OPEN_STEP_MS) {
      Widgets.drawScrolled(context, this, ids, Widgets.snapshot(context), target)
      // Opened only now: a process that ended before this step (a check of
      // the published figures doesn't hold it) opens the list at the next draw
      prefs.edit().putString(OPENED_WEEK, week).apply()
      if (opening == week) opening = null
    }
  }

  private fun week(context: Context, row: JSONObject): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.widget_agenda_week)
    views.setTextViewText(R.id.week_title, row.getString("title"))
    val totals = row.text("totals")
    views.setViewVisibility(R.id.week_totals, visible(totals != null))
    views.setTextViewText(R.id.week_totals, totals ?: "")
    views.setOnClickFillInIntent(R.id.agenda_week, Launch.fillIn("calendar"))
    return views
  }

  private fun day(context: Context, row: JSONObject, fit: Fit, day: String, opened: Boolean): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.widget_agenda_day)
    views.setInt(
      R.id.agenda_day,
      "setBackgroundResource",
      when (row.optString("position")) {
        "top" -> R.drawable.widget_day_top
        "middle" -> R.drawable.widget_day_middle
        "bottom" -> R.drawable.widget_day_bottom
        else -> R.drawable.widget_day_single
      }
    )
    views.setContentDescription(R.id.agenda_day, row.getString("spoken"))
    views.setOnClickFillInIntent(R.id.agenda_day, Launch.fillIn("calendar"))

    val today = row.optString("date") == day
    views.setViewVisibility(R.id.day_weekday, visible(!today))
    views.setViewVisibility(R.id.day_weekday_today, visible(today))
    views.setViewVisibility(R.id.day_number, visible(!today))
    views.setViewVisibility(R.id.day_number_today, visible(today))
    for (weekday in listOf(R.id.day_weekday, R.id.day_weekday_today)) views.setTextViewText(weekday, row.getString("weekday"))
    for (number in listOf(R.id.day_number, R.id.day_number_today)) views.setTextViewText(number, row.getString("dayOfMonth"))

    val time = row.text("time")
    val goal = row.whole("goalPercent")
    val timeShown = !fit.narrow && (time != null || goal != null)
    views.setViewVisibility(R.id.day_time_box, visible(timeShown))
    views.setViewVisibility(R.id.day_spacer, visible(!timeShown))
    views.setViewVisibility(R.id.day_time, visible(time != null))
    views.setTextViewText(R.id.day_time, time ?: "")
    views.setViewVisibility(R.id.day_goal, visible(goal != null && goal < 100))
    views.setViewVisibility(R.id.day_goal_met, visible(goal != null && goal >= 100))
    if (goal != null) {
      views.setProgressBar(if (goal >= 100) R.id.day_goal_met else R.id.day_goal, 100, goal.coerceIn(0, 100), false)
    }

    val money = row.text("money")
    views.setViewVisibility(R.id.day_money, visible(money != null))
    views.setTextViewText(R.id.day_money, money ?: "")

    val badges = WidgetFigures.badgesNow(row, day, opened, context.getString(R.string.widget_open_now), badgeSlots.size)
    val count = badges.size
    views.setViewVisibility(R.id.day_badges, visible(count > 0))
    badgeSlots.forEachIndexed { index, (info, success) ->
      if (index >= count) {
        views.setViewVisibility(info, View.GONE)
        views.setViewVisibility(success, View.GONE)
        return@forEachIndexed
      }
      val badge = badges[index]
      val kind = badge.kind
      val released = kind == "release" || kind == "releaseAhead"
      val shown = if (released) info else success
      views.setViewVisibility(info, visible(released))
      views.setViewVisibility(success, visible(!released))
      views.setTextViewText(shown, badge.text)
      views.setInt(
        shown,
        "setBackgroundResource",
        when (kind) {
          "release" -> R.drawable.widget_badge_info
          "releaseAhead" -> R.drawable.widget_badge_info_ahead
          "withdrawal" -> R.drawable.widget_badge_success
          else -> R.drawable.widget_badge_success_ahead
        }
      )
      views.setTextViewCompoundDrawablesRelative(
        shown,
        when (kind) {
          "withdrawal" -> R.drawable.ic_widget_savings
          "opens", "openNow" -> R.drawable.ic_widget_schedule
          else -> R.drawable.ic_widget_release
        },
        0,
        0,
        0
      )
    }
    return views
  }
}
