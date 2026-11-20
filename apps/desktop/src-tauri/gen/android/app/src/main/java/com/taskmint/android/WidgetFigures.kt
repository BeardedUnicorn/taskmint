package com.taskmint.android

import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import kotlin.math.floor
import org.json.JSONArray
import org.json.JSONObject

/** A string field that may be null (or missing) in the JSON. */
fun JSONObject.text(name: String): String? = if (isNull(name)) null else getString(name)

fun JSONObject.time(name: String): Long? = if (isNull(name)) null else getLong(name)

fun JSONObject.whole(name: String): Int? = if (isNull(name)) null else getInt(name)

/**
 * What the widgets work out for themselves from the snapshot and the
 * phone's clock (Widgets.kt draws it): today's money as a running timer
 * earns it, the releases that have passed, which day is today once the
 * snapshot's has gone, and whether another device's figures are newer.
 * Nothing here touches Android, so it's all under test
 * (src/test: WidgetFiguresTest).
 */
object WidgetFigures {
  private const val HOUR_MS = 3_600_000.0
  private const val DAY_MS = 86_400_000L
  /** The soonest today's money is drawn again. */
  private const val MONEY_EVERY_MS = 60_000L

  // ----- Money and time -----

  /** "$1,235", "~$1,235" for an estimate: whole dollars, as the page writes money (widgetText.ts). */
  fun money(cents: Double, estimated: Boolean): String {
    val dollars = NumberFormat.getCurrencyInstance(Locale.US).apply { maximumFractionDigits = 0 }
    return (if (estimated) "~" else "") + dollars.format(Math.round(cents / 100))
  }

  /** "3h 12m", "12m": a time as the page writes it (formatDurationCompact). */
  fun timeInWords(ms: Long): String {
    val minutes = ms.coerceAtLeast(0) / 60_000
    return if (minutes >= 60) "${minutes / 60}h ${minutes % 60}m" else "${minutes}m"
  }

  /**
   * Today's money in cents at `now`, as a running timer begun today earns
   * it (the snapshot's `today.earning`: what the day comes to without that
   * timer, its rate, and where its time counts from). Null when the money
   * stands still.
   */
  fun earningCents(today: JSONObject, now: Long): Double? {
    val earning = today.optJSONObject("earning") ?: return null
    val ran = (now - earning.getLong("fromMs")).coerceAtLeast(0)
    return earning.getDouble("baseCents") + earning.getDouble("perHourCents") * ran / HOUR_MS
  }

  /**
   * Today's money as it is at `now`: worked out from the running timer's
   * rate while `running` and the page said how it grows, else as the page
   * last wrote it.
   */
  fun todayMoney(today: JSONObject, running: Boolean, now: Long): String? =
    (if (running) earningCents(today, now) else null)?.let { money(it, true) } ?: today.text("money")

  /**
   * When today's money next shows another dollar; null while it stands
   * still or the figures aren't `today`'s.
   */
  fun nextDollarAt(snapshot: JSONObject, now: Long, today: String): Long? {
    if (snapshot.optString("day") != today) return null
    if (snapshot.optJSONObject("timer")?.time("countingFromMs") == null) return null
    val figures = snapshot.optJSONObject("today") ?: return null
    val perHour = figures.optJSONObject("earning")?.optDouble("perHourCents") ?: return null
    val cents = earningCents(figures, now) ?: return null
    if (!(perHour > 0)) return null
    // Whole dollars round at 50 cents
    val next = Math.round(cents / 100) * 100 + 50
    return now + maxOf(((next - cents) / perHour * HOUR_MS).toLong() + 1_000, MONEY_EVERY_MS)
  }

  // ----- Days -----

  private fun days(zone: TimeZone) = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { timeZone = zone }

  private val utc: TimeZone = TimeZone.getTimeZone("UTC")

  /** The day (YYYY-MM-DD, as the snapshot's `day`) it is at `ms` in `zone`. */
  fun dayAt(ms: Long, zone: TimeZone): String = days(zone).format(ms)

  /** A day's date, as a count of days (for the days between two); null when it isn't one. */
  private fun dayNumber(day: String): Long? =
    runCatching { days(utc).apply { isLenient = false }.parse(day) }.getOrNull()?.let { it.time / DAY_MS }

