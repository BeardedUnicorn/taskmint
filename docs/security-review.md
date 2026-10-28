# Security review (P15, October 2026)

A review of what the web-support plan added: the server, the web app and its
nginx, the desktop app's server mode and capture paths, and the browser
extension. It was done by reading the code against the threats below, with the
fixes proven by tests. Run it again when an endpoint, an auth path or a
capture path changes.

## What's protected, and from whom

**Assets:** each account's data (sessions, work logs, earnings, notes),
passwords, session cookies, API and device tokens, and the one-time invite and
reset links.

**Threats considered:**
- Someone on the internet with no account: guessing passwords, replaying or
  guessing tokens and links, forging requests.
- A signed-in user reaching another account's data, or acting as an admin.
- A web page open in the user's browser: cross-site requests, open redirects,
  `taskmint://` links, requests to the desktop app's local capture server.
- Someone who can read logs or error reports.
- The network between a client and the server.

**Out of scope:**
- Code already running on the user's computer. It can read the desktop app's
  data files, and on the compose stack it can reach Postgres directly.
- Denial of service beyond the limits listed below.
- A hosted, internet-facing deployment, which the plan defers. See
  [Deployment requirements](#deployment-requirements).

## Fixed in this review

| # | Severity | Where | What was wrong | Fix |
|---|---|---|---|---|
| 1 | Medium | `apps/web/src/routes.ts` | **Open redirect after sign-in.** `safeNext` refused `//host` and `/\host`, but browsers drop tabs and newlines while parsing a URL, so `/login?next=/%09/evil.example` passed the check and signing in went to `//evil.example`. | `next` is resolved the way the browser resolves it, and kept only if it stays on the site. Tests cover tab, newline, `javascript:` and unparseable values. |
| 2 | Medium | `apps/web/nginx/default.conf.template` | **Link secrets in the access log.** Invite and reset tokens are in the path of the page and of its API calls, and the default log format recorded both, plus the Referer, which repeats the page's URL. Anyone with the logs could use a pending invite or reset link. | A `taskmint` log format writes those paths with `[redacted]` in place of the secret, and leaves out the Referer. `verify.sh` checks the stack's logs after the smoke test accepts an invite. |
| 3 | Medium | `apps/server/src/http/{auth,links}.rs` | **Password changes and resets left desktop sign-ins working.** A device token is a desktop sign-in made with the password, but changing or resetting the password ended only browser sessions. After a reset meant to lock someone out, a desktop signed in with the old password kept full access. | Both revoke the user's `device` tokens in the same statement. Tokens made on the tokens page stay, since they weren't issued for the password. Tests cover both paths. |
| 4 | Low | desktop `server.rs`, extension `target.ts` | **Plain HTTP to other hosts.** Server mode sends the password (`auth/device-token`) and then a full-scope token, and the extension sends its token. Both accepted `http://` for any host. | `http://` is accepted only for this computer (localhost, 127.x.x.x, ::1); anything else needs `https://`, with a message saying why. |
| 5 | Low | `apps/server/src/http/mod.rs` | **Full URIs in request spans.** `TraceLayer`'s default span records the URI at debug level, so `RUST_LOG=debug` would log link secrets. | Spans record the matched route (`/api/v1/invites/{token}`) instead. |

## Checked and sound

- **Passwords:** argon2id (19 MiB, 2 passes), hashed on the blocking pool,
  one per CPU at a time. An unknown or disabled user is checked against a
  dummy hash, so the answer and its timing match a wrong password. Passwords
  are 8–256 characters.
- **Secrets at rest:** session cookies, CSRF tokens, links and API tokens are
  32 random bytes and stored only as SHA-256 hashes. API tokens keep a
  10-character prefix in clear for the list. The desktop keeps its device
  token in the OS keychain, never in a file or the webview.
- **Cookies and CSRF:**
  - The session cookie is `HttpOnly`, `SameSite=Strict`, `Secure` with the
    `__Host-` prefix when `COOKIE_SECURE`, and its expiry slides.
  - Unsafe requests from another origin are refused (`Sec-Fetch-Site`/`Origin`).
    Cookie-authenticated ones also need the session's `X-CSRF-Token`, compared
    in constant time.
  - The server has no CORS at all, so a page on another origin can't read a
    response.
- **Authorization:**
  - Every workspace query is scoped by the caller's user id, which never comes
    from a request body. `tests/isolation.rs` proves one account can't read or
    change another's, and the smoke test checks that the admin can't either.
  - Admin endpoints need a cookie session with the admin role. The last active
    admin can't be disabled or demoted, even by two admins at once (the admin
    rows are locked first).
  - A token can't mint, list or revoke tokens. A `capture` token can only
    post captures.
