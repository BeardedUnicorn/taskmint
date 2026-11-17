package com.taskmint.android

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import androidx.core.content.FileProvider
import java.io.File
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
 * hold it), and the download then fails with the system's reason, which the
 * page shows when the user is back.
 */
object AppUpdate {
  /** The release's APK, as scripts/release/lib.mjs names it (and apk_update.rs links it). */
  private const val RELEASES = "https://github.com/BeardedUnicorn/taskmint/releases/download"
  private const val APK_TYPE = "application/vnd.android.package-archive"
  private val VERSION = Regex("""\d+\.\d+\.\d+""")
  private const val TIMEOUT_MS = 30_000
  private const val REPORT_EVERY_MS = 250L

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

  /** A downloaded and checked APK whose installer waits for the activity to be resumed. */
  private var waiting: File? = null

  /** A new activity (onCreate): its page hears the reports from now on. */
  fun attach(activity: Activity, report: (JSONObject) -> Unit) {
    screen = Screen(activity, report)
    inFront = false
  }

  /** The activity is in front (onResume): an installer that waited for it opens. */
  fun resumed(activity: Activity) {
    if (screen?.activity !== activity) return
    inFront = true
    waiting?.let(::open)
  }

  /** It no longer is (onPause). */
  fun paused(activity: Activity) {
    if (screen?.activity === activity) inFront = false
  }

  /** It's gone (onDestroy). A download carries on, for the next one. */
  fun detach(activity: Activity) {
    if (screen?.activity !== activity) return
    screen = null
    inFront = false
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
          thread(name = "taskmint-update") {
            val apk = runCatching { kept(app, version) ?: fetch(app, version) }
            main.post {
              fetching = null
              progress = null
              apk.fold(::open) { report(failure(it)) }
            }
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

  /** On the download's thread. */
  private fun fetch(context: Context, version: String): File {
    val apk = apkFor(context, version)
    val folder = apk.parentFile ?: throw IOException("The download has nowhere to go.")
    // Other downloads go (another version's, or one that stopped part-way):
    // one APK is some 25 MB
    folder.deleteRecursively()
    if (!folder.mkdirs()) throw IOException("The download has nowhere to go.")
    // Under another name until it's whole
    val part = File(folder, "${apk.name}.part")

    val connection = URL("$RELEASES/v$version/TaskMint-$version-android-arm64.apk").openConnection() as HttpURLConnection
    connection.connectTimeout = TIMEOUT_MS
    connection.readTimeout = TIMEOUT_MS
    try {
      val status = connection.responseCode
      if (status != HttpURLConnection.HTTP_OK) throw IOException("GitHub answered $status.")
      val total = connection.contentLengthLong.takeIf { it > 0 }
      var downloaded = 0L
      var reportedAt = 0L
      connection.inputStream.use { input ->
        part.outputStream().use { output ->
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
    } finally {
      connection.disconnect()
    }
    if (!part.renameTo(apk)) throw IOException("The download couldn't be kept.")
    try {
      check(context, apk, version)
    } catch (e: IOException) {
      apk.delete()
      throw e
    }
    return apk
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
   * The download is this app at that version. (Android itself refuses an
   * update signed with another key.)
   */
  private fun check(context: Context, apk: File, version: String) {
    val info = context.packageManager.getPackageArchiveInfo(apk.path, 0)
      ?: throw IOException("The download isn't an app.")
    if (info.packageName != context.packageName) throw IOException("The download isn't TaskMint.")
    if (info.versionName != version) throw IOException("The download isn't TaskMint $version.")
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
