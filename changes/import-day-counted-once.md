---
bump: patch
type: Fixed
---
- Importing work logs for a day that was already imported always replaces
  that import. A day could be counted twice when the import came from a
  device that hadn't caught up yet (another device imported it first, or
  the app had only just opened).
