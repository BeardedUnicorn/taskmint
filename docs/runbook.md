# Runbook: TaskMint on Firebase

How to deploy, watch, recover and lock down cloud sync and the web app, on
the Firebase project `taskmint-f9a05`, and its twin for every build that
isn't a release, `taskmint-dev` ([The dev project](#the-dev-project)). The
design is [ADR 0002](adr/0002-firebase.md) and
[ADR 0004](adr/0004-dev-environment.md); the README's "Firebase" section has
the setup. Commands run from the repository root. `pnpm firebase` is
firebase-tools at the pinned version, and needs `pnpm firebase login` once
(or gcloud's application default credentials). The self-hosted server this
runbook used to cover was retired on 2026-11-09.

## Health

- **The web app:** https://taskmint-f9a05.web.app opens to the sign-in page.
- **Deploys:** `gh run list --workflow release.yml`. A tag's `Deploy the web
  app` job deploys Hosting, the Firestore rules and the indexes.
- **Usage against the free quotas:** Firebase console → Firestore → Usage, and
  Authentication → Usage. Spark allows 50,000 reads, 20,000 writes and
  20,000 deletes a day, and 1 GiB stored. A day's quota resets at midnight
  Pacific time.
- **Errors in the apps:** Sentry, when the builds had `VITE_SENTRY_DSN`.

When a quota runs out, Firestore refuses until it resets: devices keep
working on their own data, show the sync error with **Try again**, and catch
up afterwards. The web app can't open until then. With billing off, there's
no charge.

## Deploying by hand

The release workflow deploys on each tag. By hand, for a rules fix between
releases, or when the workflow's deploy failed:

```bash
pnpm test:rules
pnpm firebase deploy --only firestore:rules,firestore:indexes --project taskmint-f9a05
```

The web app, from a clean checkout of the release's tag (Hosting serves
whatever `apps/web/dist` holds, so never deploy a working tree's build). It
has to be a production build: Hosting's predeploy step
(`scripts/check-web-environment.mjs`) refuses one made for dev.

```bash
pnpm install --frozen-lockfile && pnpm build:wasm && TASKMINT_ENV=production pnpm --filter @taskmint/web build
pnpm firebase deploy --only hosting --project taskmint-f9a05
```

Re-running the tag's `Deploy the web app` job (`gh run rerun <run id>
--job <job id>`, or the Actions page) does the same with no local login.

## The dev project

`taskmint-dev` is where every build that isn't a release syncs: `pnpm tauri
dev`, a plain `pnpm tauri build` ("TaskMint Dev"), Android builds
(`com.taskmint.android.dev`), and the web app at
https://taskmint-dev.web.app (the README's "Dev environment"). It's on Spark
with billing off, with quotas of its own, and nothing in it matters: sign up
with any account.

It mirrors production's setup: email and password and Google sign-in, email
enumeration protection, Firestore `(default)` in nam5, and Hosting. Google
sign-in on the desktop uses production's "TaskMint desktop" client, which
the dev project safelists (Authentication → Sign-in method → Google →
Safelist client IDs from external projects). Its Android app,
`com.taskmint.android.dev`, has the debug and release keys' SHA-1s. It has
no Analytics. A setting changed in production's Authentication is worth
changing here too.

Nothing deploys to it automatically. From your Mac, the web app, rules and
indexes (after the rules' tests):

```bash
pnpm deploy:dev
```

To start it over, delete its data (Authentication → Users can delete the
accounts):

```bash
pnpm firebase firestore:delete --all-collections --project taskmint-dev
```

`.firebaserc` makes it the default project, so a `pnpm firebase` command
without `--project` works on dev. Every production command here names
`--project taskmint-f9a05`.

## Rolling back

- **The web app:** Firebase console → Hosting → the release history → the
  release before → Roll back. Open tabs keep the version they loaded until
  they reload.
- **The rules:** Firebase console → Firestore → Rules keeps each version, or
  deploy an older file:
  `git show <good commit>:firebase/firestore.rules > firebase/firestore.rules`,
  then deploy the rules as above and put the file back with git.
- **A release whose sync is wrong** (data merged badly): roll back the web
  app, and on the desktop and Android install the previous release by hand.
  Each device keeps its own data, so nothing is lost by stopping. If the
  cloud copy needs replacing, see [Recovering data](#recovering-data).

## Accounts

In the Firebase console → Authentication → Users:
- **A forgotten password:** the user taps **Forgot password?** at sign-in,
  or the console's menu for the user → Reset password. Both email a link.
- **Disable** stops new sign-ins and token refreshes. A token already
  issued keeps working for up to an hour.
- **Delete** removes the account, but not its data. The app's Settings →
  Account → Delete account (web) deletes both. To remove what's left of a
  deleted account:

```bash
pnpm firebase firestore:delete users/<uid> --recursive --project taskmint-f9a05
```

**Sign-up** is open to anyone. To close it: Authentication → Settings →
User actions → untick **Enable create (sign-up)**. Existing accounts keep
signing in.

## Recovering data

The project has no Firestore backups or point-in-time recovery set up. Every
synced device keeps a full copy of the account's data, and the desktop's
folder backups keep working. So:

- **One device lost its data:** sign in on it again. With nothing local,
  it takes the cloud's copy.
- **The cloud copy is wrong or lost:** on the device with the best copy,
  Settings → Cloud sync → **Delete cloud data**, then **Sync again**: its
  data becomes the cloud's. Each other device shows that the cloud data was
  deleted. **Sync again** there merges its data in, so first pick, for each,
  whether its copy should join (sync again) or be replaced (Data
  Management → Reset All Data, then sign in).
- **From a backup file:** on one device, Settings → Data Management →
  Restore Exactly (or Import Data to add only what's missing). Its changes
  sync to the others.

## Incidents

**An account may be compromised.** Disable it (above), then have the owner
reset their password and enable it again. The rules keep each account to
its own data, so others' aren't exposed.

**Someone is burning the quota** (a burst of sign-ups, reads or writes in
Usage). In order of effort:
1. Disable or delete the accounts responsible (Authentication → Users,
   sorted by created).
2. Close sign-up (above).
3. Turn on App Check for Firestore and Auth, which then needs the apps to
   attest first (a code change: ADR 0002 lists it as the follow-up).

**A bad rules deploy** (sync failing with "missing or insufficient
permissions" everywhere): roll the rules back (above). Devices retry with
**Try again** and lose nothing.

**The deploy path is misused or leaks** (an unexpected Hosting release or
rules change, or a compromised workflow dependency). Stop it at once, then
look:

```bash
gcloud iam workload-identity-pools providers update-oidc taskmint-releases --location=global --workload-identity-pool=github --project=taskmint-f9a05 --disabled
```

Roll back what was deployed, and check Cloud Logging's audit logs for the
`github-deploy@taskmint-f9a05.iam.gserviceaccount.com` service account.
`--no-disabled` turns it back on. The provider trusts only this repository's
`v*` tags, so a tag pushed by someone with write access to the repository is
the other way in: check the repository's tags and collaborators too.

**The desktop's Google client secret leaked.** Google treats it as public
(it ships in every installed app), so a leak lets someone show Google's
consent screen under TaskMint's name, not sign in as anyone. To rotate it:
Google Cloud console → APIs & Services → Credentials → the Desktop client →
add a secret, update `VITE_GOOGLE_DESKTOP_CLIENT_SECRET` in the repository
secrets and `.env`, release, then delete the old secret.

**The Android release key leaked or was lost:** the README's "Android
signing", including registering the new key's SHA-1 with Firebase.

## Housekeeping

- **API keys** (Google Cloud console → APIs & Services → Credentials): the
  browser and Android keys are limited to Firebase's APIs. They're public by
  design; the rules protect the data.
- **Authorized domains** (Authentication → Settings) should list only
  `localhost` and the project's own `firebaseapp.com` and `web.app` domains
  (production's also lists BudgetMint's).
- **The deploy service account** holds Firebase Hosting Admin, Firebase
  Rules Admin, Cloud Datastore Index Admin and Service Usage Consumer, which
  between them cover every call firebase-tools makes to deploy (Hosting
  Admin includes looking up the project). Don't add Firebase Viewer or any
  other viewer role: they read Firestore documents and the user list.
