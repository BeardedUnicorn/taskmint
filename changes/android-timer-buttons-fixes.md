---
bump: patch
type: Fixed
---
- On Android, Stop on the running timer's notification stops only that timer when another task's timer is waiting paused. It used to leave the notification and the Today widget showing the stopped timer as running, and could go on to stop the paused one too.
- On Android, the Today widget's and the notification's timer buttons keep working without opening TaskMint while TaskMint is open on another device. They used to go back to opening the app within a quarter of an hour of a timer starting.
- On Android, pressing the notification's Pause or Stop with TaskMint in front no longer risks the widgets ignoring your other devices until TaskMint is next opened.
- On Android, the Today widget's money goes back to its usual size when a tall widget with a running timer is made shorter.
