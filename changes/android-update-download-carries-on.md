---
bump: patch
type: Fixed
---
On Android, an update's download that is interrupted carries on from where
it stopped instead of starting again. Android takes TaskMint off the network
a few seconds after you switch apps or lock the screen: the download now
waits, and finishes by itself when you come back to TaskMint. Try again
after any other failure also keeps what was already downloaded.
