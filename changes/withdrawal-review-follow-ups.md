---
bump: patch
type: Fixed
---
- The next withdrawal no longer leaves out money the site still showed as pending or Untransferred when you imported again after a withdrawal and nothing about the entry had changed.
- A deduction from the site (a negative amount) now comes off the withdrawal it's released with.
- The phone's widgets keep the figures TaskMint showed while it was open, instead of taking an older copy another device published meanwhile.
- The Today widget stops adding a running timer's money to yesterday's figure after midnight.
- The Payouts widget marks a release that comes before the next withdrawal opens as held: its money is already in the amount shown.
