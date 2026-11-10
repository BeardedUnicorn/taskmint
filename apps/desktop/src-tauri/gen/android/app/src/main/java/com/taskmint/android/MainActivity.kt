package com.taskmint.android

import android.os.Bundle
import android.os.CancellationSignal
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
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

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  // Added before the page loads, so the webview has them from the start
  override fun onWebViewCreate(webView: WebView) {
    this.webView = webView
    webView.addJavascriptInterface(SystemBars(), "TaskMintSystemBars")
    webView.addJavascriptInterface(GoogleSignIn(), "TaskMintGoogleSignIn")
    webView.addJavascriptInterface(Analytics(), "TaskMintAnalytics")
  }

  /**
   * The app draws under the status bar (edge to edge), and its top bar
   * follows the theme chosen in Settings → Appearance, not the system's dark
   * mode. The webview says which theme shows (tauriBackend.ts), and the
   * status bar's clock and icons follow it.
   */
  private inner class SystemBars {
    @JavascriptInterface
    fun setTheme(theme: String) {
      // The bridge calls in on its own thread
      runOnUiThread {
        WindowCompat.getInsetsController(window, window.decorView).isAppearanceLightStatusBars = theme == "light"
      }
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
}
