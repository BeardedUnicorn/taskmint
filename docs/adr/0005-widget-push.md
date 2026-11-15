# ADR 0005: Widgets with the app closed, and the first Cloud Function

- **Status:** accepted (2026-11-14)
- **Supersedes:** [ADR 0002](0002-firebase.md)'s "nothing to run or pay
  for": both projects are on the Blaze plan now, and TaskMint deploys one
  Cloud Function. Its other decisions stand.
- **Scope:** how an Android phone shows what happened on another device
  while TaskMint is closed

## Context

Sync runs in the page ([ADR 0002](0002-firebase.md) decision 6), so a closed
phone knew nothing new: a timer started on the desktop showed in the phone's
widgets and notification only once TaskMint was opened there. Android gives
a closed app two ways to run: on a schedule, about every quarter of an hour
at best and far less often when the phone dozes; and when a push message
arrives. A push needs a sender that sees the change, which on Firebase means
a Cloud Function, which needs the Blaze plan.

## Decisions

1. **The phone reads figures, it doesn't sync.** Every device publishes the
   widgets' figures as it shows them (`users/{uid}/published/widgets`,
   [the contract](../contracts/widgets.md), [ADR 0003](0003-payout-forecast.md)
   decision 8), and the phone's own code (`WidgetSync.kt`) reads that one
   document. The merge rules stay in core and the page: nothing in Kotlin
   writes the data files.
2. **The phone holds the Firebase refresh token a second time,** handed over
   by the page while this device syncs with the account, encrypted under a
   keystore key. A native Firebase sign-in couldn't take over the page's
   session, and would ask email-and-password users to sign in twice.
3. **It checks every quarter of an hour** (WorkManager, with a connection),
   and at once when a push says so.
4. **One Cloud Function sends the push** (`apps/functions`,
   `widgetsPublished`): a write to the published widgets messages the
   account's other phones, at the addresses they keep in
   `users/{uid}/devices/{deviceId}` (their Firebase installation IDs). The
   message is empty: the figures stay behind the user's sign-in. It's urgent
   only when the live timer changed. It triggers on the published document,
   not the synced data, so it runs once per change a widget would show.
5. **Blaze, with a budget alert.** The function, its builds and Cloud
   Messaging sit inside the free allowances at this size; Firestore's free
   daily quota is unchanged.
6. **The function is deployed by hand** (`pnpm deploy:dev`; the runbook for
   production) until the release workflow's service account is given the
   roles for it. The rules and the web app still deploy with each tag.

## Consequences

- Without push (no Google Play services, or the message is put off), the
  widgets are up to a quarter of an hour behind, more when the phone dozes.
- Each published change costs one function run and one read of the
  account's `devices`; each push, one read by the phone.
- A second copy of the refresh token exists on the phone
  ([security review](../security-review.md)).
- A function is server code to keep current: its Node runtime and the two
  Firebase packages (`apps/functions/package.json`, exact versions).
