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
| `apps/desktop/src-tauri` | `src/platform/os.rs` (and `src/platform/keychain.rs` when server mode adds it in P12) | the Platform on Tauri: tray and menu rendering, dialogs, OS notifications, window focus; later keychain prompts. They need a real UI session, so they hold calls only, and every decision is in tested code | manual QA checklist |
| `apps/desktop/src-tauri` (implicit) | `cfg(target_os = "windows" \| "linux")` code | not compiled on the macOS coverage runner (the macOS idle FFI *is* covered by a real call) | `cargo xwin clippy` for Windows |
| all TS packages | `**/test/**`, `**/__tests__/**`, `*.config.ts`, `*.d.ts`, build scripts | not shipped runtime code | – |

Each `main.tsx` is **not** excluded. It's a single `startClient` call, covered by a test that imports it.

## Rust specifics

These are confirmed by the P0 spikes (see [ADR 0001](adr/0001-web-support.md)):
- Derived impls are not instrumented, and `log` macros add no uncovered regions.
- `#[cfg(test)]` helpers count, so every helper must run.
- `generate_handler!` expands an error path for each argument of each command. Each command gets IPC tests that omit and mistype its arguments.
- Infrastructure error paths that can't be reached cheaply (transaction begin/commit, file writes, keychain) use the `fail` crate's failpoints behind a `failpoints` feature, run serially. Use a real fault where one is cheap: a closed pool, a corrupt file, a read-only directory.

Found while building the server (P8):
- **Each function is scored by its best single build, not the union.** A crate's unit tests (the lib's own test harness) and its integration tests (`tests/`) compile the code separately, and llvm-cov counts the instantiation with the most covered regions. So one of the two must cover the whole function: a branch reached only by unit tests plus another reached only by integration tests still counts as missed.
- **Every `?`, `let … else`, and closure on an error path is a region of its own**; `.expect()` and `tracing` macros add none. Prefer one statement per operation, and reach the error paths with real faults. The server's tests use a closed pool, a renamed table, or a statement trigger that raises (`apps/server/tests/api/common.rs`), so it needed no failpoints.
- Code generated by `sqlx::query!`/`query_as!` adds no regions of its own.

Found while building the server's workspace (P9):
- **One statement per step.** The store reads every part a command needs in one query, and saves through one list of statements run behind a single `?`. So a fault anywhere in a step is one region, and a renamed table or a raising trigger reaches it.
- **A commit failure** comes from a deferred constraint trigger, which raises only at `COMMIT`.
- **Connection errors** are reached by calling `workspace::run` with a closed pool. Over HTTP, the authentication extractor would fail first.
- **Stale instrumented binaries:** after the server's coverage run, a later core run counted `command/execute.rs` twice over (about 650 to 1,000 regions too many) until `cargo llvm-cov clean --workspace`. `verify.sh` now cleans before measuring.

Found while bringing the desktop shell to 100% (P7):
- **`log` macros do add regions when their arguments call methods** (`path.display()`, `.join(..)`): the arguments are evaluated only when a logger takes the level. The desktop's tests install a logger that takes every level before any test runs (`src/testing.rs`, with `ctor`).
- **An `if let` (or `if`) whose body runs every time still leaves its implicit `else` as a region.** Where no test can take the other path, write it without one: `.map(...)`, `.into_iter().for_each(...)`, `unwrap_or_default()`.
- **Chaining I/O steps with `and_then` gives them one error path**, which a single real fault covers (a folder where a file should be). A `?` after each step needs a fault for each.
- **Locks recover from poisoning** (`unwrap_or_else(PoisonError::into_inner)`) where every value they guard is replaced in one step. That makes the lock-error paths go away, not untested.
- **Failpoints:** the desktop crate's `failpoints` feature turns `fail::fail_point!` on. Only `verify.sh`'s coverage run enables it, and each failpoint is set inside the one test that passes through its location, so no other test can trip it. Today there's one: putting a file back after a later save failed.
