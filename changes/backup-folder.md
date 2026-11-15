---
bump: patch
type: Changed
---
Automatic backups now go in a `Backups` folder inside the app's data folder
(About shows where), so macOS no longer asks for access to Documents at
launch. Settings still pointing at `Documents/TaskMint Backups` switch over by
themselves; the backups already there stay, and a folder you picked yourself
is unchanged.
