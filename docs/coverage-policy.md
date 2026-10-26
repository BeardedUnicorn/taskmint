# Coverage policy

Every package is held to **100% coverage**:
- **TypeScript:** lines, branches, functions, and statements, measured with vitest v8.
- **Rust:** lines, functions, and regions, measured with `cargo llvm-cov` on stable. Stable has no branch metric.

Each Rust crate is measured on its own tests. The server and desktop runs ignore `crates/`, so the core can't be covered by accident through a host.

Integration tests count toward the total, including `#[sqlx::test]` against a real Postgres and axum `oneshot`. A database adapter can't be meaningfully tested without a database.

## Rules

1. **No inline ignores.** `v8 ignore`, `istanbul ignore`, `c8 ignore`, and `#[coverage(off)]` are banned in source. `scripts/check-coverage-policy.mjs` fails the build if one appears.
2. **Exclusions are files, listed once.** `coverage-policy.json` is the only list. Every package's coverage config reads it, and the check fails if a config drifts from it.
3. **An excluded file holds no logic.** It wires things together and calls tested code. Anything with a branch moves into a tested module.
4. **Delete instead of covering the impossible.** Remove defensive `??`, `?.`, default parameters, or `process.env.NODE_ENV` forks that the types or the boundaries (zod, serde) make unreachable.
5. **Floors only go up.** `packages/client` starts at its current floors (71/75/79/78) and ratchets to 100 with per-glob thresholds. New packages start at 100.

## How it's wired

- **The list:** [`coverage-policy.json`](../coverage-policy.json) at the repo root.
- **TypeScript:** each package's `vitest.config.ts` calls `defineTaskmintConfig({ packageDir, … })` from [`vitest.shared.ts`](../vitest.shared.ts). The preset reads the exclusions from the policy and defaults the thresholds to 100. A package may pass lower `thresholds` only while it ratchets up. Today that's `packages/client`, at 71/75/79/78.
- **The check:** [`scripts/check-coverage-policy.mjs`](../scripts/check-coverage-policy.mjs) fails when any of these happen:
  - an inline ignore appears in `packages/`, `apps/`, or `crates/`;
  - a package's vitest config isn't registered in the policy, doesn't use the preset, or declares its own `coverage`/`exclude`;
  - a policy entry points at a file that doesn't exist.
- **Rust ignore regex:** `node scripts/check-coverage-policy.mjs --rust-ignore-regex <crate dir>` prints that crate's `--ignore-filename-regex`. That's its excluded files plus every other crate.
- **Running the gates:** [`scripts/verify.sh`](../scripts/verify.sh) runs all of them locally; CI runs the same steps.

## Exclusions

| Package | Excluded | Why | Checked by |
|---|---|---|---|
| `crates/taskmint-core` | nothing | pure code | – |
| `apps/server` | `src/main.rs` | `#[tokio::main]` and signal wiring that call the tested `cli::run` | compose smoke test |
| `apps/desktop/src-tauri` | `src/main.rs`, `src/app.rs` | binary entry; `tauri::Builder`, plugins, `generate_context!`, run loop. They need a real event loop and main thread | manual QA checklist |
| `apps/desktop/src-tauri` | `src/platform/os.rs`, `src/platform/keychain.rs` | native tray/menu rendering, dialogs, OS notifications, window focus, deep-link registration, restart, keychain prompts. They need a real UI session | manual QA checklist |
| `apps/desktop/src-tauri` (implicit) | `cfg(target_os = "windows" \| "linux")` code | not compiled on the macOS coverage runner (the macOS idle FFI *is* covered by a real call) | `cargo xwin clippy` for Windows |
| all TS packages | `**/test/**`, `**/__tests__/**`, `*.config.ts`, `*.d.ts`, build scripts | not shipped runtime code | – |

Each `main.tsx` is **not** excluded. It's a single `startClient` call, covered by a test that imports it.

## Rust specifics

These are confirmed by the P0 spikes (see [ADR 0001](adr/0001-web-support.md)):
- Derived impls are not instrumented, and `log` macros add no uncovered regions.
- `#[cfg(test)]` helpers count, so every helper must run.
- `generate_handler!` expands an error path for each argument of each command. Each command gets IPC tests that omit and mistype its arguments.
- Infrastructure error paths that can't be reached cheaply (transaction begin/commit, file writes, keychain) use the `fail` crate's failpoints behind a `failpoints` feature, run serially. Use a real fault where one is cheap: a closed pool, a corrupt file, a read-only directory.
