package com.taskmint.android

import android.content.Context
import android.view.View
import android.widget.RemoteViews
import com.taskmint.android.Widgets.text
import com.taskmint.android.Widgets.time
import com.taskmint.android.Widgets.visible
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

    Widgets.content(views)
    val amount = payouts.getString("amount")
    views.setTextViewText(R.id.payouts_label, payouts.getString("label"))
    views.setTextViewText(R.id.payouts_amount, amount)
    views.setContentDescription(R.id.payouts_amount, Widgets.spoken(context, amount))

    // Open once its time has passed, though the page hasn't said so yet
    val opensAt = payouts.time("opensAtMs")
    val open = payouts.optBoolean("isOpen") || (opensAt != null && System.currentTimeMillis() >= opensAt)
    views.setViewVisibility(R.id.payouts_pill, visible(open))
    views.setViewVisibility(R.id.payouts_status, visible(!open))
    views.setTextViewText(R.id.payouts_status, payouts.getString("status"))

    // Tall: the next release days, less the one the big figure is already
    val releases = payouts.optJSONArray("releases")
    val first = releases?.optJSONObject(0)
    val skip = if (first != null && first.getString("day") == payouts.getString("status") && first.getString("amount") == amount) 1 else 0
    val count = if (fit.height == Height.TALL) minOf((releases?.length() ?: 0) - skip, releaseRows.size) else 0
    views.setViewVisibility(R.id.releases_block, visible(count > 0))
    views.setViewVisibility(R.id.releases_spacer, visible(count > 0))
    releaseRows.forEachIndexed { index, (rowId, dayId, amountId) ->
      views.setViewVisibility(rowId, visible(index < count))
      if (index < count) {
        val release = releases!!.getJSONObject(index + skip)
        views.setTextViewText(dayId, release.getString("day"))
        views.setTextViewText(amountId, release.getString("amount"))
        views.setContentDescription(amountId, Widgets.spoken(context, release.getString("amount")))
      }
    }

    // One row, wide, under a withdrawal: the next release on the right
    val next = releases?.optJSONObject(0)
    val aside = fit.height == Height.ROW && !fit.narrow && payouts.text("nextRelease") != null && next != null
    views.setViewVisibility(R.id.row_aside, visible(aside))
    if (aside) {
      views.setTextViewText(R.id.row_aside_figure, next!!.getString("amount"))
      views.setContentDescription(R.id.row_aside_figure, Widgets.spoken(context, next.getString("amount")))
      views.setTextViewText(R.id.row_aside_detail, next.getString("day"))
    }

    // A hint first; else the next release, unless the list shows it
    val footnote = payouts.text("hint") ?: payouts.text("nextRelease")?.takeIf { count == 0 }
    views.setViewVisibility(R.id.payouts_footnote, if (footnote == null) View.GONE else View.VISIBLE)
    views.setTextViewText(R.id.payouts_footnote, footnote ?: "")
    return views
  }
}
