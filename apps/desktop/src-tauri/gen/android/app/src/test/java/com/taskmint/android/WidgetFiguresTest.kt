package com.taskmint.android

import java.util.TimeZone
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * What the widgets work out from the snapshot and the clock (WidgetFigures).
 * The snapshots here are written as the page writes them
 * (packages/client/src/widgets, docs/contracts/widgets.md).
 */
class WidgetFiguresTest {
  private val hour = 3_600_000L
  private val minute = 60_000L
  /** 2026-11-18 12:00 UTC, a Wednesday. */
  private val noon = 1_795_003_200_000L

  private fun json(text: String) = JSONObject(text.trimIndent())

  // ----- Money and time -----

  @Test
  fun money_is_whole_dollars_with_a_mark_for_an_estimate() {
    assertEquals("$1,235", WidgetFigures.money(123_450.0, false))
    assertEquals("~$45", WidgetFigures.money(4_549.0, true))
    assertEquals("$0", WidgetFigures.money(0.0, false))
  }

  @Test
  fun a_time_is_written_as_the_page_writes_it() {
    assertEquals("0m", WidgetFigures.timeInWords(-5))
    assertEquals("12m", WidgetFigures.timeInWords(12 * minute + 59_000))
    assertEquals("3h 12m", WidgetFigures.timeInWords(3 * hour + 12 * minute))
    assertEquals("1h 0m", WidgetFigures.timeInWords(hour))
  }

  private fun today(earning: String?) =
    json("""{ "money": "~$40", "earning": ${earning ?: "null"} }""")

  @Test
  fun todays_money_grows_at_the_running_timers_rate() {
    val today = today("""{ "baseCents": 4000, "perHourCents": 6000, "fromMs": $noon }""")
    assertEquals(4_000.0, WidgetFigures.earningCents(today, noon)!!, 0.001)
    assertEquals(7_000.0, WidgetFigures.earningCents(today, noon + hour / 2)!!, 0.001)
    // A clock set back doesn't take money away
    assertEquals(4_000.0, WidgetFigures.earningCents(today, noon - hour)!!, 0.001)
    assertEquals("~$70", WidgetFigures.todayMoney(today, running = true, now = noon + hour / 2))
  }

  @Test
  fun todays_money_stands_as_written_without_a_running_timer() {
    val growing = today("""{ "baseCents": 4000, "perHourCents": 6000, "fromMs": $noon }""")
    assertEquals("~$40", WidgetFigures.todayMoney(growing, running = false, now = noon + hour))
    assertEquals("~$40", WidgetFigures.todayMoney(today(null), running = true, now = noon + hour))
    assertNull(WidgetFigures.earningCents(today(null), noon))
    assertNull(WidgetFigures.todayMoney(json("""{ "money": null }"""), running = false, now = noon))
  }

  private fun running(day: String, perHour: Int, timer: String = """{ "task": "Writing", "countingFromMs": $noon }""") =
    json(
      """
      { "day": "$day", "timer": $timer,
        "today": { "earning": { "baseCents": 4000, "perHourCents": $perHour, "fromMs": $noon } } }
      """
    )

  @Test
  fun the_next_dollar_comes_when_the_money_rounds_up() {
    // $40.00 at $60 an hour: $40.50 (which shows as $41) is half a minute off,
    // and the money is drawn at most once a minute
    assertEquals(noon + minute, WidgetFigures.nextDollarAt(running("2026-11-18", 6_000), noon, "2026-11-18"))
    // At $6 an hour it's five minutes off, and a second for the rounding
    assertEquals(noon + 5 * minute + 1_000, WidgetFigures.nextDollarAt(running("2026-11-18", 600), noon, "2026-11-18"))
  }

  @Test
  fun no_dollar_is_coming_when_the_money_stands_still() {
    val day = "2026-11-18"
    assertNull(WidgetFigures.nextDollarAt(running("2026-11-17", 6_000), noon, day))
    assertNull(WidgetFigures.nextDollarAt(running(day, 0), noon, day))
    assertNull(WidgetFigures.nextDollarAt(running(day, 6_000, "null"), noon, day))
    assertNull(
      WidgetFigures.nextDollarAt(running(day, 6_000, """{ "task": "Writing", "countingFromMs": null }"""), noon, day)
    )
    assertNull(WidgetFigures.nextDollarAt(json("""{ "day": "$day", "timer": { "countingFromMs": 1 } }"""), noon, day))
    assertNull(
      WidgetFigures.nextDollarAt(
        json("""{ "day": "$day", "timer": { "countingFromMs": 1 }, "today": { "earning": null } }"""),
        noon,
        day
      )
    )
  }

