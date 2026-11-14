package com.taskmint.android

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.format.DateFormat
import android.util.SizeF
import android.view.View
import android.widget.RemoteViews
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import org.json.JSONObject

/**
 * The home-screen widgets: Today (the running timer, today's time and money,
 * the daily goal), Payouts (the next withdrawal and the releases coming), the
 * Calendar (the phone's Calendar agenda) and This week (a bar a day).
 *
 * The page works the figures out (the money math is the client's:
 * packages/client/src/widgets) and sends them whenever their text changes
 * (MainActivity's AppTask.updateWidgets), as one snapshot (WidgetSnapshot,
 * version 2). It's kept here, so a widget added or redrawn later has it,
 * and each widget is redrawn only when its own part changes: a running timer
 * sends Today's figures every minute, and the Calendar's list would lose its
 * scroll if it were sent again with them.
 *
 * A widget picks its layout by its size (Fit): Android 12 and later get one
 * per size class and switch between them as the widget is resized; earlier
 * Androids get the one for the widget's current size. A running timer counts
 * on its own (a Chronometer). The widgets are redrawn at midnight (Today
 * then says "Yesterday" over figures the page hasn't updated) and when the
 * next withdrawal opens (WidgetRefresh).
 */
object Widgets {
  private const val PREFS = "TaskMintWidgets"
  private const val SNAPSHOT = "snapshot"
  /** The snapshot's version these widgets read; an older one shows "Open TaskMint…". */
  private const val VERSION = 2
  private const val REFRESH_WINDOW_MS = 10 * 60_000L

  private val kinds: List<WidgetKind>
    get() = listOf(TodayViews, PayoutsViews, CalendarViews, WeekViews)

  fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  /** Keeps the page's figures and redraws the widgets whose part of them changed. */
  fun save(context: Context, json: String) {
    val before = read(prefs(context).getString(SNAPSHOT, null))
    prefs(context).edit().putString(SNAPSHOT, json).apply()
    val after = read(json)
    for (kind in kinds) {
      if (before == null || after == null || kind.part(before) != kind.part(after)) redraw(context, kind)
    }
    scheduleRefresh(context, after)
  }

  private fun read(json: String?): JSONObject? =
    json?.let { runCatching { JSONObject(it) }.getOrNull() }?.takeIf { it.optInt("version") == VERSION }

  fun snapshot(context: Context): JSONObject? = read(prefs(context).getString(SNAPSHOT, null))

  /** Every widget, from the kept figures (at midnight, the opening, a clock change). */
  fun redrawAll(context: Context) {
    for (kind in kinds) redraw(context, kind)
    scheduleRefresh(context, snapshot(context))
  }

  private fun redraw(context: Context, kind: WidgetKind) {
    val ids = AppWidgetManager.getInstance(context).getAppWidgetIds(ComponentName(context, kind.provider))
    if (ids.isNotEmpty()) draw(context, kind, ids, fresh = false)
  }

  /**
   * Draws `kind`'s widgets `ids`. `fresh`: just placed, or the phone or app
   * restarted (the Calendar then opens at this week again).
   */
  fun draw(context: Context, kind: WidgetKind, ids: IntArray, fresh: Boolean) {
    val snapshot = snapshot(context)
    drawScrolled(context, kind, ids, snapshot, null)
    kind.drawn(context, ids, snapshot, fresh)
  }