- **Disabling a user** ends their sessions, revokes every token and closes
  their event streams. Session and token lookups also check `disabled_at`,
  so a disabled user is refused even before that runs.
- **Links:** single use, expiring, and used up in the same statement that
  creates the account or sets the password. A new reset link expires the
  user's pending one.
- **Rate limits:** sign-in, device sign-in, password changes and the public
  link endpoints are limited per client (30 a minute; IPv6 by /64) and per
  client and username (5 a minute).
- **Inputs:** bodies are capped (32 MB, 8 MB for captures), unknown admin
  fields are refused, and usernames, names and notes are length-checked in
  code and in the schema. Database errors reach the client only as
  `internal error`.
- **Captures:**
  - The server takes them only with a bearer token and `X-TaskMint-Capture`,
    from no Origin or the pinned extension.
  - The desktop's capture server listens on 127.0.0.1 only. A web page can't
    add the header without a preflight, which fails for any origin but the
    extension's, so DNS rebinding gets nowhere either.
  - A payload that arrives by `taskmint://` link (any page can open one) is
    held in Payouts for review instead of rewriting tracked days. Decoded link
    payloads are size-capped before and after gunzip.
- **The desktop webview** has only `core:default`: every call goes through
  `dispatch`, and dialogs, files, the keychain and the network are in Rust.
  Its HTTP client never forwards `Authorization` across a redirect.
- **The extension** asks for host access to a server only in answer to a
  click, takes messages only from its own content scripts, and pauses its
  retries when a token is refused.
- **The web app:**
  - It renders no raw HTML (no `dangerouslySetInnerHTML`).
  - nginx sends a CSP with `script-src 'self'`, plus `frame-ancestors 'none'`,
    nosniff, a referrer policy, COOP, CORP and a permissions policy.
  - Sentry starts only after sign-in, drops the request URL and fetch
    breadcrumbs, and keeps only diagnostic fields.

## Accepted risks

- **Distributed password guessing.** The per-username limit is per client,
  so many addresses can each try 5 a minute. A global per-username limit would
  let anyone lock a user out instead. Passwords are at least 8 characters,
  and argon2 makes each guess expensive.
- **Long-lived credentials.** A session lasts while it's used at least every
  30 days. API tokens don't expire. The tokens page shows each token's last
  use; revoke what you don't recognize.
- **nginx's error log** records the request line when nginx can't reach the
  server, so a link opened during an outage leaves its secret there.
- **No quotas.** A signed-in user can store as much as the body limit allows
  per request, and open many event streams. Accounts are invite-only.
- **Admin actions don't ask for the password again.** An admin's open session
  is enough.
- **Sign-ins aren't audited.** Changes are written to `audit_events`, but
  sign-ins and failed attempts aren't (failures are rate-limited).
- **`style-src 'unsafe-inline'`.** MUI's styles are injected at run time. Scripts
  stay `'self'` only.
- **Local processes are trusted.** The desktop's capture server accepts a
  delivery with no Origin, as a script's, and applies it like the extension's.

## Deployment requirements

The compose stack is for one machine. Before anyone else can reach it:
- Put an HTTPS proxy in front of `web`, and send HSTS from it. Set
  `COOKIE_SECURE=true` and `PUBLIC_ORIGIN` to the `https://` address.
- Stop publishing `db` and `server`. With `TRUST_PROXY=true`, the server
  believes the last `X-Forwarded-For` hop, so a client that can reach it
  without nginx can pick its own address and dodge the per-client limits.
- Set a strong `POSTGRES_PASSWORD` (hex, so it fits in `DATABASE_URL`) and
  admin password, ideally through the `<NAME>_FILE` variables.
- Ship the logs only to places that may hold account names and addresses.

[docs/runbook.md](runbook.md) has the procedures: backups, account recovery,
signing everyone out, and rotating secrets.