  // ----- Days -----

  @Test
  fun a_day_is_the_zones_own() {
    assertEquals("2026-11-18", WidgetFigures.dayAt(noon, TimeZone.getTimeZone("UTC")))
    // Late evening in New York is already tomorrow in UTC
    val lateEvening = noon + 15 * hour
    assertEquals("2026-11-19", WidgetFigures.dayAt(lateEvening, TimeZone.getTimeZone("UTC")))
    assertEquals("2026-11-18", WidgetFigures.dayAt(lateEvening, TimeZone.getTimeZone("America/New_York")))
  }

  @Test
  fun days_are_counted_across_months_and_clock_changes() {
    assertEquals(0, WidgetFigures.daysBetween("2026-11-18", "2026-11-18"))
    assertEquals(13, WidgetFigures.daysBetween("2026-11-18", "2026-12-01"))
    assertEquals(-3, WidgetFigures.daysBetween("2026-11-18", "2026-11-15"))
    // The clocks go back on November 1: still seven days
    assertEquals(7, WidgetFigures.daysBetween("2026-10-28", "2026-11-04"))
    assertNull(WidgetFigures.daysBetween("2026-11-18", "soon"))
    assertNull(WidgetFigures.daysBetween("", "2026-11-18"))
    assertEquals("2026-11-15", WidgetFigures.shiftDay("2026-11-18", -3))
    assertEquals("2026-12-01", WidgetFigures.shiftDay("2026-11-30", 1))
    assertNull(WidgetFigures.shiftDay("2026-13-40", 1))
  }

  // ----- This week -----

  /** A week whose `marked` day (0 = Sunday) the page called today. */
  private fun week(marked: Int?) =
    JSONArray((0 until 7).map { JSONObject().put("isToday", it == marked) })

  @Test
  fun the_week_keeps_the_pages_today_on_the_snapshots_day() {
    // Wednesday the 18th: the week began on Sunday the 15th
    val now = WidgetFigures.weekNow("2026-11-18", week(3), "2026-11-18")
    assertEquals(3, now.todayIndex)
    assertEquals(0, now.weeksAgo)
    assertEquals("2026-11-15", now.start)
  }

  @Test
  fun today_moves_along_the_week_after_midnight() {
    val thursday = WidgetFigures.weekNow("2026-11-18", week(3), "2026-11-19")
    assertEquals(4, thursday.todayIndex)
    assertEquals(0, thursday.weeksAgo)
    val saturday = WidgetFigures.weekNow("2026-11-18", week(3), "2026-11-21")
    assertEquals(6, saturday.todayIndex)
  }

  @Test
  fun a_week_that_has_ended_has_no_today() {
    val sunday = WidgetFigures.weekNow("2026-11-18", week(3), "2026-11-22")
    assertEquals(-1, sunday.todayIndex)
    assertEquals(1, sunday.weeksAgo)
    assertEquals("2026-11-15", sunday.start)
    assertEquals(1, WidgetFigures.weekNow("2026-11-18", week(3), "2026-11-28").weeksAgo)
    assertEquals(2, WidgetFigures.weekNow("2026-11-18", week(3), "2026-11-29").weeksAgo)
  }

  @Test
  fun a_phone_whose_day_is_before_the_week_has_no_today_either() {
    // Another device, a zone ahead, published Sunday's figures on the phone's Saturday
    val now = WidgetFigures.weekNow("2026-11-15", week(0), "2026-11-14")
    assertEquals(-1, now.todayIndex)
    assertEquals(0, now.weeksAgo)
  }

  @Test
  fun the_pages_word_stands_when_the_week_cant_be_placed() {
    val unmarked = WidgetFigures.weekNow("2026-11-18", week(null), "2026-11-25")
    assertEquals(-1, unmarked.todayIndex)
    assertEquals(0, unmarked.weeksAgo)
    assertNull(unmarked.start)
    val oddDay = WidgetFigures.weekNow("someday", week(3), "2026-11-25")
    assertEquals(3, oddDay.todayIndex)
    assertEquals(0, oddDay.weeksAgo)
    val oddToday = WidgetFigures.weekNow("2026-11-18", week(3), "")
    assertEquals(3, oddToday.todayIndex)
  }

  // ----- The Calendar -----

