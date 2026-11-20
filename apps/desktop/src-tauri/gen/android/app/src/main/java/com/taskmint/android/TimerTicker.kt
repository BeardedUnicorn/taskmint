package com.taskmint.android

import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import androidx.core.content.ContextCompat

/**
 * Draws the money a running timer earns each second, to the cent, on the
 * timer's notification (the lock screen's Live Update) and the Today
 * widget.
 *
 * Android counts a clock on its own, which is how today's time moves each
 * second with TaskMint closed, but it has no figure that counts money: the
 * money moves only when TaskMint draws it again. And Android stops an app
 * that's left the screen about a minute later. So while a timer earns, this
 * keeps TaskMint running, as a foreground service: the one way Android lets
 * an app carry on in the background, and it has to show a notification for
 * it, which is the timer's own (TimerNotices.ID), so there's no second one.
 *
 * It runs only while there's something to tick for (TimerNotices.ticks: the
 * notification is up over a running timer whose money grows today), and it
 * draws only while the screen is lit (the lock screen counts; the screen
 * off or dimmed to the always-on display doesn't). It holds no wake lock:
 * with the screen off nothing is scheduled, and the phone sleeps as it
 * would.
 *
 * Android lets a service like this start only from certain places: with
 * TaskMint in front, from a tap on a notification or a widget, from a push,
 * as the phone starts. `sync` asks wherever the figures or the timer change
 * (Widgets.scheduleRefresh) and when TaskMint comes forward, and leaves it
 * when Android says no. Without the ticker the figures are as they were
 * before it: the money in whole dollars, drawn again as each dollar is
 * earned (the WIDGET_MONEY alarm), which also draws them should this ever
 * be killed. Before Android 14, which has no kind of foreground service for
 * this, it never runs.
 *
 * docs/adr/0007-timer-ticker-service.md has why it's built this way.
 */
class TimerTicker : Service() {
  private val main = Handler(Looper.getMainLooper())
  private val tick = Runnable { tick() }

  /** Whether the screen is lit: there's someone to draw for. */
  private var lit = true

  /** Android wouldn't let it show its notification: it isn't asked for again as it goes. */
  private var refused = false

  private val screen =
    object : BroadcastReceiver() {
      override fun onReceive(context: Context, intent: Intent) {
        lit = intent.action == Intent.ACTION_SCREEN_ON
        // Lit again: the figures are a while old, so at once
        if (lit) tick() else main.removeCallbacks(tick)
      }
    }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    // From here the figures are drawn to the cent (`alive`)
    instance = this
    lit = getSystemService(PowerManager::class.java)?.isInteractive ?: true
    val changes = IntentFilter(Intent.ACTION_SCREEN_ON).apply { addAction(Intent.ACTION_SCREEN_OFF) }
    ContextCompat.registerReceiver(this, screen, changes, ContextCompat.RECEIVER_NOT_EXPORTED)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    try {
      // Android gives a started service a few seconds to say what it shows.
      // `sync` starts it only where this kind of service exists (Android 14)
      check(Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
      startForeground(TimerNotices.ID, TimerNotices.forTicker(this), ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } catch (e: Exception) {
      // TaskMint left the screen between the ask and now
      Log.w(TAG, "Couldn't keep the timer's figures ticking", e)
      refused = true
      stopSelf()
      return START_NOT_STICKY
    }
    tick()
    // Not started again by Android after it's killed: that comes from the
    // background, where a service like this can't start. The alarm draws
    // the figures until `sync` can
    return START_NOT_STICKY
  }

  /** Draws the figures as they are now, and comes back at the clock's next second while the screen is lit. */
  private fun tick() {
    main.removeCallbacks(tick)
    // The delay to the next draw; null once there's nothing to tick for.
    // Figures it can't read (another TaskMint's) are nothing to tick for
    val next =
      try {
        if (TimerNotices.tick(this)) {
          Widgets.tickMoney(this)
          val now = System.currentTimeMillis()
          val from = Widgets.snapshot(this)?.let(WidgetFigures::tickFrom) ?: now
          WidgetFigures.nextTickAt(from, now) - now
        } else {
          null
        }
      } catch (e: Exception) {
        Log.w(TAG, "Couldn't draw the timer's figures", e)
        null
      }
    if (next == null) done() else if (lit) main.postDelayed(tick, next)
  }

  /**
   * Nothing to tick for. The notification stays when it's still the
   * timer's (paused, or its money stands still), as an ordinary one; it
   * goes with the service when the timer has (Android wouldn't take it down
   * before) or the user swiped it away.
   */
  private fun done() {
    stopForeground(if (TimerNotices.up(this)) STOP_FOREGROUND_DETACH else STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  override fun onDestroy() {
    main.removeCallbacks(tick)
    unregisterReceiver(screen)
    instance = null
    // In whole dollars again: a figure with cents that stood still would look stuck
    Widgets.drawMoney(applicationContext)
    // The timer may have gone on again while this was stopping (a pause, then a resume)
    if (!refused) sync(applicationContext)
    super.onDestroy()
  }

  companion object {
    private const val TAG = "TaskMintTicker"

    @Volatile private var instance: TimerTicker? = null

    /** Whether it's drawing each second. */
    private val alive: Boolean
      get() = instance != null

    /** Android 14 and later have the kind of foreground service this is. */
    private val supported = Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE

    /**
     * Whether today's money beside a timer is written to the cent: growing
     * (`running`), only while this draws it each second, since cents that
     * stood still would look stuck; standing still (a pause), wherever this
     * can run, so a pause leaves the cents that were just showing.
     */
    fun toTheCent(running: Boolean): Boolean = if (running) alive else supported

    /**
     * The timer or today's figures changed, or TaskMint came forward: the
     * ticker, if it's running, looks again at once (and stops when there's
     * nothing left to tick for); if it isn't and there is, it's asked to
     * start, which Android refuses from most places in the background.
     */
    fun sync(context: Context) {
      if (!supported) return
      val running = instance
      if (running != null) {
        running.main.post(running.tick)
        return
      }
      if (!TimerNotices.ticks(context)) return
      try {
        context.startForegroundService(Intent(context, TimerTicker::class.java))
      } catch (e: Exception) {
        // ForegroundServiceStartNotAllowedException, mostly: not from here
        Log.i(TAG, "Not ticking yet: ${e.javaClass.simpleName}")
      }
    }
  }
}
