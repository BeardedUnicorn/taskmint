---
bump: major
type: Removed
---
TaskMint no longer upgrades data from builds older than mid-October 2026. A
backup from before then may restore without moving its sessions' notes into
Notes, and note templates with fields that ran shell commands won't load;
records an old build left in the app's local storage aren't moved in either.
To bring such data forward, open or restore it in 2.4 first, then update.
