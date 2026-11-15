package com.taskmint.android

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.Log
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ProcessLifecycleOwner
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.google.firebase.installations.FirebaseInstallations
import com.google.firebase.messaging.FirebaseMessaging
import com.taskmint.android.Widgets.time
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.security.KeyStore
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONArray
import org.json.JSONObject

/**
 * The widgets and the running timer's notification with TaskMint closed.
 * The page keeps them while it's open; closed, nothing of TaskMint's runs,
 * and a timer started on the desktop wouldn't show until the app was opened.
 * So every device publishes the widgets' figures to the cloud
 * (`users/{uid}/published/widgets`, docs/contracts/widgets.md), and this
 * reads that one document about every quarter of an hour, when the phone
 * has a connection, and shows what it says.
 *
 * The page says which account to read (AppTask.setBackgroundSync, once this
 * device syncs with it) and hands over the user's Firebase refresh token,
 * which is kept encrypted with a key in the phone's keystore and traded for
 * an ID token at each read. Signing out, or the account's cloud data going,
 * forgets it (clearBackgroundSync), as does Firebase refusing the token.
 *
 * So the phone needn't wait for its next check, it also keeps its push
 * address (its Firebase installation ID, which Cloud Messaging sends to) in
 * the cloud while it syncs,
 * `users/{uid}/devices/{deviceId}`, written again when it changes and every
 * week. A Cloud Function (apps/functions) sends a message there when another
 * device publishes, and [WidgetPush] reads the figures at once.
 *
 * Of the user's data it only reads: the sessions and the rest stay the page's
 * to sync, when TaskMint is next opened. Figures are taken only when they're another
 * device's, newer than the ones kept, from the epoch this device is linked
 * to, and in the version the widgets read; and never while the app is in
 * front, where the page's own are the newest.
 */
object WidgetSync {
  private const val TAG = "TaskMintWidgetSync"
  private const val PREFS = "TaskMintWidgetSync"
  private const val LINK = "link"
  private const val TOKEN = "token"
  private const val TIMER_NOTICE = "timerNotice"
  /** The push address the cloud has, and when it was last written there. */
  private const val PUSH_TOKEN = "pushToken"
  private const val PUSH_AT = "pushAt"
  private const val PUSH_AGAIN_MS = 7 * 24 * 60 * 60_000L
  private const val KEY_ALIAS = "TaskMintWidgetSync"
  private const val PERIODIC = "widget-sync"
  private const val ONCE = "widget-sync-once"
  private const val EVERY_MINUTES = 15L
  private const val TIMEOUT_MS = 8_000
  /** The snapshot's version the widgets read (Widgets.VERSION). */
  private const val SCHEMA = 2
  /** Firebase's words for a refresh token that will never work again. */
  private val REFUSED = setOf("TOKEN_EXPIRED", "USER_DISABLED", "USER_NOT_FOUND", "INVALID_REFRESH_TOKEN")

  enum class Outcome {
    /** Read (or nothing to read): until next time. */
    DONE,
    /** The cloud couldn't be reached: worth another try soon. */
    RETRY,
  }

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  /** The account to read from now on (BackgroundSyncLink, as JSON), and the checks begin. */
  fun set(context: Context, json: String) {
    val link = runCatching { JSONObject(json) }.getOrNull() ?: return
    val token = link.remove("refreshToken") as? String ?: return
    val sealed = seal(token) ?: return
    prefs(context).edit().putString(LINK, link.toString()).putString(TOKEN, sealed).apply()
    WorkManager.getInstance(context)
      .enqueueUniquePeriodicWork(
        PERIODIC,
        ExistingPeriodicWorkPolicy.KEEP,
        PeriodicWorkRequestBuilder<WidgetSyncWorker>(EVERY_MINUTES, TimeUnit.MINUTES).setConstraints(connected()).build(),
      )
    // A push address only while this device syncs
    val app = context.applicationContext
    val messaging = FirebaseMessaging.getInstance()
    messaging.isAutoInitEnabled = true
    messaging.register().addOnSuccessListener {
      FirebaseInstallations.getInstance().id.addOnSuccessListener { address -> thread { register(app, address) } }
    }
  }

