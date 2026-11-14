package com.taskmint.android

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * Opening TaskMint for an action (the Rust side's contract::launch: start
 * work, a task, pause, Payouts…): what launcher shortcuts and home-screen
 * widget buttons do. MainActivity keeps the action for the page, which hands
 * it to the shell (launch_action).
 */
object Launch {
  /** The intent extra that names the action. */
  const val ACTION = "com.taskmint.android.LAUNCH_ACTION"

  /** Opens (or brings forward) the app for `action`. */
  fun intent(context: Context, action: String): Intent =
    Intent(context, MainActivity::class.java)
      .setAction(Intent.ACTION_VIEW)
      .putExtra(ACTION, action)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)

  /**
   * The same, for a widget's button. Each action gets its own request code:
   * Android treats intents that differ only in their extras as one.
   */
  fun pending(context: Context, action: String): PendingIntent =
    PendingIntent.getActivity(
      context,
      action.hashCode(),
      intent(context, action),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )

  /**
   * For a widget's list (the Calendar): one intent for all its rows, which
   * each fill in their action (fillIn). Mutable, as filling in needs.
   */
  fun template(context: Context): PendingIntent =
    PendingIntent.getActivity(
      context,
      "list".hashCode(),
      Intent(context, MainActivity::class.java)
        .setAction(Intent.ACTION_VIEW)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
      PendingIntent.FLAG_UPDATE_CURRENT or
        (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0)
    )

  /** A list row's part of template(): its action. */
  fun fillIn(action: String): Intent = Intent().putExtra(ACTION, action)
}
