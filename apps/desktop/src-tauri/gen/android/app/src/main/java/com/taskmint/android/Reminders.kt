package com.taskmint.android

import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.graphics.Color
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.notification.ACTION_INTENT_KEY
import app.tauri.notification.DEFAULT_PRESS_ACTION
import app.tauri.notification.NOTIFICATION_INTENT_KEY
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin
import org.json.JSONException
import org.json.JSONObject

/** A notification for the system to show at [atMs] (the withdrawal reminder), in its [channel]. */
data class Reminder(
  val id: Int,
  val atMs: Long,
  val title: String,
  val body: String,
  val channel: String,
) {
  fun toJson(): String =
    JSONObject()
      .put("id", id)
      .put("atMs", atMs)
      .put("title", title)
      .put("body", body)
      .put("channel", channel)
      .toString()

  companion object {
    fun fromJson(json: String): Reminder? =
      try {
        val saved = JSONObject(json)
        Reminder(
          saved.getInt("id"),
          saved.getLong("atMs"),
          saved.getString("title"),
          saved.getString("body"),
          saved.getString("channel"),
        )
      } catch (_: JSONException) {
        null
      }
  }
}

/**
 * TaskMint's notifications for later, which the system shows at their time
 * with the app closed (os.rs sets and takes them back, through
 * [RemindersPlugin]). Each one is kept until it's shown or taken back, so it
 * can be set again whenever the system has forgotten it: after a restart
 * ([RemindersRestore]), which loses every alarm, and when TaskMint starts
 * (MainActivity), since a force stop loses them too. One that came due
 * meanwhile (the phone was off) is shown then.
 *
 * The notification plugin sets alarms too, but sets none again after a
 * restart: its restore only knows what its `batch` command saved, which the
 * Rust side never calls, and couldn't read back what TaskMint sends it.
 */
object Reminders {
  private const val TAG = "TaskMintReminders"
  private const val STORE = "taskmint_reminders"

  /** The alarm's extra that says which reminder it's for. */
  const val EXTRA_ID = "reminderId"

  /** The leaf's tint, as os.rs `routed` gives the plugin's notifications. */
  private val ICON_COLOR = Color.parseColor("#65D6A1")

  /** Keeps [reminder] and sets its alarm, in place of any with its id (and takes down one shown with it). */
  fun set(context: Context, reminder: Reminder) {
    saved(context).edit().putString(reminder.id.toString(), reminder.toJson()).apply()
    NotificationManagerCompat.from(context).cancel(reminder.id)
    arm(context, reminder)
  }

  /** Takes back the reminder [id]: its alarm, what was kept, and the notification if it's showing. */
  fun cancel(context: Context, id: Int) {
    saved(context).edit().remove(id.toString()).apply()
    context.getSystemService(AlarmManager::class.java).cancel(alarm(context, id))
    NotificationManagerCompat.from(context).cancel(id)
  }

  /** Sets every kept reminder's alarm again, and shows any that came due without one. */
  fun restore(context: Context) {
    for (json in saved(context).all.values) {
      val reminder = (json as? String)?.let(Reminder::fromJson) ?: continue
      settle(context, reminder)
    }
  }

  /** The alarm for [id] went off. */
  fun alarmed(context: Context, id: Int) {
    val reminder = saved(context).getString(id.toString(), null)?.let(Reminder::fromJson) ?: return
    settle(context, reminder)
  }

  /** Shows [reminder] if it's due, or sets its alarm (one set again for later goes off when it said). */
  @SuppressLint("ApplySharedPref")
  private fun settle(context: Context, reminder: Reminder) {
    if (reminder.atMs > System.currentTimeMillis()) return arm(context, reminder)
    // Let go first, so a second alarm or start can't show it again
    saved(context).edit().remove(reminder.id.toString()).commit()
    show(context, reminder)
  }

  private fun saved(context: Context): SharedPreferences =
    context.getSharedPreferences(STORE, Context.MODE_PRIVATE)