  private val rows =
    JSONArray(
      """
      [ { "kind": "week", "date": "2026-11-08" },
        { "kind": "day", "date": "2026-11-10" },
        { "kind": "week", "date": "2026-11-15" },
        { "kind": "day", "date": "2026-11-18" },
        { "kind": "week", "date": "2026-11-29" },
        { "kind": "day", "date": "2026-12-01" } ]
      """
    )

  @Test
  fun the_calendar_opens_at_the_week_today_is_in() {
    assertEquals(2, WidgetFigures.thisWeekRow(rows, "2026-11-18", 2))
    assertEquals(2, WidgetFigures.thisWeekRow(rows, "2026-11-15", 0))
    // A week with nothing in it isn't listed: the one before it is the nearest
    assertEquals(2, WidgetFigures.thisWeekRow(rows, "2026-11-24", 0))
    assertEquals(4, WidgetFigures.thisWeekRow(rows, "2026-11-30", 2))
    assertEquals(0, WidgetFigures.thisWeekRow(rows, "2026-11-09", 2))
  }

  @Test
  fun the_calendar_keeps_the_pages_week_when_none_has_begun() {
    assertEquals(2, WidgetFigures.thisWeekRow(rows, "2026-11-01", 2))
    assertEquals(5, WidgetFigures.thisWeekRow(JSONArray("""[ 7, { "kind": "week" } ]"""), "2026-11-18", 5))
  }

  private fun dayRow(date: String, badges: String) = json("""{ "date": "$date", "badges": $badges }""")

  private fun kinds(badges: List<WidgetFigures.Badge>) = badges.map { "${it.kind}:${it.text}" }

  @Test
  fun badges_stay_as_written_until_the_clock_moves_them() {
    val row = dayRow("2026-11-18", """[ { "kind": "release", "text": "$40" }, { "kind": "opens", "text": "6:25 PM" } ]""")
    assertEquals(
      listOf("release:$40", "opens:6:25 PM"),
      kinds(WidgetFigures.badgesNow(row, "2026-11-18", opened = false, openNow = "Open now", room = 3))
    )
    assertEquals(emptyList<String>(), kinds(WidgetFigures.badgesNow(json("{}"), "2026-11-18", false, "Open now", 3)))
  }

  @Test
  fun the_opening_badge_becomes_open_now_on_todays_row() {
    val row = dayRow("2026-11-18", """[ { "kind": "opens", "text": "6:25 PM" } ]""")
    assertEquals(listOf("openNow:Open now"), kinds(WidgetFigures.badgesNow(row, "2026-11-18", true, "Open now", 3)))
    // Opened yesterday: the badge goes from its day, and today's row says so
    assertEquals(emptyList<String>(), kinds(WidgetFigures.badgesNow(row, "2026-11-19", true, "Open now", 3)))
    val today = dayRow("2026-11-19", "[]")
    assertEquals(listOf("openNow:Open now"), kinds(WidgetFigures.badgesNow(today, "2026-11-19", true, "Open now", 3)))
    // The page's own Open now isn't said twice
    val said = dayRow("2026-11-19", """[ { "kind": "openNow", "text": "Open now" } ]""")
    assertEquals(listOf("openNow:Open now"), kinds(WidgetFigures.badgesNow(said, "2026-11-19", true, "Open now", 3)))
  }

  @Test
  fun open_now_leaves_a_day_that_is_no_longer_today() {
    val row = dayRow("2026-11-18", """[ { "kind": "openNow", "text": "Open now" }, { "kind": "withdrawal", "text": "$9" } ]""")
    assertEquals(listOf("withdrawal:$9"), kinds(WidgetFigures.badgesNow(row, "2026-11-19", false, "Open now", 3)))
  }

  @Test
  fun a_release_that_was_ahead_is_a_plain_one_once_its_day_has_passed() {
    val row = dayRow("2026-11-18", """[ { "kind": "releaseAhead", "text": "~$40" } ]""")
    assertEquals(listOf("releaseAhead:~$40"), kinds(WidgetFigures.badgesNow(row, "2026-11-18", false, "Open now", 3)))
    assertEquals(listOf("release:~$40"), kinds(WidgetFigures.badgesNow(row, "2026-11-19", false, "Open now", 3)))
  }

