# Working in TaskMint

- **Change notes.** A change a user would notice adds a note in `changes/`
  (format in [changes/README.md](changes/README.md)), in the same branch.
  Internal work (tests, refactors, tooling) needs none.
- **Versions and the changelog** are written by `pnpm release` only. Don't
  edit a manifest's version or CHANGELOG.md's released sections by hand.
- **Releases** are cut in the main checkout, on `main`, never in a worktree.
  `pnpm release` commits and tags locally; push or `--publish` only when
  asked (the repository is public).
- **Formatting.** Biome formats and lints the TypeScript and JavaScript:
  run `pnpm lint:fix` before committing, since the pre-commit hook rejects
  unformatted staged files. Rust: `cargo fmt --all`.
- **Gates.** `pnpm verify` (scripts/verify.sh) runs every check CI does;
  run it before merging.
