---
bump: patch
type: Fixed
---
- With cloud sync, an Undo (or a quick change of mind) no longer comes undone
  a moment later. Deleting a timer and undoing it, adding time and undoing
  it, or starring and unstarring a task before the first change had reached
  the cloud used to bring the first change back, on every device. It
  happened most on a slow connection or offline.
