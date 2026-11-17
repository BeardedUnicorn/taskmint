package com.taskmint.android

import android.content.Context
import android.view.View
import android.widget.RemoteViews
import com.taskmint.android.Widgets.text
import com.taskmint.android.Widgets.time
import com.taskmint.android.Widgets.visible
import org.json.JSONArray
import org.json.JSONObject

/** The Payouts widget (PayoutsViews). */
class PayoutsWidget : TaskMintWidget() {
  override val kind: WidgetKind
    get() = PayoutsViews
}

/**
 * Payouts: the next withdrawal (how much, when it opens, or "Ready to
 * withdraw" once it has) with the next release under it; until a
 * withdrawal is recorded, the next release itself. Tall, it lists the next
 * release days. From the snapshot's `payouts`.
 */
object PayoutsViews : WidgetKind {
  override val provider = PayoutsWidget::class.java

  private val releaseRows =
    listOf(
      Triple(R.id.release_0, R.id.release_0_day, R.id.release_0_amount),
      Triple(R.id.release_1, R.id.release_1_day, R.id.release_1_amount),
      Triple(R.id.release_2, R.id.release_2_day, R.id.release_2_amount),
    )

  override fun part(snapshot: JSONObject) = listOf(snapshot.opt("updatedAtMs"), snapshot.opt("payouts")).toString()

  override fun views(context: Context, snapshot: JSONObject?, fit: Fit, id: Int, scroll: Int?): RemoteViews {
    val views =
      RemoteViews(context.packageName, if (fit.height == Height.ROW) R.layout.widget_payouts_row else R.layout.widget_payouts)
    views.setOnClickPendingIntent(android.R.id.background, Launch.pending(context, "payouts"))
    Widgets.header(
      views,
      context.getString(R.string.widget_payouts_label),
      if (snapshot == null || fit.narrow) null else Widgets.asOf(context, snapshot)
    )
    if (snapshot == null) return Widgets.message(views, context.getString(R.string.widget_open_app))
    val payouts = snapshot.optJSONObject("payouts") ?: return Widgets.message(views, context.getString(R.string.widget_no_payouts))

    // The figures as they are now: the page wrote them a while ago, and releases have passed since
    val now = System.currentTimeMillis()
    val releases = releasesLeft(payouts, now)
    val planned = payouts.text("hint") == null
    if (!planned && releases.isEmpty()) return Widgets.message(views, context.getString(R.string.widget_no_payouts))

    Widgets.content(views)
    // Until a withdrawal is recorded the big figure is the next release itself
    val amount = if (planned) withdrawalNow(payouts, now) else releases[0].amount
    val status = if (planned) payouts.getString("status") else releases[0].day
    views.setTextViewText(R.id.payouts_label, payouts.getString("label"))
    views.setTextViewText(R.id.payouts_amount, amount)
    views.setContentDescription(R.id.payouts_amount, Widgets.spoken(context, amount))

    // Open once its time has passed, though the page hasn't said so yet
    val opensAt = payouts.time("opensAtMs")
    val open = payouts.optBoolean("isOpen") || (opensAt != null && now >= opensAt)
    views.setViewVisibility(R.id.payouts_pill, visible(open))
    views.setViewVisibility(R.id.payouts_status, visible(!open))
    views.setTextViewText(R.id.payouts_status, status)

    // Tall: the next release days, less the one the big figure is already
    val skip = if (planned) 0 else 1
    val count = if (fit.height == Height.TALL) minOf(releases.size - skip, releaseRows.size) else 0
    views.setViewVisibility(R.id.releases_block, visible(count > 0))
    views.setViewVisibility(R.id.releases_spacer, visible(count > 0))
    releaseRows.forEachIndexed { index, (rowId, dayId, amountId) ->
      views.setViewVisibility(rowId, visible(index < count))
      if (index < count) {
        val release = releases[index + skip]
        views.setTextViewText(dayId, release.day)
        views.setTextViewText(amountId, release.amount)
        views.setContentDescription(amountId, Widgets.spoken(context, release.amount))
      }
    }

    // One row, wide, under a withdrawal: the next release on the right
    val next = releases.firstOrNull()
    val aside = fit.height == Height.ROW && !fit.narrow && planned && next != null
    views.setViewVisibility(R.id.row_aside, visible(aside))
    if (aside) {
      views.setTextViewText(R.id.row_aside_figure, next!!.amount)
      views.setContentDescription(R.id.row_aside_figure, Widgets.spoken(context, next.amount))
      views.setTextViewText(R.id.row_aside_detail, next.day)
    }

    // A hint first; else the next release, unless the list shows it
    val nextRelease =
      if (planned && next != null) "${context.getString(R.string.widget_next_release)} ${next.day} · ${next.amount}" else null
    val footnote = payouts.text("hint") ?: nextRelease?.takeIf { count == 0 }
    views.setViewVisibility(R.id.payouts_footnote, if (footnote == null) View.GONE else View.VISIBLE)
    views.setTextViewText(R.id.payouts_footnote, footnote ?: "")
    return views
  }

  /** A release day still ahead, as the widget lists it. */
  private class Release(val day: String, val amount: String)

  /**
   * The snapshot's release days that are still to come at `now`: each day's
   * `parts` go as their time passes (the day with its last), and what's left
   * of a day is added up. A day without parts (an older snapshot) stays as
   * the page wrote it.
   */
  private fun releasesLeft(payouts: JSONObject, now: Long): List<Release> {
    val days = payouts.optJSONArray("releases") ?: return emptyList()
    return (0 until days.length()).mapNotNull { index ->
      val day = days.getJSONObject(index)
      val parts = day.optJSONArray("parts") ?: return@mapNotNull Release(day.getString("day"), day.getString("amount"))
      val left = (0 until parts.length()).map(parts::getJSONObject).filter { it.getLong("atMs") > now }
      when (left.size) {
        0 -> null
        parts.length() -> Release(day.getString("day"), day.getString("amount"))
        else ->
          Release(
            day.getString("day"),
            Widgets.money(left.sumOf { it.getDouble("cents") }, left.any { it.optBoolean("estimated") })
          )
      }
    }
  }

  /**
   * What the next withdrawal takes at `now`: the page's amount, and each
   * release since it was worked out (the snapshot's `growth`), which the
   * withdrawal takes too once it's open.
   */
  private fun withdrawalNow(payouts: JSONObject, now: Long): String {
    val growth = payouts.optJSONObject("growth")
    val steps = growth?.optJSONArray("steps")
    val passed = (0 until (steps?.length() ?: 0)).map { steps!!.getJSONObject(it) }.filter { it.getLong("atMs") <= now }
    if (growth == null || passed.isEmpty()) return payouts.getString("amount")
    return Widgets.money(
      growth.getDouble("cents") + passed.sumOf { it.getDouble("cents") },
      growth.optBoolean("estimated") || passed.any { it.optBoolean("estimated") }
    )
  }

  /** When the figures next change by the clock alone: the soonest release still ahead; null when none is. */
  fun nextChangeAt(snapshot: JSONObject, now: Long): Long? {
    val payouts = snapshot.optJSONObject("payouts") ?: return null
    val times = mutableListOf<Long>()
    val collect = { steps: JSONArray? ->
      for (index in 0 until (steps?.length() ?: 0)) times += steps!!.getJSONObject(index).getLong("atMs")
    }
    collect(payouts.optJSONObject("growth")?.optJSONArray("steps"))
    val days = payouts.optJSONArray("releases")
    for (index in 0 until (days?.length() ?: 0)) collect(days!!.getJSONObject(index).optJSONArray("parts"))
    return times.filter { it > now }.minOrNull()
  }
}
