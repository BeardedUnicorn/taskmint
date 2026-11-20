package com.taskmint.android

import java.math.BigDecimal
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

  /**
   * "~$45.37": to the cent, for money drawn each second as a running timer
   * earns it (TimerTicker). The cent is rounded down: it never shows one
   * that isn't earned yet.
   */
  fun moneyToTheCent(cents: Double, estimated: Boolean): String {
    val earned = BigDecimal.valueOf(floor(cents.coerceAtLeast(0.0)).toLong(), 2)
    return (if (estimated) "~" else "") + NumberFormat.getCurrencyInstance(Locale.US).format(earned)
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
   * last wrote it. In whole dollars, as the page writes it, which a figure
   * drawn once a dollar can keep true; or `toTheCent`, beside a timer whose
   * money is drawn each second (TimerTicker): the growing money with its
   * cents, and standing still (a pause) the cents it had got to
   * (`today.moneyCents`), not a dollar more or less than was just showing.
   */
  fun todayMoney(today: JSONObject, running: Boolean, now: Long, toTheCent: Boolean = false): String? {
    val written = today.text("money")
    val growing = if (running) earningCents(today, now) else null
    if (!toTheCent) return growing?.let { money(it, true) } ?: written
    if (growing != null) return moneyToTheCent(growing, true)
    val still = if (today.isNull("moneyCents")) return written else today.getDouble("moneyCents")
    return moneyToTheCent(still, estimated = written?.startsWith("~") == true)
  }

  /**
   * Whether today's money grows as the clock does: the figures are
   * `today`'s, a timer runs, and the page said how its money grows
   * (`today.earning`: a timer begun today, on a task with a rate).
   */
  fun ticks(snapshot: JSONObject?, today: String): Boolean {
    if (snapshot == null || snapshot.optString("day") != today) return false
    if (snapshot.optJSONObject("timer")?.time("countingFromMs") == null) return false
    val perHour = snapshot.optJSONObject("today")?.optJSONObject("earning")?.optDouble("perHourCents") ?: return false
    return perHour > 0
  }

  /**
   * When today's money next shows another dollar; null while it stands
   * still or the figures aren't `today`'s.
   */
  fun nextDollarAt(snapshot: JSONObject, now: Long, today: String): Long? {
    if (!ticks(snapshot, today)) return null
    val figures = snapshot.getJSONObject("today")
    val perHour = figures.getJSONObject("earning").getDouble("perHourCents")
    val cents = earningCents(figures, now) ?: return null
    // Whole dollars round at 50 cents
    val next = Math.round(cents / 100) * 100 + 50
    return now + maxOf(((next - cents) / perHour * HOUR_MS).toLong() + 1_000, MONEY_EVERY_MS)
  }

  /**
   * Where the seconds a ticking figure is drawn at count from: where
   * today's time does, so the money is drawn as the clock beside it turns
   * to its next second (the running timer's own start without that). Null
   * when the snapshot has neither.
   */
  fun tickFrom(snapshot: JSONObject): Long? {
    val today = snapshot.optJSONObject("today") ?: return null
    return today.time("countingFromMs") ?: today.optJSONObject("earning")?.time("fromMs")
  }

  /** The next whole second after `now`, counting seconds from `fromMs`: when a ticking figure is drawn next. */
  fun nextTickAt(fromMs: Long, now: Long): Long = now + 1_000 - Math.floorMod(now - fromMs, 1_000L)

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

  /** How far apart two devices may put the moment one running timer counts from. */
  private const val SAME_TIMER_MS = 2_000L

  /**
   * Whether `published` figures have the live timer the `kept` ones do: none
   * in both, or the same task in the same state, counting from the same
   * moment (every device works that out from the timer's own times). The
   * phone's own timer, come back from another device: the phone's data has
   * it, so its buttons still act here (WidgetSync).
   */
  fun sameTimer(kept: JSONObject, published: JSONObject): Boolean {
    val mine = kept.optJSONObject("timer")
    val theirs = published.optJSONObject("timer")
    if (mine == null || theirs == null) return mine == null && theirs == null
    if (mine.optString("task") != theirs.optString("task")) return false
    val from = { timer: JSONObject -> if (timer.isNull("countingFromMs")) null else timer.optLong("countingFromMs") }
    val mineFrom = from(mine)
    val theirsFrom = from(theirs)
    if (mineFrom == null || theirsFrom == null) return mineFrom == null && theirsFrom == null
    return Math.abs(mineFrom - theirsFrom) <= SAME_TIMER_MS
  }

  // ----- A timer button pressed on the phone (WidgetAction) -----

  /**
   * The snapshot as the page would write it after a timer button's action
   * here, at `now`: `acted` is what the action came to (Headless.act: the
   * live timer, where it counts from, whether it began today).
   *
   * The timer is as `acted` says. Today's figures first stand where they had
   * got to (a pause or a stop), and then, with a timer that runs and began
   * today, count on from there: the time from now, and the money at what
   * the snapshot said that task's timer adds an hour (`timer.perHourCents`
   * for a resume, `start.perHourCents` for a start) on top of what the day
   * has come to. Figures from a day gone by stay as they were written: the
   * page works out the new day's.
   */
  fun afterAction(snapshot: JSONObject, acted: JSONObject, now: Long, today: String): JSONObject {
    val next = JSONObject(snapshot.toString()).put("updatedAtMs", now)
    val timer = acted.optJSONObject("timer")
    val countingFrom = timer?.time("countingFromMs")
    // The same timer as before (a pause, a resume), or the one Start begins.
    // A stop can leave another task's timer, which waited paused, as the live
    // one: what that adds an hour isn't known here, so its money stands
    // still until the page says
    val shown = snapshot.optJSONObject("timer")
    val rated =
      when {
        shown == null -> snapshot.optJSONObject("start")
        timer != null && timer.optString("task") != shown.optString("task") -> null
        else -> shown
      }
    val rate = rated?.opt("perHourCents") as? Number
    val perHour = rate?.toDouble()
    next.put(
      "timer",
      if (timer == null) JSONObject.NULL
      else
        JSONObject()
          .put("task", timer.getString("task"))
          .put("countingFromMs", countingFrom ?: JSONObject.NULL)
          .put("perHourCents", rate ?: JSONObject.NULL)
    )
    val figures = next.optJSONObject("today")
    if (figures == null || snapshot.optString("day") != today) return next

    // Where today has got to
    val grew = figures.optJSONObject("earning") != null
    val time = figures.time("countingFromMs")?.let { (now - it).coerceAtLeast(0) } ?: figures.time("timeMs") ?: 0
    val cents = earningCents(figures, now) ?: if (figures.isNull("moneyCents")) null else figures.optDouble("moneyCents")
    figures.put("countingFromMs", JSONObject.NULL).put("timeMs", time).put("time", timeInWords(time)).put("earning", JSONObject.NULL)
    if (cents != null) {
      figures.put("moneyCents", Math.round(cents))
      // What a timer earned by the hour is an estimate until the site pays it
      if (grew) figures.put("money", money(cents, true))
    }

    // And on from there, with a timer that runs and whose time is today's
    if (countingFrom != null && timer.optBoolean("beganToday")) {
      figures.put("countingFromMs", now - time).put("timeMs", JSONObject.NULL)
      if (cents != null && perHour != null && perHour > 0) {
        figures
          .put("earning", JSONObject().put("baseCents", cents).put("perHourCents", perHour).put("fromMs", now))
          .put("moneyCents", JSONObject.NULL)
          .put("money", money(cents, true))
      }
    }
    return next
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
