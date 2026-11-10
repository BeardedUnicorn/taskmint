# ADR 0002: Sync and the web app on Firebase

- **Status:** accepted (2026-11-09)
- **Supersedes:** [ADR 0001](0001-web-support.md) decisions 1 (accounts),
  2 (the server), 3 (desktop server mode), 5 (Postgres storage), 6 (the API)
  and 10 (hosting). Its other decisions stand: the pure `taskmint-core`, the
  one client package behind `Backend`, explicit time zones, tasks from the
  `predefinedTasks` record, and generated contracts.
- **Scope:** accounts, sync between devices, the web app's hosting and data,
  Google sign-in, analytics, and the release workflow's deploy

## Context

ADR 0001 put TaskMint's data on a self-hosted axum and Postgres server, which
the web app and the desktop's server mode used. It only ever ran in local
compose. Nothing was ever hosted, and nobody's data lived on it. Phones and
computers couldn't share data, and the web app couldn't be hosted without
running and securing a server.

The Firebase project `taskmint-f9a05` already had a Hosting site. The goal
became:
- the desktop and Android apps keep their data in step;
- the web app runs at https://taskmint-f9a05.web.app on the same data;
- the release workflow deploys it;
- nothing to run or pay for: the project is on the free Spark plan, with
  billing off.

## Decisions

1. **No server.** `apps/server`, the compose stack, the web app's nginx
   image and the desktop's server mode are deleted. TaskMint's rules run on
   every client: natively on the desktop and Android, and as WebAssembly in
   the browser (`crates/taskmint-wasm`, a thin `wasm-bindgen` layer over
   core's `JsonHost`). Firestore is the shared copy, not an authority: it
   runs no TaskMint logic.
2. **Accounts are Firebase Auth**, with email and password or Google, and
   anyone can sign up. Each account reaches only its own data
   (`firebase/firestore.rules`).
3. **Devices are local-first.** The desktop and Android keep their JSON
   files and work offline. Signing in to Settings → Cloud sync links the
   device to an account. The web app has no files: its data is the
   account's, read in full before the app opens, and kept by Firestore's
   persistent cache across tabs.
4. **Layout.** `users/{uid}` holds `{epoch}`. `users/{uid}/data/{kind~key}`
   holds one session, work-log entry, project mapping or record, as
   `{kind, id, json, hash, deleted, deviceId, schema, epoch, updatedAt}`. The
   entity is a JSON string, so its bytes round-trip with no Firestore type
   quirks. `hash` is FNV-1a 64 of it, `deleted` makes a tombstone, and
   `updatedAt` is the server's time.
5. **The sync logic is core's** (`crates/taskmint-core/src/sync`), shared by
   every host and tested at 100%:
   - a `SYNC` part keeps the account, a cursor and a baseline
     (`docId → {hash, json}`) of what the cloud last said;
   - `get_sync_outgoing` diffs the data against the baseline;
     `apply_sync_incoming` takes the cloud's changes in order;
   - a change on both sides merges three ways: arrays keyed by `id` item by
     item (timers inside a session, tasks, notes, templates, withdrawals),
     `dailyGoalAchievements` by date, objects field by field, and this
     device's version where the same item changed on both;
   - afterwards, at most one timer runs: the one started or resumed last
     wins, and the others stop at its start;
   - each running timer records the device it runs on (`runningOn`), and
     idle detection and the long-run reminder act only on this device's.
6. **The engine is the client's** (`packages/client/src/cloud`), over a
   `CloudStore` seam whose real side is the Firebase JS SDK, loaded only when
   sync starts. It listens to `updatedAt > cursor`, applies only documents
   the server has confirmed, and moves the cursor only on answers from the
   server, never the cache.
7. **Deleting the cloud data starts a new epoch.** The rules refuse writes
   from an older epoch, so a device that missed the delete can't write its
   copy back. Devices that see the new epoch stop syncing and keep their
   data.
8. **Google sign-in, per platform.** The web app uses Firebase's popup. The
   desktop runs the OAuth loopback flow with PKCE in Rust, as Google's
   "Desktop app" client, and hands the ID token to Firebase. Android asks
   Credential Manager. The webviews load no Google script.
9. **Analytics: Firebase Analytics, on by default, off in Settings →
   Privacy.** The web app loads Google's tag only while it's on; Android
   uses the native SDK through a bridge. The desktop has none: Google's tag
   would run inside a webview that can call every IPC command. Only page
   views go, never data.
10. **Hosting and deploys.** Firebase Hosting serves `apps/web/dist` with the
    headers nginx used to send, plus `'wasm-unsafe-eval'`. A release tag's
    workflow deploys Hosting, the Firestore rules and the indexes once every
    build has passed. It signs in through Workload Identity Federation, which
    trusts only this repository's `v*` tags, as a service account limited to
    those three, so no key is stored anywhere.

## Spike results

| Question | Answer | Consequence |
|---|---|---|
| Does the Firebase JS SDK work in the bundled `tauri://localhost` webview? | Yes. Auth persists in IndexedDB, and Firestore connects with the memory cache. A bundled build signed in to the real project and synced (2026-11-09) | Sync lives in the webview, next to the rest of the client |
| A write's own snapshot, before the server has it | It arrives first with `hasPendingWrites` and no server time | Only confirmed documents are applied; the cursor never comes from the cache |
| google-services 4.5.0 and BoM 35.1.0 on AGP 9.3.1 | They work. Firebase and googleid ship Kotlin 2.4 metadata, which AGP's Kotlin 2.2 can't read | Kotlin 2.3.21 in the root build and in `buildSrc` |
| Core in WebAssembly | Builds for `wasm32-unknown-unknown` with uuid's `js` feature and `getrandom_backend="wasm_js"`. Core reads no clock, files or threads | wasm-bindgen pinned at the lockfile's 0.2.127, CLI included (`check-toolchains.mjs`) |
| The production CSP with the wasm core | On the Hosting emulator, `eval` stays blocked and the core compiles with `'wasm-unsafe-eval'` | No `'unsafe-eval'` |

## Consequences

- **Spark's quotas are the limit:** 50,000 reads, 20,000 writes and 20,000
  deletes a day, and 1 GiB stored. Work-log upserts keep `updatedAt` when
  nothing else changed, so a capture doesn't upload the whole ledger again.
- **Open sign-up without App Check** lets anyone spend the project's daily
  quota. With billing off, the worst case is sync stopping until the next
  day, not a bill. App Check is the follow-up if that happens.
- **Firestore keeps no backups here.** Every synced device keeps a full copy,
  and the desktop's folder backups keep working.
- **Adding a field to a synced type bumps `SYNC_SCHEMA`.** An older app skips
  documents with a newer schema and says to update.
- **The extension delivers to the desktop only.** A capture reaches the web
  app through the desktop's sync.
- **The web app needs the network to start.** After that, Firestore's cache
  keeps working offline.
- **The desktop webview now reaches the network:** the Firestore and Auth
  hosts, in `connect-src`. Its Firebase sign-in sits in the webview's
  IndexedDB, not the OS keychain, like the data files it guards.
