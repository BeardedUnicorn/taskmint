# The published widgets (contract, schema 2)

What TaskMint publishes so its Android app can show the home-screen widgets
and the running-timer notification while it's closed: the figures another
device (the desktop, the web app, another phone) last worked out. It's built
by `packages/client/src/widgets/publishedWidgets.ts`, published by cloud sync
the way the payout forecast is ([ADR 0003](../adr/0003-payout-forecast.md),
decisions 4 and 8), and read by the phone's
`WidgetSync.kt` over Firestore's REST API.

## Where

`users/{uid}/published/widgets` in Firestore, readable by the signed-in owner
only:

| Field | |
|---|---|
| `schema` | The snapshot's version (int), `2` now. A reader refuses any other. |
| `json` | The figures below, as a JSON string |
| `hash` | FNV-1a 64 of `json`'s UTF-8 bytes, in hex |
| `deviceId` | The TaskMint device that wrote it |
| `appVersion` | That TaskMint's version |
| `epoch` | The account's TaskMint epoch |
| `updatedAt` | The server's time of writing: the snapshot's time |

Missing means no TaskMint device has published yet. It's deleted with
TaskMint's cloud data.

## The figures

`WidgetSnapshot` (`packages/client/src/backend/types.ts`) without
`updatedAtMs`, plus:

| Field | |
|---|---|
| `zone` | The IANA time zone of the device that wrote it (its `day` is that zone's) |

The text is ready to show, formatted by the device that wrote it. It carries
the live timer's task name; nothing else typed.

## When it's written

Whenever a linked device's figures change, 5 seconds later, if the cloud's
copy differs. While a timer runs the money and time grow every minute, which
a reader doesn't need: it counts today's time from `today.countingFromMs`
and works today's money out from `today.earning` (`baseCents + perHourCents
× (now − fromMs) / an hour`, the running timer's rate from where its time
counts). So then it's written when the timer, the day or the next withdrawal
(`payouts.label`, `amount`, `status`) changes and otherwise at most every 15
minutes. `timer` names the task and says whether
it runs (`countingFromMs`) or waits paused; how long the one timer has run
isn't shown anywhere.

## What moves with the clock

The text is as of the writing, and a phone shows it for hours. `payouts`
says how its figures move meanwhile, for the reader to follow on its own
clock. Each time is the end of a release's minute; an estimate's cents are
whole dollars.

- `payouts.releases[].parts`: `[{atMs, cents, estimated}]`, the day's
  releases. A part is gone once `now >= atMs`, and the day with its last;
  what's left of a day is its parts' sum. Until a withdrawal is recorded
  (`hint` is set) the first day left is the big figure. A day with `held`
  true is all released before the next withdrawal opens: its money is in
  `amount` already, and the reader says so ("Wed, Nov 18 (held)").
- `payouts.growth`: `{cents, estimated, steps: [{atMs, cents, estimated}]}`,
  `null` with no withdrawal recorded. `cents` is `amount`; the next
  withdrawal takes each step too once `now >= atMs` (all are after it opens),
  up to twelve of them.
- `payouts.opensAtMs`: "Ready to withdraw" from then. The agenda's `opens`
  badge goes then too, and the row of the reader's today says "Open now".

The days move as well, on the reader's clock:

- `day` is the writer's today. Once it isn't the reader's, Today's figures
  are named for their day ("Yesterday"), and stand still: a running timer's
  clock and money stop where they were when written.
- `week.days[].isToday` and the agenda rows' `isToday` are the writer's too.
  The reader finds the week's first day from `day` and the marked day, puts
  today where its own clock says, and names the week "Last week" (then "Week
  of Nov 8") once it has ended. The agenda opens at the last week header
  dated on or before the reader's today; a `releaseAhead` badge on a day
  that has passed is a `release`.
- `zone` (the published copy's) is the zone the writer's days are in. A
  reader refuses figures for an earlier day than the ones it has, which a
  device publishes as it wakes, unless that day was the writer's today in
  `zone` when they were written.

A snapshot without `parts` or `growth` (an older TaskMint's) is shown as
written.

## Who's told

A Cloud Function (`apps/functions`, [ADR 0005](../adr/0005-widget-push.md))
sends each of the account's phones, other than the one that wrote, an empty
push message on every write. A phone reads the document then, and at its own
check every quarter of an hour.

## Reading it

A reader takes it only when all of these hold, and otherwise keeps what it
has:

- `schema` is the version it reads (`2`);
- `epoch` is the epoch its device is linked to;
- `deviceId` isn't its own;
- `updatedAt` is later than its snapshot's time, and `day` isn't earlier than
  its snapshot's;
- its own app isn't open (the open app's figures are newer).
