package com.taskmint.android

/**
 * The way into TaskMint's own code (Rust: headless.rs) with no activity, so
 * no webview and no app running: a widget's or the notification's timer
 * button (WidgetAction).
 *
 * It's the library the app itself runs (Rust.kt loads it for the activity);
 * loading it starts nothing. The data files have one reader and writer in a
 * process, which the app and the buttons share, whichever opens them first.
 */
object Headless {
  init {
    System.loadLibrary("taskmint_lib")
  }

  /**
   * Runs `action` (Launch's pause, resume and start-task:<id>, and the
   * notification's stop) on the data in `dataDir`, and says how the timer
   * stands after it: `{"done": …, "timer": {"task", "countingFromMs",
   * "beganToday"} | null}`; null when it couldn't be run. It reads and saves
   * files: never on the main thread.
   */
  external fun act(dataDir: String, action: String): String?
}
