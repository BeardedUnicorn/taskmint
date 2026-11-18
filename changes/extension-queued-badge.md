---
bump: patch
type: Fixed
---
The browser extension's badge keeps showing `!` while a capture waits for
TaskMint. When a capture couldn't be delivered within a minute of one that
was, the badge went blank as if nothing was waiting, though the extension
kept retrying.
