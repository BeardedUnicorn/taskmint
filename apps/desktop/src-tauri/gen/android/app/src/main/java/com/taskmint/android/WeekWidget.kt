package com.taskmint.android

import android.content.Context
import android.widget.RemoteViews
import com.taskmint.android.Widgets.visible
import com.taskmint.android.Widgets.whole
import org.json.JSONObject

/** The This week widget (WeekViews). */
class WeekWidget : TaskMintWidget() {
  override val kind: WidgetKind
    get() = WeekViews
}

/**
 * This week: a bar for each day, Sunday to Saturday, today's in the accent,
 * against the daily goal's line, with the week's totals; tall, each day's
 * amount under its letter. From the snapshot's `week`, whose levels (0–10000)
 * are the bars' and the line's heights. A tap opens History.
 */
object WeekViews : WidgetKind {
  override val provider = WeekWidget::class.java

  /** Only width (where the totals go) and being tall (the amounts) change it. */
  override val sizes = Fit.sizes(listOf(Height.ROW, Height.TALL))

  private val columns = listOf(R.id.column_0, R.id.column_1, R.id.column_2, R.id.column_3, R.id.column_4, R.id.column_5, R.id.column_6)
  private val bars = listOf(R.id.bar_0, R.id.bar_1, R.id.bar_2, R.id.bar_3, R.id.bar_4, R.id.bar_5, R.id.bar_6)
  private val letters = listOf(R.id.letter_0, R.id.letter_1, R.id.letter_2, R.id.letter_3, R.id.letter_4, R.id.letter_5, R.id.letter_6)
  private val todayLetters =
    listOf(
      R.id.letter_today_0,
      R.id.letter_today_1,
      R.id.letter_today_2,
      R.id.letter_today_3,
      R.id.letter_today_4,
      R.id.letter_today_5,
      R.id.letter_today_6,
    )
  private val amounts = listOf(R.id.amount_0, R.id.amount_1, R.id.amount_2, R.id.amount_3, R.id.amount_4, R.id.amount_5, R.id.amount_6)

  override fun part(snapshot: JSONObject) = snapshot.opt("week").toString()

  override fun views(context: Context, snapshot: JSONObject?, fit: Fit, id: Int, scroll: Int?): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.widget_week)
    views.setOnClickPendingIntent(android.R.id.background, Launch.pending(context, "history"))
    val week = snapshot?.optJSONObject("week")
    if (week == null) {
      Widgets.header(views, context.getString(R.string.widget_week_label), null)
      return Widgets.message(views, context.getString(R.string.widget_open_app))
    }
    Widgets.content(views)
    val totals = week.getString("totals")
    Widgets.header(views, context.getString(R.string.widget_week_label), if (fit.narrow) null else totals)
    views.setViewVisibility(R.id.week_totals_narrow, visible(fit.narrow))
    views.setTextViewText(R.id.week_totals_narrow, totals)

    val days = week.getJSONArray("days")
    for (index in columns.indices) {
      val day = days.optJSONObject(index) ?: continue
      val today = day.optBoolean("isToday")
      views.setImageViewResource(bars[index], if (today) R.drawable.widget_bar_today else R.drawable.widget_bar)
      views.setInt(bars[index], "setImageLevel", day.optInt("level"))
      views.setViewVisibility(letters[index], visible(!today))
      views.setViewVisibility(todayLetters[index], visible(today))
      views.setTextViewText(letters[index], day.getString("letter"))
      views.setTextViewText(todayLetters[index], day.getString("letter"))
      views.setTextViewText(amounts[index], day.getString("amount"))
      views.setContentDescription(columns[index], day.getString("spoken"))
    }
    views.setViewVisibility(R.id.amounts, visible(fit.height == Height.TALL && !fit.narrow))

    val goal = week.whole("goalLevel")
    views.setViewVisibility(R.id.goal_line, visible(goal != null))
    if (goal != null) views.setInt(R.id.goal_line, "setImageLevel", goal)
    return views
  }
}
