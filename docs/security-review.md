# Security review (Firebase, November 2026)

A review of what [ADR 0002](adr/0002-firebase.md) changed: accounts in
Firebase Auth, Firestore as the shared copy and its rules, cloud sync on the
desktop and Android, Google sign-in on each, the web app on Firebase Hosting
with TaskMint's rules in WebAssembly, analytics, and the release workflow's
deploy. It was done by reading the code and the project's cloud setup
against the threats below, and by testing the rules and the production
headers. Run it again when the rules, a sign-in path, the CSP or the deploy
path changes.

The October 2026 review (P15) covered the self-hosted server, its nginx and
the desktop's server mode, all retired with ADR 0002. It's in git history
(`git show da268fd:docs/security-review.md`). Its findings about the capture
paths, the desktop webview and the extension still hold, and are repeated
below.

## What's protected, and from whom

**Assets:** each account's data, in Firestore and on each device; the
Firebase sign-in each app keeps; the path that deploys the web app and the
rules; the release signing keys.

**Threats considered:**
- Anyone on the internet, with or without an account (sign-up is open):
  reading or changing another account's data, writing data that breaks a
  device, spending the project's quota.
- A web page open in the user's browser: framing the web app, injecting
  script, cross-site use of the desktop's capture server and `taskmint://`
  links.
- A compromised dependency of the release workflow, or a tag pushed with
  bad intent.
- Someone who can read error reports or analytics.
- The network between a client and Google (TLS throughout).

**Out of scope:**
- Code already running on the user's computer or phone. It can read the
  data files and the webview's storage, the Firebase sign-in included.
- Google's own infrastructure and staff.
- Denial of service beyond the daily quotas (below).

## Checked and sound

- **The Firestore rules** (`firebase/firestore.rules`):
  - Everything is under `users/{uid}` or `budgetmint/{uid}`, and only a user
    signed in as that `uid` can read or write it. Nothing else in the
    database is reachable.
  - The account document holds only `epoch`. It's created at 1, and moves
    only one up at a time.
  - A data document must have exactly the sync fields, one of the four
    kinds, an id that starts with its kind, sizes under limits (the entity
    under 900 KB), `updatedAt` equal to the server's time, and the account's
    current epoch. A device can't backdate a write past others' cursors, and
    a device that missed a Delete cloud data can't write its old copy back.
  - The published forecast (`users/{uid}/published/payoutForecast`, the
    only name allowed) has exactly its fields, a JSON string under 200 KB,
    the server's time, the account's current epoch, and a contract version
    no older than the stored one's. It holds only amounts and times.
  - BudgetMint's data (`budgetmint/{uid}`) is guarded the same way as
    TaskMint's: its own epoch document, and data documents with exact
    fields, one of three kinds, ids matching their kind's pattern, sizes per
    kind, the server's time and the current epoch. TaskMint and BudgetMint
    documents can't be written in each other's place. The rules can't tell
    the apps apart (both are the same signed-in user): each app writing only
    its own paths is a property of its code.
  - `firebase/firestore.rules.test.mjs` checks each of these on the emulator,
    including another user and no user at all, in `verify.sh` and CI.
- **Reading what others wrote.** Even the owner's own documents are parsed
  defensively: a document core can't read is skipped, and one from a newer
  schema is held, not applied. Neither stops sync.
- **Sign-in:**
  - Passwords and reset links are Firebase Auth's. Its email enumeration
    protection is on, so sign-in and the reset form answer the same whether
    or not an address has an account. Signing up with a taken address still
    says so, as any open sign-up must.
  - Google's popup works only on the authorized domains: `localhost` and
    the project's `firebaseapp.com` and `web.app` domains.
  - The desktop's Google sign-in (`google_sign_in.rs`) uses PKCE (S256) and
    a random `state`, which the loopback listener on `127.0.0.1` checks
    before taking a code. It listens on port 43118 when that's free (so a
    browser's "always allow" for the page's `taskmint://open` link holds),
    else on any free port; a process already on 43118 only moves it to
    another port. It gives up after 5 minutes. The code is exchanged in Rust
    over TLS, and only Google's ID token reaches the webview. The page the
    browser comes back to has fixed text only: nothing from the request or
    Google's error reaches it.
  - Android's goes through Credential Manager, with the project's web client
    id. Neither the desktop nor Android loads a Google script in its webview.
  - The web app's popup runs on the project's own auth domain, which is the
    only frame the CSP allows.
