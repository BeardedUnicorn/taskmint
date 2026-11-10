/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SENTRY_DSN?: string;
  /** Development builds: sync with the Firebase emulators on this host. */
  readonly VITE_FIREBASE_EMULATOR_HOST?: string;
  /** The desktop's Google sign-in client ("Desktop app" OAuth client). */
  readonly VITE_GOOGLE_DESKTOP_CLIENT_ID?: string;
  readonly VITE_GOOGLE_DESKTOP_CLIENT_SECRET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
