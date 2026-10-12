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

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select this `chrome-extension/` folder.
4. Visit the DataAnnotation payments page while logged in.

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
