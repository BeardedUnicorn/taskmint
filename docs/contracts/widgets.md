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
counts). So then it's written when the timer or the day changes and
otherwise at most every 15 minutes. `timer` names the task and says whether
it runs (`countingFromMs`) or waits paused; how long the one timer has run
isn't shown anywhere.

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