  /** How many days `to` is after `from` (negative: before); null when either isn't a day. */
  fun daysBetween(from: String, to: String): Int? {
    val start = dayNumber(from) ?: return null
    val end = dayNumber(to) ?: return null
    return (end - start).toInt()
  }

  /** The day `by` days after `day` (before, when negative); null when `day` isn't one. */
  fun shiftDay(day: String, by: Int): String? = dayNumber(day)?.let { dayAt((it + by) * DAY_MS, utc) }

  // ----- This week -----

  /**
   * The week chart's week as it stands on `today`: which of its seven days
   * today is (-1: none of them), how many weeks ago it is (0: this week)
   * and its first day (null when the snapshot doesn't say which is today).
   */
  class WeekNow(val todayIndex: Int, val weeksAgo: Int, val start: String?)

  /**
   * The page marks its own today among the week's `days`; counted from the
   * snapshot's `day`, that gives the week's first day, and so where the
   * phone's today falls once the snapshot's day has gone.
   */
  fun weekNow(snapshotDay: String, days: JSONArray, today: String): WeekNow {
    val marked = (0 until days.length()).firstOrNull { days.optJSONObject(it)?.optBoolean("isToday") == true }
    val start = marked?.let { shiftDay(snapshotDay, -it) }
    val since = start?.let { daysBetween(it, today) }
    return when {
      // The page's word stands when there's no telling
      marked == null || since == null -> WeekNow(marked ?: -1, 0, start)
      since in 0..6 -> WeekNow(since, 0, start)
      since > 6 -> WeekNow(-1, since / 7, start)
      // The phone's day is before the week began (another device's zone is ahead)
      else -> WeekNow(-1, 0, start)
    }
  }

  // ----- The Calendar -----

  /**
   * The row of the week `today` falls in: the last week header dated on or
   * before it. The page's own index when no header is (an odd snapshot).
   */
  fun thisWeekRow(rows: JSONArray, today: String, pageIndex: Int): Int {
    var found = -1
    for (index in 0 until rows.length()) {
      val row = rows.optJSONObject(index) ?: continue
      val date = row.optString("date")
      if (row.optString("kind") == "week" && date.isNotEmpty() && date <= today) found = index
    }
    return if (found >= 0) found else pageIndex
  }

  /** A day's badge: what it's for (the snapshot's kinds) and its words. */
  data class Badge(val kind: String, val text: String)

  /**
   * A day's badges as they stand now. The page wrote them when the figures
   * were worked out; since then the next withdrawal may have opened
   * (`opened`): its "opens at" badge goes, and today's row says "Open now"
   * (`openNow`, the widget's words for it). A release that was ahead is a
   * plain one once its day has passed. At most `room` are kept.
   */
  fun badgesNow(row: JSONObject, today: String, opened: Boolean, openNow: String, room: Int): List<Badge> {
    val date = row.optString("date")
    val written = row.optJSONArray("badges")
    val badges = mutableListOf<Badge>()
    for (index in 0 until (written?.length() ?: 0)) {
      val badge = written!!.optJSONObject(index) ?: continue
      val kind = badge.optString("kind")
      val text = badge.optString("text")
      when {
        kind == "opens" && opened -> Unit
        // Open now is today's: one left on an earlier day's row goes
        kind == "openNow" && date != today -> Unit
        kind == "releaseAhead" && date.isNotEmpty() && date < today -> badges += Badge("release", text)
        else -> badges += Badge(kind, text)
      }
    }
    if (opened && date == today && badges.none { it.kind == "openNow" }) badges += Badge("openNow", openNow)
    return badges.take(room)
  }

  // ----- Payouts -----

  /** A release day still ahead, as the widget lists it. */
  class Release(val day: String, val amount: String)

  /**
   * The snapshot's release days that are still to come at `now`: each day's
   * `parts` go as their time passes (the day with its last), and what's left
   * of a day is added up. A day without parts (an older snapshot) stays as
   * the page wrote it. `held` words a held day's name ("Wed, Nov 18 (held)").
   */
  fun releasesLeft(payouts: JSONObject, now: Long, held: (String) -> String): List<Release> {
    val days = payouts.optJSONArray("releases") ?: return emptyList()
    return (0 until days.length()).mapNotNull { index ->
      val day = days.getJSONObject(index)
      // Held: released before the next withdrawal opens, so in its amount already
      val name = day.getString("day").let { if (day.optBoolean("held")) held(it) else it }
      val parts = day.optJSONArray("parts") ?: return@mapNotNull Release(name, day.getString("amount"))
      val left = (0 until parts.length()).map(parts::getJSONObject).filter { it.getLong("atMs") > now }
      when (left.size) {
        0 -> null
        parts.length() -> Release(name, day.getString("amount"))
        else -> Release(name, money(left.sumOf { it.getDouble("cents") }, left.any { it.optBoolean("estimated") }))
      }
    }
  }

