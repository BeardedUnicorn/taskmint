package com.taskmint.android

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Another device published the widgets' figures, and the Cloud Function
 * (apps/functions) says so: [WidgetSync] reads them now instead of at its
 * next check. The message carries nothing itself. Both calls come on a
 * thread of Firebase's, with a few seconds to finish in.
 */
class WidgetPush : FirebaseMessagingService() {
  override fun onMessageReceived(message: RemoteMessage) {
    // Out of reach just now: once there's a connection
    if (WidgetSync.run(applicationContext) == WidgetSync.Outcome.RETRY) WidgetSync.soon(applicationContext)
  }

  /** The phone has a push address (its Firebase installation ID), or a new one: the cloud's copy follows. */
  override fun onRegistered(installationId: String) {
    WidgetSync.register(applicationContext, installationId)
  }
}
