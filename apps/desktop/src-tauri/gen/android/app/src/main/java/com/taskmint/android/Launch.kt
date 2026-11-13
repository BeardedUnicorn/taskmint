package com.taskmint.android

import android.app.PendingIntent
import android.content.Context
import android.content.Intent

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
}
