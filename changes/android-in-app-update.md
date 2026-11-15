---
bump: minor
type: Changed
---
- On Android, TaskMint downloads its own update, shows how far the download is, and opens Android's installer, instead of handing the download to the browser (where it could stall and never install). The first time, Android asks to let TaskMint install apps. If the download fails, Open in browser does it the old way.
- On an Android phone with Advanced Protection on, the update dialog now shows the steps to turn it off, with a button that opens the phone's Security settings, and offers the download as soon as it's off.