  /** Keeps this phone's push address in the cloud, when it's new or a week has passed (on a thread of its own). */
  fun register(context: Context, address: String) {
    val prefs = prefs(context)
    val link = prefs.getString(LINK, null)?.let { runCatching { JSONObject(it) }.getOrNull() } ?: return
    val fresh = System.currentTimeMillis() - prefs.getLong(PUSH_AT, 0) in 0 until PUSH_AGAIN_MS
    if (address == prefs.getString(PUSH_TOKEN, null) && fresh) return
    val refreshToken = prefs.getString(TOKEN, null)?.let(::open) ?: return
    try {
      val idToken = idToken(context, link, refreshToken) ?: return
      val text = { value: String -> JSONObject().put("stringValue", value) }
      val fields = JSONObject().put("fid", text(address)).put("platform", text("android")).put("appVersion", text(BuildConfig.VERSION_NAME))
      // The rules want the server's own time in updatedAt
      val write =
        JSONObject()
          .put("update", JSONObject().put("name", device(link)).put("fields", fields))
          .put("updateTransforms", JSONArray().put(JSONObject().put("fieldPath", "updatedAt").put("setToServerValue", "REQUEST_TIME")))
      val reply =
        request(
          "${firestore(link)}/v1/${database(link)}/documents:commit",
          "POST",
          mapOf("Authorization" to "Bearer $idToken", "Content-Type" to "application/json"),
          JSONObject().put("writes", JSONArray().put(write)).toString(),
        )
      if (reply.code != 200) throw IllegalStateException("push address: ${reply.code} ${reply.body.take(200)}")
      prefs.edit().putString(PUSH_TOKEN, address).putLong(PUSH_AT, System.currentTimeMillis()).apply()
    } catch (e: Exception) {
      // Tried again the next time the app says it syncs
      Log.w(TAG, "Couldn't keep the push address: $e")
    }
  }

  /** This device no longer syncs with the account: the checks stop and the token is forgotten. */
  fun clear(context: Context) {
    val prefs = prefs(context)
    val link = prefs.getString(LINK, null)?.let { runCatching { JSONObject(it) }.getOrNull() }
    val refreshToken = prefs.getString(TOKEN, null)?.let(::open)
    val registered = prefs.contains(PUSH_TOKEN)
    prefs.edit().remove(LINK).remove(TOKEN).remove(PUSH_TOKEN).remove(PUSH_AT).apply()
    val work = WorkManager.getInstance(context)
    work.cancelUniqueWork(PERIODIC)
    work.cancelUniqueWork(ONCE)
    if (link == null) return
    // The push address goes too: from the cloud while the token still works, and from the phone
    val messaging = FirebaseMessaging.getInstance()
    messaging.isAutoInitEnabled = false
    messaging.unregister()
    if (!registered || refreshToken == null) return
    thread {
      runCatching {
        val idToken = exchange(link, refreshToken).first ?: return@runCatching
        request("${firestore(link)}/v1/${device(link)}", "DELETE", mapOf("Authorization" to "Bearer $idToken"), null)
      }
    }
  }

  /** Whether the timer's notification is wanted (Settings → Notifications' "System notifications"). */
  fun setTimerNotice(context: Context, wanted: Boolean) {
    prefs(context).edit().putBoolean(TIMER_NOTICE, wanted).apply()
  }

  /** One check soon (the phone has started: the figures kept are from before). */
  fun soon(context: Context) {
    if (!prefs(context).contains(LINK)) return
    WorkManager.getInstance(context)
      .enqueueUniqueWork(
        ONCE,
        ExistingWorkPolicy.REPLACE,
        OneTimeWorkRequestBuilder<WidgetSyncWorker>().setConstraints(connected()).build(),
      )
  }