- **The web app on Hosting** (`firebase.json`):
  - The CSP allows scripts from the site, Google's sign-in and Analytics
    hosts, and `'wasm-unsafe-eval'` for the core, not `'unsafe-eval'`.
    Connections go only to the Firebase, Analytics and Sentry hosts.
    Checked on the Hosting emulator: `eval` is blocked, the core compiles,
    and a fetch to another host is refused.
  - `frame-ancestors 'none'` and `X-Frame-Options: DENY` stop framing;
    nosniff, a referrer policy, COOP (`same-origin-allow-popups`, which
    Google's popup needs), CORP and a permissions policy are sent too.
  - It renders no raw HTML (no `dangerouslySetInnerHTML`). Its code loads
    only after sign-in, Sentry with it, and Sentry keeps only diagnostic
    fields.
- **Analytics** sends page views only: the page's name, never data. The web
  app doesn't load Google's tag while it's off. The desktop has none, since
  the tag would run inside a webview that can call every IPC command.
- **The desktop webview** still has only `core:default`: every call goes
  through `dispatch`, and dialogs and files are in Rust. Its CSP adds only
  the Firestore and Auth hosts to `connect-src` (the emulators' ports only
  in `devCsp`).
- **The deploy path:**
  - `deploy-web` signs in through Workload Identity Federation. Its provider
    accepts only GitHub's tokens for `BeardedUnicorn/taskmint` on a
    `refs/tags/v*` ref, and no key is stored anywhere.
  - Only that job has `id-token: write`. Checkouts don't keep credentials,
    and firebase-tools runs at a pinned version.
- **Captures** (unchanged since P15):
  - The desktop's capture server listens on 127.0.0.1 only and takes a
    delivery only with `X-TaskMint-Capture`. A web page can't add that
    header without a preflight, which fails for any origin but the pinned
    extension's, so DNS rebinding gets nowhere either.
  - A payload that arrives by `taskmint://` link (any page can open one) is
    held in Payouts for review instead of rewriting tracked days. Decoded
    link payloads are size-capped before and after gunzip.
  - With sync on, an applied capture reaches the account's other devices,
    as any change made on the desktop does.
- **Public config.** The Firebase configs in the repository (API keys, app
  ids, `google-services.json`) only name the project. The keys are limited
  to Firebase's APIs, and the rules decide what a sign-in can reach.

## Fixed in this review

| # | Severity | Where | What was wrong | Fix |
|---|---|---|---|---|
| 1 | Medium | the `github-deploy` service account | **The deploy could read every account's data.** It held Firebase Viewer, which includes reading Firestore documents and the user list, so a compromised workflow dependency on a tag run could have read them. | Firebase Viewer is removed (2026-11-09). The deploy's calls (firebase-tools 15.35.0: the project lookup, the API check, Hosting, the rules, the database and its indexes) are all within Hosting Admin, Rules Admin, Index Admin and Service Usage Consumer, none of which read data. The next tag's deploy confirms it. |

## Accepted risks

- **Open sign-up without App Check.** Anyone can make accounts and spend the
  daily quotas (50,000 reads, 20,000 writes and 20,000 deletes). With billing
  off, the worst case is sync stopping for everyone until the next day, not
  a bill. [docs/runbook.md](runbook.md) has the responses; App Check is the
  follow-up if it happens.
- **The API keys have no application restrictions.** A referrer or app
  restriction is easily forged and would need the desktop's `tauri://`
  origin, so it adds little. They stay limited to Firebase's APIs.
- **The Firebase sign-in sits in the webview's IndexedDB,** not the OS
  keychain, next to the data files it guards. A process on the computer can
  read either.
- **Disabling an account takes up to an hour** to stop a token already
  issued.
- **The rules check a document's shape, not its content.** A user can write
  anything under their own account; it can only break their own data, and
  core skips what it can't read.
- **The data isn't end-to-end encrypted.** Google encrypts it at rest;
  Google and the project's owners can read it.
- **`style-src 'unsafe-inline'`.** MUI's styles are injected at run time.
  Scripts stay `'self'` and the listed Google hosts.
- **Actions are pinned by major version,** not commit. The deploy job runs
  only the checkout, pnpm and Node setup, the artifact download, Google's
  auth action and firebase-tools.
- **Local processes are trusted.** The desktop's capture server accepts a
  delivery with no Origin, as a script's, and applies it like the
  extension's.
