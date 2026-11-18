package com.taskmint.android

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.content.FileProvider
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread
import org.json.JSONObject

/**
 * The app's own update: it downloads a release's APK from GitHub into its
 * cache and hands it to Android's installer, which asks before replacing the
 * app (and, the first time, for TaskMint to be allowed to install apps).
 * A browser used to do the download, and some never finished it.
 *
 * The download is the app's, not the screen's that asked for it. It carries
 * on with TaskMint in the background, and when Android makes the activity
 * again meanwhile (the display's size changed, say), the new one's page
 * hears the rest. Android lets an app open another screen only while its own
 * is in front, and refuses without a word otherwise, so the installer opens
 * while the activity is resumed: at once, or as soon as it next is. The APK
 * stays in the cache, and asking for that version again opens the installer
 * on it with no download.
 *
 * How long it carries on in the background is Android's call. Android 17
 * takes a backgrounded app off the network some six seconds after it leaves
 * the screen (seen on the emulator; there's no foreground service here to
 * hold it). A download that's cut off keeps what it has, and the next go at
 * it asks GitHub for the rest only: by itself once TaskMint is in front
 * again, when being out of front is what cut it off, and otherwise when the
 * user tries again.
 */
object AppUpdate {
  /** The release's APK, as scripts/release/lib.mjs names it (and apk_update.rs links it). */
  private const val RELEASES = "https://github.com/BeardedUnicorn/taskmint/releases/download"
  private const val APK_TYPE = "application/vnd.android.package-archive"
  private val VERSION = Regex("""\d+\.\d+\.\d+""")

  /** `Content-Range: bytes 100-999/1000`: where what's sent starts, and the whole's size. */
  private val CONTENT_RANGE = Regex("""bytes (\d+)-\d+/(\d+)""")
  private const val RANGE_NOT_SATISFIABLE = 416
  private const val TIMEOUT_MS = 30_000
  private const val REPORT_EVERY_MS = 250L

  /** Android gives an app its network back a moment after it's in front again. */
  private const val SETTLE_MS = 1_000L

  /**
   * A failure that another go wouldn't change: GitHub's answer, or what the
   * download turned out to be. Anything else that stops a download (an
   * IOException) is the connection's or the phone's doing.
   */
  private class Refused(message: String) : Exception(message)

  private val main = Handler(Looper.getMainLooper())

  /** The app's activity, and how its page hears a report (window.__taskmintUpdate). */
  private class Screen(val activity: Activity, val report: (JSONObject) -> Unit)

  // What follows is the main thread's alone
  /** The activity made last, until it's destroyed. */
  private var screen: Screen? = null

  /** Whether `screen` is resumed: only then will Android let it open the installer. */
  private var inFront = false

  /** The version being downloaded, and how far it last said it was. */
  private var fetching: String? = null
  private var progress: JSONObject? = null

  /** Whether TaskMint has been out of front since this go at the download began. */
  private var away = false

  /** The next go at a download that was cut off with TaskMint out of front: for when it's back. */
  private var stalled: (() -> Unit)? = null

  /** A downloaded and checked APK whose installer waits for the activity to be resumed. */
  private var waiting: File? = null

  /** A new activity (onCreate): its page hears the reports from now on. */
  fun attach(activity: Activity, report: (JSONObject) -> Unit) {
    screen = Screen(activity, report)
    left()
  }

  /**
   * The activity is in front (onResume): an installer that waited for it
   * opens, and a download that was cut off meanwhile carries on.
   */
  fun resumed(activity: Activity) {
    if (screen?.activity !== activity) return
    inFront = true
    waiting?.let(::open)
    stalled?.let {
      stalled = null
      main.postDelayed(it, SETTLE_MS)
    }
  }

  /** It no longer is (onPause). */
  fun paused(activity: Activity) {
    if (screen?.activity === activity) left()
  }

  /** It's gone (onDestroy). A download carries on, for the next one. */
  fun detach(activity: Activity) {
    if (screen?.activity !== activity) return
    screen = null
    left()
  }

  private fun left() {
    inFront = false
    away = true
  }

