---
bump: patch
type: Fixed
---
- The Payouts widget keeps up on its own: once a withdrawal is open its amount
  grows with each release, and a release that has passed leaves the list,
  without opening TaskMint.
- A paused timer's estimate is released a week after it was paused, not a week
  from now (it used to move later every minute).
- A withdrawal recorded while a timer runs reaches your phone's widgets at
  once.
- Recording a withdrawal suggests the amount for the minute it's saved at.
