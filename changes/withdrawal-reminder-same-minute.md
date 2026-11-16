---
bump: patch
type: Fixed
---
A scheduled withdrawal's reminder counts every release in its row of
Upcoming releases. When two releases landed in the same minute, the reminder
left out the later one and showed less than the row. "If you wait" lists
such a minute once, with its full amount.