  /** Draws `kind`'s widgets `ids`, bringing a list's row `scroll` into view (null: leaving it where it is). */
  fun drawScrolled(context: Context, kind: WidgetKind, ids: IntArray, snapshot: JSONObject?, scroll: Int?) {
    val manager = AppWidgetManager.getInstance(context)
    for (id in ids) {
      val views =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
          RemoteViews(kind.sizes.associateWith { size -> kind.views(context, snapshot, Fit.of(size.width, size.height), id, scroll) })
        } else {
          kind.views(context, snapshot, Fit.of(manager.getAppWidgetOptions(id)), id, scroll)
        }
      manager.updateAppWidget(id, views)
    }
  }

  private val main by lazy { Handler(Looper.getMainLooper()) }

  /** After `delayMs`, on the main thread. */
  fun later(delayMs: Long, work: () -> Unit) {
    main.postDelayed(work, delayMs)
  }

  /**
   * How long a widget's redraw can go on after it's asked for (the
   * Calendar's list settling at this week): a receiver keeps its process
   * that long.
   */
  const val SETTLE_MS = 3_500L

  /**
   * Redraws every widget at the next local midnight or when the next
   * withdrawal opens, whichever comes first; nothing once no widget is left.
   */
  fun scheduleRefresh(context: Context, snapshot: JSONObject? = this.snapshot(context)) {
    val alarms = context.getSystemService(AlarmManager::class.java) ?: return
    val refresh =
      PendingIntent.getBroadcast(
        context,
        0,
        Intent(context, WidgetRefresh::class.java),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
      )
    val manager = AppWidgetManager.getInstance(context)
    if (kinds.all { manager.getAppWidgetIds(ComponentName(context, it.provider)).isEmpty() }) {
      alarms.cancel(refresh)
      return
    }
    val now = System.currentTimeMillis()
    val midnight =
      Calendar.getInstance().apply {
        timeInMillis = now
        add(Calendar.DAY_OF_YEAR, 1)
        set(Calendar.HOUR_OF_DAY, 0)
        set(Calendar.MINUTE, 0)
        set(Calendar.SECOND, 5)
        set(Calendar.MILLISECOND, 0)
      }.timeInMillis
    val opens = snapshot?.optJSONObject("payouts")?.time("opensAtMs")?.takeIf { it > now }
    // A window, not exact: the phone needn't wake for it, and the opening
    // still shows within minutes of its time
    alarms.setWindow(AlarmManager.RTC, minOf(midnight, opens ?: midnight), REFRESH_WINDOW_MS, refresh)
  }

  // ----- What the widgets share -----

  /** A string field that may be null (or missing) in the JSON. */
  fun JSONObject.text(name: String): String? = if (isNull(name)) null else getString(name)

  fun JSONObject.time(name: String): Long? = if (isNull(name)) null else getLong(name)

  fun JSONObject.whole(name: String): Int? = if (isNull(name)) null else getInt(name)

  fun visible(shown: Boolean) = if (shown) View.VISIBLE else View.GONE

  /** The header's name and its right-hand side (none when null). */
  fun header(views: RemoteViews, title: String, aside: String?) {
    views.setTextViewText(R.id.widget_title, title)
    views.setTextViewText(R.id.widget_aside, aside ?: "")
    views.setViewVisibility(R.id.widget_aside, visible(aside != null))
  }

  /** In place of the widget's figures: why there are none. */
  fun message(views: RemoteViews, text: String): RemoteViews {
    views.setViewVisibility(R.id.widget_content, View.GONE)
    views.setTextViewText(R.id.widget_message, text)
    views.setViewVisibility(R.id.widget_message, View.VISIBLE)
    return views
  }

  /**
   * The widget's figures, not the message. Every draw says what's shown: a
   * launcher re-applies views to the same layout in place, so anything left
   * unsaid keeps what the last draw set.
   */
  fun content(views: RemoteViews) {
    views.setViewVisibility(R.id.widget_content, View.VISIBLE)
    views.setViewVisibility(R.id.widget_message, View.GONE)
  }

  /** "as of 3:42 PM", in the phone's clock format: when the page worked the figures out. */
  fun asOf(context: Context, snapshot: JSONObject): String =
    context.getString(R.string.widget_as_of, DateFormat.getTimeFormat(context).format(Date(snapshot.getLong("updatedAtMs"))))

  /** A figure as a screen reader says it: "~$45" is "About $45". */
  fun spoken(context: Context, money: String): String =
    if (money.startsWith("~")) context.getString(R.string.widget_about, money.substring(1)) else money

  private fun dayKey(calendar: Calendar): String = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(calendar.time)

  /** "Today" for today's figures; "Yesterday" or "Wed, Nov 11" once they're from an earlier day. */
  fun dayLabel(context: Context, day: String): String {
    val now = Calendar.getInstance()
    if (day == dayKey(now)) return context.getString(R.string.widget_today_label)
    now.add(Calendar.DAY_OF_YEAR, -1)
    if (day == dayKey(now)) return context.getString(R.string.widget_yesterday)
    val date = runCatching { SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(day) }.getOrNull() ?: return day
    val locale = Locale.getDefault()
    return SimpleDateFormat(DateFormat.getBestDateTimePattern(locale, "EEEMMMd"), locale).format(date)
  }
}

