#!/usr/bin/env bash
# Every gate a phase must pass before it merges (CI runs the same steps).
# Usage: scripts/verify.sh
set -euo pipefail
cd "$(dirname "$0")/.."

step() { printf '\n==> %s\n' "$*"; }

step "Coverage policy"
node scripts/check-coverage-policy.mjs

step "TypeScript (sources and tests)"
pnpm typecheck

step "Build (the desktop build must precede cargo: generate_context! embeds its dist)"
pnpm build

step "Unit tests with coverage gates"
pnpm test:coverage

step "Rust format"
cargo fmt --all --check

step "Rust lints"
cargo clippy --workspace --all-targets -- -D warnings

step "Rust tests"
cargo test --workspace

step "Rust coverage: taskmint-core at 100%"
cargo llvm-cov -p taskmint-core --summary-only \
  --ignore-filename-regex "$(node scripts/check-coverage-policy.mjs --rust-ignore-regex crates/taskmint-core)" \
  --fail-under-lines 100 --fail-under-functions 100 --fail-under-regions 100

printf '\nAll gates passed.\n'
