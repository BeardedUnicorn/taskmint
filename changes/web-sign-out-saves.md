---
bump: patch
type: Fixed
---
- The web app sends your latest changes to your account before it signs out,
  and asks first if they can't be sent. A change made in the second before
  signing out was lost.
- Changes sync at once when TaskMint is hidden or closed (a browser tab, the
  phone app left), not a second later.
