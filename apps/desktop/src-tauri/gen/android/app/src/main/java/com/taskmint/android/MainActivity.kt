package com.taskmint.android

import android.content.Intent
import android.os.Bundle
import android.os.CancellationSignal
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.content.ContextCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.splashscreen.SplashScreenViewProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.credentials.CredentialManager
import androidx.credentials.CredentialManagerCallback
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetCredentialResponse
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.firebase.analytics.FirebaseAnalytics
import org.json.JSONObject

class MainActivity : TauriActivity() {
  private var webView: WebView? = null

  /** The launch screen while it covers the app, and whether the page has drawn. */
  private var splash: SplashScreenViewProvider? = null
  private var pageDrawn = false

  /** The theme the page last gave the status bar (SystemBars); light icons on the launch screen's teal until then. */
  private var barsTheme = "dark"

  /**
   * What covers the bottom of the app, in dp (the page's CSS px): the
   * navigation bar or gesture area, and the on-screen keyboard while it's up
   * (from the screen's bottom edge, so over the navigation bar). The app
   * draws under both (edge to edge), and the webview doesn't say so to the
   * page (env(safe-area-inset-bottom) is 0, and older webviews don't shrink
   * the visual viewport for the keyboard), so the page asks (SystemBars) and
   * hears of each change (window.__taskmintInsets).
   */
  @Volatile private var bottomInsetDp = 0f
  @Volatile private var keyboardInsetDp = 0f

  /**
   * The notification the user last tapped, or the button they pressed on it,
   * until the page takes it (AppTask.takeNotificationTap):
   * `{"id": …, "action": …}`. The notification plugin opens the app with
   * both in the intent but reports neither to the app (it loses the
   * notification), and the id is what says which page to open.
   */
  @Volatile private var notificationTap: String? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    val splashScreen = installSplashScreen()
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    applyBarsTheme()
    // A tap that started the app (not a restart after a config change)
    if (savedInstanceState == null) keepNotificationTap(intent)
    ViewCompat.setOnApplyWindowInsetsListener(window.decorView) { view, insets ->
      val density = resources.displayMetrics.density
      val bottom = insets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom / density
      val keyboard = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom / density
      if (bottom != bottomInsetDp || keyboard != keyboardInsetDp) {
        bottomInsetDp = bottom
        keyboardInsetDp = keyboard
        webView?.evaluateJavascript("window.__taskmintInsets && window.__taskmintInsets()", null)
      }
      // The decor view still lays itself and the webview out as before
      ViewCompat.onApplyWindowInsets(view, insets)
    }

