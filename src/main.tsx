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

// Initialize Sentry before rendering the app
initSentry();

// Clear data left behind by the removed subscription/paywall system.
for (const key of ['userSubscription', 'featureOverrides', 'taskLimitOverride']) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage unavailable; nothing to clean up.
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