  /**
   * Downloads `version`, unless an earlier download of it is still in the
   * cache, and opens the installer on it. The page hears
   * `{"downloaded", "total"}` (bytes; `total` null when GitHub doesn't say)
   * as it goes, then `{"done": true}` once the installer is open, or
   * `{"error"}`. Asking again for the version that's downloading joins that
   * download. From any thread.
   */
  fun download(context: Context, version: String) {
    val app = context.applicationContext
    main.post {
      val busy = fetching
      when {
        !VERSION.matches(version) -> report(failure("$version isn't a version."))
        // The page of an activity made since it started, say: it hears the rest
        busy == version -> progress?.let(::report)
        busy != null -> report(failure("TaskMint $busy is still downloading."))
        else -> {
          fetching = version
          progress = null
          // This download's installer is the one to open
          waiting = null
          go(app, version)
        }
      }
    }
  }

  /**
   * One go at `version`'s download, on a thread of its own. When the
   * connection fails and TaskMint was out of front meanwhile, that's taken
   * for the reason (Android cuts a backgrounded app off) and not reported:
   * another go follows once TaskMint is in front, from where this one
   * stopped. Each of those takes TaskMint leaving the front again, so they
   * end.
   */
  private fun go(app: Context, version: String) {
    away = !inFront
    thread(name = "taskmint-update") {
      val apk = runCatching { kept(app, version) ?: fetch(app, version) }
      main.post {
        val cutOff = apk.exceptionOrNull() is IOException && away
        when {
          cutOff && !inFront -> stalled = { go(app, version) }
          cutOff -> main.postDelayed({ go(app, version) }, SETTLE_MS)
          else -> {
            fetching = null
            progress = null
            apk.fold(::open) { report(failure(it)) }
          }
        }
      }
    }
  }

  /** To the page of the activity there is now; to no one between two of them. */
  private fun report(said: JSONObject) {
    screen?.report?.invoke(said)
  }

  private fun failure(message: String) = JSONObject().put("error", message)

  private fun failure(error: Throwable) = failure(error.message ?: error.javaClass.simpleName)

  private fun apkFor(context: Context, version: String) =
    File(File(context.cacheDir, "updates"), "TaskMint-$version.apk")

  /** The APK an earlier download left for `version`, if it still checks out. */
  private fun kept(context: Context, version: String): File? =
    apkFor(context, version).takeIf { it.isFile && runCatching { check(context, it, version) }.isSuccess }

  /**
   * On the download's thread. What a go gets is in `.part` until the APK is
   * whole, and stays there when the go fails; `.stamp` beside it says which
   * build of the APK that's a part of. The next go asks for the rest.
   */
  private fun fetch(context: Context, version: String): File {
    val apk = apkFor(context, version)
    val folder = apk.parentFile ?: throw Refused("The download has nowhere to go.")
    val part = File(folder, "${apk.name}.part")
    val stamp = File(folder, "${apk.name}.stamp")
    // Other downloads go (another version's): one APK is some 25 MB
    folder.listFiles()?.forEach { if (it != part && it != stamp) it.deleteRecursively() }
    if (!folder.isDirectory) {
      folder.delete()
      if (!folder.mkdirs()) throw Refused("The download has nowhere to go.")
    }

    val url = "$RELEASES/v$version/TaskMint-$version-android-arm64.apk"
    val build = runCatching { stamp.readText() }.getOrNull()
    val have = if (build.isNullOrEmpty()) 0L else part.length()
    if (have == 0L || !receive(url, part, stamp, have, build)) receive(url, part, stamp, 0L, null)

    stamp.delete()
    if (!part.renameTo(apk)) throw Refused("The download couldn't be kept.")
    try {
      check(context, apk, version)
    } catch (e: Refused) {
      apk.delete()
      throw e
    }
    return apk
  }

