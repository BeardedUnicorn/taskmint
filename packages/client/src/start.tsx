import React from "react";
import ReactDOM from "react-dom/client";
// Self-hosted fonts: the theme declares Inter and Roboto Mono, which only
// render if these bundled faces are imported (the desktop app must not
// depend on network fonts).
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/roboto-mono/400.css";
import "@fontsource/roboto-mono/500.css";
import "@fontsource/roboto-mono/600.css";
import "@fontsource/roboto-mono/700.css";
import App from "./App";
import "./styles.css";
import { initSentry } from "./utils/sentry";
import { loadAppRecords } from "./services/appRecords";
import { StartupError } from "./components/StartupError";
import { setBackend, type Backend } from "./backend";
import { AppExtensionsProvider, type AppExtensions } from "./app/extensions";
import { errorMessage } from "./utils/errors";

export type { AppExtensions, SettingsSectionExtension } from "./app/extensions";

export interface StartOptions {
  backend: Backend;
  extensions: AppExtensions;
  /** Move in records an older desktop version left in localStorage (see loadAppRecords). */
  importLegacyRecords: boolean;
}

/**
 * Starts the app in `container`: the shell's backend becomes the page's,
 * the records load, and the app renders (or, when the records can't be
 * read, a startup error).
 */
export async function startClient(
  container: HTMLElement,
  { backend, extensions, importLegacyRecords }: StartOptions,
): Promise<void> {
  initSentry();

  // Clear data left behind by the removed subscription/paywall system.
  for (const key of ["userSubscription", "featureOverrides", "taskLimitOverride"]) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Storage unavailable; nothing to clean up.
    }
  }

  setBackend(backend);
  const root = ReactDOM.createRoot(container);

  // Tasks, notes, templates and the goal load before the first render, so
  // every page can read them synchronously.
  try {
    await loadAppRecords({ importLegacy: importLegacyRecords });
  } catch (error) {
    console.error("Failed to load app records:", error);
    root.render(<StartupError message={errorMessage(error, "Unknown error")} />);
    return;
  }
  root.render(
    <React.StrictMode>
      <AppExtensionsProvider value={extensions}>
        <App />
      </AppExtensionsProvider>
    </React.StrictMode>,
  );
}