  private fun connected() = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

  private fun inFront() = ProcessLifecycleOwner.get().lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)

  /** Reads the published figures and shows them, if they're newer and this device's to show. */
  fun run(context: Context): Outcome {
    val prefs = prefs(context)
    val link = prefs.getString(LINK, null)?.let { runCatching { JSONObject(it) }.getOrNull() } ?: return Outcome.DONE
    if (inFront()) return Outcome.DONE
    // (A backup restored to another phone can't open it: signed out there)
    val refreshToken = prefs.getString(TOKEN, null)?.let(::open)
    if (refreshToken == null) {
      clear(context)
      return Outcome.DONE
    }
    return try {
      val idToken = idToken(context, link, refreshToken) ?: return Outcome.DONE
      val published = read(link, idToken) ?: return Outcome.DONE
      take(context, link, published)
      Outcome.DONE
    } catch (e: Exception) {
      Log.w(TAG, "Couldn't read the published widgets: $e")
      Outcome.RETRY
    }
  }

  private fun firestore(link: JSONObject): String {
    val host = link.optString("emulatorHost").takeIf { it.isNotEmpty() }
    return if (host != null) "http://$host:8085" else "https://firestore.googleapis.com"
  }

  private fun database(link: JSONObject) = "projects/${link.getString("projectId")}/databases/(default)"

  private fun user(link: JSONObject) = "${database(link)}/documents/users/${link.getString("uid")}"

  /** This phone's push address document. */
  private fun device(link: JSONObject) = "${user(link)}/devices/${link.getString("deviceId")}"

  /**
   * Trades the refresh token for an ID token, and gives the refresh token
   * to keep from now on; a null ID token when Firebase refuses it for good.
   */
  private fun exchange(link: JSONObject, refreshToken: String): Pair<String?, String> {
    val host = link.optString("emulatorHost").takeIf { it.isNotEmpty() }
    val base = if (host != null) "http://$host:9099/securetoken.googleapis.com" else "https://securetoken.googleapis.com"
    val url = "$base/v1/token?key=${URLEncoder.encode(link.getString("apiKey"), "UTF-8")}"
    val form = "grant_type=refresh_token&refresh_token=${URLEncoder.encode(refreshToken, "UTF-8")}"
    val reply = request(url, "POST", mapOf("Content-Type" to "application/x-www-form-urlencoded"), form)
    if (reply.code == 200) {
      val answer = JSONObject(reply.body)
      // Firebase may hand back a new refresh token: the old one stops working
      return answer.getString("id_token") to answer.optString("refresh_token").ifEmpty { refreshToken }
    }
    val why = runCatching { JSONObject(reply.body).getJSONObject("error").getString("message") }.getOrDefault("")
    if (reply.code == 400 && REFUSED.any { why.startsWith(it) }) {
      Log.w(TAG, "Firebase refused the refresh token ($why)")
      return null to refreshToken
    }
    throw IllegalStateException("token exchange: ${reply.code} $why")
  }

  /** An ID token for the kept refresh token; null (and signed out here) when Firebase refuses it for good. */
  private fun idToken(context: Context, link: JSONObject, refreshToken: String): String? {
    val (idToken, next) = exchange(link, refreshToken)
    if (idToken == null) {
      clear(context)
      return null
    }
    if (next != refreshToken) seal(next)?.let { prefs(context).edit().putString(TOKEN, it).apply() }
    return idToken
  }

  /** The published document's fields and write time; null when there's none (or it's not this user's to read). */
  private fun read(link: JSONObject, idToken: String): JSONObject? {
    val reply = request("${firestore(link)}/v1/${user(link)}/published/widgets", "GET", mapOf("Authorization" to "Bearer $idToken"), null)
    return when (reply.code) {
      200 -> JSONObject(reply.body)
      // None published yet, or the cloud data was deleted; or the rules say no
      403, 404 -> null
      else -> throw IllegalStateException("published widgets: ${reply.code}")
    }
  }

  /** Shows `published` (Firestore's REST document) if it's newer than what's kept and this device's to show. */
  private fun take(context: Context, link: JSONObject, published: JSONObject) {
    val fields = published.getJSONObject("fields")
    val whole = { name: String -> fields.getJSONObject(name).getString("integerValue").toLong() }
    val text = { name: String -> fields.getJSONObject(name).getString("stringValue") }
    if (whole("schema") != SCHEMA.toLong() || whole("epoch") != link.getLong("epoch")) return
    if (text("deviceId") == link.getString("deviceId")) return
    val writtenMs = millis(published.getString("updateTime"))
    val figures = JSONObject(text("json"))
    if (figures.optInt("version") != SCHEMA) return

    val kept = Widgets.snapshot(context)
    if (kept != null && (writtenMs <= kept.optLong("updatedAtMs") || figures.getString("day") < kept.optString("day"))) return
    // The app may have come forward while this read
    if (inFront()) return
    Widgets.save(context, figures.put("updatedAtMs", writtenMs).toString())

    if (!prefs(context).getBoolean(TIMER_NOTICE, true)) return
    val timer = figures.optJSONObject("timer")
    TimerNotices.setRemote(context, timer?.let { TimerNotice(it.getString("task"), it.time("countingFromMs")) })
  }

  /** An RFC 3339 time in UTC ("2026-11-14T21:00:00.123456Z"), as epoch milliseconds. */
  private fun millis(time: String): Long {
    val seconds = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }
    val whole = seconds.parse(time.substring(0, 19))!!.time
    val fraction = time.substring(19).trimEnd('Z').trimStart('.')
    return whole + if (fraction.isEmpty()) 0 else fraction.padEnd(3, '0').substring(0, 3).toLong()
  }

  private class Reply(val code: Int, val body: String)

  private fun request(url: String, method: String, headers: Map<String, String>, body: String?): Reply {
    val connection = URL(url).openConnection() as HttpURLConnection
    try {
      connection.requestMethod = method
      connection.connectTimeout = TIMEOUT_MS
      connection.readTimeout = TIMEOUT_MS
      for ((name, value) in headers) connection.setRequestProperty(name, value)
      if (body != null) {
        connection.doOutput = true
        connection.outputStream.use { it.write(body.toByteArray()) }
      }
      val code = connection.responseCode
      val stream = if (code in 200..299) connection.inputStream else connection.errorStream
      return Reply(code, stream?.bufferedReader()?.use { it.readText() } ?: "")
    } finally {
      connection.disconnect()
    }
  }

  // ----- The token at rest: AES-GCM under a key that never leaves the keystore -----

  private fun key(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    generator.init(
      KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .build()
    )
    return generator.generateKey()
  }

  private fun seal(text: String): String? =
    runCatching {
      val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
      val sealed = cipher.doFinal(text.toByteArray())
      "${Base64.encodeToString(cipher.iv, Base64.NO_WRAP)}:${Base64.encodeToString(sealed, Base64.NO_WRAP)}"
    }.onFailure { Log.w(TAG, "Couldn't keep the token: $it") }.getOrNull()

  private fun open(sealed: String): String? =
    runCatching {
      val (iv, text) = sealed.split(":").map { Base64.decode(it, Base64.NO_WRAP) }
      val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv)) }
      String(cipher.doFinal(text))
    }.getOrNull()
}

/** One check of the published widgets (WidgetSync), on WorkManager's thread. */
class WidgetSyncWorker(context: Context, parameters: WorkerParameters) : Worker(context, parameters) {
  override fun doWork(): Result =
    when (WidgetSync.run(applicationContext)) {
      WidgetSync.Outcome.DONE -> Result.success()
      WidgetSync.Outcome.RETRY -> Result.retry()
    }
}