  /**
   * Asks GitHub for the APK from its byte `from` on and adds what comes to
   * `part`, which has that many; from 0 it's the whole APK, and `part` starts
   * again. False when `part` can't be carried on with: GitHub has another
   * build of the APK than `build` now, or sends nothing from there. Nothing
   * is written then.
   */
  private fun receive(url: String, part: File, stamp: File, from: Long, build: String?): Boolean {
    val connection = URL(url).openConnection() as HttpURLConnection
    connection.connectTimeout = TIMEOUT_MS
    connection.readTimeout = TIMEOUT_MS
    // As it is: a byte's place in what's sent is then its place in the APK
    connection.setRequestProperty("Accept-Encoding", "identity")
    if (from > 0) connection.setRequestProperty("Range", "bytes=$from-")
    try {
      val status = connection.responseCode
      val total: Long?
      if (from > 0) {
        // The whole APK instead, or it has no such byte
        if (status == HttpURLConnection.HTTP_OK || status == RANGE_NOT_SATISFIABLE) return false
        if (status != HttpURLConnection.HTTP_PARTIAL) throw Refused("GitHub answered $status.")
        val range = CONTENT_RANGE.matchEntire(connection.getHeaderField("Content-Range").orEmpty()) ?: return false
        if (range.groupValues[1].toLongOrNull() != from) return false
        total = range.groupValues[2].toLongOrNull() ?: return false
        if (stampOf(connection, total) != build) return false
      } else {
        if (status != HttpURLConnection.HTTP_OK) throw Refused("GitHub answered $status.")
        total = connection.contentLengthLong.takeIf { it > 0 }
        // The stamp is never beside another build's part
        stamp.delete()
        part.delete()
        stampOf(connection, total)?.let { stamp.writeText(it) }
      }
      var downloaded = from
      var reportedAt = 0L
      connection.inputStream.use { input ->
        FileOutputStream(part, from > 0).use { output ->
          val buffer = ByteArray(64 * 1024)
          while (true) {
            val read = input.read(buffer)
            if (read < 0) break
            output.write(buffer, 0, read)
            downloaded += read
            val now = System.currentTimeMillis()
            if (now - reportedAt >= REPORT_EVERY_MS) {
              reportedAt = now
              tell(downloaded, total)
            }
          }
        }
      }
      if (total != null && downloaded != total) throw IOException("The download stopped early.")
      tell(downloaded, total)
      return true
    } finally {
      connection.disconnect()
    }
  }

  /**
   * What tells one build of a release's APK from another: GitHub's tag for
   * the file (or its date) and its size. Null when GitHub gives none, and a
   * part can't then be carried on with.
   */
  private fun stampOf(connection: HttpURLConnection, total: Long?): String? {
    if (total == null) return null
    val tag = connection.getHeaderField("ETag") ?: connection.getHeaderField("Last-Modified") ?: return null
    return "$tag $total"
  }

  /** How far the download is, from its thread: kept for a page that joins, and reported. */
  private fun tell(downloaded: Long, total: Long?) {
    val soFar = JSONObject().put("downloaded", downloaded).put("total", total ?: JSONObject.NULL)
    main.post {
      progress = soFar
      report(soFar)
    }
  }

  /**
   * The download is this app at that version, and whole: asked for its
   * signature, Android reads the file and refuses one whose bytes aren't
   * what was signed, as a download pieced together wrongly would be.
   * (Android itself refuses an update signed with another key.)
   */
  private fun check(context: Context, apk: File, version: String) {
    @Suppress("DEPRECATION")
    val signed =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) PackageManager.GET_SIGNING_CERTIFICATES
      else PackageManager.GET_SIGNATURES
    val info = context.packageManager.getPackageArchiveInfo(apk.path, signed)
      ?: throw Refused("The download isn't an app.")
    if (info.packageName != context.packageName) throw Refused("The download isn't TaskMint.")
    if (info.versionName != version) throw Refused("The download isn't TaskMint $version.")
  }

  /**
   * Opens the installer on a checked APK and says so (`done`), if the
   * activity is in front; otherwise when it next is (`resumed`). From the
   * background Android would drop the request and not say so.
   */
  private fun open(apk: File) {
    val activity = screen?.activity?.takeIf { inFront }
    if (activity == null) {
      waiting = apk
      return
    }
    waiting = null
    try {
      // The system may have emptied the cache while the installer waited
      if (!apk.isFile) throw IOException("The download is no longer on the phone.")
      val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", apk)
      activity.startActivity(
        Intent(Intent.ACTION_VIEW)
          .setDataAndType(uri, APK_TYPE)
          .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
      )
      report(JSONObject().put("done", true))
    } catch (e: Exception) {
      report(failure(e))
    }
  }
}