/** How tall a widget is (in rows, about), for its layout. */
enum class Height {
  ROW,
  CARD,
  TALL,
}

/**
 * A widget's size class: how tall, whether narrow (about two columns), and
 * whether roomy (four columns: room for a button's words).
 */
data class Fit(val height: Height, val narrow: Boolean, val roomy: Boolean = false) {
  companion object {
    /** Where (dp) a widget stops being narrow and starts being roomy, and starts being a card and tall. */
    const val WIDE_FROM = 200f
    const val ROOMY_FROM = 300f
    const val CARD_FROM = 170f
    const val TALL_FROM = 290f
    private const val NARROWEST = 100f
    private const val SHORTEST = 40f

    fun of(width: Float, height: Float) =
      Fit(
        when {
          height >= TALL_FROM -> Height.TALL
          height >= CARD_FROM -> Height.CARD
          else -> Height.ROW
        },
        narrow = width < WIDE_FROM,
        roomy = width >= ROOMY_FROM
      )

    /** Before Android 12: the widget's size now, upright (a card until the launcher says). */
    fun of(options: Bundle): Fit {
      val width = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH)
      val height = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT)
      return if (width == 0 || height == 0) Fit(Height.CARD, narrow = false) else of(width.toFloat(), height.toFloat())
    }

    /** Each size class's smallest size, for Android 12's RemoteViews by size (`roomy`: telling roomy apart). */
    fun sizes(heights: List<Height> = Height.values().toList(), roomy: Boolean = false): List<SizeF> =
      (if (roomy) listOf(NARROWEST, WIDE_FROM, ROOMY_FROM) else listOf(NARROWEST, WIDE_FROM)).flatMap { width ->
        heights.map { height ->
          SizeF(
            width,
            when (height) {
              Height.ROW -> SHORTEST
              Height.CARD -> CARD_FROM
              Height.TALL -> TALL_FROM
            }
          )
        }
      }
  }
}

/** One kind of widget: its provider, its part of the snapshot, and its views. */
interface WidgetKind {
  val provider: Class<out AppWidgetProvider>

  /** The size classes it has layouts for (Android 12 and later). */
  val sizes: List<SizeF>
    get() = Fit.sizes()

  /** Its part of the snapshot: it's redrawn when this changes. */
  fun part(snapshot: JSONObject): String

  /**
   * Its views at `fit`, from `snapshot` (null: none yet, or an older one),
   * bringing its list's row `scroll` into view (null: leaving it be).
   */
  fun views(context: Context, snapshot: JSONObject?, fit: Fit, id: Int, scroll: Int?): RemoteViews

  /** After its widgets `ids` are drawn; `fresh` as Widgets.draw has it. */
  fun drawn(context: Context, ids: IntArray, snapshot: JSONObject?, fresh: Boolean) {}
}

/** A widget provider: draws its kind when placed, resized or restarted. */
abstract class TaskMintWidget : AppWidgetProvider() {
  abstract val kind: WidgetKind

  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    settling { Widgets.draw(context, kind, ids, fresh = true) }
    Widgets.scheduleRefresh(context)
  }

  /** Resized: before Android 12, a new size can need another layout. */
  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) {
    settling { Widgets.draw(context, kind, intArrayOf(id), fresh = false) }
  }

  /** Does `draw`, keeping the process while the redraws it leads to settle. */
  private fun settling(draw: () -> Unit) {
    val pending = goAsync()
    draw()
    Widgets.later(Widgets.SETTLE_MS) { pending.finish() }
  }

  /** The last of its kind removed: no refresh once no widget is left. */
  override fun onDisabled(context: Context) {
    Widgets.scheduleRefresh(context)
  }
}

/** Redraws the widgets at midnight, when the next withdrawal opens, and when the phone's clock or zone changes. */
class WidgetRefresh : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val pending = goAsync()
    Widgets.redrawAll(context)
    Widgets.later(Widgets.SETTLE_MS) { pending.finish() }
  }
}