    // The launch screen (Theme.taskmint.Starting) would go with the first
    // frame, long before the webview has anything to show. It stays until the
    // page says it has drawn (Splash), or 10 s have passed (the page may never
    // load), and the app draws underneath meanwhile.
    splashScreen.setOnExitAnimationListener { provider ->
      splash = provider
      // The hand-over applies the app theme's bars; light icons on the teal
      setLightStatusBar(false)
      if (pageDrawn) dismissSplash()
    }
    window.decorView.postDelayed({ onPageDrawn() }, SPLASH_TIMEOUT_MS)
  }

  private fun onPageDrawn() {
    if (pageDrawn) return
    pageDrawn = true
    dismissSplash()
  }

  private fun dismissSplash() {
    val provider = splash ?: return
    provider.view.animate().alpha(0f).setDuration(SPLASH_FADE_MS).withEndAction {
      // Removing it puts back the bars it found (Android 12 and later), so
      // the page's theme goes on again after
      provider.remove()
      splash = null
      applyBarsTheme()
    }
  }

  private fun applyBarsTheme() = setLightStatusBar(barsTheme == "light")

  /** Dark clock and icons (for a light background) or light ones. */
  private fun setLightStatusBar(light: Boolean) {
    WindowCompat.getInsetsController(window, window.decorView).isAppearanceLightStatusBars = light
  }

  // Added before the page loads, so the webview has them from the start
  /** A tap while the app runs: kept, and the page told. */
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    if (keepNotificationTap(intent)) {
      webView?.evaluateJavascript(
        "window.__taskmintNotificationTapped && window.__taskmintNotificationTapped()",
        null
      )
    }
  }

  /** Keeps the notification tap `intent` carries (the plugin's extras), if any. */
  private fun keepNotificationTap(intent: Intent?): Boolean {
    val id = intent?.getIntExtra("NotificationId", Int.MIN_VALUE) ?: return false
    if (id == Int.MIN_VALUE) return false
    val action = intent.getStringExtra("NotificationUserAction") ?: "tap"
    notificationTap = JSONObject().put("id", id).put("action", action).toString()
    return true
  }

  override fun onWebViewCreate(webView: WebView) {
    this.webView = webView
    webView.addJavascriptInterface(Splash(), "TaskMintSplash")
    webView.addJavascriptInterface(SystemBars(), "TaskMintSystemBars")
    webView.addJavascriptInterface(GoogleSignIn(), "TaskMintGoogleSignIn")
    webView.addJavascriptInterface(Analytics(), "TaskMintAnalytics")
    webView.addJavascriptInterface(AppTask(), "TaskMintApp")
  }

  /**
   * The page has drawn (HideSplashScreen: the app's page and session list,
   * not their loading skeletons, or an error is on screen), so the launch
   * screen fades out to it.
   */
  private inner class Splash {
    @JavascriptInterface
    fun hide() {
      runOnUiThread { onPageDrawn() }
    }
  }

  /**
   * The app draws under the status bar (edge to edge), and its top bar
   * follows the theme chosen in Settings → Appearance, not the system's dark
   * mode. The webview says which theme shows (tauriBackend.ts), and the
   * status bar's clock and icons follow it, once the launch screen is gone.
   */
  private inner class SystemBars {
    @JavascriptInterface
    fun setTheme(theme: String) {
      // The bridge calls in on its own thread
      runOnUiThread {
        barsTheme = theme
        if (splash == null) applyBarsTheme()
      }
    }

    /** The navigation bar's inset, in CSS px, for the page to keep its tabs and dialogs clear of. */
    @JavascriptInterface
    fun bottomInset(): Float = bottomInsetDp

    /** The keyboard's height from the screen's bottom, in CSS px (0 while it's down), for dialogs to sit above. */
    @JavascriptInterface
    fun keyboardInset(): Float = keyboardInsetDp
  }

  /**
   * Back on the app's first screen. The page takes over Android's back
   * (Tauri's onBackButtonPress) to close dialogs and step back to Home, so
   * from Home it asks for what back does there by default: the app goes to
   * the background, still running, as on any first screen.
   */
  private inner class AppTask {
    @JavascriptInterface
    fun moveToBack() {
      runOnUiThread { moveTaskToBack(true) }
    }

    /** The notification tap the app hasn't acted on (`{"id", "action"}`), once; null when none. */
    @JavascriptInterface
    fun takeNotificationTap(): String? {
      val tap = notificationTap
      notificationTap = null
      return tap
    }
  }

  /**
   * Google sign-in for cloud sync. Google refuses sign-in inside a webview,
   * so Android's account picker (Credential Manager) asks, and the Google ID
   * token goes back to the page (window.__taskmintGoogleSignIn), which signs
   * in to Firebase with it. default_web_client_id comes from
   * google-services.json.
   */
  private inner class GoogleSignIn {
    @JavascriptInterface
    fun start() {
      runOnUiThread {
        val option = GetSignInWithGoogleOption.Builder(getString(R.string.default_web_client_id)).build()
        val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
        CredentialManager.create(this@MainActivity).getCredentialAsync(
          this@MainActivity,
          request,
          CancellationSignal(),
          ContextCompat.getMainExecutor(this@MainActivity),
          object : CredentialManagerCallback<GetCredentialResponse, GetCredentialException> {
            override fun onResult(result: GetCredentialResponse) {
              val credential = result.credential
              if (credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                answer(JSONObject().put("idToken", GoogleIdTokenCredential.createFrom(credential.data).idToken))
              } else {
                answer(JSONObject().put("error", "Google sign-in didn't return a Google account."))
              }
            }

            override fun onError(e: GetCredentialException) {
              val message = if (e is GetCredentialCancellationException) {
                "Google sign-in was cancelled."
              } else {
                "Google sign-in failed: ${e.message ?: e.type}"
              }
              answer(JSONObject().put("error", message))
            }
          },
        )
      }
    }

    private fun answer(answer: JSONObject) {
      runOnUiThread {
        webView?.evaluateJavascript("window.__taskmintGoogleSignIn && window.__taskmintGoogleSignIn($answer)", null)
      }
    }
  }

  /**
   * Firebase Analytics (Settings → Privacy can turn it off; the setting
   * persists here), and the pages the app shows, as screen views.
   */
  private inner class Analytics {
    private val analytics get() = FirebaseAnalytics.getInstance(this@MainActivity)

    @JavascriptInterface
    fun setEnabled(enabled: Boolean) {
      analytics.setAnalyticsCollectionEnabled(enabled)
    }

    @JavascriptInterface
    fun screen(name: String) {
      analytics.logEvent(
        FirebaseAnalytics.Event.SCREEN_VIEW,
        Bundle().apply {
          putString(FirebaseAnalytics.Param.SCREEN_NAME, name)
          putString(FirebaseAnalytics.Param.SCREEN_CLASS, "MainActivity")
        },
      )
    }
  }

  private companion object {
    const val SPLASH_FADE_MS = 250L
    const val SPLASH_TIMEOUT_MS = 10_000L
  }
}
