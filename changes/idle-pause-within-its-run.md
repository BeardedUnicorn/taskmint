---
bump: patch
type: Fixed
---
- A timer paused for being away is never paused from before it last started
  or resumed, which could leave it with no time at all.
