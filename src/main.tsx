import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import { initSentry } from "./utils/sentry";

// Initialize Sentry before rendering the app
initSentry();

// Import Sentry test utilities in development
if (import.meta.env.MODE === 'development') {
  import('./utils/sentryTest');
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