  /** The alarm's intent: one per id, so setting it again replaces it. */
  private fun alarm(context: Context, id: Int): PendingIntent =
    PendingIntent.getBroadcast(
      context,
      id,
      Intent(context, ReminderAlarm::class.java).putExtra(EXTRA_ID, id),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

  /**
   * At its exact time, in Doze too (USE_EXACT_ALARM, granted at install; on
   * Android 12 SCHEDULE_EXACT_ALARM, which the user can turn off: then as
   * close as the system allows).
   */
  private fun arm(context: Context, reminder: Reminder) {
    val alarms = context.getSystemService(AlarmManager::class.java)
    val pending = alarm(context, reminder.id)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarms.canScheduleExactAlarms()) {
      alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, reminder.atMs, pending)
    } else {
      alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, reminder.atMs, pending)
    }
  }

  /**
   * As the notification plugin shows one: the leaf, the whole text when
   * expanded, and a tap that opens TaskMint with the plugin's extras, which
   * say what the tap opens (MainActivity.keepNotificationTap).
   */
  // Posting without permission (Android 13 and later) does nothing, and
  // areNotificationsEnabled says so first
  @SuppressLint("MissingPermission")
  private fun show(context: Context, reminder: Reminder) {
    val notifications = NotificationManagerCompat.from(context)
    if (!notifications.areNotificationsEnabled()) {
      Log.i(TAG, "Notifications are off; reminder ${reminder.id} not shown")
      return
    }
    val open =
      Intent(context, MainActivity::class.java)
        .setAction(Intent.ACTION_MAIN)
        .addFlags(
          Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        )
        .putExtra(NOTIFICATION_INTENT_KEY, reminder.id)
        .putExtra(ACTION_INTENT_KEY, DEFAULT_PRESS_ACTION)
    val tap =
      PendingIntent.getActivity(
        context,
        reminder.id,
        open,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    val notification =
      NotificationCompat.Builder(context, reminder.channel)
        .setSmallIcon(R.drawable.ic_stat_taskmint)
        .setColor(ICON_COLOR)
        .setContentTitle(reminder.title)
        .setContentText(reminder.body)
        .setStyle(NotificationCompat.BigTextStyle().bigText(reminder.body))
        .setCategory(NotificationCompat.CATEGORY_REMINDER)
        // Android 7, which has no channels: as the Reminders channel does
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setDefaults(NotificationCompat.DEFAULT_ALL)
        .setContentIntent(tap)
        .setAutoCancel(true)
        .build()
    notifications.notify(reminder.id, notification)
  }
}

/** A reminder's alarm went off. */
class ReminderAlarm : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val id = intent.getIntExtra(Reminders.EXTRA_ID, Int.MIN_VALUE)
    if (id != Int.MIN_VALUE) Reminders.alarmed(context, id)
  }
}

/**
 * The phone has started (and been unlocked: the reminders are kept in
 * storage that opens then), or TaskMint was updated: sets the reminders'
 * alarms again.
 */
class RemindersRestore : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED -> Reminders.restore(context)
    }
  }
}

@InvokeArg
class ReminderArgs {
  var id: Int = 0
  var atMs: Long = 0
  var title: String = ""
  var body: String = ""
  var channel: String = ""
}

@InvokeArg
class ReminderIdArgs {
  var id: Int = 0
}

/** How the shell sets and takes back reminders (os.rs, `reminders_plugin`). */
@TauriPlugin
class RemindersPlugin(private val activity: Activity) : Plugin(activity) {
  @Command
  fun setReminder(invoke: Invoke) {
    val args = invoke.parseArgs(ReminderArgs::class.java)
    Reminders.set(activity, Reminder(args.id, args.atMs, args.title, args.body, args.channel))
    invoke.resolve()
  }

  @Command
  fun cancelReminder(invoke: Invoke) {
    Reminders.cancel(activity, invoke.parseArgs(ReminderIdArgs::class.java).id)
    invoke.resolve()
  }
}
