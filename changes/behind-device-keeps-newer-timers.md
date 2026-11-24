---
bump: patch
type: Fixed
---
Opening TaskMint on a device that had been closed or in the background no
longer wipes out timers started on another device in the meantime. A device
now checks the cloud's copy before sending its own and merges the two, so
both devices' timers stay. Update TaskMint on every device you sync: one
still on an older version can overwrite newer changes.
