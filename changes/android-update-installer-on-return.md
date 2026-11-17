---
bump: patch
type: Fixed
---
On Android, an update that finishes downloading while TaskMint is in the
background (you switched apps, or the screen locked) opens Android's
installer when you come back to TaskMint. It used to close the update dialog
with no installer and no message, and Download then fetched the whole update
again. An update already downloaded is now used again: Download opens the
installer on it at once.
