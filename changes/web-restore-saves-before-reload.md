---
bump: patch
type: Fixed
---
On the web, Restore Exactly and Import Data keep what they bring in. The page
now saves it to your account before it reloads; it used to reload first and
come back with the old data. If it can't be saved, the page says so and stays
open so you can try again.
