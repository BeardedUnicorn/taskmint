package com.taskmint.android

import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.WindowCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  // Added before the page loads, so the webview has it from the start
  override fun onWebViewCreate(webView: WebView) {
    webView.addJavascriptInterface(SystemBars(), "TaskMintSystemBars")
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
}
