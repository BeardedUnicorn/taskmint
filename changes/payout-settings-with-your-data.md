---
bump: minor
type: Changed
---
"Days Before Funds Released" and "Days Between Withdrawals" are now kept with your data instead of on each device, so they're in exports and backups, and in server mode the web app and every computer use the same values and show the same release and withdrawal dates. Each device's values move over the first time you open this version, unless the data already has them (a computer in server mode moves its own the next time it runs on its own files). An older version of the desktop app doesn't know them, and opening one drops them.