  @Test
  fun a_day_keeps_only_the_badges_it_has_room_for() {
    val row =
      dayRow(
        "2026-11-18",
        """[ { "kind": "release", "text": "1" }, { "kind": "withdrawal", "text": "2" }, { "kind": "withdrawal", "text": "3" }, 4 ]"""
      )
    assertEquals(
      listOf("release:1", "withdrawal:2", "withdrawal:3"),
      kinds(WidgetFigures.badgesNow(row, "2026-11-18", true, "Open now", 3))
    )
  }

  // ----- Payouts -----

  private val held = { day: String -> "$day (held)" }

  private fun payouts(now: Long) =
    json(
      """
      { "amount": "$100",
        "growth": { "cents": 10000, "estimated": false, "steps": [
          { "atMs": ${now + hour}, "cents": 2000, "estimated": false },
          { "atMs": ${now + 2 * hour}, "cents": 3050, "estimated": true } ] },
        "releases": [
          { "day": "Wed, Nov 18", "amount": "$50", "held": true, "parts": [
            { "atMs": ${now + hour}, "cents": 2000, "estimated": false },
            { "atMs": ${now + 2 * hour}, "cents": 3000, "estimated": true } ] },
          { "day": "Thu, Nov 19", "amount": "~$75", "parts": [
            { "atMs": ${now + 24 * hour}, "cents": 7500, "estimated": true } ] },
          { "day": "Fri, Nov 20", "amount": "$12" } ] }
      """
    )

  private fun listed(releases: List<WidgetFigures.Release>) = releases.map { "${it.day}: ${it.amount}" }

  @Test
  fun release_days_stand_as_written_until_one_of_their_parts_passes() {
    assertEquals(
      listOf("Wed, Nov 18 (held): $50", "Thu, Nov 19: ~$75", "Fri, Nov 20: $12"),
      listed(WidgetFigures.releasesLeft(payouts(noon), noon, held))
    )
  }

  @Test
  fun a_release_days_parts_go_as_their_time_passes_and_the_day_with_its_last() {
    val figures = payouts(noon)
    // The first part has gone: what's left is added up, an estimate if any of it is
    assertEquals(
      listOf("Wed, Nov 18 (held): ~$30", "Thu, Nov 19: ~$75", "Fri, Nov 20: $12"),
      listed(WidgetFigures.releasesLeft(figures, noon + hour, held))
    )
    assertEquals(
      listOf("Thu, Nov 19: ~$75", "Fri, Nov 20: $12"),
      listed(WidgetFigures.releasesLeft(figures, noon + 2 * hour, held))
    )
    // A day without parts (an older snapshot) stays
    assertEquals(listOf("Fri, Nov 20: $12"), listed(WidgetFigures.releasesLeft(figures, noon + 48 * hour, held)))
    assertEquals(emptyList<String>(), listed(WidgetFigures.releasesLeft(json("{}"), noon, held)))
  }

  @Test
  fun the_withdrawal_takes_each_release_since_it_was_worked_out() {
    val figures = payouts(noon)
    assertEquals("$100", WidgetFigures.withdrawalNow(figures, noon))
    assertEquals("$120", WidgetFigures.withdrawalNow(figures, noon + hour))
    // The sum is rounded, not each release: $150.50, and an estimate now
    assertEquals("~$151", WidgetFigures.withdrawalNow(figures, noon + 2 * hour))
    assertEquals("$7", WidgetFigures.withdrawalNow(json("""{ "amount": "$7" }"""), noon))
    assertEquals(
      "~$8",
      WidgetFigures.withdrawalNow(
        json("""{ "amount": "x", "growth": { "cents": 700, "estimated": true, "steps": [ { "atMs": 1, "cents": 100 } ] } }"""),
        noon
      )
    )
  }

  @Test
  fun the_figures_next_change_at_the_soonest_release_still_ahead() {
    val snapshot = JSONObject().put("payouts", payouts(noon))
    assertEquals(noon + hour, WidgetFigures.nextReleaseAt(snapshot, noon))
    assertEquals(noon + 2 * hour, WidgetFigures.nextReleaseAt(snapshot, noon + hour))
    assertEquals(noon + 24 * hour, WidgetFigures.nextReleaseAt(snapshot, noon + 2 * hour))
    assertNull(WidgetFigures.nextReleaseAt(snapshot, noon + 24 * hour))
    assertNull(WidgetFigures.nextReleaseAt(json("""{ "payouts": null }"""), noon))
    assertNull(WidgetFigures.nextReleaseAt(json("""{ "payouts": { "amount": "$1" } }"""), noon))
  }

  // ----- Another device's figures -----

