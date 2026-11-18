---
bump: patch
type: Fixed
---
Signing out, or signing in as someone else, while a device is being connected
to Cloud sync leaves it signed out. It could go on syncing with the account
you had just left, and show "synced" with nobody signed in.