  /**
   * What the next withdrawal takes at `now`: the page's amount, and each
   * release since it was worked out (the snapshot's `growth`), which the
   * withdrawal takes too once it's open.
   */
  fun withdrawalNow(payouts: JSONObject, now: Long): String {
    val growth = payouts.optJSONObject("growth")
    val steps = growth?.optJSONArray("steps")
    val passed = (0 until (steps?.length() ?: 0)).map { steps!!.getJSONObject(it) }.filter { it.getLong("atMs") <= now }
    if (growth == null || passed.isEmpty()) return payouts.getString("amount")
    return money(
      growth.getDouble("cents") + passed.sumOf { it.getDouble("cents") },
      growth.optBoolean("estimated") || passed.any { it.optBoolean("estimated") }
    )
  }

  /** When the Payouts figures next change by the clock alone: the soonest release still ahead; null when none is. */
  fun nextReleaseAt(snapshot: JSONObject, now: Long): Long? {
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

  // ----- Another device's figures (WidgetSync) -----

  /** An RFC 3339 time in UTC ("2026-11-14T21:00:00.123456Z"), as epoch milliseconds. */
  fun millis(time: String): Long {
    val seconds = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).apply { timeZone = utc }
    val whole = seconds.parse(time.substring(0, 19))!!.time
    val fraction = time.substring(19).trimEnd('Z').trimStart('.')
    return whole + if (fraction.isEmpty()) 0 else fraction.padEnd(3, '0').substring(0, 3).toLong()
  }

  /**
   * Whether published `figures`, written at `writtenMs`, replace the kept
   * ones (`kept`, null: none). They do when they were written after the kept
   * ones were, and after the page last had those current (`confirmedMs`).
   *
   * Figures for an earlier day than the kept ones are another matter. A
   * device that was asleep publishes yesterday's as it wakes, before it has
   * caught up: those are refused. But a device in a zone behind the phone's
   * publishes what is today there, an earlier day here, and those are taken:
   * the figures say which zone their days are in (`zone`), so their day is
   * stale only when it was already past there when they were written.
   */
  fun takes(figures: JSONObject, writtenMs: Long, kept: JSONObject?, confirmedMs: Long): Boolean {
    if (kept == null) return true
    if (writtenMs <= maxOf(kept.optLong("updatedAtMs"), confirmedMs)) return false
    val day = figures.optString("day")
    if (day >= kept.optString("day")) return true
    val zone = figures.text("zone")?.takeIf { it in TimeZone.getAvailableIDs() } ?: return false
    return day >= dayAt(writtenMs, TimeZone.getTimeZone(zone))
  }

  // ----- Fitting a figure to its room -----

  /** A digit's width in a medium sans-serif with tabular figures, as a share of the text's size. */
  private const val DIGIT_EM = 0.58f
  /** A colon's, comma's, point's or space's. */
  private const val MARK_EM = 0.27f
  /** The smallest a big figure goes: under this it's cut short with an ellipsis instead. */
  private const val SMALLEST_SP = 14f

  /** How wide `text` is drawn, in ems: a figure's digits and signs are all about as wide, its marks narrower. */
  fun widthEm(text: String): Float = text.sumOf { (if (it in ":,. ") MARK_EM else DIGIT_EM).toDouble() }.toFloat()

  /**
   * The size (sp) the figure `text` is drawn at so it fits `availableDp`
   * across, no bigger than `base`: the phone's font size (`fontScale`: how
   * many dp an sp is) makes text wider, and a long figure ("~$12,345") in a
   * narrow widget wouldn't fit at the size a short one does.
   */
  fun fitSp(base: Float, text: String, availableDp: Float, fontScale: Float): Float {
    val scale = if (fontScale > 0) fontScale else 1f
    val width = widthEm(text) * base * scale
    if (width <= availableDp || width <= 0f) return base
    return maxOf(floor(base * availableDp / width), SMALLEST_SP)
  }
}