  @Test
  fun a_cloud_time_is_read_to_the_millisecond() {
    assertEquals(noon, WidgetFigures.millis("2026-11-18T12:00:00Z"))
    assertEquals(noon + 123, WidgetFigures.millis("2026-11-18T12:00:00.123456Z"))
    assertEquals(noon + 500, WidgetFigures.millis("2026-11-18T12:00:00.5Z"))
  }

  private fun figures(day: String, zone: String? = null) =
    JSONObject().put("day", day).put("zone", zone ?: JSONObject.NULL)

  private fun kept(day: String, updatedAtMs: Long) = JSONObject().put("day", day).put("updatedAtMs", updatedAtMs)

  @Test
  fun published_figures_are_taken_when_none_are_kept() {
    assertTrue(WidgetFigures.takes(figures("2026-11-18"), noon, null, confirmedMs = noon + hour))
  }

  @Test
  fun published_figures_must_be_newer_than_the_kept_ones_and_the_pages_last_word() {
    val mine = kept("2026-11-18", noon)
    assertTrue(WidgetFigures.takes(figures("2026-11-18"), noon + 1, mine, confirmedMs = 0))
    assertFalse(WidgetFigures.takes(figures("2026-11-18"), noon, mine, confirmedMs = 0))
    // The page had its figures current after these were written
    assertFalse(WidgetFigures.takes(figures("2026-11-18"), noon + minute, mine, confirmedMs = noon + hour))
    assertTrue(WidgetFigures.takes(figures("2026-11-19"), noon + minute, mine, confirmedMs = 0))
  }

  @Test
  fun a_waking_devices_figures_for_a_day_gone_by_are_refused() {
    val mine = kept("2026-11-18", noon)
    // Written on the 18th in New York, about the 17th: stale there too
    assertFalse(WidgetFigures.takes(figures("2026-11-17", "America/New_York"), noon + hour, mine, 0))
    // Older publishers don't say their zone, nor does an odd one: the phone's days decide
    assertFalse(WidgetFigures.takes(figures("2026-11-17"), noon + hour, mine, 0))
    assertFalse(WidgetFigures.takes(figures("2026-11-17", "Mars/Olympus"), noon + hour, mine, 0))
  }

  @Test
  fun a_device_in_a_zone_behind_publishes_its_own_today() {
    // 03:00 UTC on the 19th: the phone (kept: the 19th) is ahead of New York, where it's still the 18th
    val written = noon + 15 * hour
    val mine = kept("2026-11-19", written - hour)
    assertTrue(WidgetFigures.takes(figures("2026-11-18", "America/New_York"), written, mine, 0))
  }

  // ----- Fitting a figure to its room -----

  @Test
  fun a_figure_keeps_its_size_while_it_fits() {
    assertEquals(34f, WidgetFigures.fitSp(34f, chars = 3, availableDp = 168f, fontScale = 1f))
    assertEquals(34f, WidgetFigures.fitSp(34f, chars = 0, availableDp = 10f, fontScale = 1f))
    // A font scale that makes no sense counts as none
    assertEquals(34f, WidgetFigures.fitSp(34f, chars = 3, availableDp = 168f, fontScale = 0f))
  }

  @Test
  fun a_long_figure_or_big_text_is_drawn_smaller_to_fit() {
    // "~$12,345" in a narrow widget (78dp across): 8 × 34 × 0.58 = 158dp wide
    assertEquals(16f, WidgetFigures.fitSp(34f, chars = 8, availableDp = 78f, fontScale = 1f))
    // The same figure with the phone's text at its largest
    val large = WidgetFigures.fitSp(34f, chars = 6, availableDp = 168f, fontScale = 2f)
    assertTrue(large < 34f)
    assertEquals(24f, large)
  }

  @Test
  fun a_figure_never_goes_below_a_readable_size() {
    assertEquals(14f, WidgetFigures.fitSp(34f, chars = 12, availableDp = 40f, fontScale = 2f))
  }

  // ----- The widgets' sizes -----

  @Test
  fun a_widgets_size_class_follows_its_size() {
    assertEquals(Fit(Height.ROW, narrow = true, roomy = false), Fit.of(110f, 40f))
    assertEquals(Fit(Height.ROW, narrow = false, roomy = false), Fit.of(200f, 169f))
    assertEquals(Fit(Height.CARD, narrow = false, roomy = true), Fit.of(300f, 170f))
    assertEquals(Fit(Height.TALL, narrow = true, roomy = false), Fit.of(199f, 290f))
  }
}
