# ADR 0004: A dev environment for every build that isn't a release

- **Status:** accepted (2026-11-12)
- **Scope:** which Firebase project a build uses, and how a test build
  installs beside the real app on the desktop and Android

## Context

Every build used the production Firebase project, `taskmint-f9a05`
([ADR 0002](0002-firebase.md)). That included `pnpm tauri dev`, a local
`tauri build`, Android builds and the web dev server. The configs were
literals in the apps' `firebaseConfig.ts` and in Android's
`google-services.json`.

A desktop dev build was also the installed app, `com.taskmint.desktop`. It
shared that app's data folder, single-instance lock, `taskmint://` scheme,
capture port and update feed.

So trying a build meant writing to production's Firestore and Auth, and it
risked the real local data. A test build couldn't even start while the
installed app ran.

## Decisions

1. **A second Firebase project, `taskmint-dev`.** It mirrors production:
   - Spark, with billing off;
   - email and Google sign-in, with email enumeration protection;
   - Firestore `(default)` in nam5, with the same rules and indexes;
   - Hosting at https://taskmint-dev.web.app.

   It has no Analytics. It has the same three app registrations ("TaskMint
   web", "TaskMint desktop", and Android as `com.taskmint.android.dev`).
2. **One switch, `TASKMINT_ENV`.** It is `production` or `dev`, and unset
   means `dev`. Any other value stops the build. Every tool a build runs
   reads it from the same environment, which the Tauri CLI passes on:
   - Vite (`scripts/environment.mjs`'s plugin): the Firebase config, Sentry's
     `environment`, and a `dist/environment.json` marker;
   - Cargo (`build.rs` → `src/environment.rs`);
   - Gradle (`app/build.gradle.kts`).
3. **Dev is the default.** Only the release path sets `production`:
   `scripts/release.mjs` for its builds, and the release workflow's web job.
   Forgetting a flag gives a dev build, never a production one.
4. **A dev build is a separate app.**
   - **Desktop.** `tauri.conf.json` is the dev build: "TaskMint Dev",
     `com.taskmint.desktop.dev`, `taskmint-dev://`, and no update feed.
     `tauri.production.conf.json`, which only `release.mjs` applies, makes
     a build the real app. A dev build also listens for captures on 43127,
     so the extension's captures always reach the real app. It doesn't take
     over the pre-2.1 `com.taskmint.app` folders.
   - **Android.** Gradle adds `.dev` to the application ID and labels the
     app "TaskMint Dev". It copies the environment's
     `google-services.<env>.json` into place and deactivates Analytics. The
     code's package stays `com.taskmint.android`, which the Rust side's JNI
     names depend on.
5. **Mixed builds don't run, and wrong ones don't ship.**
   - **Desktop start-up.** A production build refuses to run as anything but
     `com.taskmint.desktop`, and a dev build refuses to run as it
     (`Environment::check_identifier`).
   - **Release builds.** `release.mjs` checks that each build's webview
     marker says production, that the Mac app's `CFBundleIdentifier` is the
     real one, and that the APK's package is.
   - **Hosting.** Hosting's predeploy step (`scripts/check-web-environment.mjs`)
     refuses a `dist` built for another project than the one it's deploying
     to.
6. **Google sign-in on a dev desktop build uses production's client.** The
   dev project safelists the "TaskMint desktop" OAuth client, so the same
   `.env` and repository secrets work and there's no second secret. Android
   has its own clients in the dev project, for the debug and release keys'
   SHA-1s. The web app uses the dev project's own client.
7. **Dev deploys are local.** `pnpm deploy:dev` deploys the web app, rules
   and indexes from a developer's machine. The release workflow's Workload
   Identity trust stays production's only.

## Consequences

- A test build can run beside the installed TaskMint. Its data, settings,
  Firebase sign-in, logs and notification permissions are its own.
- `.firebaserc`'s default is the dev project, so a bare `pnpm firebase …`,
  emulators included, works on dev. Production commands name
  `--project taskmint-f9a05`, and `firebase.json` names no Hosting site:
  each project's default site is used.
- Hosting's CSP `frame-src` lists both projects' auth domains, since the
  file is shared.
- Building production by hand takes both halves:
  `TASKMINT_ENV=production` and `--config src-tauri/tauri.production.conf.json`.
- A setting changed in production's Authentication needs the same change in
  dev's.
- Cargo rebuilds the desktop crate when `TASKMINT_ENV` changes.
- **Not done here** (follow-ups if they're needed):
  - a dev build of the browser extension (port 43127, `taskmint-dev://`,
    its own ID);
  - BudgetMint dev builds reading `taskmint-dev`;
  - a distinct dev app icon;
  - a CI workflow for dev builds.
