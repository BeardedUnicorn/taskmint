# TaskMint Work-Log Capture (Chrome extension)

Automatically captures the work-log payload from
`https://app.dataannotation.tech/workers/payments` and delivers it to the
TaskMint desktop app, which imports it through the Payouts reconciliation
pipeline (auto-applied when every project already has a task match, staged
for review otherwise).

## How it works

- On the payments page, the extension passively reads the response of the
  site's own `recent_work_logs_and_timed_work_entries` API call — no extra
  requests to the site.
- The payload is POSTed to the TaskMint app at `http://127.0.0.1:43117`.
  TaskMint accepts it only from this extension's fixed ID, and imports it
  automatically when every project already has a task match.
- If TaskMint isn't running, the extension fires a `taskmint://` link so the
  OS launches the app (the link carries the gzip-compressed payload when it
  fits), keeps the payload queued, and retries every minute until TaskMint
  confirms delivery. Any web page can open a `taskmint://` link, so a payload
  that arrives *only* by link is held in Payouts for review. The extension's
  localhost retry a moment later confirms it, and it then imports
  automatically.
- Identical payloads are deduplicated — revisiting the page with no new data
  delivers nothing and never launches the app.

## Install (load unpacked)

1. Build it: `pnpm --filter @taskmint/extension build` writes `apps/extension/dist/`
   (CI also uploads it as the `taskmint-extension` artifact).
2. Open `chrome://extensions`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select the `apps/extension/dist/` folder. After
   a rebuild, click **Reload** on the extension's card.
5. Visit the DataAnnotation payments page while logged in.

An extension loaded from `apps/extension/` itself (before it was built) has
to be removed and loaded again from `dist/`. Its ID stays the same.

The first time TaskMint is closed during a capture, Chrome asks
**"Open TaskMint?"** — check **"Always allow app.dataannotation.tech to open
taskmint links"** so future launches are silent.

## Badge legend

| Badge | Meaning |
|---|---|
| `✓` (green) | Payload delivered to TaskMint (clears after a minute) |
| `!` (red) | TaskMint unreachable — payload queued, retrying every minute |
| _(empty)_ | Idle — waiting for the payments page |

## Troubleshooting

- **Is TaskMint's capture server up?** `curl http://127.0.0.1:43117/api/health`
  should return `{"app":"TaskMint",...}`. The Payouts page shows a warning if
  the port could not be bound (e.g. two TaskMint instances).
- **`taskmint://` does nothing?** The scheme is registered by the *bundled*
  app — on macOS it must have been launched at least once from
  `/Applications`; `pnpm tauri dev` builds do not register it. The queued
  payload still delivers over localhost the next time TaskMint runs.
- **Badge stuck on `!`** — launch TaskMint; delivery completes within about a
  minute (or instantly on the next payments-page visit).
- **Delivery refused (403)?** TaskMint only accepts this extension, identified
  by its fixed ID `akokpjpnondkhammgcndnffildbbapga` (pinned by the `key` in
  `manifest.json`). After updating the extension, click **Reload** on
  `chrome://extensions` and check the ID shown there matches. Other installed
  extensions can't deliver to TaskMint.
- **Edge case**: if TaskMint crashes in the instant between accepting a
  payload and importing it, that one delivery is lost — revisit the payments
  page (any change re-delivers) or paste the JSON manually in Payouts.

## Development

The extension is TypeScript in `src/`, bundled by esbuild (`build.mjs`) into
one classic script per entry, under the names `manifest.json` gives them:

| File | Runs in | What it does |
|---|---|---|
| `src/interceptor.ts` | the page's MAIN world, at document start | wraps the page's `fetch` and `XMLHttpRequest` and posts the work-log response to the window |
| `src/content.ts` | the content script's isolated world | relays those posts to the service worker, and opens `taskmint://` links in the page |
| `src/background.ts` | the service worker | dedupe, delivery to `127.0.0.1:43117`, the deep-link launch, the retry queue and the badge |

The capture server's port, path and header, and the deep-link names, come from
`@taskmint/contracts`, so they match the desktop app's. The build copies
`manifest.json` unchanged: its `key` pins the extension's ID, which the
desktop app checks, and a test derives the ID from it.

```bash
pnpm --filter @taskmint/extension build           # dist/
pnpm --filter @taskmint/extension test:coverage   # vitest at 100%, with a typed chrome.* fake
```
