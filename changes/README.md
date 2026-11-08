# Change notes

Each change a TaskMint user would notice adds a note here, in the branch
that makes it. `pnpm release` turns the notes into the next
[CHANGELOG.md](../CHANGELOG.md) section, bumps the version by the highest
`bump` among them, and deletes them. Each note is its own file, so branches
never conflict over the changelog.

Name the file after the change (`multi-task-sessions.md`); the name isn't
shown anywhere. A note is front matter, then the text for the changelog:

```markdown
---
bump: minor
type: Added
---
A session can hold timers on several tasks. Starting another task joins the
active session.
```

- `bump`: `major` when older desktops, servers or data can't keep working
  with it; `minor` for something new; `patch` for a fix or small change.
- `type`: the CHANGELOG heading it goes under: `Added`, `Changed`,
  `Removed`, `Fixed` or `Security`.
- The text is one bullet, with lines joined. For several bullets under the
  same heading, start each with `- `.

Write it for the person using TaskMint: what they can do now or what
changed for them, not how the code changed. Internal work (tests,
refactors, tooling) needs no note.

`pnpm release --dry-run` shows the next version and its section without
changing anything.
